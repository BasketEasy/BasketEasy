import type {
  ParsedScoresheetData,
  ScoresheetPlayerStats,
  ScoresheetTeamSide,
} from '@basketeasy/types/scoresheet-extraction';

// What the OCR worker does to a vision read before storing it: derive the
// per-player points from the running score, then grade the result. Kept out
// of the processor so the eval harness (test/scoresheet-eval) measures
// exactly what a club would see, not the raw model reply.
// A jersey number is only unique within a team — both squads can field a
// number 7 — so every join between the roster block and the running-score
// column keys on the pair.
function playerKey(team: ScoresheetTeamSide, jerseyNumber: number): string {
  return `${team}:${jerseyNumber}`;
}

// Points appear nowhere on the roster half of the sheet: they exist only as
// marks in the running-score column, one per basket. So a player's total is
// the sum of their own plays there (the model is told to leave `points`
// null), which is also what makes the 1/2/3-point notation worth reading —
// see docs/decisions/scoresheets-and-stats.md.
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

// Only 1 (free throw), 2 and 3 are scorable; anything else means the
// notation around a jersey number was misread.
const VALID_PLAY_POINTS = [1, 2, 3];

// Checks internal consistency rather than rejecting partial data — a
// scoresheet photo with a fully illegible section still has a usable
// partial read, it just needs a human to fill the gaps (NEEDS_REVIEW) rather
// than being thrown away.
function isConsistent(data: ParsedScoresheetData): boolean {
  const quartersSum = (side: 'home' | 'away'): number | null => {
    if (data.quarterScores.length === 0 || data.quarterScores.some((q) => q[side] == null)) {
      return null;
    }
    return data.quarterScores.reduce((sum, q) => sum + (q[side] ?? 0), 0);
  };

  const homeSum = quartersSum('home');
  if (homeSum !== null && data.homeScore !== null && homeSum !== data.homeScore) {
    return false;
  }
  const awaySum = quartersSum('away');
  if (awaySum !== null && data.awayScore !== null && awaySum !== data.awayScore) {
    return false;
  }

  if (data.scoringPlays.some((p) => p.points !== null && !VALID_PLAY_POINTS.includes(p.points))) {
    return false;
  }
  // Every basket a team scored is one line in its running-score column, so
  // the column has to add up to that team's final score — the check that
  // actually catches a skipped or invented line. Skipped for a team whose
  // column was read only partially (any null points), which is a gap to
  // fill by hand, not a contradiction.
  const playsSum = (side: ScoresheetTeamSide): number | null => {
    const plays = data.scoringPlays.filter((p) => p.team === side);
    if (plays.length === 0 || plays.some((p) => p.points === null)) {
      return null;
    }
    return plays.reduce((sum, p) => sum + (p.points ?? 0), 0);
  };

  const homePlays = playsSum('home');
  if (homePlays !== null && data.homeScore !== null && homePlays !== data.homeScore) {
    return false;
  }
  const awayPlays = playsSum('away');
  if (awayPlays !== null && data.awayScore !== null && awayPlays !== data.awayScore) {
    return false;
  }
  return true;
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
}

export function postProcessScoresheet(visionData: ParsedScoresheetData): ProcessedScoresheet {
  const parsedData: ParsedScoresheetData = {
    ...visionData,
    players: derivePlayerPoints(visionData),
  };
  return {
    parsedData,
    confidence: computeConfidence(parsedData),
    consistent: isConsistent(parsedData),
  };
}
