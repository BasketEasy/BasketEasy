import { useQuery } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { teamEventQueryKey } from './queryKeys';

export function useEventShow(clubId: string, teamId: string, eventId: string) {
  return useQuery({
    queryKey: teamEventQueryKey(clubId, teamId, eventId),
    queryFn: () => apiClient.get<TeamEvent>(`/clubs/${clubId}/teams/${teamId}/events/${eventId}`),
  });
}
