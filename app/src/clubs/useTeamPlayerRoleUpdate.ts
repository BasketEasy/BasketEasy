import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamMemberRole, TeamPlayer } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamPlayersQueryKey } from './queryKeys';

export function useTeamPlayerRoleUpdate(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playerId, role }: { playerId: string; role: TeamMemberRole }) =>
      apiClient.patch<TeamPlayer>(`/clubs/${clubId}/teams/${teamId}/players/${playerId}`, {
        role,
      }),
    onSuccess: (teamPlayer) => {
      queryClient.setQueryData<TeamPlayer[]>(teamPlayersQueryKey(clubId, teamId), (prev) =>
        (prev ?? []).map((tp) => (tp.playerId === teamPlayer.playerId ? teamPlayer : tp)),
      );
    },
  });
}
