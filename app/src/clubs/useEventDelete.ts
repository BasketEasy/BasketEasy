import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { teamEventsQueryKey } from './queryKeys';

export function useEventDelete(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/events/${eventId}`),
    onSuccess: (_data, eventId) => {
      queryClient.setQueryData<TeamEvent[]>(teamEventsQueryKey(clubId, teamId), (prev) =>
        (prev ?? []).filter((e) => e.id !== eventId),
      );
    },
  });
}
