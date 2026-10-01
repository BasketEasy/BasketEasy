import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { FormField } from '@basketeasy/ui/form-field';
import { Loader } from '@basketeasy/ui/loader';
import { QueryError } from '@basketeasy/ui/query-error';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { ApiError } from '../api/client';
import { AuthCard } from '../auth/AuthCard';
import { useAccount } from '../auth/useAccount';
import { useInvitePreview } from './useInvitePreview';
import { useAcceptPlayerInvite } from './useAcceptPlayerInvite';
import { getInviteErrorMessage, isInviteAlreadyAccepted } from './inviteErrorMessages';

// Shared by both places an already-accepted invite can surface: the preview
// fetch on page load (the common case — re-clicking a used link) and the
// accept submit (a race between two tabs on the same invite). `as="span"`
// when nested inside AlertDescription's own <p>, to keep the markup valid.
function AlreadyAcceptedNotice({ as }: { as?: 'p' | 'span' }) {
  return (
    <Text variant="meta" as={as}>
      Vous avez déjà un compte pour cette invitation.{' '}
      <TextLink asChild>
        <Link to="/login">Connectez-vous</Link>
      </TextLink>
      .
    </Text>
  );
}

const acceptSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
});

type AcceptFormValues = z.infer<typeof acceptSchema>;

export function InviteAcceptForm({ token }: { token: string }) {
  const navigate = useNavigate();
  // /invite/:token sits outside both PublicOnlyRoute and ProtectedRoute (see
  // InviteAcceptPage) so it works for a logged-out visitor — but that also
  // means an already-authenticated visitor (e.g. a club admin testing their
  // own invite link) can land here. Submitting still unconditionally
  // overwrites the session (see useAcceptPlayerInvite), so warn them up
  // front rather than silently signing them out.
  const { user: currentUser } = useAccount();
  const {
    data: preview,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useInvitePreview(token);
  const { mutate: accept, isPending } = useAcceptPlayerInvite(token);
  const [submitAlreadyAccepted, setSubmitAlreadyAccepted] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AcceptFormValues>({ resolver: zodResolver(acceptSchema) });

  const onSubmit = (values: AcceptFormValues) => {
    setSubmitAlreadyAccepted(false);
    accept(values, {
      onSuccess: () => navigate('/dashboard', { replace: true }),
      onError: (err) => {
        if (isInviteAlreadyAccepted(err)) {
          setSubmitAlreadyAccepted(true);
          return;
        }
        setError('root', { message: getInviteErrorMessage(err) });
      },
    });
  };

  if (isError) {
    const alreadyAccepted = isInviteAlreadyAccepted(error);
    const isInvalidOrExpired = error instanceof ApiError && error.status === 404;
    return (
      <AuthCard title={alreadyAccepted ? 'Invitation déjà acceptée' : 'Invitation invalide'}>
        {alreadyAccepted ? (
          <AlreadyAcceptedNotice />
        ) : isInvalidOrExpired ? (
          <Text variant="meta">
            Ce lien d&apos;invitation est invalide ou a expiré. Demandez à votre club de vous en
            envoyer un nouveau.
          </Text>
        ) : (
          <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />
        )}
      </AuthCard>
    );
  }

  if (isLoading) {
    return (
      <AuthCard title="Invitation">
        <Loader>Chargement de l&apos;invitation…</Loader>
      </AuthCard>
    );
  }

  if (!preview) {
    return (
      <AuthCard title="Invitation invalide">
        <Text variant="meta">Ce lien d&apos;invitation est invalide ou a expiré.</Text>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow={preview.clubName}
      title="Rejoindre"
      description={`Vous avez été invité·e en tant que ${preview.playerFirstName} ${preview.playerLastName}. Créez votre compte pour accéder à votre espace joueur.`}
    >
      {currentUser && (
        <Alert>
          <AlertDescription>
            Vous êtes actuellement connecté·e avec le compte {currentUser.email}. Créer ce nouveau
            compte vous déconnectera de votre session actuelle.
          </AlertDescription>
        </Alert>
      )}
      <form
        noValidate
        onSubmit={(e) => {
          void handleSubmit(onSubmit)(e);
        }}
        className="flex flex-col gap-4"
      >
        {submitAlreadyAccepted && (
          <Alert>
            <AlertDescription>
              <AlreadyAcceptedNotice as="span" />
            </AlertDescription>
          </Alert>
        )}

        {errors.root?.message && (
          <Alert variant="destructive">
            <AlertDescription>{errors.root.message}</AlertDescription>
          </Alert>
        )}

        <FormField
          label="Adresse e-mail"
          id="invite-email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <FormField
          label="Mot de passe"
          id="invite-password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" loading={isSubmitting || isPending}>
          Créer mon compte
        </Button>
      </form>
    </AuthCard>
  );
}
