import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { teamAdminCandidatesQueryKey, teamClubsQueryKey } from './queryKeys';

export function useTeamClubRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (partnerClubId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/clubs/${partnerClubId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamClubsQueryKey(clubId, teamId) });
      // The candidates for the team's admin are the members of its linked clubs.
      queryClient.invalidateQueries({ queryKey: teamAdminCandidatesQueryKey(clubId, teamId) });
    },
  });
}
