import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { useAccount } from '../auth/useAccount';
import { useAccountUpdate } from './useAccountUpdate';
import { getAccountErrorMessage } from './accountErrorMessages';

const accountSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  avatarUrl: z.union([z.string().url("URL de l'avatar invalide"), z.literal('')]),
});

type AccountFormValues = z.infer<typeof accountSchema>;

export function AccountProfileForm() {
  const { user } = useAccount();
  const { mutate: updateAccount, isPending } = useAccountUpdate();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      avatarUrl: user?.avatarUrl ?? '',
    },
  });

  // The session user loads asynchronously (see useSession), so it's often
  // still null on this component's first render — reset() re-applies the
  // form's default values once the real user data arrives.
  useEffect(() => {
    if (user) {
      reset({
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        avatarUrl: user.avatarUrl ?? '',
      });
    }
  }, [user, reset]);

  const onSubmit = (values: AccountFormValues) => {
    updateAccount(
      {
        firstName: values.firstName,
        lastName: values.lastName,
        // Empty input means "clear the avatar", which the API models as
        // an explicit null (as opposed to omitting the field, which would
        // leave the existing value untouched).
        avatarUrl: values.avatarUrl === '' ? null : values.avatarUrl,
      },
      {
        onError: (err) => setError('root', { message: getAccountErrorMessage(err) }),
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
        label="Prénom"
        id="account-first-name"
        autoComplete="given-name"
        error={errors.firstName?.message}
        {...register('firstName')}
      />

      <FormField
        label="Nom"
        id="account-last-name"
        autoComplete="family-name"
        error={errors.lastName?.message}
        {...register('lastName')}
      />

      <FormField
        label="URL de l'avatar"
        id="account-avatar-url"
        error={errors.avatarUrl?.message}
        {...register('avatarUrl')}
      />

      <Button type="submit" disabled={isSubmitting || isPending}>
        Enregistrer
      </Button>
    </form>
  );
}
