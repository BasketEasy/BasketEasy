import { join } from 'path';
import type {
  ParsedScoresheetData,
  ScoresheetTeamSide,
} from '@basketeasy/types/scoresheet-extraction';
import { loadGoldenScoresheets } from './golden';
import { scoreExtraction } from './score-extraction';
import { postProcessScoresheet } from '../scoresheet-postprocess';

// Real e-Marque sheets, read deterministically and pseudonymised. They pin the
// production post-processing to what actual matches look like: a validator
// change that flags a correct sheet, or a points derivation that drifts from
// the running score, fails here instead of in front of a club.
const GOLDEN_DIR = join(__dirname, '../../../test/scoresheet-eval/golden');
const goldens = loadGoldenScoresheets(GOLDEN_DIR);

function periodClosingTotals(data: ParsedScoresheetData): Record<ScoresheetTeamSide, Set<number>> {
  const closing = { home: new Set<number>(), away: new Set<number>() };
  for (const side of ['home', 'away'] as const) {
    let total = 0;
    for (const quarter of data.quarterScores) {
      total += quarter[side] ?? 0;
      closing[side].add(total);
    }
  }
  return closing;
}

describe('scoresheet goldens', () => {
  it('ships at least one golden sheet', () => {
    expect(goldens.length).toBeGreaterThan(0);
  });

  describe.each(goldens.map((g) => [g.id, g] as const))('%s', (_id, golden) => {
    it('is accepted as consistent by the production validator', () => {
      expect(postProcessScoresheet(golden.expected).consistent).toBe(true);
    });

    it('re-derives every player total from the running score alone', () => {
      const withoutPoints = {
        ...golden.expected,
        players: golden.expected.players.map((p) => ({ ...p, points: null })),
      };
      const { parsedData } = postProcessScoresheet(withoutPoints);
      expect(parsedData.players.map((p) => p.points)).toEqual(
        golden.expected.players.map((p) => p.points),
      );
    });

    it('scores perfectly against itself', () => {
      const score = scoreExtraction(golden.expected, golden.expected);
      expect(score.mismatches).toEqual([]);
      expect(score.spurious).toEqual({ plays: 0, players: 0 });
    });

    // Misreads a model plausibly makes, applied to every basket of a real
    // sheet. The notation is assumed read correctly, so these measure what
    // the running-score checks catch on their own.
    it('flags every scorer read as a number nobody on that side wears', () => {
      const silent = golden.expected.scoringPlays.filter((_, i) => {
        const scoringPlays = golden.expected.scoringPlays.map((p, j) =>
          j === i ? { ...p, jerseyNumber: 99 } : p,
        );
        return postProcessScoresheet({ ...golden.expected, scoringPlays }).consistent;
      });
      expect(silent).toEqual([]);
    });

    it('flags every missed line, except one followed by a period\u2019s closing basket', () => {
      // There the notation disagreement only warns (e-Marque's own period-end
      // symbol disagrees on correct sheets), so that one case stays silent.
      const closing = periodClosingTotals(golden.expected);
      golden.expected.scoringPlays.forEach((play, i) => {
        const scoringPlays = golden.expected.scoringPlays.filter((_, j) => j !== i);
        const { consistent } = postProcessScoresheet({ ...golden.expected, scoringPlays });
        const next = scoringPlays
          .filter((p) => p.team === play.team && p.runningScore! > play.runningScore!)
          .sort((a, b) => a.runningScore! - b.runningScore!)[0];
        const expectSilent =
          next !== undefined &&
          closing[play.team].has(next.runningScore!) &&
          next.runningScore! - (play.runningScore! - play.points!) <= 3;
        expect({ play, consistent }).toEqual({ play, consistent: expectSilent });
      });
    });

    it('carries no names, only what the eval grades', () => {
      expect(golden.expected.players.every((p) => p.name === null)).toBe(true);
    });
  });
});
