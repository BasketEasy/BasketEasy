import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Checkbox } from '@basketeasy/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@basketeasy/ui/dialog';
import { FormField } from '@basketeasy/ui/form-field';
import { Label } from '@basketeasy/ui/label';
import { toast } from '@basketeasy/ui/toast-store';
import type { TeamEvent } from '@basketeasy/types/events';
import {
  MAX_TRAVEL_MINUTES,
  MEETING_POINT_ADDRESS_MAX_LENGTH,
  MEETING_POINT_NAME_MAX_LENGTH,
  type EventMeetingPlan,
  type UpdateEventMeetingRequest,
} from '@basketeasy/types/meeting-points';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { useEventMeetingRefresh } from './useEventMeetingRefresh';
import { useEventMeetingUpdate } from './useEventMeetingUpdate';

const ROUTING_UNAVAILABLE =
  'Le calcul d’itinéraire est indisponible. Saisissez la durée à la main.';

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

/**
 * A team manager's adjustments for one match: another meeting place, typed
 * travel minutes, or a fixed meeting time. Three independent sections, each
 * sent only when it changed — so touching the time never resets the place.
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

  const hasOwnPlace = plan.meetingPointSource === 'EVENT';
  const initialMinutes = plan.travelMinutesSource === 'MANUAL' ? String(plan.travelMinutes) : '';
  const initialTime =
    plan.meetsAtSource === 'OVERRIDE' && plan.meetsAt ? toTimeValue(plan.meetsAt) : '';

  const [useDefaultPlace, setUseDefaultPlace] = useState(!hasOwnPlace);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [minutes, setMinutes] = useState('');
  const [time, setTime] = useState('');
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [minutesError, setMinutesError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUseDefaultPlace(!hasOwnPlace);
    setName(hasOwnPlace ? (plan.meetingPoint?.name ?? '') : '');
    setAddress(hasOwnPlace ? (plan.meetingPoint?.address ?? '') : '');
    setMinutes(initialMinutes);
    setTime(initialTime);
    setPlaceError(null);
    setMinutesError(null);
    setTimeError(null);
    setError(null);
  }, [open, hasOwnPlace, plan, initialMinutes, initialTime]);

  const handleSubmit = () => {
    const dto: UpdateEventMeetingRequest = {};
    let valid = true;

    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    if (useDefaultPlace) {
      if (hasOwnPlace) dto.meetingPoint = null;
      setPlaceError(null);
    } else if (!trimmedName || !trimmedAddress) {
      setPlaceError('Renseignez le nom et l’adresse');
      valid = false;
    } else {
      setPlaceError(null);
      if (
        trimmedName !== plan.meetingPoint?.name ||
        trimmedAddress !== plan.meetingPoint?.address
      ) {
        dto.meetingPoint = { name: trimmedName, address: trimmedAddress };
      }
    }

    if (minutes !== initialMinutes) {
      const value = Number(minutes);
      if (minutes.trim() === '') {
        dto.travelMinutes = null;
        setMinutesError(null);
      } else if (!Number.isInteger(value) || value < 0 || value > MAX_TRAVEL_MINUTES) {
        setMinutesError(`Entre 0 et ${MAX_TRAVEL_MINUTES} minutes`);
        valid = false;
      } else {
        dto.travelMinutes = value;
        setMinutesError(null);
      }
    }

    if (time !== initialTime) {
      if (time === '') {
        dto.meetsAt = null;
        setTimeError(null);
      } else {
        const meetsAt = timeOnMatchDay(event.startsAt, time);
        if (meetsAt > new Date(event.startsAt)) {
          setTimeError('Le rendez-vous doit être avant le coup d’envoi');
          valid = false;
        } else {
          dto.meetsAt = meetsAt.toISOString();
          setTimeError(null);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajuster le rendez-vous</DialogTitle>
          <DialogDescription>
            Pour ce match seulement. Laissez un champ vide pour revenir au calcul automatique.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-start gap-2">
            <Checkbox
              id="event-meeting-default-place"
              checked={useDefaultPlace}
              onCheckedChange={(checked) => setUseDefaultPlace(checked === true)}
            />
            <Label htmlFor="event-meeting-default-place">
              Utiliser le point de rendez-vous par défaut
              {!hasOwnPlace && plan.meetingPoint ? ` (${plan.meetingPoint.name})` : ''}
            </Label>
          </div>
          {!useDefaultPlace && (
            <>
              <FormField
                label="Nom du lieu"
                id="event-meeting-name"
                maxLength={MEETING_POINT_NAME_MAX_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={placeError && !name.trim() ? placeError : undefined}
              />
              <FormField
                label="Adresse"
                id="event-meeting-address"
                maxLength={MEETING_POINT_ADDRESS_MAX_LENGTH}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                error={placeError && !address.trim() ? placeError : undefined}
              />
            </>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <FormField
              label="Temps de trajet (minutes)"
              id="event-meeting-travel"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_TRAVEL_MINUTES}
              containerClassName="min-w-0 flex-1"
              hint={
                plan.travelMinutesSource === 'COMPUTED'
                  ? `Calculé : ${plan.travelMinutes} min`
                  : 'Vide : calculé automatiquement'
              }
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

          <FormField
            label="Heure du rendez-vous"
            id="event-meeting-time"
            type="time"
            hint="Vide : coup d’envoi − délai d’arrivée − trajet, arrondi au quart d’heure."
            value={time}
            onChange={(e) => setTime(e.target.value)}
            error={timeError ?? undefined}
          />

          <Button loading={isSaving} onClick={handleSubmit}>
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
