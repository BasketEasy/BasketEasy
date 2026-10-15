import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListTeamsParams, Team } from '@basketeasy/types/teams';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { clubTeamsQueryKey } from './queryKeys';

export function useTeamList(
  clubId: string,
  params?: ListTeamsParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: clubTeamsQueryKey(clubId, params),
    staleTime: FRESHNESS.slow,
    queryFn: ({ signal }) =>
      apiClient.get<PaginatedResult<Team>>(`/clubs/${clubId}/teams`, params, { signal }),
    enabled: options?.enabled,
    placeholderData: keepPreviousData,
  });
}
