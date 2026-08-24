import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SetEventRsvpRequest, TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { eventRsvpsQueryKey, teamEventsQueryKey } from './queryKeys';

export function useEventRsvpSet(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: SetEventRsvpRequest['status'] }) =>
      apiClient.patch<TeamEvent>(`/clubs/${clubId}/teams/${teamId}/events/${eventId}/rsvp`, {
        status,
      }),
    onSuccess: (_data, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(clubId, teamId) });
      queryClient.invalidateQueries({ queryKey: eventRsvpsQueryKey(clubId, teamId, eventId) });
    },
  });
}
