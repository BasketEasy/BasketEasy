import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { FormField } from '@basketeasy/ui/form-field';
import { Label } from '@basketeasy/ui/label';
import { SelectField } from '@basketeasy/ui/select-field';
import { Textarea } from '@basketeasy/ui/textarea';
import { toast } from '@basketeasy/ui/toast-store';
import {
  isUnknownEventLocation,
  type EventType,
  type EventUpdateScope,
  type EventVenue,
  type TeamEvent,
} from '@basketeasy/types/events';
import { useEventUpdate } from './useEventUpdate';
import { useEventTimeUpdate } from './useEventTimeUpdate';
import { getClubErrorMessage } from './clubErrorMessages';
import { toDatetimeLocalValue } from './eventDateFormat';
import {
  eventVenueFields,
  refineEventVenue,
  toEventVenue,
  venueFormValues,
} from './eventVenueSchema';
import { EVENT_TYPE_OPTIONS, EVENT_UPDATE_SCOPE_OPTIONS, EVENT_VENUE_OPTIONS } from './eventLabels';
import { Text } from '@basketeasy/ui/text';
import { EventWhatsAppReminderFields } from '../whatsapp-reminders/EventWhatsAppReminderFields';
import {
  refineReminderOffset,
  reminderDefaultsFor,
  reminderFormShape,
  toReminderRequestFields,
} from '../whatsapp-reminders/eventReminderForm';

// `addressOptional` for an event still on « Lieu non communiqué »: an edit
// that leaves the address empty sends the placeholder back unchanged.
const buildEventEditSchema = (addressOptional: boolean) =>
  z
    .object({
      type: z.enum(['TRAINING', 'MATCH']),
      scope: z.enum(['THIS', 'THIS_AND_FUTURE', 'ALL']),
      startsAt: z.string(),
      time: z.string(),
      ...eventVenueFields,
      notes: z.string().optional(),
      opponentName: z.string().optional(),
      venue: z.enum(['HOME', 'AWAY']).optional(),
      ...reminderFormShape,
    })
    .superRefine(refineReminderOffset)
    .superRefine((d, ctx) => refineEventVenue(d, ctx, { addressOptional }))
    .refine((d) => d.scope !== 'THIS' || d.startsAt.length > 0, {
      message: 'Date requise',
      path: ['startsAt'],
    })
    .refine((d) => d.scope === 'THIS' || /^([01]\d|2[0-3]):([0-5]\d)$/.test(d.time), {
      message: 'Heure invalide',
      path: ['time'],
    })
    .refine((d) => d.type !== 'MATCH' || !!d.opponentName?.trim(), {
      message: "Nom de l'adversaire requis pour un match",
      path: ['opponentName'],
    })
    .refine((d) => d.type !== 'MATCH' || !!d.venue, {
      message: 'Domicile/extérieur requis pour un match',
      path: ['venue'],
    });

type EventEditFormValues = z.infer<ReturnType<typeof buildEventEditSchema>>;

function buildDefaultValues(event: TeamEvent): EventEditFormValues {
  const datetimeLocal = toDatetimeLocalValue(event.startsAt);
  return {
    type: event.type,
    scope: 'THIS',
    startsAt: datetimeLocal,
    time: datetimeLocal.slice(11),
    ...venueFormValues(event),
    notes: event.notes ?? '',
    opponentName: event.opponentName ?? '',
    venue: event.venue ?? undefined,
    ...reminderDefaultsFor(event),
  };
}

