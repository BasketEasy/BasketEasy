import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Team, UpdateTeamRequest } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { invalidateDashboard } from './eventCache';
import { clubTeamsQueryKey, myTeamsQueryKey, teamQueryKey } from './queryKeys';

export function useTeamUpdate(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: UpdateTeamRequest) =>
      apiClient.patch<Team>(`/clubs/${clubId}/teams/${teamId}`, dto),
    onSuccess: (team, dto) => {
      queryClient.setQueryData<Team>(teamQueryKey(clubId, teamId), team);
      queryClient.invalidateQueries({ queryKey: clubTeamsQueryKey(clubId) });
      // The name, category and gender are copied into « Mes équipes » and onto
      // each agenda row of the home. The rotation switch sends none of them
      // and must not refetch either.
      if (dto.name !== undefined || dto.category !== undefined || dto.gender !== undefined) {
        queryClient.invalidateQueries({ queryKey: myTeamsQueryKey });
        invalidateDashboard(queryClient);
      }
    },
  });
}
