import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { teamFfbbLinksQueryKey, teamPouleResultsQueryKey } from './queryKeys';

export function useFfbbLinkRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (linkId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/ffbb-links/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamFfbbLinksQueryKey(clubId, teamId) });
      // The standings are read from the team's links: another link, another poule.
      queryClient.invalidateQueries({ queryKey: teamPouleResultsQueryKey(clubId, teamId) });
    },
  });
}
