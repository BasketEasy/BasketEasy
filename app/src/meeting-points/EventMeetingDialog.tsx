import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  computeMeetsAt,
  type EventMeetingPlan,
  type MeetingPointSource,
  type UpdateEventMeetingRequest,
} from '@basketeasy/types/meeting-points';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { formatDayHeading, formatEventTime } from '../clubs/eventDateFormat';
import { meetingPointFields, refineMeetingPointPair, toMeetingPoint } from './meetingPointSchema';
import { useEventMeetingRefresh } from './useEventMeetingRefresh';
import { useEventMeetingUpdate } from './useEventMeetingUpdate';

const ROUTING_UNAVAILABLE =
  'Le calcul d’itinéraire est indisponible. Saisissez la durée à la main.';

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

/** Empty means « calcul automatique »; anything else must be whole minutes in range. */
function parseMinutes(value: string): number | null | 'invalid' {
  if (value.trim() === '') return null;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_TRAVEL_MINUTES
    ? minutes
    : 'invalid';
}

function meetingSchema(startsAt: string) {
  return z
    .object({
      placeMode: z.enum(['DEFAULT', 'CUSTOM']),
      ...meetingPointFields,
      minutes: z.string(),
      timeMode: z.enum(['AUTO', 'FIXED']),
      time: z.string(),
    })
    .superRefine((values, ctx) => {
      if (values.placeMode === 'CUSTOM') refineMeetingPointPair(values, ctx, { required: true });
      if (parseMinutes(values.minutes) === 'invalid') {
        ctx.addIssue({
          code: 'custom',
          path: ['minutes'],
          message: `Entre 0 et ${MAX_TRAVEL_MINUTES} minutes`,
        });
      }
      if (values.timeMode !== 'FIXED') return;
      if (!values.time) {
        ctx.addIssue({
          code: 'custom',
          path: ['time'],
          message: 'Choisissez l’heure du rendez-vous',
        });
      } else if (timeOnMatchDay(startsAt, values.time) > new Date(startsAt)) {
        ctx.addIssue({
          code: 'custom',
          path: ['time'],
          message: 'Le rendez-vous doit être avant le coup d’envoi',
        });
      }
    });
}

type MeetingFormValues = z.infer<ReturnType<typeof meetingSchema>>;

