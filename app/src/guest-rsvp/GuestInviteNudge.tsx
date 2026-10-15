import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { Heading } from '@basketeasy/ui/heading';
import { Text } from '@basketeasy/ui/text';
import { useGuestInviteRequest } from './useGuestInviteRequest';

/**
 * Soft, dismissible, never a gate: what an account unlocks, and a way to ask
 * the coach for a personal invite. The confirmation is constant: the server
 * answers 204 whether or not it notified anyone, and so does this card, so
 * the link can't be used to find out who already has an account.
 */
export function GuestInviteNudge({ token, teamPlayerId }: { token: string; teamPlayerId: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [requested, setRequested] = useState(false);
  const { mutate: requestInvite, isPending } = useGuestInviteRequest(token);

  if (dismissed) return null;

  return (
    <Card variant="inset" className="flex flex-col gap-2.5">
      <Heading as="h2" size="xl">
        Allez plus loin avec un compte Kluvo
      </Heading>
      <Text variant="meta" size="sm">
        Soyez prévenu·e de vos convocations et de l&apos;heure du RDV, suivez vos statistiques de la
        saison, votez pour le joueur du match et retrouvez les résultats et feuilles de match.
      </Text>
      {requested ? (
        <Text variant="label" size="sm" role="status">
          Demande envoyée à votre coach
        </Text>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={isPending}
            // Sent whatever happens: a failure here has nothing useful to
            // tell the visitor that the coach's own follow-up wouldn't.
            onClick={() => requestInvite({ teamPlayerId }, { onSettled: () => setRequested(true) })}
          >
            Demander mon invitation
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/login">J&apos;ai déjà un compte</Link>
          </Button>
        </div>
      )}
      <Button variant="ghost" size="sm" className="self-start" onClick={() => setDismissed(true)}>
        Plus tard
      </Button>
    </Card>
  );
}
