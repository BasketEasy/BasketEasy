import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventConvocationRosterEntry } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import {
  invalidateDashboard,
  invalidateEventDetails,
  invalidateEventLists,
  invalidateEventParts,
  invalidateJerseyRotation,
  invalidateOtherPersonas,
} from './eventCache';
import { eventConvocationsQueryKey } from './queryKeys';

/**
 * Full-replace convocation write: the whole call-up list is sent on every
 * call, not an incremental add/remove — see the convocations design spec.
 *
 * The response is the roster breakdown the GET answers with, read as the
 * caller (a manager never acts for a child, so it is the user's own copy), and
 * is written into it. What the call-up moves elsewhere: the event (its roster
 * summary counts the convoked, and `myConvocation` is the caller's own flag),
 * the lists and the dashboard, and the jersey wash, whose pool is built from
 * RSVPs and convocations. The RSVP roster does not read a convocation and is
 * left alone.
 */
export function useEventConvocationsSet(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, teamPlayerIds }: { eventId: string; teamPlayerIds: string[] }) =>
      apiClient.patch<EventConvocationRosterEntry[]>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/convocations`,
        { teamPlayerIds },
      ),
    onSuccess: (roster, { eventId }) => {
      const ids = { clubId, teamId, eventId };
      queryClient.setQueryData(eventConvocationsQueryKey(clubId, teamId, eventId), roster);
      invalidateOtherPersonas(queryClient, ids, 'convocations', undefined);
      invalidateEventDetails(queryClient, ids);
      invalidateEventLists(queryClient, ids);
      invalidateEventParts(queryClient, ids, ['jersey-duty']);
      invalidateJerseyRotation(queryClient, ids);
      invalidateDashboard(queryClient);
    },
  });
}
