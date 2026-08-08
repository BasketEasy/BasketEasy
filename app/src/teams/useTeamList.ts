import { useQuery } from '@tanstack/react-query';
import type { Team } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { clubTeamsQueryKey } from './queryKeys';

export function useTeamList(clubId: string) {
  return useQuery({
    queryKey: clubTeamsQueryKey(clubId),
    queryFn: () => apiClient.get<Team[]>(`/clubs/${clubId}/teams`),
  });
}
