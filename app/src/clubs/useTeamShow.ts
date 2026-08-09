import { useQuery } from '@tanstack/react-query';
import type { Team } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamQueryKey } from './queryKeys';

export function useTeamShow(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<Team>(`/clubs/${clubId}/teams/${teamId}`),
  });
}
