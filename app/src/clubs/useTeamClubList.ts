import { useQuery } from '@tanstack/react-query';
import type { TeamClubLink } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamClubsQueryKey } from './queryKeys';

export function useTeamClubList(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamClubsQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<TeamClubLink[]>(`/clubs/${clubId}/teams/${teamId}/clubs`),
  });
}
