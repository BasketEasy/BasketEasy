import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { teamPlayersQueryKey } from './queryKeys';

export function useTeamPlayerRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playerId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/players/${playerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamPlayersQueryKey(clubId, teamId) });
    },
  });
}
