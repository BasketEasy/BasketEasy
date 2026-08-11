import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListTeamPlayersParams, TeamPlayer } from '@basketeasy/types/teams';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { apiClient } from '../api/client';
import { teamPlayersQueryKey } from './queryKeys';

export function useTeamPlayerList(clubId: string, teamId: string, params?: ListTeamPlayersParams) {
  return useQuery({
    queryKey: teamPlayersQueryKey(clubId, teamId, params),
    queryFn: () =>
      apiClient.get<PaginatedResult<TeamPlayer>>(
        `/clubs/${clubId}/teams/${teamId}/players`,
        params,
      ),
    placeholderData: keepPreviousData,
  });
}
