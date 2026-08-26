import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LinkFfbbTeamRequest, TeamFfbbLink } from '@basketeasy/types/ffbb';
import { apiClient } from '../api/client';
import { teamFfbbLinksQueryKey } from './queryKeys';

export function useFfbbLinkAdd(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: LinkFfbbTeamRequest) =>
      apiClient.post<TeamFfbbLink>(`/clubs/${clubId}/teams/${teamId}/ffbb-links`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamFfbbLinksQueryKey(clubId, teamId) });
    },
  });
}
