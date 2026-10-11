import { useQuery } from '@tanstack/react-query';
import type { EventConvocationRosterEntry } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { eventConvocationsQueryKey } from './queryKeys';
import { useTeamPersona } from '../guardians/useActingAs';

/**
 * Roster-wide convocation breakdown for one event. `enabled` is passed by
 * the caller so the fetch only fires once the breakdown panel or the manage
 * modal is actually opened, not once per visible event on the page.
 */
export function useEventConvocations(
  clubId: string,
  teamId: string,
  eventId: string,
  enabled: boolean,
) {
  const { forPlayerId, isReady } = useTeamPersona(teamId);
  const query = useQuery({
    queryKey: eventConvocationsQueryKey(clubId, teamId, eventId, forPlayerId),
    staleTime: FRESHNESS.live,
    queryFn: ({ signal }) =>
      apiClient.get<EventConvocationRosterEntry[]>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/convocations`,
        forPlayerId ? { forPlayerId } : undefined,
        { signal },
      ),
    enabled: enabled && isReady,
  });
  // A query held back for the persona is still loading, not empty: callers
  // branch on isLoading, and a disabled query reports false.
  return { ...query, isLoading: query.isLoading || !isReady };
}
