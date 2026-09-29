import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { teamPlayersQueryKey } from './queryKeys';
import { personasQueryKey } from '../guardians/queryKeys';

export function useTeamPlayerRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playerId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/players/${playerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamPlayersQueryKey(clubId, teamId) });
      // A child's teams are part of their persona.
      queryClient.invalidateQueries({ queryKey: personasQueryKey });
    },
  });
}
