import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { FormField } from '@basketeasy/ui/form-field';
import type { GuardianInvitePreview } from '@basketeasy/types/guardians';
import { useAcceptGuardianInvite } from './useGuardianInvite';
import { guardianInviteSchema, type GuardianInviteFormValues } from './guardianInviteSchema';
import { getGuardianInviteErrorMessage, isConsentRequired } from './guardianErrorMessages';
import { GuardianConsentField } from './GuardianConsentField';
import { GUARDIAN_CONSENT_REQUIRED_MESSAGE } from './guardianConsent';

/** « Créer un compte »: a new parent account, linked to the child in one step. */
export function GuardianInviteRegisterForm({
  token,
  preview,
}: {
  token: string;
  preview: GuardianInvitePreview;
}) {
  const navigate = useNavigate();
  const { mutate: accept, isPending } = useAcceptGuardianInvite(token);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GuardianInviteFormValues>({
    resolver: zodResolver(guardianInviteSchema(preview.requiresConsent)),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', consent: false },
  });

  const onSubmit = (values: GuardianInviteFormValues) => {
    accept(
      { ...values, consent: preview.requiresConsent ? values.consent : undefined },
      {
        onSuccess: () => navigate('/dashboard', { replace: true }),
        onError: (err) => {
          if (isConsentRequired(err)) {
            setError('consent', { message: GUARDIAN_CONSENT_REQUIRED_MESSAGE });
            return;
          }
          setError('root', { message: getGuardianInviteErrorMessage(err) });
        },
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
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Prénom"
          id="guardian-first-name"
          autoComplete="given-name"
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <FormField
          label="Nom"
          id="guardian-last-name"
          autoComplete="family-name"
          error={errors.lastName?.message}
          {...register('lastName')}
        />
      </div>
      <FormField
        label="Adresse e-mail"
        id="guardian-email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <FormField
        label="Mot de passe"
        id="guardian-password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      {preview.requiresConsent && (
        <Controller
          control={control}
          name="consent"
          render={({ field }) => (
            <GuardianConsentField
              id="guardian-register-consent"
              childFirstName={preview.playerFirstName}
              checked={field.value}
              onCheckedChange={field.onChange}
              error={errors.consent?.message}
            />
          )}
        />
      )}
      <Button type="submit" loading={isSubmitting || isPending}>
        Créer mon compte et suivre {preview.playerFirstName}
      </Button>
    </form>
  );
}
