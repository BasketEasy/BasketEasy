import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { teamFfbbLinksQueryKey } from './queryKeys';

export function useFfbbLinkRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (linkId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/ffbb-links/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamFfbbLinksQueryKey(clubId, teamId) });
    },
  });
}
