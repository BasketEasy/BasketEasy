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
  /** Jersey/ball assignment for a MATCH event; null for TRAINING. */
  logistics: {
    jerseys: EventLogisticsAssignee | null;
    balls: EventLogisticsAssignee | null;
  } | null;
}

export type EventLogisticsField = 'JERSEYS' | 'BALLS';

/** The roster member currently assigned to bring the jerseys or the balls to a MATCH event. */
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
