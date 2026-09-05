import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@basketeasy/ui/card';
import { FormField } from '@basketeasy/ui/form-field';
import { Loader } from '@basketeasy/ui/loader';
import { QueryError } from '@basketeasy/ui/query-error';
import { Text } from '@basketeasy/ui/text';
import { ApiError } from '../api/client';
import { useAccount } from '../auth/useAccount';
import { useInvitePreview } from './useInvitePreview';
import { useAcceptPlayerInvite } from './useAcceptPlayerInvite';
import { getInviteErrorMessage } from './inviteErrorMessages';

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
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AcceptFormValues>({ resolver: zodResolver(acceptSchema) });

  const onSubmit = (values: AcceptFormValues) => {
    accept(values, {
      onSuccess: () => navigate('/dashboard', { replace: true }),
      onError: (err) => setError('root', { message: getInviteErrorMessage(err) }),
    });
  };

  if (isError) {
    const isInvalidOrExpired = error instanceof ApiError && error.status === 404;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitation invalide</CardTitle>
        </CardHeader>
        <CardContent>
          {isInvalidOrExpired ? (
            <Text variant="meta">
              Ce lien d&apos;invitation est invalide ou a expiré. Demandez à votre club de vous en
              envoyer un nouveau.
            </Text>
          ) : (
            <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />
          )}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Loader>Chargement de l&apos;invitation…</Loader>
        </CardContent>
      </Card>
    );
  }

  if (!preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitation invalide</CardTitle>
        </CardHeader>
        <CardContent>
          <Text variant="meta">Ce lien d&apos;invitation est invalide ou a expiré.</Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rejoindre {preview.clubName}</CardTitle>
      </CardHeader>
      <CardContent>
        <Text variant="meta" className="mb-4">
          Vous avez été invité·e en tant que {preview.playerFirstName} {preview.playerLastName}.
          Créez votre compte pour accéder à votre espace joueur.
        </Text>
        {currentUser && (
          <Alert className="mb-4">
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
      </CardContent>
    </Card>
  );
}
