import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddTeamPlayerRequest, TeamPlayer } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { invalidateRosterDependents } from './eventCache';

export function useTeamPlayerAdd(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddTeamPlayerRequest) =>
      apiClient.post<TeamPlayer>(`/clubs/${clubId}/teams/${teamId}/players`, dto),
    // The roster is read by the event rosters and summaries, the season table,
    // the rotation, « Mes équipes », the personas and the home: see
    // `invalidateRosterDependents`.
    onSuccess: () => invalidateRosterDependents(queryClient, { teamId }),
  });
}
