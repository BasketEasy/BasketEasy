import { useQuery } from '@tanstack/react-query';
import type { EventConvocationRosterEntry } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { eventConvocationsQueryKey } from './queryKeys';

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
  return useQuery({
    queryKey: eventConvocationsQueryKey(clubId, teamId, eventId),
    queryFn: () =>
      apiClient.get<EventConvocationRosterEntry[]>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/convocations`,
      ),
    enabled,
  });
}