export function EventEditModal({
  clubId,
  teamId,
  event,
  open,
  onOpenChange,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutateAsync: updateEvent, isPending: isUpdating } = useEventUpdate(clubId, teamId);
  const isUnknownVenue = isUnknownEventLocation(event.location);
  const eventEditSchema = useMemo(() => buildEventEditSchema(isUnknownVenue), [isUnknownVenue]);
  const { mutateAsync: updateEventTime, isPending: isUpdatingTime } = useEventTimeUpdate(
    clubId,
    teamId,
  );
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<EventEditFormValues>({
    resolver: zodResolver(eventEditSchema),
    defaultValues: buildDefaultValues(event),
  });
  const type = watch('type');
  const scope = watch('scope');
  const waReminder = watch('waReminder');
  const isRecurring = event.recurrenceId !== null;

  // Controlled dialog + form: re-sync the form's defaults every time this
  // event's edit modal is opened, so stale values from a previous open (or a
  // just-refetched `event` prop) never leak into the fields.
  useEffect(() => {
    if (open) {
      reset(buildDefaultValues(event));
    }
  }, [open, event, reset]);

  const onSubmit = async (values: EventEditFormValues) => {
    try {
      await updateEvent({
        eventId: event.id,
        dto: {
          type: values.type,
          ...toEventVenue(values, event.location),
          notes: values.notes || undefined,
          opponentName: values.type === 'MATCH' ? values.opponentName : undefined,
          venue: values.type === 'MATCH' ? values.venue : undefined,
          scope: values.scope,
          ...(values.scope === 'THIS' ? { startsAt: new Date(values.startsAt).toISOString() } : {}),
          // Sent only when touched: an event read without its manager fields
          // (after a plain RSVP, say) must not have its override cleared by a
          // save that never looked at it.
          ...(dirtyFields.waReminder || dirtyFields.waOffsetValue || dirtyFields.waOffsetUnit
            ? toReminderRequestFields(values)
            : {}),
        },
      });

      if (values.scope !== 'THIS') {
        const [hour, minute] = values.time.split(':').map(Number);
        await updateEventTime({ eventId: event.id, dto: { scope: values.scope, hour, minute } });
      }

      toast({ variant: 'success', title: 'Événement modifié' });
      onOpenChange(false);
    } catch (err) {
      setError('root', { message: getClubErrorMessage(err) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Modifier</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier l&apos;événement</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="flex flex-col gap-4"
        >
          {errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}

          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <SelectField
                label="Type"
                id={`event-${event.id}-edit-type-select`}
                options={EVENT_TYPE_OPTIONS}
                value={field.value}
                onValueChange={(value) => field.onChange(value as EventType)}
              />
            )}
          />

          {type === 'MATCH' && (
            <FormField
              label="Adversaire"
              id={`event-${event.id}-edit-opponent-name`}
              error={errors.opponentName?.message}
              {...register('opponentName')}
            />
          )}

          {type === 'MATCH' && (
            <Controller
              control={control}
              name="venue"
              render={({ field }) => (
                <SelectField
                  label="Domicile / Extérieur"
                  id={`event-${event.id}-edit-venue-select`}
                  placeholder="Sélectionner…"
                  error={errors.venue?.message}
                  options={EVENT_VENUE_OPTIONS}
                  value={field.value ?? ''}
                  onValueChange={(value) => field.onChange(value as EventVenue)}
                />
              )}
            />
          )}

          {isRecurring && (
            <Controller
              control={control}
              name="scope"
              render={({ field }) => (
                <SelectField
                  label="Appliquer à"
                  id={`event-${event.id}-edit-scope-select`}
                  options={EVENT_UPDATE_SCOPE_OPTIONS}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value as EventUpdateScope)}
                />
              )}
            />
          )}

          {scope === 'THIS' ? (
            <FormField
              label="Date et heure"
              id={`event-${event.id}-edit-starts-at`}
              type="datetime-local"
              error={errors.startsAt?.message}
              {...register('startsAt')}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <FormField
                label="Heure"
                id={`event-${event.id}-edit-time`}
                type="time"
                error={errors.time?.message}
                {...register('time')}
              />
              <Text variant="meta">
                La date de chaque occurrence est conservée, seule l&apos;heure sera modifiée pour
                les événements sélectionnés.
              </Text>
            </div>
          )}

          <FormField
            label="Nom de la salle (optionnel)"
            id={`event-${event.id}-edit-location-name`}
            error={errors.locationName?.message}
            {...register('locationName')}
          />

          <FormField
            label="Adresse"
            id={`event-${event.id}-edit-location`}
            placeholder={isUnknownVenue ? 'Lieu non communiqué' : undefined}
            error={errors.location?.message}
            {...register('location')}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`event-${event.id}-edit-notes`}>Notes (optionnel)</Label>
            <Textarea id={`event-${event.id}-edit-notes`} {...register('notes')} />
          </div>

          <EventWhatsAppReminderFields
            clubId={clubId}
            teamId={teamId}
            control={control}
            idPrefix={`event-${event.id}-edit`}
            watchedChoice={waReminder}
            offsetError={errors.waOffsetValue?.message}
          />

          <Button type="submit" loading={isSubmitting || isUpdating || isUpdatingTime}>
            Enregistrer
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
