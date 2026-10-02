import { useQuery, type Query } from '@tanstack/react-query';
import type { EventVoteResults } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { eventVoteResultsQueryKey } from './queryKeys';
import { voteWindowClosesAt } from './voteWindow';

// Covers a browser clock slightly ahead of the server's: a read taken this
// close to the close still counts as taken inside the window.
const CLOSE_MARGIN_MS = 60_000;

/**
 * Votes land from every teammate until the window closes (`voteWindow.ts`), and
 * the leaderboards only become public to everyone at that moment. So the
 * results are `live` while the window is open, and `static` only for a read
 * taken after it closed: that one is final, and a read taken a minute before
 * the close (leaderboards still withheld) must not be mistaken for it.
 */
export function voteResultsStaleTime(startsAt: string) {
  const finalAfter = voteWindowClosesAt(startsAt).getTime() + CLOSE_MARGIN_MS;
  return (query: Query<EventVoteResults>) =>
    query.state.dataUpdatedAt > finalAfter ? FRESHNESS.static : FRESHNESS.live;
}

/**
 * Both categories' aggregated best/worst-player vote results for one MATCH
 * event, plus the caller's own `myVote`. `enabled` lets MatchVoteTab skip
 * the fetch entirely before the match has started — the ballot/results are
 * gated behind the vote window, so there's nothing to show yet. `startsAt` is
 * the match's kickoff, which fixes when the results stop changing.
 */
export function useEventVoteResults(
  clubId: string,
  teamId: string,
  eventId: string,
  startsAt: string,
  enabled = true,
) {
  return useQuery({
    queryKey: eventVoteResultsQueryKey(clubId, teamId, eventId),
    queryFn: () =>
      apiClient.get<EventVoteResults>(`/clubs/${clubId}/teams/${teamId}/events/${eventId}/votes`),
    staleTime: voteResultsStaleTime(startsAt),
    enabled,
  });
}
