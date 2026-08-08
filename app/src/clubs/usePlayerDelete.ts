import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Player } from '@basketeasy/types/players';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerDelete(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playerId: string) => apiClient.delete(`/clubs/${clubId}/players/${playerId}`),
    onSuccess: (_data, playerId) => {
      queryClient.setQueryData<Player[]>(clubPlayersQueryKey(clubId), (prev) =>
        (prev ?? []).filter((p) => p.id !== playerId),
      );
    },
  });
}
