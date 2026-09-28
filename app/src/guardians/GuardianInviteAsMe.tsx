import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Text } from '@basketeasy/ui/text';
import type { GuardianInvitePreview } from '@basketeasy/types/guardians';
import { useLogout } from '../auth/mutations';
import { useAcceptGuardianInviteAsMe } from './useGuardianInvite';
import { getGuardianInviteErrorMessage, isConsentRequired } from './guardianErrorMessages';
import { GuardianConsentField } from './GuardianConsentField';
import { GUARDIAN_CONSENT_REQUIRED_MESSAGE } from './guardianConsent';
import {
  guardianInviteAsMeSchema,
  type GuardianInviteAsMeFormValues,
} from './guardianInviteSchema';

/**
 * The logged-in path: a parent who already plays, coaches or follows another
 * child adds this one to the same account (design decision 6).
 */
export function GuardianInviteAsMe({
  token,
  preview,
  email,
}: {
  token: string;
  preview: GuardianInvitePreview;
  email: string;
}) {
  const navigate = useNavigate();
  const { mutate: accept, isPending } = useAcceptGuardianInviteAsMe(token);
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<GuardianInviteAsMeFormValues>({
    resolver: zodResolver(guardianInviteAsMeSchema(preview.requiresConsent)),
    defaultValues: { consent: false },
  });

  const onSubmit = (values: GuardianInviteAsMeFormValues) => {
    accept(
      { consent: preview.requiresConsent ? values.consent : undefined },
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
        clearErrors('root');
        void handleSubmit(onSubmit)(e);
      }}
      className="flex flex-col gap-4"
    >
      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}
      <Text variant="meta">
        Vous êtes connecté·e avec <strong>{email}</strong>. {preview.playerFirstName} sera ajouté·e
        à ce compte, à côté de vos propres équipes.
      </Text>
      {preview.requiresConsent && (
        <Controller
          control={control}
          name="consent"
          render={({ field }) => (
            <GuardianConsentField
              id="guardian-as-me-consent"
              childFirstName={preview.playerFirstName}
              checked={field.value}
              onCheckedChange={field.onChange}
              error={errors.consent?.message}
            />
          )}
        />
      )}
      <Button type="submit" loading={isSubmitting || isPending}>
        Suivre {preview.playerFirstName}
      </Button>
      <Button type="button" variant="ghost" disabled={isLoggingOut} onClick={() => logout()}>
        Ce n&apos;est pas vous ? Se déconnecter
      </Button>
    </form>
  );
}
