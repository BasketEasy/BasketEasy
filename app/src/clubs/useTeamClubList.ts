import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListTeamClubsParams, TeamClubLink } from '@basketeasy/types/teams';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { teamClubsQueryKey } from './queryKeys';

export function useTeamClubList(
  clubId: string,
  teamId: string,
  params?: ListTeamClubsParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: teamClubsQueryKey(clubId, teamId, params),
    staleTime: FRESHNESS.static,
    queryFn: () =>
      apiClient.get<PaginatedResult<TeamClubLink>>(
        `/clubs/${clubId}/teams/${teamId}/clubs`,
        params,
      ),
    enabled: options?.enabled,
    placeholderData: keepPreviousData,
  });
}
