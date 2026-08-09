import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Team, UpdateTeamRequest } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { clubTeamsQueryKey, teamQueryKey } from './queryKeys';

export function useTeamUpdate(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: UpdateTeamRequest) =>
      apiClient.patch<Team>(`/clubs/${clubId}/teams/${teamId}`, dto),
    onSuccess: (team) => {
      queryClient.setQueryData<Team>(teamQueryKey(clubId, teamId), team);
      queryClient.setQueryData<Team[]>(clubTeamsQueryKey(clubId), (prev) =>
        (prev ?? []).map((t) => (t.id === team.id ? team : t)),
      );
    },
  });
}
