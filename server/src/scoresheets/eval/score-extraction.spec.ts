import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';
import { scoreExtraction, sumScores } from './score-extraction';

const truth: ParsedScoresheetData = {
  homeScore: 6,
  awayScore: 2,
  quarterScores: [
    { home: 3, away: 2 },
    { home: 3, away: 0 },
  ],
  players: [
    { team: 'home', number: 7, name: 'Pinçon O.', points: 5, fouls: 2 },
    { team: 'home', number: 9, name: null, points: 1, fouls: 0 },
    { team: 'away', number: 7, name: null, points: 2, fouls: 1 },
  ],
  scoringPlays: [
    { team: 'home', jerseyNumber: 7, points: 3, runningScore: 3 },
    { team: 'away', jerseyNumber: 7, points: 2, runningScore: 2 },
    { team: 'home', jerseyNumber: 7, points: 2, runningScore: 5 },
    { team: 'home', jerseyNumber: 9, points: 1, runningScore: 6 },
  ],
};

describe('scoreExtraction', () => {
  it('grades an exact read as all correct', () => {
    const score = scoreExtraction(truth, truth);
    expect(score.mismatches).toEqual([]);
    expect(score.categories.score).toEqual({ correct: 6, total: 6 });
    expect(score.categories.playFound).toEqual({ correct: 4, total: 4 });
    expect(score.categories.playerName).toEqual({ correct: 1, total: 1 });
  });

  it('keys plays on the running score, so one missed line costs one line', () => {
    const actual = {
      ...truth,
      scoringPlays: truth.scoringPlays.filter((p) => p.runningScore !== 3),
    };
    const score = scoreExtraction(truth, actual);
    expect(score.categories.playFound).toEqual({ correct: 3, total: 4 });
    expect(score.categories.playJersey).toEqual({ correct: 3, total: 4 });
    expect(score.categories.playPoints).toEqual({ correct: 3, total: 4 });
  });

  it('keeps the two sides apart when they share a jersey number', () => {
    const actual = {
      ...truth,
      players: truth.players.map((p) => (p.team === 'away' ? { ...p, fouls: 4 } : p)),
    };
    const score = scoreExtraction(truth, actual);
    expect(score.mismatches).toEqual([
      { category: 'playerFouls', field: 'away #7', expected: 1, actual: 4 },
    ]);
  });

  it('counts invented plays and players as spurious, not as correct', () => {
    const actual: ParsedScoresheetData = {
      ...truth,
      players: [...truth.players, { team: 'away', number: 12, name: null, points: 0, fouls: 0 }],
      scoringPlays: [
        ...truth.scoringPlays,
        { team: 'away', jerseyNumber: 12, points: 2, runningScore: 4 },
      ],
    };
    const score = scoreExtraction(truth, actual);
    expect(score.spurious).toEqual({ plays: 1, players: 1 });
    expect(score.mismatches).toEqual([]);
  });

  it('charges a missing period and an invented one alike', () => {
    const missing = scoreExtraction(truth, { ...truth, quarterScores: [truth.quarterScores[0]] });
    expect(missing.categories.score).toEqual({ correct: 4, total: 6 });
    const extra = scoreExtraction(truth, {
      ...truth,
      quarterScores: [...truth.quarterScores, { home: 0, away: 0 }],
    });
    expect(extra.categories.score).toEqual({ correct: 6, total: 8 });
  });

  it('compares names without case, accents or punctuation, and skips unnamed truths', () => {
    const actual = {
      ...truth,
      players: truth.players.map((p) => ({ ...p, name: p.number === 7 ? 'PINCON O' : 'X' })),
    };
    const score = scoreExtraction(truth, actual);
    expect(score.categories.playerName).toEqual({ correct: 1, total: 1 });
  });
});

describe('sumScores', () => {
  it('adds tallies and spurious counts across reads', () => {
    const one = scoreExtraction(truth, truth);
    const total = sumScores([one, one]);
    expect(total.categories.playFound).toEqual({ correct: 8, total: 8 });
    expect(total.spurious).toEqual({ plays: 0, players: 0 });
  });
});
