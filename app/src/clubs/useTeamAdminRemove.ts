import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
import { apiClient } from '../api/client';
import { teamAdminsQueryKey } from './queryKeys';

export function useTeamAdminRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/admins/${userId}`),
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<TeamAdmin[]>(teamAdminsQueryKey(clubId, teamId), (prev) =>
        (prev ?? []).filter((a) => a.userId !== userId),
      );
    },
  });
}
