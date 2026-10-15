import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddTeamAdminRequest, TeamAdmin } from '@basketeasy/types/team-admins';
import { apiClient } from '../api/client';
import { myTeamsQueryKey, teamAdminsQueryKey } from './queryKeys';

export function useTeamAdminAdd(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddTeamAdminRequest) =>
      apiClient.post<TeamAdmin>(`/clubs/${clubId}/teams/${teamId}/admins`, dto),
    onSuccess: (teamAdmin) => {
      // A list that was never read is left alone: a one-row list would look fresh.
      queryClient.setQueryData<TeamAdmin[]>(
        teamAdminsQueryKey(clubId, teamId),
        (prev) => prev && [...prev, teamAdmin],
      );
      // `isTeamAdmin` of « Mes équipes » is this grant.
      queryClient.invalidateQueries({ queryKey: myTeamsQueryKey });
    },
  });
}
