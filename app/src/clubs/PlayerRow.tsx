import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { toast } from '@basketeasy/ui/toast-store';
import type { Player } from '@basketeasy/types/players';
import type { ClubMember } from '@basketeasy/types/club-members';
import { PlayerEditForm } from './PlayerEditForm';
import { usePlayerDelete } from './usePlayerDelete';
import { getClubErrorMessage } from './clubErrorMessages';

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
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { mutate: deletePlayer, isPending: isDeleting } = usePlayerDelete(clubId);

  return (
    <TableRow>
      <TableCell>{player.firstName}</TableCell>
      <TableCell>{player.lastName}</TableCell>
      <TableCell>{linkedMemberEmail ?? '—'}</TableCell>
      <TableCell className="flex flex-col gap-2">
        {isAdmin && (
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
            <Button
              variant="outline"
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
        )}
      </TableCell>
    </TableRow>
  );
}
