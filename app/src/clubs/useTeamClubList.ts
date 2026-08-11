import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListTeamClubsParams, TeamClubLink } from '@basketeasy/types/teams';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { apiClient } from '../api/client';
import { teamClubsQueryKey } from './queryKeys';

export function useTeamClubList(clubId: string, teamId: string, params?: ListTeamClubsParams) {
  return useQuery({
    queryKey: teamClubsQueryKey(clubId, teamId, params),
    queryFn: () =>
      apiClient.get<PaginatedResult<TeamClubLink>>(
        `/clubs/${clubId}/teams/${teamId}/clubs`,
        params,
      ),
    placeholderData: keepPreviousData,
  });
}
