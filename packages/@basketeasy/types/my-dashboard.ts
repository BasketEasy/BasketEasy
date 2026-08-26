import type { EventRsvpStatus, EventType } from './events';

/** An upcoming event across every team the caller manages or is rostered on. */
export interface MyAgendaEvent {
  eventId: string;
  teamId: string;
  teamName: string;
  clubId: string;
  clubName: string;
  type: EventType;
  startsAt: string;
  location: string;
  notes: string | null;
  /** Opponent's name for a MATCH event; null for TRAINING. */
  opponentName: string | null;
  /** The caller's own RSVP status for this event; null if unset or not rostered on the team. */
  myRsvpStatus: EventRsvpStatus | null;
  /** Whether the caller is called up (convoked) for this event; false if unset or not rostered. */
  myConvocation: boolean;
}

export interface MyDashboardSummary {
  upcomingEvents: MyAgendaEvent[];
  /** Distinct players across the clubs the caller administers. */
  totalPlayers: number;
}

export interface GetDashboardParams {
  /** ISO 8601 date/datetime — defaults to now when omitted. */
  from?: string;
  /** ISO 8601 date/datetime — defaults to from + 7 days when omitted. */
  to?: string;
}
