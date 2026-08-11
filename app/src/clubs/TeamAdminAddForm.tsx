import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { ApiError } from '../api/client';
import { useTeamAdminAdd } from './useTeamAdminAdd';
import { getClubErrorMessage } from './clubErrorMessages';

const teamAdminSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
});

type TeamAdminFormValues = z.infer<typeof teamAdminSchema>;

export function TeamAdminAddForm({
  clubId,
  teamId,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  onSuccess?: () => void;
}) {
  const { mutate: addTeamAdmin, isPending } = useTeamAdminAdd(clubId, teamId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TeamAdminFormValues>({ resolver: zodResolver(teamAdminSchema) });

  const onSubmit = (values: TeamAdminFormValues) => {
    addTeamAdmin(values, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
      onError: (err) => {
        // getClubErrorMessage's 409 copy is hardcoded to "already a club
        // member" — wrong here, so that case is handled directly from the
        // server's own (already French) message instead. 404 needs the same
        // care: TeamsService.addTeamAdmin returns a 404 both when the email
        // has no account AND when the team itself isn't found (assertTeamInClub)
        // — only the former gets the friendly copy below; anything else on
        // 404 falls through to getClubErrorMessage's generic "not found".
        let message: string;
        if (
          err instanceof ApiError &&
          err.status === 404 &&
          err.message === 'No account with that email'
        ) {
          message = 'Aucun compte avec cette adresse e-mail.';
        } else if (err instanceof ApiError && err.status === 409) {
          message = err.message;
        } else {
          message = getClubErrorMessage(err);
        }
        setError('root', { message });
      },
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
        label="Adresse e-mail"
        id="team-admin-email"
        type="email"
        error={errors.email?.message}
        {...register('email')}
      />

      <Button type="submit" disabled={isSubmitting || isPending}>
        Ajouter
      </Button>
    </form>
  );
}
