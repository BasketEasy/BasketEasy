import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@basketeasy/ui/dialog';
import { FormField } from '@basketeasy/ui/form-field';
import { RadioCardGroup } from '@basketeasy/ui/radio-card-group';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import type { TeamEvent } from '@basketeasy/types/events';
import {
  MAX_TRAVEL_MINUTES,
  MEETING_POINT_ADDRESS_MAX_LENGTH,
  MEETING_POINT_NAME_MAX_LENGTH,
  type EventMeetingPlan,
  type MeetingPointSource,
  type UpdateEventMeetingRequest,
} from '@basketeasy/types/meeting-points';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { formatDayHeading, formatEventTime } from '../clubs/eventDateFormat';
import { useEventMeetingRefresh } from './useEventMeetingRefresh';
import { useEventMeetingUpdate } from './useEventMeetingUpdate';
import { useTeamMeetingSettings } from './useTeamMeetingSettings';

const ROUTING_UNAVAILABLE =
  'Le calcul d’itinéraire est indisponible. Saisissez la durée à la main.';
const MINUTE_MS = 60 * 1000;
const QUARTER_HOUR_MS = 15 * MINUTE_MS;

type PlaceMode = 'DEFAULT' | 'CUSTOM';
type TimeMode = 'AUTO' | 'FIXED';

