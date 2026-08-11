import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddTeamAdminRequest, TeamAdmin } from '@basketeasy/types/team-admins';
import { apiClient } from '../api/client';
import { teamAdminsQueryKey } from './queryKeys';

export function useTeamAdminAdd(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddTeamAdminRequest) =>
      apiClient.post<TeamAdmin>(`/clubs/${clubId}/teams/${teamId}/admins`, dto),
    onSuccess: (teamAdmin) => {
      queryClient.setQueryData<TeamAdmin[]>(teamAdminsQueryKey(clubId, teamId), (prev) => [
        ...(prev ?? []),
        teamAdmin,
      ]);
    },
  });
}
