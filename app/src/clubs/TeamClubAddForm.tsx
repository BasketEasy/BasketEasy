import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { useTeamClubAdd } from './useTeamClubAdd';
import { getClubErrorMessage } from './clubErrorMessages';

const teamClubSchema = z.object({
  clubId: z.string().min(1, 'Identifiant du club requis'),
});

type TeamClubFormValues = z.infer<typeof teamClubSchema>;

export function TeamClubAddForm({
  clubId,
  teamId,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  onSuccess?: () => void;
}) {
  const { mutate: addTeamClub, isPending } = useTeamClubAdd(clubId, teamId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TeamClubFormValues>({
    resolver: zodResolver(teamClubSchema),
    defaultValues: { clubId: '' },
  });

  const onSubmit = (values: TeamClubFormValues) => {
    addTeamClub(
      { clubId: values.clubId },
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
      <p className="text-sm text-muted">
        Demandez à l'administrateur du club partenaire (entente/CTC) son identifiant de club pour
        l'associer à cette équipe.
      </p>

      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <FormField
        label="Identifiant du club partenaire"
        id="team-club-id"
        error={errors.clubId?.message}
        {...register('clubId')}
      />

      <Button type="submit" disabled={isSubmitting || isPending}>
        Associer
      </Button>
    </form>
  );
}
