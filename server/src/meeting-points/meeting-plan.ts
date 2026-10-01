import { createHash } from 'node:crypto';
import {
  DEFAULT_ARRIVAL_BUFFER_MINUTES,
  computeArrivalAt,
  computeMeetsAt,
  type EventMeetingPlan,
  type MeetingPoint,
  type MeetingPointSource,
} from '@basketeasy/types/meeting-points';
import { isUnknownEventLocation } from '@basketeasy/types/events';

/** The meeting-point columns shared by Club, Team and EventMeeting. */
export interface MeetingPointColumns {
  meetingPointName: string | null;
  meetingPointAddress: string | null;
}

/** The Event columns the plan reads — the match itself, not its meeting state. */
export interface MeetingPlanEvent {
  type: 'TRAINING' | 'MATCH';
  startsAt: Date;
  location: string;
  /** A home match is played at our own gym: the team goes straight there, no default RDV. */
  venue: 'HOME' | 'AWAY' | null;
}

/**
 * A match's EventMeeting row, or null when nothing was ever stored for it
 * (no override, no travel time yet) — the common case, so no row is needed.
 */
export interface MeetingPlanState extends MeetingPointColumns {
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
 * Bumped whenever normaliseAddress (or the key's shape) changes, so every
 * stored key reads as stale once and is recomputed, instead of silently
 * mismatching forever.
 */
const ROUTE_KEY_VERSION = 'v1';

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
 * what turns that into "stale" rather than a wrong time. Hashed so the column
 * stays a fixed width however long the two addresses are.
 */
export function travelRouteKey(originAddress: string, location: string): string {
  const digest = createHash('sha1')
    .update(`${normaliseAddress(originAddress)}\u0000${normaliseAddress(location)}`)
    .digest('hex');
  return `${ROUTE_KEY_VERSION}:${digest}`;
}

function toMeetingPoint(columns: MeetingPointColumns | null): MeetingPoint | null {
  return columns?.meetingPointName && columns.meetingPointAddress
    ? { name: columns.meetingPointName, address: columns.meetingPointAddress }
    : null;
}

type DefaultMeetingPoint = {
  meetingPoint: MeetingPoint;
  source: Exclude<MeetingPointSource, 'EVENT'>;
};

/** What a match falls back to without its own override: team default, then owner club default. */
export function resolveDefaultMeetingPoint(
  team: MeetingPointColumns,
  club: MeetingPointColumns | null,
): DefaultMeetingPoint | null {
  const fromTeam = toMeetingPoint(team);
  if (fromTeam) return { meetingPoint: fromTeam, source: 'TEAM' };
  const fromClub = toMeetingPoint(club);
  if (fromClub) return { meetingPoint: fromClub, source: 'CLUB' };
  return null;
}

/** Event override, then team default, then owner club default — the most specific set one wins. */
function resolveMeetingPoint(
  override: MeetingPointColumns | null,
  team: MeetingPointColumns,
  club: MeetingPointColumns | null,
): { meetingPoint: MeetingPoint; source: MeetingPointSource } | null {
  const fromEvent = toMeetingPoint(override);
  if (fromEvent) return { meetingPoint: fromEvent, source: 'EVENT' };
  return resolveDefaultMeetingPoint(team, club);
}

/**
 * The meeting point a match actually uses. A home match skips the team and
 * club defaults (those are for getting to someone else's gym) and has a
 * meeting point only when a manager set one on the match itself.
 */
export function resolveEventMeetingPoint(
  event: Pick<MeetingPlanEvent, 'venue'>,
  override: MeetingPointColumns | null,
  team: MeetingPointColumns,
  club: MeetingPointColumns | null,
): { meetingPoint: MeetingPoint; source: MeetingPointSource } | null {
  if (event.venue !== 'HOME') return resolveMeetingPoint(override, team, club);
  const fromEvent = toMeetingPoint(override);
  return fromEvent ? { meetingPoint: fromEvent, source: 'EVENT' } : null;
}

/**
 * A computed travel time needs a real destination. The import's « Lieu non
 * communiqué » placeholder geocodes to somewhere in France, so a route to it
 * is noise; a manager's typed minutes still count.
 */
function hasNoDestination(event: MeetingPlanEvent): boolean {
  return isUnknownEventLocation(event.location);
}

/**
 * The whole formula from the design doc, resolved on read:
 *
 *   arrivalAt = startsAt − buffer
 *   meetsAt   = override ?? floor15(arrivalAt − travel) ?? null
 *
 * Travel minutes only count when they were computed (or typed) for the
 * route the event resolves to right now — see travelRouteKey.
 */
export function resolveMeetingPlan(
  event: MeetingPlanEvent,
  state: MeetingPlanState | null,
  team: MeetingPlanTeam,
  club: MeetingPlanClub | null,
): EventMeetingPlan | null {
  if (event.type !== 'MATCH') return null;

  const arrivalBufferMinutes =
    team.arrivalBufferMinutes ?? club?.arrivalBufferMinutes ?? DEFAULT_ARRIVAL_BUFFER_MINUTES;
  const arrivalAt = computeArrivalAt(event.startsAt, arrivalBufferMinutes).toISOString();
  const fallback = event.venue === 'HOME' ? null : resolveDefaultMeetingPoint(team, club);
  const resolved = resolveEventMeetingPoint(event, state, team, club);
  const defaults = {
    defaultMeetingPoint: fallback?.meetingPoint ?? null,
    defaultMeetingPointSource: fallback?.source ?? null,
  };

  if (!resolved) {
    return {
      arrivalAt,
      arrivalBufferMinutes,
      meetingPoint: null,
      meetingPointSource: null,
      ...defaults,
      travelMinutes: null,
      travelMinutesSource: null,
      meetsAt: null,
      meetsAtSource: null,
    };
  }

  const isCurrentRoute =
    state?.travelRouteKey === travelRouteKey(resolved.meetingPoint.address, event.location);
  const usable = isCurrentRoute && (state.travelMinutesManual || !hasNoDestination(event));
  const travelMinutes = usable ? state.travelMinutes : null;
  const travelMinutesSource =
    travelMinutes === null ? null : state?.travelMinutesManual ? 'MANUAL' : 'COMPUTED';

  let meetsAt: Date | null = null;
  let meetsAtSource: EventMeetingPlan['meetsAtSource'] = null;
  if (state?.meetsAtOverride) {
    meetsAt = state.meetsAtOverride;
    meetsAtSource = 'OVERRIDE';
  } else if (travelMinutes !== null) {
    meetsAt = computeMeetsAt({ startsAt: event.startsAt, arrivalBufferMinutes, travelMinutes });
    meetsAtSource = 'COMPUTED';
  }

  return {
    arrivalAt,
    arrivalBufferMinutes,
    meetingPoint: resolved.meetingPoint,
    meetingPointSource: resolved.source,
    ...defaults,
    travelMinutes,
    travelMinutesSource,
    meetsAt: meetsAt?.toISOString() ?? null,
    meetsAtSource,
  };
}

/**
 * What players were last told about a match's meeting — a change to the
 * place or the time is what makes a new announcement worth sending.
 */
export function meetingAnnouncementKey(meetingPoint: MeetingPoint, meetsAt: string): string {
  return `${meetingPoint.name}|${meetingPoint.address}|${meetsAt}`;
}

/**
 * True when a MATCH resolves to a meeting point but its stored travel time
 * belongs to another route (or was never computed) — the read path queues a
 * recompute for these.
 */
export function isTravelStale(
  event: MeetingPlanEvent,
  state: MeetingPlanState | null,
  team: MeetingPlanTeam,
  club: MeetingPlanClub | null,
): boolean {
  if (event.type !== 'MATCH' || hasNoDestination(event)) return false;
  const resolved = resolveEventMeetingPoint(event, state, team, club);
  if (!resolved) return false;
  return state?.travelRouteKey !== travelRouteKey(resolved.meetingPoint.address, event.location);
}
