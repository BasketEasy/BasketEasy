import type { PaginationParams, SortOrder } from './pagination';

export type EventType = 'TRAINING' | 'MATCH';

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
  /** Shared by every occurrence created in the same recurring POST; null for a single event. */
  recurrenceId: string | null;
  createdAt: string;
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
  /** When set, creates one event per week from startsAt through until, inclusive. */
  recurrence?: EventRecurrenceRequest;
}

export interface UpdateEventRequest {
  type?: EventType;
  startsAt?: string;
  location?: string;
  notes?: string;
  opponentName?: string;
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
