export interface TeamEvent {
  id: string;
  teamId: string;
  startsAt: string;
  location: string;
  notes: string | null;
  createdAt: string;
}

export type EventRecurrenceFrequency = 'WEEKLY';

export interface EventRecurrenceRequest {
  frequency: EventRecurrenceFrequency;
  /** Last date a recurring occurrence may fall on (inclusive), ISO 8601. */
  until: string;
}

export interface CreateEventRequest {
  startsAt: string;
  location: string;
  notes?: string;
  /** When set, creates one event per week from startsAt through until, inclusive. */
  recurrence?: EventRecurrenceRequest;
}

export interface UpdateEventRequest {
  startsAt?: string;
  location?: string;
  notes?: string;
}
