import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { useTeamCreate } from './useTeamCreate';
import { getTeamErrorMessage } from './teamErrorMessages';

const teamSchema = z.object({
  name: z.string().min(2, "Le nom de l'équipe doit contenir au moins 2 caractères"),
});

type TeamFormValues = z.infer<typeof teamSchema>;

export function TeamCreateForm({ clubId, onSuccess }: { clubId: string; onSuccess?: () => void }) {
  const { mutate: createTeam, isPending } = useTeamCreate(clubId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TeamFormValues>({ resolver: zodResolver(teamSchema) });

  const onSubmit = (values: TeamFormValues) => {
    createTeam(values, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
      onError: (err) => setError('root', { message: getTeamErrorMessage(err) }),
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
        label="Nom de l'équipe"
        id="team-name"
        error={errors.name?.message}
        {...register('name')}
      />

      <Button type="submit" disabled={isSubmitting || isPending}>
        Créer
      </Button>
    </form>
  );
}
