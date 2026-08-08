import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamMember } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamMembersQueryKey } from './queryKeys';

export function useTeamMemberRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/members/${userId}`),
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<TeamMember[]>(teamMembersQueryKey(clubId, teamId), (prev) =>
        (prev ?? []).filter((m) => m.userId !== userId),
      );
    },
  });
}
