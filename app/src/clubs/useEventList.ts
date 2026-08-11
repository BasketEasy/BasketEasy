import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListEventsParams, TeamEvent } from '@basketeasy/types/events';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { apiClient } from '../api/client';
import { teamEventsQueryKey } from './queryKeys';

export function useEventList(clubId: string, teamId: string, params?: ListEventsParams) {
  return useQuery({
    queryKey: teamEventsQueryKey(clubId, teamId, params),
    queryFn: () =>
      apiClient.get<PaginatedResult<TeamEvent>>(
        `/clubs/${clubId}/teams/${teamId}/events`,
        params,
      ),
    placeholderData: keepPreviousData,
  });
}
