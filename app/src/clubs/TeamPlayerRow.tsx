import { useState } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { FieldError } from '@basketeasy/ui/field-error';
import { SelectField } from '@basketeasy/ui/select-field';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { TeamMemberRole, TeamPlayer } from '@basketeasy/types/teams';
import { useTeamPlayerRemove } from './useTeamPlayerRemove';
import { useTeamPlayerRoleUpdate } from './useTeamPlayerRoleUpdate';
import { getClubErrorMessage } from './clubErrorMessages';
import { TEAM_MEMBER_ROLE_OPTIONS, teamMemberRoleLabel } from './teamLabels';

export function TeamPlayerRow({
  clubId,
  teamId,
  teamPlayer,
  canManage,
}: {
  clubId: string;
  teamId: string;
  teamPlayer: TeamPlayer;
  canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const { mutate: removeTeamPlayer, isPending: isRemoving } = useTeamPlayerRemove(clubId, teamId);
  const { mutate: updateRole, isPending: isUpdatingRole } = useTeamPlayerRoleUpdate(clubId, teamId);

  return (
    <TableRow>
      <TableCell>{teamPlayer.firstName}</TableCell>
      <TableCell>{teamPlayer.lastName}</TableCell>
      <TableCell>
        {canManage ? (
          <SelectField
            label="Rôle"
            id={`team-player-role-${teamPlayer.playerId}`}
            options={TEAM_MEMBER_ROLE_OPTIONS}
            value={teamPlayer.role}
            disabled={isUpdatingRole}
            onValueChange={(value) =>
              updateRole(
                { playerId: teamPlayer.playerId, role: value as TeamMemberRole },
                { onError: (err) => setError(getClubErrorMessage(err)) },
              )
            }
          />
        ) : (
          <Badge variant="secondary">{teamMemberRoleLabel(teamPlayer.role)}</Badge>
        )}
      </TableCell>
      <TableCell className="flex flex-col gap-2">
        {error && <FieldError>{error}</FieldError>}
        {canManage && (
          <Button
            variant="outline"
            loading={isRemoving}
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
