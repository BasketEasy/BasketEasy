import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { SelectField } from '@basketeasy/ui/select-field';
import { toast } from '@basketeasy/ui/toast-store';
import type { TeamAdminCandidate } from '@basketeasy/types/team-admins';
import { ApiError } from '../api/client';
import { useTeamAdminAdd } from './useTeamAdminAdd';
import { getClubErrorMessage } from './clubErrorMessages';

const teamAdminSchema = z.object({
  userId: z.string().min(1, 'Membre requis'),
});

type TeamAdminFormValues = z.infer<typeof teamAdminSchema>;

function candidateLabel(candidate: TeamAdminCandidate): string {
  const name = [candidate.firstName, candidate.lastName].filter(Boolean).join(' ');
  return name ? `${name} (${candidate.email})` : candidate.email;
}

export function TeamAdminAddForm({
  clubId,
  teamId,
  candidates,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  /** Members of a club linked to this team who aren't already a TeamAdmin. */
  candidates: TeamAdminCandidate[];
  onSuccess?: () => void;
}) {
  const { mutate: addTeamAdmin, isPending } = useTeamAdminAdd(clubId, teamId);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TeamAdminFormValues>({
    resolver: zodResolver(teamAdminSchema),
    defaultValues: { userId: '' },
  });

  const onSubmit = (values: TeamAdminFormValues) => {
    addTeamAdmin(values, {
      onSuccess: () => {
        toast({ variant: 'success', title: 'Administrateur ajouté' });
        reset();
        onSuccess?.();
      },
      onError: (err) => {
        // getClubErrorMessage's 409 copy is hardcoded to "already a club
        // member" — wrong here (this is about team admin grants), so that
        // case is handled directly from the server's own (already French)
        // message instead.
        const message =
          err instanceof ApiError && err.status === 409 ? err.message : getClubErrorMessage(err);
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

      <Controller
        control={control}
        name="userId"
        render={({ field }) => (
          <SelectField
            label="Membre"
            id="team-admin-select"
            options={candidates.map((candidate) => ({
              value: candidate.userId,
              label: candidateLabel(candidate),
            }))}
            value={field.value}
            onValueChange={field.onChange}
            placeholder="Choisir un membre"
            error={errors.userId?.message}
          />
        )}
      />

      <Button type="submit" disabled={candidates.length === 0} loading={isSubmitting || isPending}>
        Ajouter
      </Button>
    </form>
  );
}
