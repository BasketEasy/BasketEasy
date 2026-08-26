import { useQuery } from '@tanstack/react-query';
import type { TeamFfbbLink } from '@basketeasy/types/ffbb';
import { apiClient } from '../api/client';
import { teamFfbbLinksQueryKey } from './queryKeys';

export function useTeamFfbbLinks(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamFfbbLinksQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<TeamFfbbLink[]>(`/clubs/${clubId}/teams/${teamId}/ffbb-links`),
  });
}
