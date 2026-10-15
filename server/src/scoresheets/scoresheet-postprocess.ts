import type {
  ParsedScoresheetData,
  ScoresheetIssueCode,
  ScoresheetPlayerStats,
  ScoresheetScoringPlay,
  ScoresheetTeamSide,
  ScoresheetValidationIssue,
} from '@basketeasy/types/scoresheet-extraction';

// What the OCR worker does to a vision read before storing it: take each
// basket's points from the running-score gaps, derive the per-player points,
// then validate the result. Kept out of the processor so the eval harness
// (test/scoresheet-eval) measures exactly what a club would see, not the raw
// model reply. Rules and the evidence behind them:
// docs/decisions/scoresheets-and-stats.md.

const SIDES: readonly ScoresheetTeamSide[] = ['home', 'away'];

// Only 1 (free throw), 2 and 3 are scorable.
const VALID_PLAY_POINTS = [1, 2, 3];

// The roster block has five foul cells per player.
const MAX_FOULS = 5;

// A jersey number is only unique within a team — both squads can field a
// number 7 — so every join between the roster block and the running-score
// column keys on the pair.
function playerKey(team: ScoresheetTeamSide, jerseyNumber: number): string {
  return `${team}:${jerseyNumber}`;
}

function playsOf(data: ParsedScoresheetData, side: ScoresheetTeamSide): ScoresheetScoringPlay[] {
  return data.scoringPlays.filter((p) => p.team === side);
}

function finalScoreOf(data: ParsedScoresheetData, side: ScoresheetTeamSide): number | null {
  return side === 'home' ? data.homeScore : data.awayScore;
}

// A side's column is "fully numbered" when every play carries its box number:
// only then are the gaps between boxes the plays' values.
function isFullyNumbered(plays: ScoresheetScoringPlay[]): boolean {
  return plays.length > 0 && plays.every((p) => p.runningScore !== null);
}

/**
 * Each basket's points are the gap from the previous marked total. The box
 * numbers are pre-printed 1…120, so reading which box was struck is far more
 * reliable than reading the notation around a handwritten number (a circle, a
 * dot), and the gaps add up to the final score by construction. The notation
 * read is kept as `notationPoints` only when it disagrees, for the validator
 * to report. A gap outside 1–3 is left alone (the notation stays): it means
 * a line was missed or a box misread, which validation reports.
 */
function applyRunningScoreGaps(plays: ScoresheetScoringPlay[]): ScoresheetScoringPlay[] {
  const gaps = new Map<ScoresheetScoringPlay, number>();
  for (const side of SIDES) {
    const sidePlays = plays.filter((p) => p.team === side);
    if (!isFullyNumbered(sidePlays)) {
      continue;
    }
    let previous = 0;
    for (const play of [...sidePlays].sort((a, b) => a.runningScore! - b.runningScore!)) {
      gaps.set(play, play.runningScore! - previous);
      previous = play.runningScore!;
    }
  }
  // Sheet order is kept: only the values change.
  return plays.map((play) => {
    const gap = gaps.get(play);
    if (gap === undefined || !VALID_PLAY_POINTS.includes(gap)) {
      return play;
    }
    const { team, jerseyNumber, runningScore } = play;
    return play.points === null || play.points === gap
      ? { team, jerseyNumber, points: gap, runningScore }
      : { team, jerseyNumber, points: gap, runningScore, notationPoints: play.points };
  });
}

// Points appear nowhere on the roster half of the sheet: they exist only as
// marks in the running-score column, one per basket. So a player's total is
// the sum of their own plays there (the model is told to leave `points`
// null).
function derivePlayerPoints(data: ParsedScoresheetData): ScoresheetPlayerStats[] {
  const totals = new Map<string, number>();
  const teamsWithPlays = new Set<ScoresheetTeamSide>();
  for (const play of data.scoringPlays) {
    if (play.jerseyNumber === null || play.points === null) {
      continue;
    }
    teamsWithPlays.add(play.team);
    const key = playerKey(play.team, play.jerseyNumber);
    totals.set(key, (totals.get(key) ?? 0) + play.points);
  }

  return data.players.map((player) => {
    if (player.team === null || player.number === null) {
      return player;
    }
    const derived = totals.get(playerKey(player.team, player.number));
    if (derived !== undefined) {
      return { ...player, points: derived };
    }
    // No play matched this player. That means 0 points once their team's
    // column was legible at all, but stays null when it wasn't — otherwise
    // an unreadable running score would report a whole squad as having
    // scored nothing instead of as unknown.
    return teamsWithPlays.has(player.team) ? { ...player, points: 0 } : player;
  });
}

// The cumulative score at the end of each period, when every quarter of the
// side was read. A period the side didn't score in closes on the previous
// total, which is already checked, so it is skipped.
function periodEndTotals(
  data: ParsedScoresheetData,
  side: ScoresheetTeamSide,
): { period: number; total: number }[] {
  if (data.quarterScores.length === 0 || data.quarterScores.some((q) => q[side] === null)) {
    return [];
  }
  let total = 0;
  const ends: { period: number; total: number }[] = [];
  data.quarterScores.forEach((q, index) => {
    if (q[side]! > 0) {
      total += q[side]!;
      ends.push({ period: index + 1, total });
    }
  });
  return ends;
}

/**
 * Checks a read against the sheet's own redundancy rather than rejecting
 * partial data: a sheet with an illegible section still has a usable partial
 * read, it just needs a person to fill the gaps. Every `error` flips the
 * sheet to NEEDS_REVIEW.
 *
 * One kind of misread stays invisible to every check here: a jersey number
 * read as another number that someone on the same side also wears. It moves
 * points between two teammates and every total still holds.
 */
