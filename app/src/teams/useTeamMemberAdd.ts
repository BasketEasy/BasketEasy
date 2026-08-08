import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddTeamMemberRequest, TeamMember } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamMembersQueryKey } from './queryKeys';

export function useTeamMemberAdd(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddTeamMemberRequest) =>
      apiClient.post<TeamMember>(`/clubs/${clubId}/teams/${teamId}/members`, dto),
    onSuccess: (member) => {
      queryClient.setQueryData<TeamMember[]>(teamMembersQueryKey(clubId, teamId), (prev) => [
        ...(prev ?? []),
        member,
      ]);
    },
  });
}
