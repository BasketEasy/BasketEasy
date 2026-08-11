/** An upcoming event across every team the caller manages or is rostered on. */
export interface MyAgendaEvent {
  eventId: string;
  teamId: string;
  teamName: string;
  clubId: string;
  clubName: string;
  startsAt: string;
  location: string;
  notes: string | null;
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
