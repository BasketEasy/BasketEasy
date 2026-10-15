import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { invalidateRosterDependents } from './eventCache';

export function useTeamPlayerRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playerId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/players/${playerId}`),
    // The roster is read by the event rosters and summaries, the season table,
    // the rotation, « Mes équipes », the personas and the home: see
    // `invalidateRosterDependents`.
    onSuccess: () => invalidateRosterDependents(queryClient, { teamId }),
  });
}
