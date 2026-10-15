import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@basketeasy/ui/card';
import { Loader } from '@basketeasy/ui/loader';
import { QueryError } from '@basketeasy/ui/query-error';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@basketeasy/ui/tabs';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { ApiError } from '../api/client';
import { LoginForm } from '../auth/LoginForm';
import { useAccount } from '../auth/useAccount';
import { isInviteAlreadyAccepted } from '../invites/inviteErrorMessages';
import { useGuardianInvitePreview } from './useGuardianInvite';
import { GuardianInviteRegisterForm } from './GuardianInviteRegisterForm';
import { GuardianInviteAsMe } from './GuardianInviteAsMe';

/**
 * What a parent sees on opening their invite link: who they are about to
 * follow, then either « continue as <account> » when already logged in, or
 * « Créer un compte » / « J'ai déjà un compte ». Logging in through the second
 * tab updates the session in place, which swaps this card to the logged-in
 * branch — no redirect, the parent stays on their link.
 */
export function GuardianInviteCard({ token }: { token: string }) {
  const { user } = useAccount();
  const {
    data: preview,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useGuardianInvitePreview(token);

  if (isError) {
    const alreadyAccepted = isInviteAlreadyAccepted(error);
    const isInvalid = error instanceof ApiError && error.status === 404;
    return (
      <Card>
        <CardHeader>
          <CardTitle>{alreadyAccepted ? 'Lien déjà utilisé' : 'Lien invalide'}</CardTitle>
        </CardHeader>
        <CardContent>
          {alreadyAccepted ? (
            <Text variant="meta">
              Ce lien a déjà servi.{' '}
              <TextLink asChild>
                <Link to="/login">Connectez-vous</Link>
              </TextLink>{' '}
              pour retrouver votre enfant, ou demandez un nouveau lien au club.
            </Text>
          ) : isInvalid ? (
            <Text variant="meta">
              Ce lien n&apos;est plus valide ou a expiré. Demandez au club de vous en envoyer un
              nouveau.
            </Text>
          ) : (
            <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />
          )}
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !preview) {
    return (
      <Card>
        <CardContent>
          <Loader>Chargement de l&apos;invitation…</Loader>
        </CardContent>
      </Card>
    );
  }

  const childName = `${preview.playerFirstName} ${preview.playerLastName}`;
  const context = [...preview.teamNames, preview.clubName].join(' · ');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Suivre {childName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Text variant="meta">{context}</Text>
        <Text>
          En tant que parent, vous pourrez répondre aux convocations de {preview.playerFirstName},
          choisir son trajet et recevoir ses notifications.
        </Text>
        {user ? (
          <GuardianInviteAsMe token={token} preview={preview} email={user.email} />
        ) : (
          <Tabs defaultValue="register" className="flex flex-col gap-4">
            <TabsList>
              <TabsTrigger value="register">Créer un compte</TabsTrigger>
              <TabsTrigger value="login">J&apos;ai déjà un compte</TabsTrigger>
            </TabsList>
            <TabsContent value="register">
              <GuardianInviteRegisterForm token={token} preview={preview} />
            </TabsContent>
            <TabsContent value="login">
              <LoginForm />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
