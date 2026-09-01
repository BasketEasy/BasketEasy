import type { PaginationParams, SortOrder } from './pagination';
import type { TeamMemberRole } from './teams';

export type EventType = 'TRAINING' | 'MATCH';

/** Home/away for a MATCH event; not applicable to TRAINING. */
export type EventVenue = 'HOME' | 'AWAY';

/** A rostered team member's self-reported attendance status for one event. */
export type EventRsvpStatus = 'GOING' | 'NOT_GOING' | 'MAYBE';

/**
 * Scopes a PATCH/DELETE to one occurrence of a recurring series ('THIS',
 * the default), that occurrence and its later siblings ('THIS_AND_FUTURE'),
 * or every occurrence sharing the same recurrenceId ('ALL').
 */
export type EventUpdateScope = 'THIS' | 'THIS_AND_FUTURE' | 'ALL';

export interface TeamEvent {
  id: string;
  teamId: string;
  type: EventType;
  startsAt: string;
  location: string;
  notes: string | null;
  /** Opponent's name for a MATCH event; null for TRAINING. */
  opponentName: string | null;
  /** Home/away for a MATCH event; null for TRAINING. */
  venue: EventVenue | null;
  /** Shared by every occurrence created in the same recurring POST; null for a single event. */
  recurrenceId: string | null;
  createdAt: string;
  /** The caller's own RSVP status for this event; null if unset or not rostered on the team. */
  myRsvpStatus: EventRsvpStatus | null;
  /** Whether the caller is called up (convoked) for this event; false if unset or not rostered. */
  myConvocation: boolean;
  /** True for an event created by the FFBB calendar import, false for a manually-created one. */
  isImported: boolean;
  /** False when FFBB's kickoff time was still its "not yet confirmed" placeholder; always true for a manual event. */
  timeConfirmed: boolean;
  /**
   * Jersey/ball equipment assignment — populated for both event types.
   * `jerseys` holds the match-jersey assignee for a MATCH event or the
   * scrimmage-bib ("Chasubles") assignee for a TRAINING event; `balls` is
   * the same slot/copy for both. Either field is null when unassigned.
   */
  logistics: {
    jerseys: EventLogisticsAssignee | null;
    balls: EventLogisticsAssignee | null;
  };
}

export type EventLogisticsField = 'JERSEYS' | 'BALLS';

/** The roster member currently assigned to bring the jerseys/bibs or the balls to an event. */
export interface EventLogisticsAssignee {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
}

export interface SetEventLogisticsRequest {
  field: EventLogisticsField;
  /** Null clears the assignment. */
  teamPlayerId: string | null;
}

export type EventRecurrenceFrequency = 'WEEKLY';

export interface EventRecurrenceRequest {
  frequency: EventRecurrenceFrequency;
  /** Last date a recurring occurrence may fall on (inclusive), ISO 8601. */
  until: string;
}

export interface CreateEventRequest {
  type: EventType;
  startsAt: string;
  location: string;
  notes?: string;
  /** Required when type is MATCH. */
  opponentName?: string;
  /** Required when type is MATCH; validated server-side, see EventsService. */
  venue?: EventVenue;
  /** When set, creates one event per week from startsAt through until, inclusive. */
  recurrence?: EventRecurrenceRequest;
}

export interface UpdateEventRequest {
  type?: EventType;
  startsAt?: string;
  location?: string;
  notes?: string;
  opponentName?: string;
  /** Required when the resulting type is MATCH; validated server-side, see EventsService. */
  venue?: EventVenue;
  /** Defaults to 'THIS'. startsAt may only be changed with scope 'THIS'. */
  scope?: EventUpdateScope;
}

/**
 * Bulk-changes the time-of-day (not the date) of every occurrence in scope,
 * via PATCH .../events/:eventId/time — the narrower, date-preserving
 * counterpart to the still-unsupported "shift a whole series to a new date"
 * operation. `hour`/`minute` are UTC (0-23 / 0-59): the caller resolves the
 * desired local wall-clock time against the anchor event's own date before
 * sending, and the server applies that same UTC hour/minute to every row's
 * existing date.
 */
