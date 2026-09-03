import type {
  EventLogisticsAssignee,
  EventRsvpStatus,
  EventRsvpSummary,
  EventType,
  EventVenue,
} from './events';

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
  /** Home/away for a MATCH event; null for TRAINING. Mirrors TeamEvent.venue. */
  venue: EventVenue | null;
  /** Shared by every occurrence created in the same recurring POST; null for a single event. */
  recurrenceId: string | null;
  /** The caller's own RSVP status for this event; null if unset or not rostered on the team. */
  myRsvpStatus: EventRsvpStatus | null;
  /** Whether the caller is called up (convoked) for this event; false if unset or not rostered. */
  myConvocation: boolean;
  /** The whole roster's RSVP/convocation breakdown, for list/card contexts — see EventRsvpSummary. */
  rsvpSummary: EventRsvpSummary;
  /** True for an event created by the FFBB calendar import, false for a manually-created one. */
  isImported: boolean;
  /** False when FFBB's kickoff time was still its "not yet confirmed" placeholder; always true for a manual event. */
  timeConfirmed: boolean;
  /** Jersey/ball equipment assignment — mirrors TeamEvent.logistics. */
  logistics: {
    jerseys: EventLogisticsAssignee | null;
    balls: EventLogisticsAssignee | null;
  };
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
