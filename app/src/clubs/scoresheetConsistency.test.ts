import { describe, expect, it } from 'vitest';
import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';
import { findMissingPlayerFields, findQuarterMismatches } from './scoresheetConsistency';

function baseData(overrides: Partial<ParsedScoresheetData> = {}): ParsedScoresheetData {
  return {
    homeScore: 80,
    awayScore: 70,
    quarterScores: [
      { home: 20, away: 15 },
      { home: 20, away: 20 },
      { home: 20, away: 15 },
      { home: 20, away: 20 },
    ],
    players: [],
    ...overrides,
  };
}

describe('findQuarterMismatches', () => {
  it('returns no mismatch when both sides sum to their totals', () => {
    expect(findQuarterMismatches(baseData())).toEqual([]);
  });

  it('flags the home side when its sum differs from the recorded total', () => {
    const data = baseData({ homeScore: 81 });
    expect(findQuarterMismatches(data)).toEqual([{ side: 'home', sum: 80, total: 81 }]);
  });

  it('flags the away side when its sum differs from the recorded total', () => {
    const data = baseData({ awayScore: 71 });
    expect(findQuarterMismatches(data)).toEqual([{ side: 'away', sum: 70, total: 71 }]);
  });

  it('does not flag a side that has a null quarter, even if the total is wrong', () => {
    const data = baseData({
      homeScore: 999,
      quarterScores: [
        { home: null, away: 15 },
        { home: 20, away: 20 },
        { home: 20, away: 15 },
        { home: 20, away: 20 },
      ],
    });
    expect(findQuarterMismatches(data)).toEqual([]);
  });

  it('flags both sides independently when both mismatch', () => {
    const data = baseData({ homeScore: 81, awayScore: 71 });
    expect(findQuarterMismatches(data)).toEqual([
      { side: 'home', sum: 80, total: 81 },
      { side: 'away', sum: 70, total: 71 },
    ]);
  });

  it('returns no flags when quarterScores is empty', () => {
    const data = baseData({ quarterScores: [] });
    expect(findQuarterMismatches(data)).toEqual([]);
  });
});

describe('findMissingPlayerFields', () => {
  it('flags a player with null points', () => {
    const data = baseData({
      players: [{ number: 4, name: 'Alice', points: null, fouls: 2 }],
    });
    expect(findMissingPlayerFields(data)).toEqual([{ playerIndex: 0, field: 'points' }]);
  });

  it('flags a player with null fouls', () => {
    const data = baseData({
      players: [{ number: 4, name: 'Alice', points: 10, fouls: null }],
    });
    expect(findMissingPlayerFields(data)).toEqual([{ playerIndex: 0, field: 'fouls' }]);
  });

  it('flags a player missing both points and fouls with two entries', () => {
    const data = baseData({
      players: [{ number: 4, name: 'Alice', points: null, fouls: null }],
    });
    expect(findMissingPlayerFields(data)).toEqual([
      { playerIndex: 0, field: 'points' },
      { playerIndex: 0, field: 'fouls' },
    ]);
  });

  it('returns no flags when every player has points and fouls populated', () => {
    const data = baseData({
      players: [
        { number: 4, name: 'Alice', points: 10, fouls: 2 },
        { number: 7, name: 'Bob', points: 6, fouls: 1 },
      ],
    });
    expect(findMissingPlayerFields(data)).toEqual([]);
  });

  it('returns no flags when players is empty', () => {
    expect(findMissingPlayerFields(baseData({ players: [] }))).toEqual([]);
  });
});
