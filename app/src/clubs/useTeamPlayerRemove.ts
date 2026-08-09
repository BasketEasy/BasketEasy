import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamPlayer } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamPlayersQueryKey } from './queryKeys';

export function useTeamPlayerRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playerId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/players/${playerId}`),
    onSuccess: (_data, playerId) => {
      queryClient.setQueryData<TeamPlayer[]>(teamPlayersQueryKey(clubId, teamId), (prev) =>
        (prev ?? []).filter((tp) => tp.playerId !== playerId),
      );
    },
  });
}
