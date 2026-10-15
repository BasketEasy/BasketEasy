import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LinkFfbbTeamRequest, TeamFfbbLink } from '@basketeasy/types/ffbb';
import { apiClient } from '../api/client';
import { teamFfbbLinksQueryKey, teamPouleResultsQueryKey } from './queryKeys';

export function useFfbbLinkAdd(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: LinkFfbbTeamRequest) =>
      apiClient.post<TeamFfbbLink>(`/clubs/${clubId}/teams/${teamId}/ffbb-links`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamFfbbLinksQueryKey(clubId, teamId) });
      // The standings are read from the team's links: another link, another poule.
      queryClient.invalidateQueries({ queryKey: teamPouleResultsQueryKey(clubId, teamId) });
    },
  });
}
