import {
  DEFAULT_ARRIVAL_BUFFER_MINUTES,
  type EventMeetingPlan,
  type MeetingPoint,
  type MeetingPointSource,
} from '@basketeasy/types/meeting-points';

const MINUTE_MS = 60 * 1000;
const QUARTER_HOUR_MS = 15 * MINUTE_MS;

/** The meeting-point columns shared by Club, Team and Event. */
export interface MeetingPointColumns {
  meetingPointName: string | null;
  meetingPointAddress: string | null;
}

export interface MeetingPlanEvent extends MeetingPointColumns {
  type: 'TRAINING' | 'MATCH';
  startsAt: Date;
  location: string;
  travelMinutes: number | null;
  travelMinutesManual: boolean;
  travelRouteKey: string | null;
  meetsAtOverride: Date | null;
}

export interface MeetingPlanTeam extends MeetingPointColumns {
  arrivalBufferMinutes: number | null;
}

export interface MeetingPlanClub extends MeetingPointColumns {
  arrivalBufferMinutes: number;
}

/**
 * Case, surrounding and repeated whitespace don't make a different address —
 * « Salle Coubertin,  Nantes » and « salle coubertin, nantes » are one gym,
 * one geocode, one route.
 */
export function normaliseAddress(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Identifies the route a stored travel time belongs to. An event's origin is
 * inherited, so a club admin moving the club's meeting point silently changes
 * the route of every match that inherits it — comparing this key on read is
 * what turns that into "stale" rather than a wrong time.
 */
export function travelRouteKey(originAddress: string, location: string): string {
  return `${normaliseAddress(originAddress)} → ${normaliseAddress(location)}`;
}

/**
 * Rounds down, never up: a meeting time a few minutes early is fine, one that
 * makes the group late isn't. Flooring the UTC instant is the same as flooring
 * in Europe/Paris, whose offset is a whole number of hours.
 */
export function floorToQuarterHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS);
}

function toMeetingPoint(columns: MeetingPointColumns): MeetingPoint | null {
  return columns.meetingPointName && columns.meetingPointAddress
    ? { name: columns.meetingPointName, address: columns.meetingPointAddress }
    : null;
}

/** Event override, then team default, then owner club default — the most specific set one wins. */
export function resolveMeetingPoint(
  event: MeetingPointColumns,
  team: MeetingPointColumns,
  club: MeetingPointColumns | null,
): { meetingPoint: MeetingPoint; source: MeetingPointSource } | null {
  const fromEvent = toMeetingPoint(event);
  if (fromEvent) return { meetingPoint: fromEvent, source: 'EVENT' };
  const fromTeam = toMeetingPoint(team);
  if (fromTeam) return { meetingPoint: fromTeam, source: 'TEAM' };
  const fromClub = club ? toMeetingPoint(club) : null;
  if (fromClub) return { meetingPoint: fromClub, source: 'CLUB' };
  return null;
}

/**
 * The whole formula from the design doc, in one pure function:
 *
 *   arrivalAt = startsAt − buffer
 *   meetsAt   = override ?? floor15(arrivalAt − travel) ?? null
 *
 * Travel minutes only count when they were computed (or typed) for the
 * route the event resolves to right now — see travelRouteKey.
 */
export function resolveMeetingPlan(
  event: MeetingPlanEvent,
  team: MeetingPlanTeam,
  club: MeetingPlanClub | null,
): EventMeetingPlan | null {
  if (event.type !== 'MATCH') return null;

  const arrivalBufferMinutes =
    team.arrivalBufferMinutes ?? club?.arrivalBufferMinutes ?? DEFAULT_ARRIVAL_BUFFER_MINUTES;
  const arrivalAt = new Date(event.startsAt.getTime() - arrivalBufferMinutes * MINUTE_MS);
  const resolved = resolveMeetingPoint(event, team, club);

  if (!resolved) {
    return {
      arrivalAt: arrivalAt.toISOString(),
      arrivalBufferMinutes,
      meetingPoint: null,
      meetingPointSource: null,
      travelMinutes: null,
      travelMinutesSource: null,
      meetsAt: null,
      meetsAtSource: null,
    };
  }

  const isCurrentRoute =
    event.travelRouteKey === travelRouteKey(resolved.meetingPoint.address, event.location);
  const travelMinutes = isCurrentRoute ? event.travelMinutes : null;
  const travelMinutesSource =
    travelMinutes === null ? null : event.travelMinutesManual ? 'MANUAL' : 'COMPUTED';

  let meetsAt: Date | null = null;
  let meetsAtSource: EventMeetingPlan['meetsAtSource'] = null;
  if (event.meetsAtOverride) {
    meetsAt = event.meetsAtOverride;
    meetsAtSource = 'OVERRIDE';
  } else if (travelMinutes !== null) {
    meetsAt = floorToQuarterHour(new Date(arrivalAt.getTime() - travelMinutes * MINUTE_MS));
    meetsAtSource = 'COMPUTED';
  }

  return {
    arrivalAt: arrivalAt.toISOString(),
    arrivalBufferMinutes,
    meetingPoint: resolved.meetingPoint,
    meetingPointSource: resolved.source,
    travelMinutes,
    travelMinutesSource,
    meetsAt: meetsAt?.toISOString() ?? null,
    meetsAtSource,
  };
}

/**
 * True when a MATCH resolves to a meeting point but its stored travel time
 * belongs to another route (or was never computed) — the read path queues a
 * recompute for these.
 */
export function isTravelStale(
  event: MeetingPlanEvent,
  team: MeetingPlanTeam,
  club: MeetingPlanClub | null,
): boolean {
  if (event.type !== 'MATCH') return false;
  const resolved = resolveMeetingPoint(event, team, club);
  if (!resolved) return false;
  return event.travelRouteKey !== travelRouteKey(resolved.meetingPoint.address, event.location);
}
