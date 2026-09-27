import { useQuery } from '@tanstack/react-query';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
import { apiClient } from '../api/client';
import { teamAdminsQueryKey } from './queryKeys';

// `enabled` lets a caller skip the read for someone who can't see the
// result — the route refuses guardians, since it carries coaches' e-mails.
export function useTeamAdminList(clubId: string, teamId: string, enabled = true) {
  return useQuery({
    queryKey: teamAdminsQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<TeamAdmin[]>(`/clubs/${clubId}/teams/${teamId}/admins`),
    enabled,
  });
}
