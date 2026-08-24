import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { eventRsvpsQueryKey, teamEventsQueryKey } from './queryKeys';

export function useEventRsvpClear(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId }: { eventId: string }) =>
      apiClient.delete<TeamEvent>(`/clubs/${clubId}/teams/${teamId}/events/${eventId}/rsvp`),
    onSuccess: (_data, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(clubId, teamId) });
      queryClient.invalidateQueries({ queryKey: eventRsvpsQueryKey(clubId, teamId, eventId) });
    },
  });
}
