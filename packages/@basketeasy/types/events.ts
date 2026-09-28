import type { PaginationParams, SortOrder } from './pagination';
import type { TeamMemberRole } from './teams';
import type { ActingAsParams } from './guardians';
import type { EventMeetingPlan, EventTravelMode } from './meeting-points';

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

/**
 * A whole-roster RSVP/convocation aggregate for one event — mirrors
 * `EventRosterCounts` (`app/src/clubs/useEventRoster.ts`) field-for-field so
 * a future consumer can treat them identically, but is resolved server-side
 * for a batch of events without a per-event roster fetch (see
 * `EventsService`/`DashboardService`). `useEventRoster`'s per-member roster
 * (names, avatars) is still the source for the single-event page; this is
 * for list/card contexts that only need the counts.
 */
export interface EventRsvpSummary {
  /** Everyone on the team's roster. */
  rosterSize: number;
  convoked: number;
  /** The people the response counts below are about — see `isConvocationScoped`. */
  answering: number;
  going: number;
  maybe: number;
  notGoing: number;
  pending: number;
  /**
   * True once anyone has been called up: the response counts then describe
   * the convoked group only. Before a call-up exists they describe the
   * whole roster instead.
   */
  isConvocationScoped: boolean;
}

/**
 * A MATCH's final score, derived from the **confirmed** ScoresheetExtraction
 * plus the event's own venue — never from an unconfirmed read, and never
 * invented when a confirmed sheet's score is somehow still null. See
 * `deriveMatchResult` (`server/src/common/match-result.ts`).
 */
export interface EventMatchResult {
  ourScore: number;
  theirScore: number;
  outcome: 'WIN' | 'LOSS' | 'DRAW';
}

/**
 * The caller's own per-match line, folded from `MatchPlayerStat` — see
 * CLAUDE.md's Team stats module for the zero-vs-unknown rule each field
 * already follows (null means unread, never 0).
 */
export interface EventMatchPlayerStats {
  points: number | null;
  fouls: number | null;
}

/**
 * Who gave an RSVP answer: the player or one of their guardians. First name
 * and last initial only (« Sophie M. »), never a relationship label.
 */
export interface EventRsvpRespondent {
  // No account id: every roster reader gets this, and nothing needs more
  // than « is it me » to tell respondents apart.
  firstName: string | null;
  lastInitial: string | null;
  /** The respondent is the caller (not the persona they act for). */
  isMe: boolean;
}

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
  /**
   * The persona's RSVP status for this event (the caller, or the player named
   * by `forPlayerId`); null if unset or not rostered on the team.
   */
  myRsvpStatus: EventRsvpStatus | null;
  /** Who gave `myRsvpStatus`; null when there is no answer or its author is unknown. */
  myRsvpRespondedBy: EventRsvpRespondent | null;
  /** When `myRsvpStatus` was given; null when there is no answer. */
  myRsvpRespondedAt: string | null;
  /** Whether the persona is called up (convoked) for this event; false if unset or not rostered. */
  myConvocation: boolean;
  /** The whole roster's RSVP/convocation breakdown, for list/card contexts — see EventRsvpSummary. */
  rsvpSummary: EventRsvpSummary;
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
  /**
   * Null for TRAINING, for a MATCH with no confirmed scoresheet, or for a
   * confirmed one whose score is somehow still null — never invented. A
   * player must never see an unconfirmed score, so this is only ever
   * populated from a CONFIRMED ScoresheetExtraction.
   */
  result: EventMatchResult | null;
  /** The caller's own line for this match; null under the same conditions as `result`, or when the caller isn't the player mapped on the sheet. */
  myMatchStats: EventMatchPlayerStats | null;
  /** Where and when the group meets before a MATCH; null for TRAINING. */
  meetingPlan: EventMeetingPlan | null;
  /**
   * How the caller gets to this MATCH — null unless they answered GOING. A
   * GOING player who never chose reads MEETING_POINT: not choosing counts as
   * coming to the meeting point.
   */
  myTravelMode: EventTravelMode | null;
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

export interface ListEventsParams extends PaginationParams, ActingAsParams {
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
  /** Who answered; null when nobody has, or the author is unknown. */
  respondedBy: EventRsvpRespondent | null;
  /** The answer was given by someone other than the player themself — one of their guardians. */
  respondedByGuardian: boolean;
  /** Null unless this member answered GOING to a MATCH — same rule as TeamEvent.myTravelMode. */
  travelMode: EventTravelMode | null;
  /** True when this roster row is the persona's (the caller's own, or `forPlayerId`'s). */
  isMe: boolean;
}

export interface SetEventTravelModeRequest {
  travelMode: EventTravelMode;
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
  /** True when this roster row is the persona's (the caller's own, or `forPlayerId`'s). */
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
  /**
   * True when a back-office impersonation is reading this: `myVote` is then
   * nulled, because staff watching the subject's screen must not learn whom
   * they voted for (the vote is anonymous by construction, and the RGPD
   * export withholds the nominee for the same reason). The leaderboards
   * still follow the subject's real vote.
   */
  myVoteHidden: boolean;
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
