// The team's shared « réponse sans compte » link — see
// docs/decisions/guest-rsvp-and-whatsapp.md. Public
// payloads carry first name + last initial only, never a player or user id.
import type { EventRsvpRespondent, EventRsvpStatus, EventType, EventVenue } from './events';
import type { EventMeetingPlan, EventTravelMode } from './meeting-points';
import type { TeamMemberRole } from './teams';

/** The guest page lists, and accepts answers for, events starting within this many days. */
export const GUEST_WINDOW_DAYS = 14;

/** `code` of the 409 answered for an event outside the window or already started. */
export const GUEST_RSVP_CLOSED_CODE = 'GUEST_RSVP_CLOSED';

export type EventRsvpSource = 'APP' | 'GUEST_LINK';

/** Manager view: null when the link is off. */
export type TeamGuestLinkInfo = { url: string } | null;

export interface GuestRosterMember {
  teamPlayerId: string;
  firstName: string;
  /** Null when the player has no last name on file. */
  lastInitial: string | null;
  role: TeamMemberRole;
}

export interface GuestAttendanceEntry {
  teamPlayerId: string;
  status: EventRsvpStatus | null;
  /** Non-null only for a GOING answer on a MATCH. */
  travelMode: EventTravelMode | null;
  convoked: boolean;
  viaLink: boolean;
}

export interface GuestEvent {
  id: string;
  type: EventType;
  startsAt: string;
  /** False for an FFBB-imported match whose kick-off hour isn't known yet. */
  timeConfirmed: boolean;
  location: string;
  /** The gym's name; display through `eventVenueLabel`. */
  locationName: string | null;
  opponentName: string | null;
  venue: EventVenue | null;
  notes: string | null;
  /** Null for a TRAINING. */
  meetingPlan: EventMeetingPlan | null;
  /** One entry per roster member. */
  attendance: GuestAttendanceEntry[];
}

export interface GuestTeamPage {
  teamName: string;
  clubName: string;
  roster: GuestRosterMember[];
  events: GuestEvent[];
}

export interface GuestRsvpRequest {
  teamPlayerId: string;
  status: EventRsvpStatus;
  /** Only with GOING on a MATCH. */
  travelMode?: EventTravelMode;
  /** Set by the guest page when the visit came from a WhatsApp-shared link. */
  via?: 'WHATSAPP';
}

export interface GuestInviteRequest {
  teamPlayerId: string;
}

/** One line of the manager's answer history, newest first. */
export interface EventRsvpChangeEntry {
  /** Null when the answer was cleared. */
  status: EventRsvpStatus | null;
  travelMode: EventTravelMode | null;
  source: EventRsvpSource;
  via: 'WHATSAPP' | null;
  /** Null for a guest-link change, or an author whose account is gone. */
  respondedBy: EventRsvpRespondent | null;
  createdAt: string;
}
