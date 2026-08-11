import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateEventRequest, TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { teamEventsQueryKey } from './queryKeys';

export function useEventCreate(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateEventRequest) =>
      apiClient.post<TeamEvent[]>(`/clubs/${clubId}/teams/${teamId}/events`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(clubId, teamId) });
    },
  });
}
