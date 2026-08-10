import { useQuery } from '@tanstack/react-query';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
import { apiClient } from '../api/client';
import { teamAdminsQueryKey } from './queryKeys';

export function useTeamAdminList(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamAdminsQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<TeamAdmin[]>(`/clubs/${clubId}/teams/${teamId}/admins`),
  });
}
