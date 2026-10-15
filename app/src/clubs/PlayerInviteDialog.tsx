import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { Input } from '@basketeasy/ui/input';
import { Loader } from '@basketeasy/ui/loader';
import { QueryError } from '@basketeasy/ui/query-error';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import type { Player } from '@basketeasy/types/players';
import type { PlayerInviteLink, PlayerInviteState } from '@basketeasy/types/player-invites';
import { usePlayerInvite } from './usePlayerInvite';
import { usePlayerInviteStatus } from './usePlayerInviteStatus';
import { getClubErrorMessage } from './clubErrorMessages';

const STATUS_LABEL: Record<PlayerInviteState, string> = {
  NONE: "Aucune invitation n'a encore été envoyée à ce joueur.",
  PENDING: 'Une invitation est en attente de réponse.',
  EXPIRED: 'Le dernier lien envoyé a expiré.',
  ACCEPTED: 'Ce joueur a déjà accepté une invitation.',
};

/**
 * Dialog letting an admin generate a one-time signup link for a player with
 * no linked account yet — the player opens the link, creates their account,
 * and gets linked to this Player row automatically. Only ever rendered for
 * `!player.userId` (see PlayerRow), so a fresh ACCEPTED status here just
 * means the roster list hasn't refetched yet.
 */
export function PlayerInviteDialog({
  clubId,
  player,
  open,
  onOpenChange,
}: {
  clubId: string;
  player: Pick<Player, 'id' | 'firstName' | 'lastName'>;
  /**
   * Controlled mode, for a caller that opens the dialog itself (the « invite
   * request » notification lands on it): no trigger button is drawn.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : ownOpen;
  const setIsOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [link, setLink] = useState<PlayerInviteLink | null>(null);
  const {
    data: status,
    isLoading,
    isError,
    refetch,
  } = usePlayerInviteStatus(clubId, player.id, isOpen);
  const { mutate: generateInvite, isPending } = usePlayerInvite(clubId, player.id);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setLink(null);
    }
  };

  const handleGenerate = () => {
    generateInvite(undefined, {
      onSuccess: (result) => setLink(result),
      onError: (err) =>
        toast({
          variant: 'destructive',
          description: getClubErrorMessage(err, { 400: 'Ce joueur est déjà lié à un compte.' }),
        }),
    });
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast({ variant: 'success', title: 'Lien copié' });
    } catch {
      toast({ variant: 'destructive', description: 'Impossible de copier le lien.' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline">Inviter</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Inviter {player.firstName} {player.lastName}
          </DialogTitle>
          <DialogDescription>
            Générez un lien à envoyer au joueur (SMS, WhatsApp, e-mail...) pour qu&apos;il crée son
            compte et soit automatiquement lié à sa fiche.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" onClick={() => void handleCopy()}>
                Copier
              </Button>
            </div>
            <Text variant="meta">
              Ce lien expire le {new Date(link.expiresAt).toLocaleDateString('fr-FR')}.
            </Text>
          </div>
        ) : isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <Loader>Chargement…</Loader>
        ) : (
          <div className="flex flex-col gap-3">
            <Text variant="meta">{status ? STATUS_LABEL[status.status] : ''}</Text>
            <Button type="button" loading={isPending} onClick={handleGenerate}>
              {status?.status === 'PENDING' || status?.status === 'EXPIRED'
                ? 'Générer un nouveau lien'
                : "Générer un lien d'invitation"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
