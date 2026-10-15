import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SetEventRsvpRequest, TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { applyRsvpWrite } from './eventCache';
import { actingAsQuery, useTeamActingAs } from '../guardians/useActingAs';

export function useEventRsvpSet(clubId: string, teamId: string) {
  const queryClient = useQueryClient();
  // Answers for the child on the child's teams; the response is the
  // persona's event, so it goes back under the persona's key.
  const forPlayerId = useTeamActingAs(teamId);

  return useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: SetEventRsvpRequest['status'] }) =>
      apiClient.patch<TeamEvent>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/rsvp${actingAsQuery(forPlayerId)}`,
        { status },
      ),
    onSuccess: (event) => applyRsvpWrite(queryClient, { clubId, teamId }, forPlayerId, event),
  });
}
