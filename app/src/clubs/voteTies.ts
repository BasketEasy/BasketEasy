import type { EventVoteCandidateResult } from '@basketeasy/types/events';

/**
 * Competition ("1224") ranking over an already-sorted-descending results
 * array: tied entries share a rank, and the next distinct voteCount skips
 * the intervening numbers (two tied for 1st -> both rank 1, the next entry
 * is rank 3, not 2) — the standard sports-leaderboard convention, and the
 * one that correctly answers "am I actually 2nd" (nobody is, if two people
 * tied for 1st — the next player is 3rd). Returns one rank per entry, same
 * order/length as the input; derives purely from `voteCount`, no new API
 * field needed.
 */
export function computeRanks(results: EventVoteCandidateResult[]): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < results.length; i++) {
    ranks.push(i > 0 && results[i].voteCount === results[i - 1].voteCount ? ranks[i - 1] : i + 1);
  }
  return ranks;
}

/**
 * How many candidates share the top vote count — 0 for an empty array, 1
 * when there's a single clear leader, 2+ for a tie. Used to decide when a
 * display needs tie-aware copy ("Égalité (N)") instead of a single name.
 */
export function countTiedAtTop(results: EventVoteCandidateResult[]): number {
  if (results.length === 0) {
    return 0;
  }
  const topVoteCount = results[0].voteCount;
  return results.filter((result) => result.voteCount === topVoteCount).length;
}
