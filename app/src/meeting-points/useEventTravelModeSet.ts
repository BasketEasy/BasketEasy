import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import type { EventTravelMode } from '@basketeasy/types/meeting-points';
import { apiClient } from '../api/client';
import {
  eventRsvpsQueryKey,
  myDashboardQueryKeyPrefix,
  teamEventQueryKey,
  teamEventsQueryKey,
} from '../clubs/queryKeys';

/** Same invalidation set as useEventRsvpSet — the choice rides on the RSVP row. */
export function useEventTravelModeSet(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, travelMode }: { eventId: string; travelMode: EventTravelMode }) =>
      apiClient.patch<TeamEvent>(`/clubs/${clubId}/teams/${teamId}/events/${eventId}/travel-mode`, {
        travelMode,
      }),
    onSuccess: (event, { eventId }) => {
      queryClient.setQueryData(teamEventQueryKey(clubId, teamId, eventId), event);
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(clubId, teamId) });
      queryClient.invalidateQueries({ queryKey: eventRsvpsQueryKey(clubId, teamId, eventId) });
      queryClient.invalidateQueries({ queryKey: myDashboardQueryKeyPrefix });
    },
  });
}
