import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { FieldError } from '@basketeasy/ui/field-error';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { TeamPlayer } from '@basketeasy/types/teams';
import { useTeamPlayerRemove } from './useTeamPlayerRemove';
import { getClubErrorMessage } from './clubErrorMessages';

export function TeamPlayerRow({
  clubId,
  teamId,
  teamPlayer,
  isAdmin,
}: {
  clubId: string;
  teamId: string;
  teamPlayer: TeamPlayer;
  isAdmin: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const { mutate: removeTeamPlayer, isPending } = useTeamPlayerRemove(clubId, teamId);

  return (
    <TableRow>
      <TableCell>{teamPlayer.firstName}</TableCell>
      <TableCell>{teamPlayer.lastName}</TableCell>
      <TableCell className="flex flex-col gap-2">
        {error && <FieldError>{error}</FieldError>}
        {isAdmin && (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() =>
              removeTeamPlayer(teamPlayer.playerId, {
                onError: (err) => setError(getClubErrorMessage(err)),
              })
            }
          >
            Retirer
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
