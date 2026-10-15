import type { EventScoresheetStatus } from './events';

/** One quarter's score. */
export interface ScoresheetQuarterScore {
  home: number | null;
  away: number | null;
}

/**
 * Which of the two teams on the sheet a row belongs to. The FFBB sheet's
 * "Équipe A" is the receiving (home) team, "Équipe B" the visiting (away)
 * one — the same pairing homeScore/awayScore already use.
 */
export type ScoresheetTeamSide = 'home' | 'away';

/** One player's row as read off the scoresheet. */
export interface ScoresheetPlayerStats {
  team: ScoresheetTeamSide | null;
  number: number | null;
  name: string | null;
  points: number | null;
  fouls: number | null;
}

/**
 * One basket, read off the running-score column ("marque courante") on the
 * right-hand side of the sheet — the only place points are recorded. Each
 * pre-printed box is a cumulative team total; the marker strikes the total
 * reached and writes the scorer's jersey number beside it, the notation
 * around that number carrying how many points it was worth (see
 * `ScoresheetPlayerStats.points`, derived from these).
 */
export interface ScoresheetScoringPlay {
  team: ScoresheetTeamSide;
  /** The jersey number written next to the box, not the box's own number. */
  jerseyNumber: number | null;
  /**
   * 1 (free throw), 2 or 3. When the side's running scores were all read,
   * this is the gap from the previous marked total (the box numbers are
   * pre-printed, so they are the reliable part of the column); otherwise
   * it is the marker's notation as read.
   */
  points: number | null;
  /** The pre-printed cumulative total the marked box carries. */
  runningScore: number | null;
  /**
   * The notation as read (circled 3, plain 2, dotted 1), kept only when it
   * disagrees with `points`, so the disagreement can be shown for review.
   */
  notationPoints?: number | null;
}

/**
 * Why a read needs a person's eye. `error` flips the sheet to NEEDS_REVIEW;
 * `warning` is shown but doesn't: the case it covers happens on correct
 * sheets too (see docs/decisions/scoresheets-and-stats.md).
 */
export type ScoresheetIssueCode =
  /** The side's quarters don't add up to its final score. */
  | 'QUARTERS_DONT_SUM'
  /** The side's last marked total isn't its final score. */
  | 'FINAL_SCORE_NOT_REACHED'
  /** Running totals unread, and the plays' notation doesn't add up to the final score. */
  | 'PLAYS_DONT_SUM'
  /** A marked total is not above the previous one. */
  | 'RUNNING_SCORE_NOT_INCREASING'
  /** A basket worth more than 3 (a missed line) or a notation outside 1–3. */
  | 'IMPOSSIBLE_PLAY'
  /** A quarter's closing total is never marked: a line around it was missed. */
  | 'PERIOD_END_NOT_MARKED'
  /** A basket whose scorer's number wasn't read. */
  | 'UNREAD_SCORER'
  /** A scorer's number nobody on that side's roster wears. */
  | 'SCORER_NOT_ON_ROSTER'
  /** The notation says another value than the gap between totals. */
  | 'NOTATION_DISAGREES'
  /** More fouls than the sheet's five cells hold. */
  | 'TOO_MANY_FOULS';

export interface ScoresheetValidationIssue {
  code: ScoresheetIssueCode;
  severity: 'error' | 'warning';
  side: ScoresheetTeamSide;
  /** The marked total the issue is about, when it is about one basket. */
  runningScore: number | null;
  jerseyNumber: number | null;
  /** 1-based, when it is about one period. */
  period: number | null;
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
  /**
   * Every basket read off the running-score column, in sheet order. The
   * source of truth for `ScoresheetPlayerStats.points`, which the OCR
   * worker derives from these rather than trusting a per-player total the
   * model invented — the left-hand roster block carries no points at all.
   */
  scoringPlays: ScoresheetScoringPlay[];
}

/**
 * The server's proposal for one jersey number on our side of the sheet,
 * matched against the roster by the handwritten name the sheet carries.
 * `teamPlayerId` is null when the name was illegible, absent, or matched
 * more than one roster member — a suggestion never resolves an ambiguity
 * silently, it hands it to the manager. Nothing here is persisted until a
 * confirm sends it back as `rosterMapping`.
 */
export interface SuggestedRosterMappingEntry {
  jerseyNumber: number;
  teamPlayerId: string | null;
  /** The name as read off the sheet, shown next to the suggestion. */
  sheetName: string | null;
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
  /**
   * One entry per jersey number found on our own side of the sheet, in sheet
   * order. Empty when there is no parsed data yet.
   */
  suggestedRosterMapping: SuggestedRosterMappingEntry[];
  /**
   * What the validator found in `parsedData`, recomputed on every read so a
   * validator change applies to sheets already stored. Empty without data.
   */
  issues: ScoresheetValidationIssue[];
}

/**
 * One jersey number on our own side of the sheet, tied to the roster member
 * who wore it in this match. Clubs share jersey sets between teams, so the
 * pairing is per match rather than a number stored on the player.
 */
export interface ScoresheetRosterMappingEntry {
  jerseyNumber: number;
  teamPlayerId: string;
}

/**
 * Confirms the extracted data as ground truth, via
 * PATCH .../scoresheet-extraction/confirm. `corrections`, when present,
 * overwrites parsedData before marking the extraction CONFIRMED.
 *
 * `rosterMapping` says who each of our own jersey numbers is, and is what
 * turns a read of a piece of paper into per-player season stats — confirming
 * is the one moment a person is looking at both the sheet and the roster.
 * A jersey number left out of the mapping is legal (a licensed guest who
 * isn't in the app): its points simply reach no player's total. An empty
 * array is legal too, and clears the match's stats — the escape hatch for a
 * sheet whose own-side column was unreadable.
 */
export interface ConfirmScoresheetExtractionRequest {
  corrections?: ParsedScoresheetData;
  rosterMapping: ScoresheetRosterMappingEntry[];
}
