import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerDelete(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playerId: string) => apiClient.delete(`/clubs/${clubId}/players/${playerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubPlayersQueryKey(clubId) });
    },
  });
}
