import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddTeamPlayerRequest, TeamPlayer } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamPlayersQueryKey } from './queryKeys';

export function useTeamPlayerAdd(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddTeamPlayerRequest) =>
      apiClient.post<TeamPlayer>(`/clubs/${clubId}/teams/${teamId}/players`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamPlayersQueryKey(clubId, teamId) });
    },
  });
}
