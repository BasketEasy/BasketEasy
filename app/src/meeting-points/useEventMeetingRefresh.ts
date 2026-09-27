import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { teamEventQueryKey, teamEventsQueryKey } from '../clubs/queryKeys';

/** « Recalculer » — the server recomputes the driving time synchronously. */
export function useEventMeetingRefresh(clubId: string, teamId: string, eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post<TeamEvent>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/meeting/refresh`,
        {},
      ),
    onSuccess: (event) => {
      queryClient.setQueryData(teamEventQueryKey(clubId, teamId, eventId), event);
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(clubId, teamId) });
    },
  });
}
