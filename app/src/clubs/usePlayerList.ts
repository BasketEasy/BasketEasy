import { useQuery } from '@tanstack/react-query';
import type { Player } from '@basketeasy/types/players';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerList(clubId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clubPlayersQueryKey(clubId),
    queryFn: () => apiClient.get<Player[]>(`/clubs/${clubId}/players`),
    enabled: options?.enabled,
  });
}
