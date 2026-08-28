import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { SelectField } from '@basketeasy/ui/select-field';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { toast } from '@basketeasy/ui/toast-store';
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
              // No success toast: the select's own updated value is the
              // feedback for this single-field, high-frequency change (see
              // CLAUDE.md's "Modals vs. inline editing"). A failure still
              // needs one, since otherwise the select silently reverting
              // wouldn't explain why.
              updateRole(
                { playerId: teamPlayer.playerId, role: value as TeamMemberRole },
                {
                  onError: (err) =>
                    toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
                },
              )
            }
          />
        ) : (
          <Badge tone="structure">{teamMemberRoleLabel(teamPlayer.role)}</Badge>
        )}
      </TableCell>
      <TableCell className="flex flex-col gap-2">
        {canManage && (
          <Button
            variant="destructive"
            loading={isRemoving}
            onClick={() =>
              removeTeamPlayer(teamPlayer.playerId, {
                onSuccess: () =>
                  toast({ variant: 'success', title: 'Joueur retiré de l’effectif' }),
                onError: (err) =>
                  toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
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
