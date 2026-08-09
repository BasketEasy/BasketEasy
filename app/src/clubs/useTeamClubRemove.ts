import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamClubLink } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamClubsQueryKey } from './queryKeys';

export function useTeamClubRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (partnerClubId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/clubs/${partnerClubId}`),
    onSuccess: (_data, partnerClubId) => {
      queryClient.setQueryData<TeamClubLink[]>(teamClubsQueryKey(clubId, teamId), (prev) =>
        (prev ?? []).filter((c) => c.clubId !== partnerClubId),
      );
    },
  });
}
