import { useQuery } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { teamEventsQueryKey } from './queryKeys';

export function useEventList(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamEventsQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<TeamEvent[]>(`/clubs/${clubId}/teams/${teamId}/events`),
  });
}