function defaultsFromPlan(plan: EventMeetingPlan): MeetingFormValues {
  const hasOwnPlace = plan.meetingPointSource === 'EVENT';
  const hasFixedTime = plan.meetsAtSource === 'OVERRIDE' && plan.meetsAt !== null;
  return {
    placeMode: hasOwnPlace ? 'CUSTOM' : 'DEFAULT',
    name: hasOwnPlace ? (plan.meetingPoint?.name ?? '') : '',
    address: hasOwnPlace ? (plan.meetingPoint?.address ?? '') : '',
    minutes: plan.travelMinutesSource === 'MANUAL' ? String(plan.travelMinutes) : '',
    timeMode: hasFixedTime ? 'FIXED' : 'AUTO',
    time: hasFixedTime && plan.meetsAt ? toTimeValue(plan.meetsAt) : '',
  };
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
 * sent only when it changed (react-hook-form's dirty fields) — so touching
 * the time never resets the place — under a live preview of the meeting
 * time the form would produce, computed by the same `computeMeetsAt` the
 * API uses.
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
  const { mutateAsync: update } = useEventMeetingUpdate(clubId, teamId, event.id);
  const { mutate: refresh, isPending: isRefreshing } = useEventMeetingRefresh(
    clubId,
    teamId,
    event.id,
  );
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, dirtyFields, isSubmitting },
  } = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingSchema(event.startsAt)),
    defaultValues: defaultsFromPlan(plan),
  });

  const hasOwnPlace = plan.meetingPointSource === 'EVENT';
  const hasFixedTime = plan.meetsAtSource === 'OVERRIDE' && plan.meetsAt !== null;
  const computedMinutes = plan.travelMinutesSource === 'COMPUTED' ? plan.travelMinutes : null;
  const defaultPoint = plan.defaultMeetingPoint;
  const defaultSource = plan.defaultMeetingPointSource;

  // Re-seed on every open, so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (open) reset(defaultsFromPlan(plan));
  }, [open, plan, reset]);

  const [placeMode, minutes, timeMode, time] = watch(['placeMode', 'minutes', 'timeMode', 'time']);
  const placeChanged = Boolean(dirtyFields.placeMode || dirtyFields.name || dirtyFields.address);

  // Typed minutes win; otherwise the computed ones, unless the place moved
  // (the server will recompute for the new route).
  const typedMinutes = parseMinutes(minutes);
  const previewMinutes =
    typeof typedMinutes === 'number' ? typedMinutes : placeChanged ? null : computedMinutes;
  const preview =
    timeMode === 'FIXED'
      ? time
        ? { time, detail: 'Heure fixée pour ce match' }
        : null
      : previewMinutes !== null
        ? {
            time: formatEventTime(
              computeMeetsAt({
                startsAt: new Date(event.startsAt),
                arrivalBufferMinutes: plan.arrivalBufferMinutes,
                travelMinutes: previewMinutes,
              }).toISOString(),
            ),
            detail: `${formatEventTime(event.startsAt)} − ${plan.arrivalBufferMinutes} min d’arrivée − ${previewMinutes} min de trajet, arrondi au quart d’heure inférieur`,
          }
        : null;

  const onSubmit = handleSubmit(async (values) => {
    const dto: UpdateEventMeetingRequest = {};
    if (values.placeMode === 'DEFAULT') {
      if (hasOwnPlace) dto.meetingPoint = null;
    } else if (placeChanged) {
      dto.meetingPoint = toMeetingPoint(values);
    }
    if (dirtyFields.minutes) {
      const parsed = parseMinutes(values.minutes);
      dto.travelMinutes = parsed === 'invalid' ? null : parsed;
    }
    if (values.timeMode === 'AUTO') {
      if (hasFixedTime) dto.meetsAt = null;
    } else if (dirtyFields.timeMode || dirtyFields.time) {
      dto.meetsAt = timeOnMatchDay(event.startsAt, values.time).toISOString();
    }

    if (Object.keys(dto).length === 0) {
      onOpenChange(false);
      return;
    }
    try {
      await update(dto);
      toast({ variant: 'success', title: 'Rendez-vous mis à jour' });
      onOpenChange(false);
    } catch (err) {
      setError('root', { message: getClubErrorMessage(err) });
    }
  });

  const handleRefresh = () =>
    refresh(undefined, {
      onSuccess: (updated) => {
        toast(
          updated.travelMinutes === null
            ? {
                variant: 'destructive',
                description: 'Adresse introuvable — saisissez la durée à la main.',
              }
            : { variant: 'success', title: `Trajet recalculé : ${updated.travelMinutes} min` },
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
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 pt-2">
          {errors.root && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
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
            <Controller
              control={control}
              name="placeMode"
              render={({ field }) => (
                <RadioCardGroup<PlaceMode>
                  aria-labelledby="event-meeting-place"
                  tone="choice"
                  indicator
                  value={field.value}
                  onChange={field.onChange}
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
                    {
                      value: 'CUSTOM',
                      render: () => <RadioLabel title="Autre lieu pour ce match" />,
                    },
                  ]}
                />
              )}
            />
            {placeMode === 'CUSTOM' && (
              <>
                <FormField
                  label="Nom du lieu"
                  id="event-meeting-name"
                  maxLength={MEETING_POINT_NAME_MAX_LENGTH}
                  error={errors.name?.message}
                  {...register('name')}
                />
                <FormField
                  label="Adresse"
                  id="event-meeting-address"
                  maxLength={MEETING_POINT_ADDRESS_MAX_LENGTH}
                  error={errors.address?.message}
                  {...register('address')}
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
                error={errors.minutes?.message}
                {...register('minutes')}
              />
              {plan.meetingPoint && (
                <Button
                  type="button"
                  variant="outline"
                  loading={isRefreshing}
                  onClick={handleRefresh}
                >
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
            <Controller
              control={control}
              name="timeMode"
              render={({ field }) => (
                <RadioCardGroup<TimeMode>
                  aria-labelledby="event-meeting-time-mode"
                  tone="choice"
                  indicator
                  value={field.value}
                  onChange={field.onChange}
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
                      render: () => (
                        <RadioLabel title="Heure fixe" detail="Pause repas, bouchons…" />
                      ),
                    },
                  ]}
                />
              )}
            />
            {timeMode === 'FIXED' && (
              <FormField
                label="Heure du rendez-vous"
                id="event-meeting-time"
                type="time"
                error={errors.time?.message}
                {...register('time')}
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
              <Button type="button" variant="ghost">
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" loading={isSubmitting}>
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
