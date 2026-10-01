import { Link } from 'react-router-dom';
import { Loader } from '@basketeasy/ui/loader';
import { QueryError } from '@basketeasy/ui/query-error';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@basketeasy/ui/tabs';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { ApiError } from '../api/client';
import { AuthCard } from '../auth/AuthCard';
import { LoginFields } from '../auth/LoginForm';
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
      <AuthCard title={alreadyAccepted ? 'Lien déjà utilisé' : 'Lien invalide'}>
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
      </AuthCard>
    );
  }

  if (isLoading || !preview) {
    return (
      <AuthCard title="Invitation">
        <Loader>Chargement de l&apos;invitation…</Loader>
      </AuthCard>
    );
  }

  const childName = `${preview.playerFirstName} ${preview.playerLastName}`;
  const context = [...preview.teamNames, preview.clubName].join(' · ');

  return (
    <AuthCard eyebrow={context} title={`Suivre ${childName}`}>
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
            <LoginFields />
          </TabsContent>
        </Tabs>
      )}
    </AuthCard>
  );
}
