import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamPlayer, UpdateTeamPlayerRequest } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamPlayersQueryKey } from './queryKeys';

/** One roster entry's editable fields: the roster role, the jersey wash exemption. */
export function useTeamPlayerUpdate(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playerId, ...dto }: UpdateTeamPlayerRequest & { playerId: string }) =>
      apiClient.patch<TeamPlayer>(`/clubs/${clubId}/teams/${teamId}/players/${playerId}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamPlayersQueryKey(clubId, teamId) });
    },
  });
}
