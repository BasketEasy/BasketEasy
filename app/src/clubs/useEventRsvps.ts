import { useQuery } from '@tanstack/react-query';
import type { EventRsvpRosterEntry } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { eventRsvpsQueryKey } from './queryKeys';
import { useTeamActingAs } from '../guardians/useActingAs';

/**
 * Roster-wide RSVP breakdown for one event. `enabled` is passed by the
 * caller so the fetch only fires once the breakdown panel is actually
 * opened, not once per visible event on the page.
 */
export function useEventRsvps(clubId: string, teamId: string, eventId: string, enabled: boolean) {
  // `isMe` marks the persona's row, so the persona is part of the key.
  const forPlayerId = useTeamActingAs(teamId);
  return useQuery({
    queryKey: eventRsvpsQueryKey(clubId, teamId, eventId, forPlayerId),
    queryFn: () =>
      apiClient.get<EventRsvpRosterEntry[]>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/rsvps`,
        forPlayerId ? { forPlayerId } : undefined,
      ),
    enabled,
  });
}
