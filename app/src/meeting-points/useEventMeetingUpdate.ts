import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import type { UpdateEventMeetingRequest } from '@basketeasy/types/meeting-points';
import { apiClient } from '../api/client';
import { teamEventQueryKey, teamEventsQueryKey } from '../clubs/queryKeys';

export function useEventMeetingUpdate(clubId: string, teamId: string, eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: UpdateEventMeetingRequest) =>
      apiClient.patch<TeamEvent>(`/clubs/${clubId}/teams/${teamId}/events/${eventId}/meeting`, dto),
    onSuccess: (event) => {
      queryClient.setQueryData(teamEventQueryKey(clubId, teamId, eventId), event);
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(clubId, teamId) });
    },
  });
}
