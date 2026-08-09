import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Team } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { clubTeamsQueryKey } from './queryKeys';

export function useTeamDelete(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (teamId: string) => apiClient.delete(`/clubs/${clubId}/teams/${teamId}`),
    onSuccess: (_data, teamId) => {
      queryClient.setQueryData<Team[]>(clubTeamsQueryKey(clubId), (prev) =>
        (prev ?? []).filter((t) => t.id !== teamId),
      );
    },
  });
}
