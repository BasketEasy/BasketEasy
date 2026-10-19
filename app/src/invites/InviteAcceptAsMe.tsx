import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Text } from '@basketeasy/ui/text';
import type { PlayerInvitePreview } from '@basketeasy/types/player-invites';
import { ApiError } from '../api/client';
import { useLogout } from '../auth/mutations';
import { useAcceptPlayerInviteAsMe } from './useAcceptPlayerInviteAsMe';
import { getInviteErrorMessage, isInviteAlreadyAccepted } from './inviteErrorMessages';

// The generic 409 copy talks about an e-mail address, which makes no sense
// here: the visitor registers nothing.
function asMeErrorMessage(err: unknown): string {
  if (isInviteAlreadyAccepted(err)) return 'Cette invitation a déjà été utilisée.';
  if (err instanceof ApiError && err.status === 409) {
    return 'Ce compte est déjà lié à un autre joueur de ce club.';
  }
  return getInviteErrorMessage(err);
}

/**
 * The logged-in path: someone who already has an account links it to the
 * invited player instead of registering a second one. An error is a server
 * refusal bound to the form, so it renders in the card (setError('root') +
 * Alert is the convention of the public auth forms).
 */
export function InviteAcceptAsMe({
  token,
  preview,
  email,
}: {
  token: string;
  preview: PlayerInvitePreview;
  email: string;
}) {
  const navigate = useNavigate();
  const { mutate: accept, isPending } = useAcceptPlayerInviteAsMe(token);
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const [error, setError] = useState<string | null>(null);

  const handleAccept = () => {
    setError(null);
    accept(undefined, {
      onSuccess: () => navigate('/dashboard', { replace: true }),
      onError: (err) => setError(asMeErrorMessage(err)),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Text variant="meta">
        Vous êtes connecté·e avec <strong>{email}</strong>. Ce compte sera lié à la fiche de{' '}
        {preview.playerFirstName} {preview.playerLastName}.
      </Text>
      <Button type="button" loading={isPending} onClick={handleAccept}>
        Lier ce compte à la fiche de {preview.playerFirstName}
      </Button>
      <Button type="button" variant="ghost" disabled={isLoggingOut} onClick={() => logout()}>
        Ce n&apos;est pas vous ? Se déconnecter
      </Button>
    </div>
  );
}
