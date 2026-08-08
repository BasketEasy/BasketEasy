import { useQuery } from '@tanstack/react-query';
import type { TeamMember } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamMembersQueryKey } from './queryKeys';

export function useTeamMemberList(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamMembersQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<TeamMember[]>(`/clubs/${clubId}/teams/${teamId}/members`),
  });
}
