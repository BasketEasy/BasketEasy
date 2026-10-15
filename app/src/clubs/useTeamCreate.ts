import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateTeamRequest, Team } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { clubTeamsQueryKey, myTeamsQueryKey } from './queryKeys';

export function useTeamCreate(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateTeamRequest) => apiClient.post<Team>(`/clubs/${clubId}/teams`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubTeamsQueryKey(clubId) });
      // The creator is the new team's admin: « Mes équipes » lists it.
      queryClient.invalidateQueries({ queryKey: myTeamsQueryKey });
    },
  });
}
