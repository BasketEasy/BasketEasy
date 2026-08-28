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
import { toast } from '@basketeasy/ui/toast-store';
import type { Player } from '@basketeasy/types/players';
import type { ClubMember } from '@basketeasy/types/club-members';
import { PlayerEditForm } from './PlayerEditForm';
import { usePlayerDelete } from './usePlayerDelete';
import { getClubErrorMessage } from './clubErrorMessages';

/** Mobile card row for the Joueurs tab's table — see PlayerRow for the desktop equivalent. */
export function PlayerCard({
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
    <Card className="flex flex-col gap-2 bg-surface-2 p-3">
      <span className="font-medium text-charcoal">
        {player.firstName} {player.lastName}
      </span>
      <span className="text-sm text-muted">Compte lié : {linkedMemberEmail ?? '—'}</span>
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
    </Card>
  );
}
