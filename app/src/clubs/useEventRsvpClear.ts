import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import {
  eventRsvpsQueryKey,
  myDashboardQueryKeyPrefix,
  teamEventQueryKey,
  teamEventsQueryKey,
} from './queryKeys';

export function useEventRsvpClear(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId }: { eventId: string }) =>
      apiClient.delete<TeamEvent>(`/clubs/${clubId}/teams/${teamId}/events/${eventId}/rsvp`),
    onSuccess: (_data, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: teamEventQueryKey(clubId, teamId, eventId) });
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(clubId, teamId) });
      queryClient.invalidateQueries({ queryKey: eventRsvpsQueryKey(clubId, teamId, eventId) });
      // The dashboard agenda carries the caller's own myRsvpStatus and now
      // answers from the home screen, so it has to refetch too. Keyed on the
      // prefix, not myDashboardQueryKey(), so every from/to window variant is
      // matched rather than only the params-less one.
      queryClient.invalidateQueries({ queryKey: myDashboardQueryKeyPrefix });
    },
  });
}
