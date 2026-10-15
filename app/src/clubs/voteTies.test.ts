import { describe, expect, it } from 'vitest';
import type { EventVoteCandidateResult } from '@basketeasy/types/events';
import { computeRanks, countTiedAtTop } from './voteTies';

function candidate(teamPlayerId: string, voteCount: number): EventVoteCandidateResult {
  return { teamPlayerId, firstName: 'x', lastName: teamPlayerId, voteCount };
}

describe('computeRanks', () => {
  it('returns an empty array for no results', () => {
    expect(computeRanks([])).toEqual([]);
  });

  it('ranks 1, 2, 3 when nobody is tied', () => {
    const results = [candidate('a', 5), candidate('b', 3), candidate('c', 1)];
    expect(computeRanks(results)).toEqual([1, 2, 3]);
  });

  it('gives a tie for 1st the same rank, and skips to 3 for the next distinct entry', () => {
    const results = [candidate('a', 5), candidate('b', 5), candidate('c', 3)];
    expect(computeRanks(results)).toEqual([1, 1, 3]);
  });

  it('handles a tie in the middle of the list the same way', () => {
    const results = [
      candidate('a', 5),
      candidate('b', 3),
      candidate('c', 3),
      candidate('d', 3),
      candidate('e', 1),
    ];
    expect(computeRanks(results)).toEqual([1, 2, 2, 2, 5]);
  });

  it('gives every entry rank 1 when everyone is tied', () => {
    const results = [candidate('a', 2), candidate('b', 2), candidate('c', 2)];
    expect(computeRanks(results)).toEqual([1, 1, 1]);
  });
});

describe('countTiedAtTop', () => {
  it('returns 0 for an empty array', () => {
    expect(countTiedAtTop([])).toBe(0);
  });

  it('returns 1 when there is a single clear leader', () => {
    expect(countTiedAtTop([candidate('a', 5), candidate('b', 3)])).toBe(1);
  });

  it('returns the count of candidates sharing the top vote count', () => {
    const results = [candidate('a', 5), candidate('b', 5), candidate('c', 3)];
    expect(countTiedAtTop(results)).toBe(2);
  });

  it('does not count a tie further down the list', () => {
    const results = [candidate('a', 5), candidate('b', 3), candidate('c', 3)];
    expect(countTiedAtTop(results)).toBe(1);
  });
});
