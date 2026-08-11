import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamEvent, UpdateEventTimeOfDayRequest } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { teamEventsQueryKey } from './queryKeys';

export function useEventTimeUpdate(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, dto }: { eventId: string; dto: UpdateEventTimeOfDayRequest }) =>
      apiClient.patch<TeamEvent[]>(`/clubs/${clubId}/teams/${teamId}/events/${eventId}/time`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(clubId, teamId) });
    },
  });
}
