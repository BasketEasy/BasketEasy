import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListEventsParams, TeamEvent } from '@basketeasy/types/events';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { teamEventsQueryKey } from './queryKeys';
import { useTeamPersona } from '../guardians/useActingAs';

export function useEventList(
  clubId: string,
  teamId: string,
  params?: ListEventsParams,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  // The persona rides in the params, so it is part of the key too.
  const { forPlayerId, isReady } = useTeamPersona(teamId);
  const scoped = forPlayerId ? { ...params, forPlayerId } : params;
  const query = useQuery({
    queryKey: teamEventsQueryKey(clubId, teamId, scoped),
    staleTime: FRESHNESS.live,
    queryFn: ({ signal }) =>
      apiClient.get<PaginatedResult<TeamEvent>>(`/clubs/${clubId}/teams/${teamId}/events`, scoped, {
        signal,
      }),
    placeholderData: keepPreviousData,
    enabled: isReady && enabled,
  });
  // A query held back for the persona is still loading, not empty: callers
  // branch on isLoading, and a disabled query reports false. One the caller
  // switched off is not loading: nobody reads it.
  return { ...query, isLoading: query.isLoading || (enabled && !isReady) };
}
