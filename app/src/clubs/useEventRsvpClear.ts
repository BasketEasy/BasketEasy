import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { applyRsvpWrite } from './eventCache';
import { actingAsQuery, useTeamActingAs } from '../guardians/useActingAs';

export function useEventRsvpClear(clubId: string, teamId: string) {
  const queryClient = useQueryClient();
  const forPlayerId = useTeamActingAs(teamId);

  return useMutation({
    mutationFn: ({ eventId }: { eventId: string }) =>
      apiClient.delete<TeamEvent>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/rsvp${actingAsQuery(forPlayerId)}`,
      ),
    onSuccess: (event) => applyRsvpWrite(queryClient, { clubId, teamId }, forPlayerId, event),
  });
}
