import { useQuery } from '@tanstack/react-query';
import type { TeamPlayer } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamPlayersQueryKey } from './queryKeys';

export function useTeamPlayerList(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamPlayersQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<TeamPlayer[]>(`/clubs/${clubId}/teams/${teamId}/players`),
  });
}
