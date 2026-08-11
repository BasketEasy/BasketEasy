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

export interface ListEventsParams extends PaginationParams {
  /** ISO 8601 date/datetime — filters startsAt >= from. */
  from?: string;
  /** ISO 8601 date/datetime — filters startsAt <= to. */
  to?: string;
  sortOrder?: SortOrder;
}
