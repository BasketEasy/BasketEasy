import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { Label } from '@basketeasy/ui/label';
import { Textarea } from '@basketeasy/ui/textarea';
import { useEventCreate } from './useEventCreate';
import { getClubErrorMessage } from './clubErrorMessages';

const eventSchema = z.object({
  startsAt: z.string().min(1, 'Date requise'),
  location: z.string().min(1, 'Lieu requis'),
  notes: z.string().optional(),
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
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: { startsAt: '', location: '', notes: '' },
  });

  const onSubmit = (values: EventFormValues) => {
    createEvent(
      {
        startsAt: new Date(values.startsAt).toISOString(),
        location: values.location,
        notes: values.notes || undefined,
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

      <Button type="submit" disabled={isSubmitting || isPending}>
        Créer l'événement
      </Button>
    </form>
  );
}