export function validateScoresheet(data: ParsedScoresheetData): ScoresheetValidationIssue[] {
  const issues: ScoresheetValidationIssue[] = [];
  const report = (
    code: ScoresheetIssueCode,
    side: ScoresheetTeamSide,
    detail: { runningScore?: number | null; jerseyNumber?: number | null; period?: number } = {},
    severity: 'error' | 'warning' = 'error',
  ): void => {
    issues.push({
      code,
      severity,
      side,
      runningScore: detail.runningScore ?? null,
      jerseyNumber: detail.jerseyNumber ?? null,
      period: detail.period ?? null,
    });
  };

  for (const side of SIDES) {
    const finalScore = finalScoreOf(data, side);
    const quarters = data.quarterScores.map((q) => q[side]);
    if (finalScore !== null && quarters.length > 0 && quarters.every((q) => q !== null)) {
      const sum = quarters.reduce<number>((total, q) => total + q!, 0);
      if (sum !== finalScore) {
        report('QUARTERS_DONT_SUM', side);
      }
    }

    const plays = playsOf(data, side);
    const ends = periodEndTotals(data, side);
    const endTotals = new Set(ends.map((e) => e.total));
    if (isFullyNumbered(plays)) {
      const sorted = [...plays].sort((a, b) => a.runningScore! - b.runningScore!);
      let previous = 0;
      for (const play of sorted) {
        const gap = play.runningScore! - previous;
        if (gap <= 0) {
          report('RUNNING_SCORE_NOT_INCREASING', side, play);
        } else if (gap > 3) {
          report('IMPOSSIBLE_PLAY', side, play);
        }
        previous = play.runningScore!;
        if (
          play.notationPoints !== undefined &&
          play.notationPoints !== null &&
          play.notationPoints !== play.points
        ) {
          // e-Marque marks the closing basket of a period with its own
          // symbol, and on real sheets that symbol disagrees with the gap
          // even when the read is right, so it only warns there.
          report(
            'NOTATION_DISAGREES',
            side,
            play,
            endTotals.has(play.runningScore!) ? 'warning' : 'error',
          );
        }
      }
      const last = sorted[sorted.length - 1].runningScore!;
      if (finalScore !== null && last !== finalScore) {
        report('FINAL_SCORE_NOT_REACHED', side, { runningScore: last });
      }
      const marked = new Set(sorted.map((p) => p.runningScore));
      for (const end of ends) {
        if (!marked.has(end.total)) {
          report('PERIOD_END_NOT_MARKED', side, { period: end.period, runningScore: end.total });
        }
      }
    } else if (plays.length > 0) {
      for (const play of plays) {
        if (play.points !== null && !VALID_PLAY_POINTS.includes(play.points)) {
          report('IMPOSSIBLE_PLAY', side, play);
        }
      }
      // Skipped for a column read only partially (any null points), which is
      // a gap to fill by hand, not a contradiction.
      if (finalScore !== null && plays.every((p) => p.points !== null)) {
        const sum = plays.reduce((total, p) => total + p.points!, 0);
        if (sum !== finalScore) {
          report('PLAYS_DONT_SUM', side);
        }
      }
    }

    const roster = new Set(
      data.players.filter((p) => p.team === side && p.number !== null).map((p) => p.number),
    );
    for (const play of plays) {
      if (play.jerseyNumber === null) {
        report('UNREAD_SCORER', side, play);
      } else if (roster.size > 0 && !roster.has(play.jerseyNumber)) {
        report('SCORER_NOT_ON_ROSTER', side, play);
      }
    }

    for (const player of data.players) {
      if (player.team === side && player.fouls !== null && player.fouls > MAX_FOULS) {
        report('TOO_MANY_FOULS', side, { jerseyNumber: player.number });
      }
    }
  }
  return issues;
}

// Heuristic, not a model-reported score (Gemini's structured-output mode
// doesn't return one) — the fraction of leaf fields the model actually
// populated versus left null, as a rough signal of how legible the source
// photo was for a reviewer deciding how much to double-check.
function computeConfidence(data: ParsedScoresheetData): number {
  const values: unknown[] = [
    data.homeScore,
    data.awayScore,
    ...data.quarterScores.flatMap((q) => [q.home, q.away]),
    ...data.players.flatMap((p) => [p.team, p.number, p.name, p.points, p.fouls]),
  ];
  // scoringPlays is deliberately left out: a full game is 40-80 lines of
  // three fields each, which would swamp every other field and turn this
  // into a measure of one column. The column's legibility already reaches
  // the score through the derived player points counted above.
  if (values.length === 0) {
    return 0;
  }
  const populated = values.filter((v) => v !== null && v !== undefined).length;
  return Math.round((populated / values.length) * 100) / 100;
}

export interface ProcessedScoresheet {
  parsedData: ParsedScoresheetData;
  confidence: number;
  /** False flips the sheet to NEEDS_REVIEW instead of PARSED. */
  consistent: boolean;
  issues: ScoresheetValidationIssue[];
}

export function postProcessScoresheet(visionData: ParsedScoresheetData): ProcessedScoresheet {
  const withGaps: ParsedScoresheetData = {
    ...visionData,
    scoringPlays: applyRunningScoreGaps(visionData.scoringPlays),
  };
  const parsedData: ParsedScoresheetData = {
    ...withGaps,
    players: derivePlayerPoints(withGaps),
  };
  const issues = validateScoresheet(parsedData);
  return {
    parsedData,
    confidence: computeConfidence(parsedData),
    consistent: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
}
