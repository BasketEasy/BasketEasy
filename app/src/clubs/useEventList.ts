import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListEventsParams, TeamEvent } from '@basketeasy/types/events';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { apiClient } from '../api/client';
import { teamEventsQueryKey } from './queryKeys';
import { useTeamActingAs } from '../guardians/useActingAs';

export function useEventList(clubId: string, teamId: string, params?: ListEventsParams) {
  // The persona rides in the params, so it is part of the key too.
  const forPlayerId = useTeamActingAs(teamId);
  const scoped = forPlayerId ? { ...params, forPlayerId } : params;
  return useQuery({
    queryKey: teamEventsQueryKey(clubId, teamId, scoped),
    queryFn: () =>
      apiClient.get<PaginatedResult<TeamEvent>>(`/clubs/${clubId}/teams/${teamId}/events`, scoped),
    placeholderData: keepPreviousData,
  });
}
