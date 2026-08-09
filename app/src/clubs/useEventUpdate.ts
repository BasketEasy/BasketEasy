import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamEvent, UpdateEventRequest } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { teamEventsQueryKey } from './queryKeys';

export function useEventUpdate(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, dto }: { eventId: string; dto: UpdateEventRequest }) =>
      apiClient.patch<TeamEvent>(`/clubs/${clubId}/teams/${teamId}/events/${eventId}`, dto),
    onSuccess: (event) => {
      queryClient.setQueryData<TeamEvent[]>(teamEventsQueryKey(clubId, teamId), (prev) =>
        (prev ?? [])
          .map((e) => (e.id === event.id ? event : e))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
    },
  });
}
