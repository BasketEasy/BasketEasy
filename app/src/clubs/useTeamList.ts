import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListTeamsParams, Team } from '@basketeasy/types/teams';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { apiClient } from '../api/client';
import { clubTeamsQueryKey } from './queryKeys';

export function useTeamList(
  clubId: string,
  params?: ListTeamsParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: clubTeamsQueryKey(clubId, params),
    queryFn: () => apiClient.get<PaginatedResult<Team>>(`/clubs/${clubId}/teams`, params),
    enabled: options?.enabled,
    placeholderData: keepPreviousData,
  });
}
