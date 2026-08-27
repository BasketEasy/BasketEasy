import { useQuery } from '@tanstack/react-query';
import type { EventVoteResults } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { eventVoteResultsQueryKey } from './queryKeys';

/**
 * Both categories' aggregated best/worst-player vote results for one MATCH
 * event, plus the caller's own `myVote`. `enabled` lets MatchVoteTab skip
 * the fetch entirely before the match has started — the ballot/results are
 * gated behind the vote window, so there's nothing to show yet.
 */
export function useEventVoteResults(
  clubId: string,
  teamId: string,
  eventId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: eventVoteResultsQueryKey(clubId, teamId, eventId),
    queryFn: () =>
      apiClient.get<EventVoteResults>(`/clubs/${clubId}/teams/${teamId}/events/${eventId}/votes`),
    enabled,
  });
}
