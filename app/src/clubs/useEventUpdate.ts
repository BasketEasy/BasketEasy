import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamEvent, UpdateEventRequest } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { invalidateTeamEvents } from './eventCache';

export function useEventUpdate(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, dto }: { eventId: string; dto: UpdateEventRequest }) =>
      apiClient.patch<TeamEvent[]>(`/clubs/${clubId}/teams/${teamId}/events/${eventId}`, dto),
    onSuccess: () => {
      invalidateTeamEvents(queryClient, { clubId, teamId }, { stats: true });
    },
  });
}
