import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { ApiError } from '../api/client';
import { useClubMemberAdd } from './useClubMemberAdd';
import { getClubErrorMessage } from './clubErrorMessages';

const memberSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
});

type MemberFormValues = z.infer<typeof memberSchema>;

export function ClubMemberAddForm({
  clubId,
  onSuccess,
}: {
  clubId: string;
  onSuccess?: () => void;
}) {
  const { mutate: addMember, isPending } = useClubMemberAdd(clubId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({ resolver: zodResolver(memberSchema) });

  const onSubmit = (values: MemberFormValues) => {
    addMember(values, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
      onError: (err) => {
        const message =
          err instanceof ApiError && err.status === 404
            ? 'Aucun compte avec cette adresse e-mail.'
            : getClubErrorMessage(err);
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
        label="Adresse e-mail du membre"
        id="member-email"
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
