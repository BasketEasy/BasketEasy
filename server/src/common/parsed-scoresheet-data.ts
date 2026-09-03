import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';

/**
 * An extraction row exists even when the OCR job gave up: `ScoresheetOcrProcessor`'s
 * 'failed' listener writes `parsedData: {}` (the column is non-nullable, so there
 * is no null to write), and a truncated model reply can drop one of the arrays on
 * its own. Neither is a sheet, so anything not carrying the three arrays reads as
 * "nothing was extracted" rather than being indexed into.
 *
 * Shared between `ScoresheetsService` (the extraction read/confirm flow) and
 * `deriveMatchResult` (`./match-result`, the events/dashboard result
 * projection) — both need to tell a real parsed sheet apart from an empty or
 * partial one before trusting its fields.
 */
export function asParsedScoresheetData(value: unknown): ParsedScoresheetData | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ParsedScoresheetData>;
  if (
    !Array.isArray(candidate.players) ||
    !Array.isArray(candidate.scoringPlays) ||
    !Array.isArray(candidate.quarterScores)
  ) {
    return null;
  }
  return candidate as ParsedScoresheetData;
}
