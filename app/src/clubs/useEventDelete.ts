import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventUpdateScope } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { teamEventsQueryKey } from './queryKeys';

export function useEventDelete(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    // apiClient.delete takes no params argument, so the scope query string
    // is built inline here rather than via apiClient's buildQuery helper.
    mutationFn: ({ eventId, scope }: { eventId: string; scope?: EventUpdateScope }) =>
      apiClient.delete(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}${
          scope && scope !== 'THIS' ? `?scope=${scope}` : ''
        }`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(clubId, teamId) });
    },
  });
}
