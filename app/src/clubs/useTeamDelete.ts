import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { clubTeamsQueryKey } from './queryKeys';

export function useTeamDelete(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (teamId: string) => apiClient.delete(`/clubs/${clubId}/teams/${teamId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubTeamsQueryKey(clubId) });
    },
  });
}
