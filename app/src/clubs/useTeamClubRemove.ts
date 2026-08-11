import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { teamClubsQueryKey } from './queryKeys';

export function useTeamClubRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (partnerClubId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/clubs/${partnerClubId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamClubsQueryKey(clubId, teamId) });
    },
  });
}
