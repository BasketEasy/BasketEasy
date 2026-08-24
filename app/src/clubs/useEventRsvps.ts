import { useQuery } from '@tanstack/react-query';
import type { EventRsvpRosterEntry } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { eventRsvpsQueryKey } from './queryKeys';

/**
 * Roster-wide RSVP breakdown for one event. `enabled` is passed by the
 * caller so the fetch only fires once the breakdown panel is actually
 * opened, not once per visible event on the page.
 */
export function useEventRsvps(clubId: string, teamId: string, eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: eventRsvpsQueryKey(clubId, teamId, eventId),
    queryFn: () =>
      apiClient.get<EventRsvpRosterEntry[]>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/rsvps`,
      ),
    enabled,
  });
}
