import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventConvocationRosterEntry } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { eventConvocationsQueryKey, teamEventsQueryKey } from './queryKeys';

/**
 * Full-replace convocation write: the whole call-up list is sent on every
 * call, not an incremental add/remove — see the convocations design spec.
 */
export function useEventConvocationsSet(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, teamPlayerIds }: { eventId: string; teamPlayerIds: string[] }) =>
      apiClient.patch<EventConvocationRosterEntry[]>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/convocations`,
        { teamPlayerIds },
      ),
    onSuccess: (_data, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(clubId, teamId) });
      queryClient.invalidateQueries({
        queryKey: eventConvocationsQueryKey(clubId, teamId, eventId),
      });
    },
  });
}
