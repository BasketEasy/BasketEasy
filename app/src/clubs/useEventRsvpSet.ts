import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SetEventRsvpRequest, TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import {
  eventRsvpsQueryKey,
  myDashboardQueryKeyPrefix,
  teamEventQueryKey,
  teamEventsQueryKey,
} from './queryKeys';
import { actingAsQuery, useTeamActingAs } from '../guardians/useActingAs';

export function useEventRsvpSet(clubId: string, teamId: string) {
  const queryClient = useQueryClient();
  // Answers for the child on the child's teams; the prefix invalidations
  // below match every persona's copy of each key.
  const forPlayerId = useTeamActingAs(teamId);

  return useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: SetEventRsvpRequest['status'] }) =>
      apiClient.patch<TeamEvent>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/rsvp${actingAsQuery(forPlayerId)}`,
        { status },
      ),
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
