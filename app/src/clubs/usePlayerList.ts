import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListPlayersParams, Player } from '@basketeasy/types/players';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerList(
  clubId: string,
  params?: ListPlayersParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: clubPlayersQueryKey(clubId, params),
    staleTime: FRESHNESS.slow,
    queryFn: ({ signal }) =>
      apiClient.get<PaginatedResult<Player>>(`/clubs/${clubId}/players`, params, { signal }),
    enabled: options?.enabled,
    placeholderData: keepPreviousData,
  });
}
