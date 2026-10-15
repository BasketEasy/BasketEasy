import type {
  EventLogisticsAssignee,
  EventMatchPlayerStats,
  EventMatchResult,
  EventRsvpRespondent,
  EventRsvpStatus,
  EventRsvpSummary,
  EventType,
  EventVenue,
} from './events';
import type { ActingAsParams } from './guardians';
import type { EventMeetingPlan, EventTravelMode } from './meeting-points';

/** One « MVP » winner as the home shows them: « Prénom N. », never a full name. */
export interface MyAgendaVoteWinner {
  firstName: string;
  lastInitial: string;
  /** True when the winner is the persona. */
  isMe: boolean;
}

/**
 * The peer vote on one played match, as the home needs it: what the persona
 * can do and, once public, who won « MVP ». The « joueur en difficulté »
 * category is deliberately absent — it stays on the match page's vote
 * section and never reaches a home, a results list or a notification.
 */
export interface MyAgendaVote {
  /** castVote would accept this persona now: window open, convoked and GOING, not a guardian persona. */
  canVote: boolean;
  /** The persona has a BEST row for this match. */
  hasVoted: boolean;
  /** ISO end of the window (VOTE_CLOSE_DELAY after startsAt). */
  closesAt: string;
  /** Voters so far / eligible roster, the numbers EventVoteResults already exposes. */
  votesCast: number;
  totalVoters: number;
  /**
   * BEST winners (ties → several), « Prénom N. », `isMe` for the reader's own row.
   * null until public for this reader (hasVoted, or window closed); [] when public but nobody voted.
   */
  mvp: MyAgendaVoteWinner[] | null;
}

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
  /** The gym's name; display through `eventVenueLabel`. */
  locationName: string | null;
  notes: string | null;
  /** Opponent's name for a MATCH event; null for TRAINING. */
  opponentName: string | null;
  /** Home/away for a MATCH event; null for TRAINING. Mirrors TeamEvent.venue. */
  venue: EventVenue | null;
  /** Shared by every occurrence created in the same recurring POST; null for a single event. */
  recurrenceId: string | null;
  /** The persona's RSVP status for this event; null if unset or not rostered on the team. */
  myRsvpStatus: EventRsvpStatus | null;
  /** Mirrors TeamEvent.myRsvpRespondedBy. */
  myRsvpRespondedBy: EventRsvpRespondent | null;
  /** Mirrors TeamEvent.myRsvpRespondedAt. */
  myRsvpRespondedAt: string | null;
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
  /** Mirrors TeamEvent.result — see its doc-comment for the null cases. */
  result: EventMatchResult | null;
  /** Mirrors TeamEvent.myMatchStats. */
  myMatchStats: EventMatchPlayerStats | null;
  /** The peer vote; null for a TRAINING and for a match not yet started. */
  vote: MyAgendaVote | null;
  /** Mirrors TeamEvent.meetingPlan (null for a TRAINING), resolved by the same helper. */
  meetingPlan: EventMeetingPlan | null;
  /** Mirrors TeamEvent.myTravelMode: null unless the persona answered GOING to a MATCH. */
  myTravelMode: EventTravelMode | null;
}

/**
 * The four things a manager might need to go do, none of which is otherwise
 * surfaced anywhere in one round trip today — see `DashboardService`'s
 * resolver for the exact, deliberately bounded query behind each kind.
 */
export type ActionItemKind =
  | 'MATCH_WITHOUT_CONVOCATIONS'
  | 'EVENT_PENDING_RSVPS'
  | 'MATCH_WITHOUT_CONFIRMED_SCORESHEET'
  | 'PLAYERS_WITHOUT_ACCOUNT';

/** One row of the manager's « À traiter » band — `docs/personas.md`. */
export interface ActionItem {
  kind: ActionItemKind;
  clubId: string;
  clubName: string;
  /** Null for PLAYERS_WITHOUT_ACCOUNT, which isn't scoped to a team. */
  teamId: string | null;
  teamName: string | null;
  /** Null for PLAYERS_WITHOUT_ACCOUNT, which isn't scoped to an event. */
  eventId: string | null;
  /** Human-readable French sentence, fully formed server-side — the frontend renders it verbatim. */
  message: string;
}

export interface MyDashboardSummary {
  upcomingEvents: MyAgendaEvent[];
  /** Distinct players across the clubs the caller administers. */
  totalPlayers: number;
  /**
   * Capped at a small total across all four kinds (see `DashboardService`) —
   * never an unpaginated list. Empty for a caller with no manage rights.
   */
  actionItems: ActionItem[];
}

export interface GetDashboardParams extends ActingAsParams {
  /** ISO 8601 date/datetime — defaults to now when omitted. */
  from?: string;
  /** ISO 8601 date/datetime — defaults to from + 7 days when omitted. */
  to?: string;
}
