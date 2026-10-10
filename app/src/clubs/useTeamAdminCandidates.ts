import { useQuery } from '@tanstack/react-query';
import type { TeamAdminCandidate } from '@basketeasy/types/team-admins';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { teamAdminCandidatesQueryKey } from './queryKeys';

// `enabled` lets a caller skip the read for someone who can't see the
// result — the route refuses guardians, since it carries coaches' e-mails.
export function useTeamAdminCandidates(clubId: string, teamId: string, enabled = true) {
  return useQuery({
    queryKey: teamAdminCandidatesQueryKey(clubId, teamId),
    // Every member of every linked club, and a player accepting an invite adds
    // one without any manager's write: refreshed, not `static`.
    staleTime: FRESHNESS.slow,
    queryFn: () =>
      apiClient.get<TeamAdminCandidate[]>(`/clubs/${clubId}/teams/${teamId}/admins/eligible`),
    enabled,
  });
}
