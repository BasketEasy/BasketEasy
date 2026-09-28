import { useQuery } from '@tanstack/react-query';
import type { TeamAdminCandidate } from '@basketeasy/types/team-admins';
import { apiClient } from '../api/client';
import { teamAdminCandidatesQueryKey } from './queryKeys';

// `enabled` lets a caller skip the read for someone who can't see the
// result — the route refuses guardians, since it carries coaches' e-mails.
export function useTeamAdminCandidates(clubId: string, teamId: string, enabled = true) {
  return useQuery({
    queryKey: teamAdminCandidatesQueryKey(clubId, teamId),
    queryFn: () =>
      apiClient.get<TeamAdminCandidate[]>(`/clubs/${clubId}/teams/${teamId}/admins/eligible`),
    enabled,
  });
}
