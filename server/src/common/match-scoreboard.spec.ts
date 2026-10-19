import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';
import { applyScoreboard, toScoreboard } from './match-scoreboard';

const sheet: ParsedScoresheetData = {
  homeScore: 62,
  awayScore: 55,
  quarterScores: [{ home: 16, away: 12 }],
  players: [{ team: 'home', number: 7, name: 'Martin', points: 12, fouls: 2 }],
  scoringPlays: [{ team: 'home', jerseyNumber: 7, points: 2, runningScore: 2 }],
};

describe('toScoreboard', () => {
  it('reads the home column as ours for a home match', () => {
    expect(toScoreboard('HOME', sheet)).toEqual({
      ourScore: 62,
      theirScore: 55,
      periods: [{ ours: 16, theirs: 12 }],
    });
  });

  it('reads the away column as ours for an away match', () => {
    expect(toScoreboard('AWAY', sheet)).toEqual({
      ourScore: 55,
      theirScore: 62,
      periods: [{ ours: 12, theirs: 16 }],
    });
  });

  it('is null without a venue or without data, never a guess', () => {
    expect(toScoreboard(null, sheet)).toBeNull();
    expect(toScoreboard('HOME', null)).toBeNull();
  });
});

describe('applyScoreboard', () => {
  const score = { ourScore: 40, theirScore: 38, periods: [{ ours: 10, theirs: 9 }] };

  it('puts our side in the sheet column the venue says, keeping the rest of the read', () => {
    const result = applyScoreboard('AWAY', sheet, score);

    expect(result).toEqual({
      ...sheet,
      homeScore: 38,
      awayScore: 40,
      quarterScores: [{ home: 9, away: 10 }],
    });
  });

  it('starts from empty players and plays when there is no sheet', () => {
    expect(applyScoreboard('HOME', null, score)).toEqual({
      homeScore: 40,
      awayScore: 38,
      quarterScores: [{ home: 10, away: 9 }],
      players: [],
      scoringPlays: [],
    });
  });

  it('round-trips through toScoreboard', () => {
    expect(toScoreboard('AWAY', applyScoreboard('AWAY', null, score))).toEqual(score);
  });
});
