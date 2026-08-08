import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Input } from '@basketeasy/ui/input';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { Player } from '@basketeasy/types/players';
import { usePlayerUpdate } from './usePlayerUpdate';
import { usePlayerDelete } from './usePlayerDelete';

export function PlayerRow({
  clubId,
  player,
  isAdmin,
}: {
  clubId: string;
  player: Player;
  isAdmin: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(player.firstName);
  const [lastName, setLastName] = useState(player.lastName);
  const { mutate: updatePlayer, isPending: isUpdating } = usePlayerUpdate(clubId);
  const { mutate: deletePlayer, isPending: isDeleting } = usePlayerDelete(clubId);

  if (isEditing) {
    return (
      <TableRow>
        <TableCell>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </TableCell>
        <TableCell>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </TableCell>
        <TableCell className="flex gap-2">
          <Button
            disabled={isUpdating}
            onClick={() =>
              updatePlayer(
                { playerId: player.id, dto: { firstName, lastName } },
                { onSuccess: () => setIsEditing(false) },
              )
            }
          >
            Enregistrer
          </Button>
          <Button variant="ghost" onClick={() => setIsEditing(false)}>
            Annuler
          </Button>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>{player.firstName}</TableCell>
      <TableCell>{player.lastName}</TableCell>
      <TableCell className="flex gap-2">
        {isAdmin && (
          <>
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              Modifier
            </Button>
            <Button variant="outline" disabled={isDeleting} onClick={() => deletePlayer(player.id)}>
              Supprimer
            </Button>
          </>
        )}
      </TableCell>
    </TableRow>
  );
}
