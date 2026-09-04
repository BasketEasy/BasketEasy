import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import type { Player } from '@basketeasy/types/players';
import type { ClubMember } from '@basketeasy/types/club-members';
import { PlayerEditForm } from './PlayerEditForm';
import { PlayerInviteDialog } from './PlayerInviteDialog';
import { usePlayerDelete } from './usePlayerDelete';
import { getClubErrorMessage } from './clubErrorMessages';

/** One row of the Joueurs tab — a table row on desktop, a card below it. */
export function PlayerRow({
  clubId,
  player,
  isAdmin,
  linkedMemberEmail,
  linkableMembers,
}: {
  clubId: string;
  player: Player;
  isAdmin: boolean;
  /** Email of the member this player is linked to, if any. */
  linkedMemberEmail: string | null;
  /** Club members this player can be linked to: unlinked ones, plus its own current link. */
  linkableMembers: ClubMember[];
}) {
  const layout = useTableLayout();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { mutate: deletePlayer, isPending: isDeleting } = usePlayerDelete(clubId);

  const adminActions = isAdmin ? (
    <div className="flex flex-wrap gap-2">
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">Modifier</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le joueur</DialogTitle>
            <DialogDescription>
              Mettez à jour la fiche joueur, comme lors d&apos;un import.
            </DialogDescription>
          </DialogHeader>
          <PlayerEditForm
            clubId={clubId}
            player={player}
            linkableMembers={linkableMembers}
            onSuccess={() => setIsEditOpen(false)}
          />
        </DialogContent>
      </Dialog>
      {!player.userId && <PlayerInviteDialog clubId={clubId} player={player} />}
      <Button
        variant="destructive"
        loading={isDeleting}
        onClick={() =>
          deletePlayer(player.id, {
            onSuccess: () => toast({ variant: 'success', title: 'Joueur supprimé' }),
            onError: (err) =>
              toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
          })
        }
      >
        Supprimer
      </Button>
    </div>
  ) : null;

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <Text as="span" variant="label">
          {player.firstName} {player.lastName}
        </Text>
        <Text as="span" variant="meta" className="break-all">
          Compte lié : {linkedMemberEmail ?? '—'}
        </Text>
        {adminActions}
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>{player.firstName}</TableCell>
      <TableCell>{player.lastName}</TableCell>
      <TableCell>{linkedMemberEmail ?? '—'}</TableCell>
      <TableCell className="flex flex-col gap-2">{adminActions}</TableCell>
    </TableRow>
  );
}
