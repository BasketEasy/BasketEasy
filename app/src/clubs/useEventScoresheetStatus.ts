import { useQuery } from '@tanstack/react-query';
import type { EventScoresheet } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { eventScoresheetStatusQueryKey } from './queryKeys';

/**
 * Current scoresheet capture status for one MATCH event, or `null` if
 * nothing has been uploaded yet. Visible to the whole team (not
 * rostered-only) — same read visibility as the RSVP/convocation breakdowns.
 */
export function useEventScoresheetStatus(clubId: string, teamId: string, eventId: string) {
  return useQuery({
    queryKey: eventScoresheetStatusQueryKey(clubId, teamId, eventId),
    queryFn: () =>
      apiClient.get<EventScoresheet | null>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/scoresheet`,
      ),
  });
}
