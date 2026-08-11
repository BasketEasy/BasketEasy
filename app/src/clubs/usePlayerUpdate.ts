import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Player, UpdatePlayerRequest } from '@basketeasy/types/players';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerUpdate(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playerId, dto }: { playerId: string; dto: UpdatePlayerRequest }) =>
      apiClient.patch<Player>(`/clubs/${clubId}/players/${playerId}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubPlayersQueryKey(clubId) });
    },
  });
}
