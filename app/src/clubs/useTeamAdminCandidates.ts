import { useQuery } from '@tanstack/react-query';
import type { TeamAdminCandidate } from '@basketeasy/types/team-admins';
import { apiClient } from '../api/client';
import { teamAdminCandidatesQueryKey } from './queryKeys';

export function useTeamAdminCandidates(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamAdminCandidatesQueryKey(clubId, teamId),
    queryFn: () =>
      apiClient.get<TeamAdminCandidate[]>(`/clubs/${clubId}/teams/${teamId}/admins/eligible`),
  });
}
