import { join } from 'path';
import { loadGoldenScoresheets } from './golden';
import { scoreExtraction } from './score-extraction';
import { postProcessScoresheet } from '../scoresheet-postprocess';

// Real e-Marque sheets, read deterministically and pseudonymised. They pin the
// production post-processing to what actual matches look like: a validator
// change that flags a correct sheet, or a points derivation that drifts from
// the running score, fails here instead of in front of a club.
const GOLDEN_DIR = join(__dirname, '../../../test/scoresheet-eval/golden');
const goldens = loadGoldenScoresheets(GOLDEN_DIR);

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

    it('carries no names, only what the eval grades', () => {
      expect(golden.expected.players.every((p) => p.name === null)).toBe(true);
    });
  });
});
