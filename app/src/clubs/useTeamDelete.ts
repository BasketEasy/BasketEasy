import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { invalidateDashboard } from './eventCache';
import { clubTeamsQueryKey, myTeamsQueryKey } from './queryKeys';

export function useTeamDelete(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (teamId: string) => apiClient.delete(`/clubs/${clubId}/teams/${teamId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubTeamsQueryKey(clubId) });
      // Its events leave the home's agenda, and it leaves « Mes équipes ».
      queryClient.invalidateQueries({ queryKey: myTeamsQueryKey });
      invalidateDashboard(queryClient);
    },
  });
}