const DEFAULT_SOURCE_LABEL: Record<Exclude<MeetingPointSource, 'EVENT'>, string> = {
  CLUB: 'défini par le club',
  TEAM: 'défini par l’équipe',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "HH:MM" in the viewer's local time, for a `type="time"` input. */
function toTimeValue(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Resolves a local "HH:MM" against the match's own local date — the same
 * approach EventEditModal takes for a series' time of day, so DST is right
 * for the one date that matters.
 */
function timeOnMatchDay(startsAt: string, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(startsAt);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function RadioLabel({ title, detail }: { title: string; detail?: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <Text as="span" variant="label" size="sm" className="font-bold">
        {title}
      </Text>
      {detail && (
        <Text as="span" variant="meta" size="xs">
          {detail}
        </Text>
      )}
    </span>
  );
}

/**
 * A team manager's adjustments for one match: another meeting place, typed
 * travel minutes, or a fixed meeting time. Three independent sections, each
 * sent only when it changed — so touching the time never resets the place —
 * under a live preview of the meeting time the form would produce.
 */
export function EventMeetingDialog({
  clubId,
  teamId,
  event,
  plan,
  open,
  onOpenChange,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  plan: EventMeetingPlan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate: update, isPending: isSaving } = useEventMeetingUpdate(clubId, teamId, event.id);
  const { mutate: refresh, isPending: isRefreshing } = useEventMeetingRefresh(
    clubId,
    teamId,
    event.id,
  );
  // What the match falls back to without its own place — needed to name the
  // default while this match overrides it.
  const { data: teamSettings } = useTeamMeetingSettings(clubId, teamId);

  const hasOwnPlace = plan.meetingPointSource === 'EVENT';
  const initialMinutes = plan.travelMinutesSource === 'MANUAL' ? String(plan.travelMinutes) : '';
  const hasFixedTime = plan.meetsAtSource === 'OVERRIDE' && plan.meetsAt !== null;
  const computedMinutes = plan.travelMinutesSource === 'COMPUTED' ? plan.travelMinutes : null;

  const defaultPoint = hasOwnPlace
    ? (teamSettings?.meetingPoint ?? teamSettings?.clubDefaults.meetingPoint ?? null)
    : plan.meetingPoint;
  const defaultSource: Exclude<MeetingPointSource, 'EVENT'> | null = hasOwnPlace
    ? teamSettings?.meetingPoint
      ? 'TEAM'
      : teamSettings?.clubDefaults.meetingPoint
        ? 'CLUB'
        : null
    : plan.meetingPointSource === 'TEAM' || plan.meetingPointSource === 'CLUB'
      ? plan.meetingPointSource
      : null;

  const [placeMode, setPlaceMode] = useState<PlaceMode>(hasOwnPlace ? 'CUSTOM' : 'DEFAULT');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [minutes, setMinutes] = useState('');
  const [timeMode, setTimeMode] = useState<TimeMode>(hasFixedTime ? 'FIXED' : 'AUTO');
  const [time, setTime] = useState('');
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [minutesError, setMinutesError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPlaceMode(hasOwnPlace ? 'CUSTOM' : 'DEFAULT');
    setName(hasOwnPlace ? (plan.meetingPoint?.name ?? '') : '');
    setAddress(hasOwnPlace ? (plan.meetingPoint?.address ?? '') : '');
    setMinutes(initialMinutes);
    setTimeMode(hasFixedTime ? 'FIXED' : 'AUTO');
    setTime(hasFixedTime && plan.meetsAt ? toTimeValue(plan.meetsAt) : '');
    setPlaceError(null);
    setMinutesError(null);
    setTimeError(null);
    setError(null);
  }, [open, hasOwnPlace, hasFixedTime, plan, initialMinutes]);

  const trimmedName = name.trim();
  const trimmedAddress = address.trim();
  const placeChanged =
    placeMode === 'DEFAULT'
      ? hasOwnPlace
      : trimmedName !== plan.meetingPoint?.name || trimmedAddress !== plan.meetingPoint?.address;

  // The meeting time this form would produce — the server's own formula,
  // replayed on the fields as typed.
  const typedMinutes = minutes.trim() === '' ? null : Number(minutes);
  const previewMinutes =
    typedMinutes !== null && Number.isInteger(typedMinutes)
      ? typedMinutes
      : placeChanged
        ? null
        : computedMinutes;
  const arrivalMs = new Date(event.startsAt).getTime() - plan.arrivalBufferMinutes * MINUTE_MS;
  const preview =
    timeMode === 'FIXED'
      ? time
        ? {
            time,
            detail: 'Heure fixée pour ce match',
          }
        : null
      : previewMinutes !== null
        ? {
            time: formatEventTime(
              new Date(
                Math.floor((arrivalMs - previewMinutes * MINUTE_MS) / QUARTER_HOUR_MS) *
                  QUARTER_HOUR_MS,
              ).toISOString(),
            ),
            detail: `${formatEventTime(event.startsAt)} − ${plan.arrivalBufferMinutes} min d’arrivée − ${previewMinutes} min de trajet, arrondi au quart d’heure inférieur`,
          }
        : null;

  const handleSubmit = () => {
    const dto: UpdateEventMeetingRequest = {};
    let valid = true;

    if (placeMode === 'DEFAULT') {
      if (hasOwnPlace) dto.meetingPoint = null;
      setPlaceError(null);
    } else if (!trimmedName || !trimmedAddress) {
      setPlaceError('Renseignez le nom et l’adresse');
      valid = false;
    } else {
      setPlaceError(null);
      if (placeChanged) dto.meetingPoint = { name: trimmedName, address: trimmedAddress };
    }

    if (minutes !== initialMinutes) {
      if (typedMinutes === null) {
        dto.travelMinutes = null;
        setMinutesError(null);
      } else if (
        !Number.isInteger(typedMinutes) ||
        typedMinutes < 0 ||
        typedMinutes > MAX_TRAVEL_MINUTES
      ) {
        setMinutesError(`Entre 0 et ${MAX_TRAVEL_MINUTES} minutes`);
        valid = false;
      } else {
        dto.travelMinutes = typedMinutes;
        setMinutesError(null);
      }
    }

    if (timeMode === 'AUTO') {
      if (hasFixedTime) dto.meetsAt = null;
      setTimeError(null);
    } else if (!time) {
      setTimeError('Choisissez l’heure du rendez-vous');
      valid = false;
    } else {
      const meetsAt = timeOnMatchDay(event.startsAt, time);
      if (meetsAt > new Date(event.startsAt)) {
        setTimeError('Le rendez-vous doit être avant le coup d’envoi');
        valid = false;
      } else {
        setTimeError(null);
        if (!hasFixedTime || time !== toTimeValue(plan.meetsAt!)) {
          dto.meetsAt = meetsAt.toISOString();
        }
      }
    }

    if (!valid) return;
    if (Object.keys(dto).length === 0) {
      onOpenChange(false);
      return;
    }
    update(dto, {
      onSuccess: () => {
        toast({ variant: 'success', title: 'Rendez-vous mis à jour' });
        onOpenChange(false);
      },
      onError: (err) => setError(getClubErrorMessage(err)),
    });
  };

  const handleRefresh = () =>
    refresh(undefined, {
      onSuccess: (updated) => {
        const travel = updated.meetingPlan?.travelMinutes;
        toast(
          travel === null || travel === undefined
            ? {
                variant: 'destructive',
                description: 'Adresse introuvable — saisissez la durée à la main.',
              }
            : { variant: 'success', title: `Trajet recalculé : ${travel} min` },
        );
      },
      onError: (err) =>
        toast({
          variant: 'destructive',
          description: getClubErrorMessage(err, { 503: ROUTING_UNAVAILABLE }),
        }),
    });

  const matchLabel = `${event.opponentName ? `vs ${event.opponentName} · ` : ''}${formatDayHeading(event.startsAt).toLowerCase()}, ${formatEventTime(event.startsAt)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajuster le rendez-vous</DialogTitle>
          <DialogDescription>{matchLabel}. Pour ce match seulement.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card variant="inset" tone="structure" className="flex items-center gap-3.5">
            <Text
              variant="display"
              size="3xl"
              tone={preview ? 'structure' : 'secondary'}
              className="tabular"
            >
              {preview?.time ?? '--:--'}
            </Text>
            <Text variant="body" size="sm">
              {preview?.detail ?? 'Le trajet sera recalculé à l’enregistrement.'}
            </Text>
          </Card>

          <div className="flex flex-col gap-2">
            <Text variant="eyebrow" id="event-meeting-place">
              Lieu
            </Text>
            <RadioCardGroup<PlaceMode>
              aria-labelledby="event-meeting-place"
              tone="choice"
              indicator
              value={placeMode}
              onChange={setPlaceMode}
              options={[
                {
                  value: 'DEFAULT',
                  disabled: !defaultPoint,
                  render: () => (
                    <RadioLabel
                      title="RDV par défaut"
                      detail={
                        defaultPoint
                          ? `${defaultPoint.name}${defaultSource ? ` · ${DEFAULT_SOURCE_LABEL[defaultSource]}` : ''}`
                          : 'Aucun défini pour le club ou l’équipe'
                      }
                    />
                  ),
                },
                { value: 'CUSTOM', render: () => <RadioLabel title="Autre lieu pour ce match" /> },
              ]}
            />
            {placeMode === 'CUSTOM' && (
              <>
                <FormField
                  label="Nom du lieu"
                  id="event-meeting-name"
                  maxLength={MEETING_POINT_NAME_MAX_LENGTH}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={placeError && !trimmedName ? placeError : undefined}
                />
                <FormField
                  label="Adresse"
                  id="event-meeting-address"
                  maxLength={MEETING_POINT_ADDRESS_MAX_LENGTH}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  error={placeError && !trimmedAddress ? placeError : undefined}
                />
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="eyebrow">Temps de trajet</Text>
            <div className="flex items-end gap-2.5">
              <FormField
                label="Minutes (vide = calcul automatique)"
                id="event-meeting-travel"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_TRAVEL_MINUTES}
                placeholder={computedMinutes !== null ? String(computedMinutes) : undefined}
                containerClassName="min-w-0 flex-1"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                error={minutesError ?? undefined}
              />
              {plan.meetingPoint && (
                <Button variant="outline" loading={isRefreshing} onClick={handleRefresh}>
                  Recalculer
                </Button>
              )}
            </div>
            <Text variant="meta" size="xs">
              {computedMinutes !== null
                ? `Estimé ${computedMinutes} min par OpenRouteService, du RDV à la salle.`
                : 'Pas encore calculé : saisissez la durée ou recalculez.'}
            </Text>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="eyebrow" id="event-meeting-time-mode">
              Heure du RDV
            </Text>
            <RadioCardGroup<TimeMode>
              aria-labelledby="event-meeting-time-mode"
              tone="choice"
              indicator
              value={timeMode}
              onChange={setTimeMode}
              options={[
                {
                  value: 'AUTO',
                  render: () => (
                    <RadioLabel
                      title="Calculée automatiquement"
                      detail="Suit le trajet et l’heure du match"
                    />
                  ),
                },
                {
                  value: 'FIXED',
                  render: () => <RadioLabel title="Heure fixe" detail="Pause repas, bouchons…" />,
                },
              ]}
            />
            {timeMode === 'FIXED' && (
              <FormField
                label="Heure du rendez-vous"
                id="event-meeting-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                error={timeError ?? undefined}
              />
            )}
          </div>

          <Card variant="inset" tone="accent">
            <Text variant="meta" size="xs" tone="accent">
              Les joueurs qui viennent au RDV seront prévenus du changement.
            </Text>
          </Card>

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
            <Button loading={isSaving} onClick={handleSubmit}>
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
