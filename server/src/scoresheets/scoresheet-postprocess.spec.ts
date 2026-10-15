import type {
  ParsedScoresheetData,
  ScoresheetScoringPlay,
} from '@basketeasy/types/scoresheet-extraction';
import { postProcessScoresheet, validateScoresheet } from './scoresheet-postprocess';

const play = (
  jerseyNumber: number | null,
  points: number | null,
  runningScore: number | null,
  team: 'home' | 'away' = 'home',
): ScoresheetScoringPlay => ({ team, jerseyNumber, points, runningScore });

// Home: 3 + 2 in the first period, 1 in the second. Away: one basket.
const sheet: ParsedScoresheetData = {
  homeScore: 6,
  awayScore: 2,
  quarterScores: [
    { home: 5, away: 2 },
    { home: 1, away: 0 },
  ],
  players: [
    { team: 'home', number: 7, name: null, points: null, fouls: 2 },
    { team: 'home', number: 9, name: null, points: null, fouls: 0 },
    { team: 'away', number: 4, name: null, points: null, fouls: 1 },
  ],
  scoringPlays: [play(7, 3, 3), play(9, 2, 5), play(7, 1, 6), play(4, 2, 2, 'away')],
};

const codes = (data: ParsedScoresheetData) =>
  validateScoresheet(postProcessScoresheet(data).parsedData).map((i) => `${i.severity}:${i.code}`);

describe('postProcessScoresheet', () => {
  it('accepts a consistent sheet and derives each player’s points', () => {
    const result = postProcessScoresheet(sheet);
    expect(result.issues).toEqual([]);
    expect(result.consistent).toBe(true);
    expect(result.parsedData.players.map((p) => p.points)).toEqual([4, 2, 2]);
  });

  it('takes each basket’s points from the gap between marked totals, keeping sheet order', () => {
    const result = postProcessScoresheet({
      ...sheet,
      scoringPlays: [
        play(4, null, 2, 'away'),
        play(7, null, 3),
        play(9, null, 5),
        play(7, null, 6),
      ],
    });
    expect(result.parsedData.scoringPlays).toEqual([
      play(4, 2, 2, 'away'),
      play(7, 3, 3),
      play(9, 2, 5),
      play(7, 1, 6),
    ]);
    expect(result.consistent).toBe(true);
  });

  it('keeps a disagreeing notation for review, and the gap wins', () => {
    const result = postProcessScoresheet({
      ...sheet,
      scoringPlays: [play(7, 2, 3), play(9, 2, 5), play(7, 1, 6), play(4, 2, 2, 'away')],
    });
    expect(result.parsedData.scoringPlays[0]).toEqual({ ...play(7, 3, 3), notationPoints: 2 });
    expect(result.issues.map((i) => `${i.severity}:${i.code}`)).toEqual([
      'error:NOTATION_DISAGREES',
    ]);
    expect(result.consistent).toBe(false);
  });

  it('only warns when the disagreement is on a period’s closing basket', () => {
    // 5 closes the first period: e-Marque's own end-of-period symbol
    // disagrees with the gap on correct sheets.
    const result = postProcessScoresheet({
      ...sheet,
      scoringPlays: [play(7, 3, 3), play(9, 1, 5), play(7, 1, 6), play(4, 2, 2, 'away')],
    });
    expect(result.issues.map((i) => `${i.severity}:${i.code}`)).toEqual([
      'warning:NOTATION_DISAGREES',
    ]);
    expect(result.consistent).toBe(true);
  });

  it('drops a stale notation once it agrees with the gap', () => {
    const result = postProcessScoresheet({
      ...sheet,
      scoringPlays: [{ ...play(7, 3, 3), notationPoints: 2 }, ...sheet.scoringPlays.slice(1)],
    });
    expect(result.parsedData.scoringPlays[0]).toEqual(play(7, 3, 3));
  });
});

describe('validateScoresheet', () => {
  it('flags quarters that do not add up', () => {
    expect(codes({ ...sheet, homeScore: 7 })).toContain('error:QUARTERS_DONT_SUM');
  });

  it('flags a missed line as a basket worth more than 3', () => {
    // 5 → 6 → missing → 10: a gap of 4.
    expect(
      codes({
        ...sheet,
        homeScore: 10,
        quarterScores: [],
        scoringPlays: [play(7, 3, 3), play(9, 2, 5), play(7, 1, 6), play(9, 2, 10)],
      }),
    ).toEqual(['error:IMPOSSIBLE_PLAY']);
  });

  it('flags a last marked total that is not the final score', () => {
    expect(codes({ ...sheet, homeScore: 8, quarterScores: [] })).toEqual([
      'error:FINAL_SCORE_NOT_REACHED',
    ]);
  });

  it('flags a total marked twice', () => {
    expect(codes({ ...sheet, scoringPlays: [...sheet.scoringPlays, play(9, 2, 5)] })).toContain(
      'error:RUNNING_SCORE_NOT_INCREASING',
    );
  });

  it('flags a period whose closing total is never marked', () => {
    // Quarters say the first period closed at 4; no basket reached 4.
    const data = {
      ...sheet,
      quarterScores: [
        { home: 4, away: 2 },
        { home: 2, away: 0 },
      ],
    };
    expect(codes(data)).toContain('error:PERIOD_END_NOT_MARKED');
  });

  it('flags a scorer nobody on that side wears, and one whose number was not read', () => {
    expect(
      codes({ ...sheet, scoringPlays: [play(99, 3, 3), ...sheet.scoringPlays.slice(1)] }),
    ).toEqual(['error:SCORER_NOT_ON_ROSTER']);
    expect(
      codes({ ...sheet, scoringPlays: [play(null, 3, 3), ...sheet.scoringPlays.slice(1)] }),
    ).toEqual(['error:UNREAD_SCORER']);
  });

  it('checks the scorer against the right side’s roster', () => {
    // 4 plays for away; at home nobody wears it.
    expect(
      codes({ ...sheet, scoringPlays: [play(4, 3, 3), ...sheet.scoringPlays.slice(1)] }),
    ).toEqual(['error:SCORER_NOT_ON_ROSTER']);
  });

  it('flags more fouls than the sheet has cells for', () => {
    expect(
      codes({
        ...sheet,
        players: sheet.players.map((p) => (p.number === 9 ? { ...p, fouls: 6 } : p)),
      }),
    ).toEqual(['error:TOO_MANY_FOULS']);
  });

  describe('without running totals', () => {
    const unnumbered = {
      ...sheet,
      quarterScores: [],
      scoringPlays: sheet.scoringPlays.map((p) => ({ ...p, runningScore: null })),
    };

    it('falls back to summing the notation', () => {
      expect(codes(unnumbered)).toEqual([]);
      expect(codes({ ...unnumbered, homeScore: 9 })).toEqual(['error:PLAYS_DONT_SUM']);
    });

    it('rejects a notation outside 1–3', () => {
      expect(
        codes({
          ...unnumbered,
          homeScore: null,
          scoringPlays: [{ ...unnumbered.scoringPlays[0], points: 4 }],
        }),
      ).toEqual(['error:IMPOSSIBLE_PLAY']);
    });
  });
});
