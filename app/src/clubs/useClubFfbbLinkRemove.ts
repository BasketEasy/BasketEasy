import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { clubQueryKey } from './queryKeys';

export function useClubFfbbLinkRemove(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.delete(`/clubs/${clubId}/ffbb-link`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKey(clubId) });
    },
  });
}
