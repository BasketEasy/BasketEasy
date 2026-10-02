import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventVoteCategory, EventVoteResults } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { invalidateDashboard } from './eventCache';
import { eventVoteResultsQueryKey } from './queryKeys';

/**
 * Casts (or recasts — the server upserts on the unique event/category/voter
 * key) one category's vote for one MATCH event. The response is already the
 * fresh aggregated EventVoteResults, so onSuccess writes it straight into
 * the results query cache rather than triggering a second round-trip. The
 * home's agenda carries `vote.hasVoted`, so the dashboard is marked stale.
 */
export function useEventVoteCast(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      category,
      teamPlayerId,
    }: {
      eventId: string;
      category: EventVoteCategory;
      teamPlayerId: string;
    }) =>
      apiClient.patch<EventVoteResults>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/votes`,
        {
          category,
          teamPlayerId,
        },
      ),
    onSuccess: (data, { eventId }) => {
      queryClient.setQueryData(eventVoteResultsQueryKey(clubId, teamId, eventId), data);
      invalidateDashboard(queryClient);
    },
  });
}
