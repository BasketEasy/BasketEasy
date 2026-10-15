import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventUpdateScope } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { pendingCancellationsQueryKey } from '../whatsapp-reminders/queryKeys';
import { invalidateTeamEvents, removeEventSubQueries } from './eventCache';

export function useEventDelete(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    // apiClient.delete takes no params argument, so the scope query string
    // is built inline here rather than via apiClient's buildQuery helper.
    mutationFn: ({ eventId, scope }: { eventId: string; scope?: EventUpdateScope }) =>
      apiClient.delete(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}${
          scope && scope !== 'THIS' ? `?scope=${scope}` : ''
        }`,
      ),
    onSuccess: (_data, { eventId, scope }) => {
      // A single-event delete knows which event is gone: its sub-queries are
      // dropped (nothing refetches a route that now answers 404) and only the
      // lists are refetched. A series scope removes occurrences the client has
      // no ids for, so it keeps the broad prefix.
      const single = !scope || scope === 'THIS';
      if (single) removeEventSubQueries(queryClient, { clubId, teamId, eventId });
      invalidateTeamEvents(queryClient, { clubId, teamId }, { stats: true, listsOnly: single });
      // A cancellation may just have been raised for the WhatsApp group.
      void queryClient.invalidateQueries({
        queryKey: pendingCancellationsQueryKey(clubId, teamId),
      });
    },
  });
}
