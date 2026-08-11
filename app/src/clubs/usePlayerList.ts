import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListPlayersParams, Player } from '@basketeasy/types/players';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerList(
  clubId: string,
  params?: ListPlayersParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: clubPlayersQueryKey(clubId, params),
    queryFn: () => apiClient.get<PaginatedResult<Player>>(`/clubs/${clubId}/players`, params),
    enabled: options?.enabled,
    placeholderData: keepPreviousData,
  });
}
