import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatePlayerRequest, Player } from '@basketeasy/types/players';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerCreate(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreatePlayerRequest) =>
      apiClient.post<Player>(`/clubs/${clubId}/players`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubPlayersQueryKey(clubId) });
    },
  });
}
