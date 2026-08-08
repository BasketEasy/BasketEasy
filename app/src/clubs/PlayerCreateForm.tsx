import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { usePlayerCreate } from './usePlayerCreate';
import { getClubErrorMessage } from './clubErrorMessages';

const playerSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
});

type PlayerFormValues = z.infer<typeof playerSchema>;

export function PlayerCreateForm({
  clubId,
  onSuccess,
}: {
  clubId: string;
  onSuccess?: () => void;
}) {
  const { mutate: createPlayer, isPending } = usePlayerCreate(clubId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PlayerFormValues>({ resolver: zodResolver(playerSchema) });

  const onSubmit = (values: PlayerFormValues) => {
    createPlayer(values, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
      onError: (err) => setError('root', { message: getClubErrorMessage(err) }),
    });
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
        label="Prénom"
        id="player-first-name"
        error={errors.firstName?.message}
        {...register('firstName')}
      />
      <FormField
        label="Nom"
        id="player-last-name"
        error={errors.lastName?.message}
        {...register('lastName')}
      />

      <Button type="submit" disabled={isSubmitting || isPending}>
        Ajouter
      </Button>
    </form>
  );
}
