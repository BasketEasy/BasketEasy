// Match meeting point (point de rendez-vous) — where and when the group meets
// before a match. See
// docs/superpowers/specs/2026-09-27-match-meeting-point-design.md.

/** A named place with a postal address, e.g. « Parking salle Coubertin ». */
export interface MeetingPoint {
  name: string;
  address: string;
}

/** Which level the resolved meeting point came from — the most specific one set wins. */
export type MeetingPointSource = 'EVENT' | 'TEAM' | 'CLUB';

export type TravelMinutesSource = 'COMPUTED' | 'MANUAL';

export type MeetsAtSource = 'COMPUTED' | 'OVERRIDE';

/** How a GOING player gets to a match. A player who hasn't chosen counts as MEETING_POINT. */
export type EventTravelMode = 'MEETING_POINT' | 'DIRECT';

export const DEFAULT_ARRIVAL_BUFFER_MINUTES = 45;
export const MAX_ARRIVAL_BUFFER_MINUTES = 180;
export const MAX_TRAVEL_MINUTES = 600;
export const MEETING_POINT_NAME_MAX_LENGTH = 80;
export const MEETING_POINT_ADDRESS_MAX_LENGTH = 200;

/**
 * A MATCH's resolved meeting plan — null on `TeamEvent.meetingPlan` for a
 * TRAINING. `arrivalAt` is always known (tip-off minus the buffer), since a
 * player going direct needs it even when no meeting point is configured.
 */
export interface EventMeetingPlan {
  arrivalAt: string;
  arrivalBufferMinutes: number;
  /** Null when no meeting point is configured at any level. */
  meetingPoint: MeetingPoint | null;
  meetingPointSource: MeetingPointSource | null;
  /** Null when unknown, or when it was computed for a route that has since changed. */
  travelMinutes: number | null;
  travelMinutesSource: TravelMinutesSource | null;
  /** Null means « horaire à confirmer »: a place is set but no travel time is known yet. */
  meetsAt: string | null;
  meetsAtSource: MeetsAtSource | null;
}

export interface ClubMeetingSettings {
  meetingPoint: MeetingPoint | null;
  arrivalBufferMinutes: number;
}

export interface UpdateClubMeetingSettingsRequest {
  meetingPoint: MeetingPoint | null;
  arrivalBufferMinutes: number;
}

export interface TeamMeetingSettings {
  meetingPoint: MeetingPoint | null;
  /** Null inherits the owner club's buffer. */
  arrivalBufferMinutes: number | null;
  /**
   * The owner club's values — what the team inherits. Carried here because a
   * partner-club manager may not be a member of the owner club.
   */
  clubDefaults: ClubMeetingSettings & { clubName: string };
}

export interface UpdateTeamMeetingSettingsRequest {
  meetingPoint: MeetingPoint | null;
  arrivalBufferMinutes: number | null;
}

/** Each field is applied only when present; null clears it back to the inherited/computed value. */
export interface UpdateEventMeetingRequest {
  meetingPoint?: MeetingPoint | null;
  /** A number sets manual minutes; null returns to the computed value. */
  travelMinutes?: number | null;
  /** ISO 8601; must not be after tip-off. */
  meetsAt?: string | null;
}
