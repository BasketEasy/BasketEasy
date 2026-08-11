import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddTeamClubRequest, TeamClubLink } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamClubsQueryKey } from './queryKeys';

export function useTeamClubAdd(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddTeamClubRequest) =>
      apiClient.post<TeamClubLink>(`/clubs/${clubId}/teams/${teamId}/clubs`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamClubsQueryKey(clubId, teamId) });
    },
  });
}
