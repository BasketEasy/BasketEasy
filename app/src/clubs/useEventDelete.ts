import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { teamEventsQueryKey } from './queryKeys';

export function useEventDelete(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/events/${eventId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(clubId, teamId) });
    },
  });
}
