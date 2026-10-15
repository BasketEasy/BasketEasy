import { asParsedScoresheetData } from './parsed-scoresheet-data';

describe('asParsedScoresheetData', () => {
  it('returns null for the failed-job placeholder ({})', () => {
    expect(asParsedScoresheetData({})).toBeNull();
  });

  it('returns null for null/undefined/non-object values', () => {
    expect(asParsedScoresheetData(null)).toBeNull();
    expect(asParsedScoresheetData(undefined)).toBeNull();
    expect(asParsedScoresheetData('not an object')).toBeNull();
    expect(asParsedScoresheetData(42)).toBeNull();
  });

  it('returns null when any of the three arrays is missing (a truncated model reply)', () => {
    expect(
      asParsedScoresheetData({
        homeScore: 62,
        awayScore: 58,
        quarterScores: [],
        players: [],
        // scoringPlays missing
      }),
    ).toBeNull();
  });

  it('returns the value as-is when all three arrays are present', () => {
    const data = {
      homeScore: 62,
      awayScore: 58,
      quarterScores: [{ home: 20, away: 15 }],
      players: [{ team: 'home', number: 7, name: 'Dupont', points: 12, fouls: 2 }],
      scoringPlays: [{ team: 'home', jerseyNumber: 7, points: 2, runningScore: 12 }],
    };
    expect(asParsedScoresheetData(data)).toEqual(data);
  });
});
