import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MatchStats, UpdateMatchStatsRequest } from '@basketeasy/types/team-stats';
import { apiClient } from '../api/client';
import { useTeamPersona } from '../guardians/useActingAs';
import {
  invalidateDashboard,
  invalidateEventDetails,
  invalidateEventLists,
  invalidateEventParts,
} from './eventCache';
import { matchStatsQueryKey, teamStatsQueryKeyPrefix } from './queryKeys';

/**
 * A manager's correction of a played match (or its first entry, with no
 * sheet). The server answers with the match's stats as they now stand, which
 * goes straight into the cache entry the page reads; the rest of what the
 * write moves is refetched: the event's result (score, outcome) on its detail,
 * the lists and the dashboard, the sheet's own status (a sheet-less match now
 * has one) and the season table folded from the same lines. The match entry
 * just written is left out of the stats invalidation, but another persona's
 * copy of it goes stale with the rest.
 */
export function useUpdateMatchStats(clubId: string, teamId: string, eventId: string) {
  const queryClient = useQueryClient();
  const { forPlayerId } = useTeamPersona(teamId);

  return useMutation({
    mutationFn: (request: UpdateMatchStatsRequest) =>
      apiClient.put<MatchStats>(
        `/clubs/${clubId}/teams/${teamId}/stats/matches/${eventId}`,
        request,
      ),
    onSuccess: (data) => {
      const written = matchStatsQueryKey(clubId, teamId, eventId, forPlayerId);
      queryClient.setQueryData(written, data);
      void queryClient.invalidateQueries({
        queryKey: teamStatsQueryKeyPrefix(clubId, teamId),
        predicate: ({ queryKey }) => JSON.stringify(queryKey) !== JSON.stringify(written),
      });
      invalidateEventParts(queryClient, { clubId, teamId, eventId }, [
        'scoresheet',
        'scoresheet-extraction',
      ]);
      invalidateEventDetails(queryClient, { clubId, teamId, eventId });
      invalidateEventLists(queryClient, { clubId, teamId });
      invalidateDashboard(queryClient);
    },
  });
}
