import type { GetDashboardParams } from '@basketeasy/types/my-dashboard';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const SNAP_IN_MS = 15 * 60 * 1000;

// Bounds are snapped to a quarter hour so every mount inside it builds the
// same query key and hits the cache, instead of a fresh `new Date()` key (and
// request) per visit. `from` rounds down and `to` up, so the window only grows.
const floorToSnap = (ms: number) => Math.floor(ms / SNAP_IN_MS) * SNAP_IN_MS;
const ceilToSnap = (ms: number) => Math.ceil(ms / SNAP_IN_MS) * SNAP_IN_MS;

/**
 * `GET /me/dashboard` defaults to a 7-day window server-side
 * (`DEFAULT_AGENDA_WINDOW_DAYS`, `server/src/dashboard/dashboard.service.ts`)
 * — a match the *following* Saturday (10 days out, say) simply doesn't exist
 * on a Wednesday check-in, even though it's exactly the one with a
 * convocation to answer and travel to organise
 * (`docs/personas.md`). The server default stays put for
 * the manager view (unchanged in this phase); a player's « Ma semaine »
 * overrides it client-side with an explicit 14-day window instead.
 */
const PLAYER_AGENDA_WINDOW_DAYS = 14;

/**
 * How far back « Après le match » looks for a played match to surface — the
 * inverted window `player-journey.md` §4.5 describes for the eventual
 * `/résultats` destination (phase 8), stubbed here against the *existing*
 * payload shape (no `result` field yet) rather than waiting on that phase.
 */
const PAST_MATCHES_WINDOW_DAYS = 30;

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

/**
 * `now`, floored to the previous 5 minutes. The window bounds are part of the
 * query key, so a bound stamped to the millisecond makes a new cache entry on
 * every mount, never a hit, and every visit to the home screen refetches what
 * it just showed. Floored, every screen asking within the same five minutes
 * shares one entry (the home, the bottom nav's badge), and the window is at
 * most five minutes behind: an agenda this short-lived does not need better.
 */
export function roundedNow(now: Date = new Date()): Date {
  return new Date(Math.floor(now.getTime() / FIVE_MINUTES_IN_MS) * FIVE_MINUTES_IN_MS);
}

/** `now → now + 14 days`, in the shape `useMyAgenda` expects. */
export function playerAgendaWindowParams(now: Date = roundedNow()): GetDashboardParams {
  return {
    from: new Date(floorToSnap(now.getTime())).toISOString(),
    to: new Date(ceilToSnap(now.getTime()) + PLAYER_AGENDA_WINDOW_DAYS * DAY_IN_MS).toISOString(),
  };
}

/** `now − 30 days → now`. */
export function pastMatchesWindowParams(now: Date = roundedNow()): GetDashboardParams {
  return {
    from: new Date(floorToSnap(now.getTime()) - PAST_MATCHES_WINDOW_DAYS * DAY_IN_MS).toISOString(),
    to: new Date(ceilToSnap(now.getTime())).toISOString(),
  };
}
