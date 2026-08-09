import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { FieldError } from '@basketeasy/ui/field-error';
import { Input } from '@basketeasy/ui/input';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@basketeasy/ui/select';
import type { Player } from '@basketeasy/types/players';
import type { ClubMember } from '@basketeasy/types/club-members';
import { usePlayerUpdate } from './usePlayerUpdate';
import { usePlayerDelete } from './usePlayerDelete';
import { getClubErrorMessage } from './clubErrorMessages';

const UNLINKED = 'none';

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
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(player.firstName);
  const [lastName, setLastName] = useState(player.lastName);
  const [userId, setUserId] = useState(player.userId ?? UNLINKED);
  const [error, setError] = useState<string | null>(null);
  const { mutate: updatePlayer, isPending: isUpdating } = usePlayerUpdate(clubId);
  const { mutate: deletePlayer, isPending: isDeleting } = usePlayerDelete(clubId);

  const startEditing = () => {
    setFirstName(player.firstName);
    setLastName(player.lastName);
    setUserId(player.userId ?? UNLINKED);
    setError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setFirstName(player.firstName);
    setLastName(player.lastName);
    setUserId(player.userId ?? UNLINKED);
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
        <TableCell>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger aria-label="Compte lié (optionnel)">
              <SelectValue placeholder="Aucun compte lié" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNLINKED}>Aucun compte lié</SelectItem>
              {linkableMembers.map((member) => (
                <SelectItem key={member.userId} value={member.userId}>
                  {member.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell className="flex flex-col gap-2">
          {error && <FieldError>{error}</FieldError>}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isUpdating}
              onClick={() =>
                updatePlayer(
                  {
                    playerId: player.id,
                    dto: { firstName, lastName, userId: userId === UNLINKED ? null : userId },
                  },
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
      <TableCell>{linkedMemberEmail ?? '—'}</TableCell>
      <TableCell className="flex flex-col gap-2">
        {error && <FieldError>{error}</FieldError>}
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
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
