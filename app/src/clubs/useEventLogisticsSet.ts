import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventLogisticsField, TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { teamEventQueryKey, teamEventsQueryKey } from './queryKeys';

/**
 * Self-assign/self-clear or manager-reassign of the jersey/ball carrier for
 * one MATCH event — the permission split (self vs. manager) is enforced
 * server-side, this hook just sends the write. Invalidates both the event
 * detail query (Aperçu tab) and the agenda list query (mini-chips) so both
 * surfaces refresh from one mutation.
 */
export function useEventLogisticsSet(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      field,
      teamPlayerId,
    }: {
      eventId: string;
      field: EventLogisticsField;
      teamPlayerId: string | null;
    }) =>
      apiClient.patch<TeamEvent>(`/clubs/${clubId}/teams/${teamId}/events/${eventId}/logistics`, {
        field,
        teamPlayerId,
      }),
    onSuccess: (_data, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: teamEventQueryKey(clubId, teamId, eventId) });
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(clubId, teamId) });
    },
  });
}
