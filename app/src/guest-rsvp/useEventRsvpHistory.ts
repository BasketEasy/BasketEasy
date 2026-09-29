import { useQuery } from '@tanstack/react-query';
import type { EventRsvpChangeEntry } from '@basketeasy/types/guest-links';
import { apiClient } from '../api/client';

/** Lazy: only fetched while the history dialog is open. */
export function useEventRsvpHistory(
  clubId: string,
  teamId: string,
  eventId: string,
  teamPlayerId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['clubs', clubId, 'teams', teamId, 'events', eventId, 'rsvp-history', teamPlayerId],
    queryFn: () =>
      apiClient.get<EventRsvpChangeEntry[]>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/rsvps/${teamPlayerId}/history`,
      ),
    enabled,
    // "Who looked at what" style log: no refetch just because the tab regained focus.
    refetchOnWindowFocus: false,
  });
}
