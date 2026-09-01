import type { EventScoresheetStatus } from './events';

/** One quarter's score. */
export interface ScoresheetQuarterScore {
  home: number | null;
  away: number | null;
}

/** One player's row as read off the scoresheet. */
export interface ScoresheetPlayerStats {
  number: number | null;
  name: string | null;
  points: number | null;
  fouls: number | null;
}

/**
 * The structured box score read off a scoresheet photo/PDF. Fields are
 * nullable/loose since photo legibility varies — validation checks internal
 * consistency (e.g. quarter scores summing to the total) rather than
 * rejecting partial data; an inconsistency flips the owning
 * EventScoresheet's status to NEEDS_REVIEW instead of failing the job.
 */
export interface ParsedScoresheetData {
  homeScore: number | null;
  awayScore: number | null;
  quarterScores: ScoresheetQuarterScore[];
  players: ScoresheetPlayerStats[];
}

/** The LLM's read of one EventScoresheet, via GET .../scoresheet-extraction. */
export interface ScoresheetExtraction {
  status: EventScoresheetStatus;
  parsedData: ParsedScoresheetData | null;
  confidence: number | null;
  /** Null unless status is FAILED. */
  failureReason: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
}

/**
 * Confirms the extracted data as ground truth, via
 * PATCH .../scoresheet-extraction/confirm. `corrections`, when present,
 * overwrites parsedData before marking the extraction CONFIRMED.
 */
export interface ConfirmScoresheetExtractionRequest {
  corrections?: ParsedScoresheetData;
}
