import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import type { EventTravelMode } from '@basketeasy/types/meeting-points';
import { apiClient } from '../api/client';
import {
  invalidateDashboard,
  invalidateEventLists,
  invalidateEventParts,
  storeTeamEvent,
} from '../clubs/eventCache';
import { actingAsQuery, useTeamActingAs } from '../guardians/useActingAs';

/** The choice rides on the RSVP row: it moves the lists, the RSVP roster and the dashboard, not the roster summary. */
export function useEventTravelModeSet(clubId: string, teamId: string) {
  const queryClient = useQueryClient();
  const forPlayerId = useTeamActingAs(teamId);

  return useMutation({
    mutationFn: ({ eventId, travelMode }: { eventId: string; travelMode: EventTravelMode }) =>
      apiClient.patch<TeamEvent>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/travel-mode${actingAsQuery(forPlayerId)}`,
        { travelMode },
      ),
    onSuccess: (event, { eventId }) => {
      // The event the server answered with is the persona's, so it goes back
      // under the persona's key.
      storeTeamEvent(queryClient, { clubId, teamId }, forPlayerId, event);
      invalidateEventLists(queryClient, { clubId, teamId });
      invalidateEventParts(queryClient, { clubId, teamId, eventId }, ['rsvps']);
      invalidateDashboard(queryClient);
    },
  });
}
