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
  /** 1 (free throw), 2 or 3, per the marker's notation. */
  points: number | null;
  /** The pre-printed cumulative total the marked box carries. */
  runningScore: number | null;
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
