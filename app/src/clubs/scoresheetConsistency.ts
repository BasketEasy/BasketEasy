import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';

export interface QuarterMismatch {
  side: 'home' | 'away';
  sum: number;
  total: number;
}

/**
 * Mirrors the backend's isConsistent heuristic (scoresheet-ocr.processor.ts)
 * client-side: flags a side whose quarter scores are all populated but don't
 * sum to the recorded total. A side with any null quarter is a missing-field
 * case (see findMissingQuarterFields below), not a mismatch — the backend
 * heuristic only fires when every value needed for the sum is present.
 */
export function findQuarterMismatches(data: ParsedScoresheetData): QuarterMismatch[] {
  const mismatches: QuarterMismatch[] = [];

  const sides: Array<'home' | 'away'> = ['home', 'away'];
  for (const side of sides) {
    if (data.quarterScores.length === 0 || data.quarterScores.some((q) => q[side] == null)) {
      continue;
    }
    const sum = data.quarterScores.reduce((total, q) => total + (q[side] ?? 0), 0);
    const total = side === 'home' ? data.homeScore : data.awayScore;
    if (total !== null && sum !== total) {
      mismatches.push({ side, sum, total });
    }
  }

  return mismatches;
}

export interface MissingPlayerField {
  playerIndex: number;
  field: 'number' | 'name' | 'points' | 'fouls';
}

/**
 * Flags player rows missing points or fouls (the two numeric columns the UI
 * renders and asks a manager to fill in before confirming) — a null value
 * genuinely means "the model couldn't read this," independent of the
 * quarter-sum consistency check above.
 */
export function findMissingPlayerFields(data: ParsedScoresheetData): MissingPlayerField[] {
  const missing: MissingPlayerField[] = [];

  data.players.forEach((player, playerIndex) => {
    if (player.points === null) {
      missing.push({ playerIndex, field: 'points' });
    }
    if (player.fouls === null) {
      missing.push({ playerIndex, field: 'fouls' });
    }
  });

  return missing;
}