export interface UpdateEventTimeOfDayRequest {
  scope: Extract<EventUpdateScope, 'THIS_AND_FUTURE' | 'ALL'>;
  hour: number;
  minute: number;
}

export interface ListEventsParams extends PaginationParams {
  /** ISO 8601 date/datetime — filters startsAt >= from. */
  from?: string;
  /** ISO 8601 date/datetime — filters startsAt <= to. */
  to?: string;
  sortOrder?: SortOrder;
}

export interface SetEventRsvpRequest {
  status: EventRsvpStatus;
}

/** One roster member's RSVP status for a single event, via GET .../events/:eventId/rsvps. */
export interface EventRsvpRosterEntry {
  teamPlayerId: string;
  playerId: string;
  firstName: string;
  lastName: string;
  role: TeamMemberRole;
  /** Null when this roster member hasn't responded yet. */
  status: EventRsvpStatus | null;
  respondedAt: string | null;
  /** True when this roster row belongs to the requesting user. */
  isMe: boolean;
}

export interface SetEventConvocationsRequest {
  /** Full replacement list of convoked TeamPlayer ids; empty array clears the call-up list. */
  teamPlayerIds: string[];
}

/** One roster member's call-up status for a single event, via GET/PATCH .../events/:eventId/convocations. */
export interface EventConvocationRosterEntry {
  teamPlayerId: string;
  playerId: string;
  firstName: string;
  lastName: string;
  role: TeamMemberRole;
  convoked: boolean;
  /** Null when not convoked. */
  convokedAt: string | null;
  /** True when this roster row belongs to the requesting user. */
  isMe: boolean;
}

/** "Best player" or "joueur en difficulté" ("worst", softer framing) — see EventVote in the server schema. */
export type EventVoteCategory = 'BEST' | 'WORST';

export interface CastEventVoteRequest {
  category: EventVoteCategory;
  teamPlayerId: string;
}

/** One candidate's aggregated vote count within a category's results. */
export interface EventVoteCandidateResult {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
  voteCount: number;
}

/**
 * Both categories' aggregated results, visible to the whole team — but only
 * once the caller has cast their own BEST vote ("vote to see results"): the
 * server returns `best`/`worst` as empty arrays until then, even though
 * `totalVoters`/`votesCast` stay populated so the UI can still show "N votes
 * exprimés" alongside a "vote first" prompt. Never carries who voted for
 * whom, only counts. `myVote` reflects the caller's own two rows (null per
 * category if they haven't voted yet).
 */
export interface EventVoteResults {
  best: EventVoteCandidateResult[];
  worst: EventVoteCandidateResult[];
  /** Roster size eligible to vote, for "N votes sur M". */
  totalVoters: number;
  /** Count of distinct voters who've cast at least one vote (either category). */
  votesCast: number;
  myVote: {
    best: string | null;
    worst: string | null;
  };
}

/**
 * QUEUED/PROCESSING track the async OCR job; PARSED means the LLM returned
 * internally-consistent data; NEEDS_REVIEW means it returned data but
 * validation flagged an inconsistency; CONFIRMED means a manager approved
 * it; FAILED means the job exhausted its retries. See
 * `./scoresheet-extraction` for the parsed data itself. An upload-transport
 * failure is client-side-only and never reaches this type; nothing is
 * persisted until the direct-to-R2 upload actually succeeds.
 */
export type EventScoresheetStatus =
  'UPLOADED' | 'QUEUED' | 'PROCESSING' | 'PARSED' | 'NEEDS_REVIEW' | 'CONFIRMED' | 'FAILED';

export interface EventScoresheetUploadUrlRequest {
  contentType: string;
}

export interface EventScoresheetUploadUrlResponse {
  uploadUrl: string;
  /** Provider-agnostic object key — named storageKey (not r2Key) so it stays meaningful if the backing object store ever changes. */
  storageKey: string;
}

export interface ConfirmEventScoresheetRequest {
  storageKey: string;
}

/** The file itself is never exposed here — only capture status, not display, is in scope. */
export interface EventScoresheet {
  status: EventScoresheetStatus;
  uploadedByTeamPlayerId: string;
  uploadedAt: string;
}
