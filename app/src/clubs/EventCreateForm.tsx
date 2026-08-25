import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Checkbox } from '@basketeasy/ui/checkbox';
import { FormField } from '@basketeasy/ui/form-field';
import { Label } from '@basketeasy/ui/label';
import { SelectField } from '@basketeasy/ui/select-field';
import { Textarea } from '@basketeasy/ui/textarea';
import type { EventType } from '@basketeasy/types/events';
import { useEventCreate } from './useEventCreate';
import { getClubErrorMessage } from './clubErrorMessages';
import { EVENT_TYPE_OPTIONS } from './eventLabels';

const eventSchema = z
  .object({
    type: z.enum(['TRAINING', 'MATCH']),
    startsAt: z.string().min(1, 'Date requise'),
    location: z.string().min(1, 'Lieu requis'),
    notes: z.string().optional(),
    opponentName: z.string().optional(),
    isRecurring: z.boolean(),
    recurrenceUntil: z.string().optional(),
  })
  .refine((data) => !data.isRecurring || !!data.recurrenceUntil, {
    message: 'Date de fin requise pour un événement récurrent',
    path: ['recurrenceUntil'],
  })
  .refine((data) => data.type !== 'MATCH' || !!data.opponentName?.trim(), {
    message: "Nom de l'adversaire requis pour un match",
    path: ['opponentName'],
  });

type EventFormValues = z.infer<typeof eventSchema>;

export function EventCreateForm({
  clubId,
  teamId,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  onSuccess?: () => void;
}) {
  const { mutate: createEvent, isPending } = useEventCreate(clubId, teamId);
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      type: 'TRAINING',
      startsAt: '',
      location: '',
      notes: '',
      opponentName: '',
      isRecurring: false,
      recurrenceUntil: '',
    },
  });
  const isRecurring = watch('isRecurring');
  const type = watch('type');

  const onSubmit = (values: EventFormValues) => {
    createEvent(
      {
        type: values.type,
        startsAt: new Date(values.startsAt).toISOString(),
        location: values.location,
        notes: values.notes || undefined,
        opponentName: values.type === 'MATCH' ? values.opponentName : undefined,
        recurrence: values.isRecurring
          ? { frequency: 'WEEKLY', until: new Date(values.recurrenceUntil!).toISOString() }
          : undefined,
      },
      {
        onSuccess: () => {
          reset();
          onSuccess?.();
        },
        onError: (err) => setError('root', { message: getClubErrorMessage(err) }),
      },
    );
  };

  return (
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
            id="event-type-select"
            options={EVENT_TYPE_OPTIONS}
            value={field.value}
            onValueChange={(value) => field.onChange(value as EventType)}
          />
        )}
      />

      {type === 'MATCH' && (
        <FormField
          label="Adversaire"
          id="event-opponent-name"
          error={errors.opponentName?.message}
          {...register('opponentName')}
        />
      )}

      <FormField
        label="Date et heure"
        id="event-starts-at"
        type="datetime-local"
        error={errors.startsAt?.message}
        {...register('startsAt')}
      />

      <FormField
        label="Lieu"
        id="event-location"
        error={errors.location?.message}
        {...register('location')}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-notes">Notes (optionnel)</Label>
        <Textarea id="event-notes" {...register('notes')} />
      </div>

      <div className="flex items-center gap-2 py-1">
        <Controller
          control={control}
          name="isRecurring"
          render={({ field }) => (
            <Checkbox
              id="event-is-recurring"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <Label htmlFor="event-is-recurring">Se répète chaque semaine</Label>
      </div>

      {isRecurring && (
        <FormField
          label="Jusqu'au"
          id="event-recurrence-until"
          type="date"
          error={errors.recurrenceUntil?.message}
          {...register('recurrenceUntil')}
        />
      )}

      <Button type="submit" loading={isSubmitting || isPending}>
        Créer l'événement
      </Button>
    </form>
  );
}
