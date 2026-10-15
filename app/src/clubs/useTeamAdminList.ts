import { useQuery } from '@tanstack/react-query';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { teamAdminsQueryKey } from './queryKeys';

// `enabled` lets a caller skip the read for someone who can't see the
// result — the route refuses guardians, since it carries coaches' e-mails.
export function useTeamAdminList(clubId: string, teamId: string, enabled = true) {
  return useQuery({
    queryKey: teamAdminsQueryKey(clubId, teamId),
    // Who holds authority over the team: another manager can grant or revoke it.
    staleTime: FRESHNESS.slow,
    queryFn: ({ signal }) =>
      apiClient.get<TeamAdmin[]>(`/clubs/${clubId}/teams/${teamId}/admins`, undefined, { signal }),
    enabled,
  });
}
