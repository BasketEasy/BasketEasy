import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Input } from '@basketeasy/ui/input';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { Player } from '@basketeasy/types/players';
import { usePlayerUpdate } from './usePlayerUpdate';
import { usePlayerDelete } from './usePlayerDelete';
import { getClubErrorMessage } from './clubErrorMessages';

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
  const [error, setError] = useState<string | null>(null);
  const { mutate: updatePlayer, isPending: isUpdating } = usePlayerUpdate(clubId);
  const { mutate: deletePlayer, isPending: isDeleting } = usePlayerDelete(clubId);

  const startEditing = () => {
    setFirstName(player.firstName);
    setLastName(player.lastName);
    setError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setFirstName(player.firstName);
    setLastName(player.lastName);
    setError(null);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <TableRow>
        <TableCell>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </TableCell>
        <TableCell>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </TableCell>
        <TableCell className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              disabled={isUpdating}
              onClick={() =>
                updatePlayer(
                  { playerId: player.id, dto: { firstName, lastName } },
                  {
                    onSuccess: () => setIsEditing(false),
                    onError: (err) => setError(getClubErrorMessage(err)),
                  },
                )
              }
            >
              Enregistrer
            </Button>
            <Button variant="ghost" onClick={cancelEditing}>
              Annuler
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>{player.firstName}</TableCell>
      <TableCell>{player.lastName}</TableCell>
      <TableCell className="flex flex-col gap-2">
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={startEditing}>
              Modifier
            </Button>
            <Button
              variant="outline"
              disabled={isDeleting}
              onClick={() =>
                deletePlayer(player.id, { onError: (err) => setError(getClubErrorMessage(err)) })
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
