import type {
  ParsedScoresheetData,
  ScoresheetTeamSide,
} from '@basketeasy/types/scoresheet-extraction';

/**
 * Field-level grading of one scoresheet read against its ground truth, for
 * the eval harness (test/scoresheet-eval). Each category answers a question a
 * club would ask of the read, so a prompt or model change can be judged on
 * what it actually moved rather than on one blended number:
 *
 * - `score`: final score and every quarter, the numbers a result is built on;
 * - `playFound`/`playJersey`/`playPoints`: the running-score column, matched
 *   on (side, running score) because that pre-printed number is the one thing
 *   a read can't shift — a missed line shows up as not found, not as every
 *   later line being off by one;
 * - `playerFound`/`playerPoints`/`playerFouls`: the roster block, matched on
 *   (side, jersey number), with points as derived by postProcessScoresheet;
 * - `playerName`: graded only where the ground truth carries a name, since the
 *   committed goldens are pseudonymised.
 *
 * Plays and players the read invented are counted separately as `spurious`:
 * they don't fit a correct/total ratio, and folding them in would let a read
 * that hallucinates extra lines look as good as one that doesn't.
 */
export type ScoreCategory =
  | 'score'
  | 'playFound'
  | 'playJersey'
  | 'playPoints'
  | 'playerFound'
  | 'playerPoints'
  | 'playerFouls'
  | 'playerName';

export const SCORE_CATEGORIES: readonly ScoreCategory[] = [
  'score',
  'playFound',
  'playJersey',
  'playPoints',
  'playerFound',
  'playerPoints',
  'playerFouls',
  'playerName',
];

export interface FieldTally {
  correct: number;
  total: number;
}

export interface ScoreMismatch {
  category: ScoreCategory;
  /** Human-readable locator, e.g. `away play @42` or `home #7`. */
  field: string;
  expected: unknown;
  actual: unknown;
}

export interface ExtractionScore {
  categories: Record<ScoreCategory, FieldTally>;
  spurious: { plays: number; players: number };
  mismatches: ScoreMismatch[];
}

function emptyCategories(): Record<ScoreCategory, FieldTally> {
  return Object.fromEntries(SCORE_CATEGORIES.map((c) => [c, { correct: 0, total: 0 }])) as Record<
    ScoreCategory,
    FieldTally
  >;
}

// Names are compared the way a manager would read them, not byte for byte:
// « Pinçon O. » and « PINCON O » are the same read.
function normaliseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toUpperCase();
}

export function scoreExtraction(
  expected: ParsedScoresheetData,
  actual: ParsedScoresheetData,
): ExtractionScore {
  const categories = emptyCategories();
  const mismatches: ScoreMismatch[] = [];
  const grade = (category: ScoreCategory, field: string, want: unknown, got: unknown): void => {
    categories[category].total += 1;
    if (want === got) {
      categories[category].correct += 1;
    } else {
      mismatches.push({ category, field, expected: want, actual: got });
    }
  };

  grade('score', 'home final', expected.homeScore, actual.homeScore);
  grade('score', 'away final', expected.awayScore, actual.awayScore);
  // Over the longer of the two lists, so a missing overtime and an invented
  // fifth quarter both cost a field.
  const periods = Math.max(expected.quarterScores.length, actual.quarterScores.length);
  for (let i = 0; i < periods; i += 1) {
    for (const side of ['home', 'away'] as const) {
      grade(
        'score',
        `${side} period ${i + 1}`,
        expected.quarterScores[i]?.[side] ?? null,
        actual.quarterScores[i]?.[side] ?? null,
      );
    }
  }

  const playKey = (team: ScoresheetTeamSide, runningScore: number | null): string =>
    `${team}@${runningScore}`;
  const actualPlays = new Map(actual.scoringPlays.map((p) => [playKey(p.team, p.runningScore), p]));
  const matchedPlays = new Set<string>();
  for (const play of expected.scoringPlays) {
    const key = playKey(play.team, play.runningScore);
    const label = `${play.team} play @${play.runningScore}`;
    const found = actualPlays.get(key);
    grade('playFound', label, true, found !== undefined);
    // A missed line also misses its jersey and its points: counting them as
    // wrong keeps those two ratios honest about what a manager has to type.
    grade('playJersey', label, play.jerseyNumber, found?.jerseyNumber ?? null);
    grade('playPoints', label, play.points, found?.points ?? null);
    if (found) {
      matchedPlays.add(key);
    }
  }

  const playerKey = (team: ScoresheetTeamSide | null, number: number | null): string =>
    `${team}#${number}`;
  const actualPlayers = new Map(actual.players.map((p) => [playerKey(p.team, p.number), p]));
  const matchedPlayers = new Set<string>();
  for (const player of expected.players) {
    const key = playerKey(player.team, player.number);
    const label = `${player.team} #${player.number}`;
    const found = actualPlayers.get(key);
    grade('playerFound', label, true, found !== undefined);
    grade('playerPoints', label, player.points, found?.points ?? null);
    grade('playerFouls', label, player.fouls, found?.fouls ?? null);
    if (player.name !== null) {
      grade(
        'playerName',
        label,
        normaliseName(player.name),
        found?.name ? normaliseName(found.name) : null,
      );
    }
    if (found) {
      matchedPlayers.add(key);
    }
  }

  return {
    categories,
    spurious: {
      plays: [...actualPlays.keys()].filter((k) => !matchedPlays.has(k)).length,
      players: [...actualPlayers.keys()].filter((k) => !matchedPlayers.has(k)).length,
    },
    mismatches,
  };
}

/** Sums several reads' tallies, for a whole-set figure per category. */
export function sumScores(scores: readonly ExtractionScore[]): ExtractionScore {
  const categories = emptyCategories();
  const spurious = { plays: 0, players: 0 };
  for (const score of scores) {
    for (const category of SCORE_CATEGORIES) {
      categories[category].correct += score.categories[category].correct;
      categories[category].total += score.categories[category].total;
    }
    spurious.plays += score.spurious.plays;
    spurious.players += score.spurious.players;
  }
  return { categories, spurious, mismatches: scores.flatMap((s) => s.mismatches) };
}
