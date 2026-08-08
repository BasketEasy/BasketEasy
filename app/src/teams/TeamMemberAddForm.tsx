import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@basketeasy/ui/select';
import { useClubMemberList } from '../clubs/useClubMemberList';
import { useTeamMemberAdd } from './useTeamMemberAdd';
import { useTeamMemberList } from './useTeamMemberList';
import { getTeamErrorMessage } from './teamErrorMessages';

const memberSchema = z.object({
  userId: z.string().min(1, 'Choisissez un membre'),
});

type MemberFormValues = z.infer<typeof memberSchema>;

export function TeamMemberAddForm({
  clubId,
  teamId,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  onSuccess?: () => void;
}) {
  const { data: clubMembers } = useClubMemberList(clubId);
  const { data: teamMembers } = useTeamMemberList(clubId, teamId);
  const { mutate: addMember, isPending } = useTeamMemberAdd(clubId, teamId);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({ resolver: zodResolver(memberSchema) });

  const teamMemberIds = new Set((teamMembers ?? []).map((m) => m.userId));
  const candidates = (clubMembers ?? []).filter((m) => !teamMemberIds.has(m.userId));

  const onSubmit = (values: MemberFormValues) => {
    addMember(values, {
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

      <Controller
        name="userId"
        control={control}
        defaultValue=""
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger aria-label="Membre du club">
              <SelectValue placeholder="Choisir un membre du club" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((member) => (
                <SelectItem key={member.userId} value={member.userId}>
                  {member.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {errors.userId?.message && (
        <p role="alert" className="text-sm text-error">
          {errors.userId.message}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting || isPending || candidates.length === 0}>
        Ajouter à l&apos;équipe
      </Button>
    </form>
  );
}
