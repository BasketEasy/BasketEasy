import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventLogisticsField, TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import {
  invalidateDashboard,
  invalidateEventDetails,
  invalidateEventLists,
  storeTeamEvent,
} from './eventCache';

/**
 * Self-assign/self-clear or manager-reassign of the jersey/ball carrier for
 * one MATCH event — the permission split (self vs. manager) is enforced
 * server-side, this hook just sends the write. The response is the caller's
 * own event: it goes into the detail (Aperçu tab). The agenda lists
 * (mini-chips) and the dashboard mirror `logistics`, and another persona's
 * cached copy of the detail carries it too, so those are marked stale.
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
    onSuccess: (event, { eventId }) => {
      storeTeamEvent(queryClient, { clubId, teamId }, undefined, event);
      invalidateEventDetails(queryClient, { clubId, teamId, eventId }, { forPlayerId: undefined });
      invalidateEventLists(queryClient, { clubId, teamId });
      invalidateDashboard(queryClient);
    },
  });
}
