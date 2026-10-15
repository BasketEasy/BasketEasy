import { useQuery } from '@tanstack/react-query';
import type { EventRsvpRosterEntry } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { eventRsvpsQueryKey } from './queryKeys';
import { useTeamPersona } from '../guardians/useActingAs';

/**
 * Roster-wide RSVP breakdown for one event. `enabled` is passed by the
 * caller so the fetch only fires once the breakdown panel is actually
 * opened, not once per visible event on the page.
 */
export function useEventRsvps(clubId: string, teamId: string, eventId: string, enabled: boolean) {
  // `isMe` marks the persona's row, so the persona is part of the key.
  const { forPlayerId, isReady } = useTeamPersona(teamId);
  const query = useQuery({
    queryKey: eventRsvpsQueryKey(clubId, teamId, eventId, forPlayerId),
    staleTime: FRESHNESS.live,
    queryFn: ({ signal }) =>
      apiClient.get<EventRsvpRosterEntry[]>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/rsvps`,
        forPlayerId ? { forPlayerId } : undefined,
        { signal },
      ),
    enabled: enabled && isReady,
  });
  // A query held back for the persona is still loading, not empty: callers
  // branch on isLoading, and a disabled query reports false.
  return { ...query, isLoading: query.isLoading || !isReady };
}
