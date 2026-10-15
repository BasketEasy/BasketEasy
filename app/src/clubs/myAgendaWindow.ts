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

/** `now → now + 14 days`, in the shape `useMyAgenda` expects. */
export function playerAgendaWindowParams(now: Date = new Date()): GetDashboardParams {
  return {
    from: new Date(floorToSnap(now.getTime())).toISOString(),
    to: new Date(ceilToSnap(now.getTime()) + PLAYER_AGENDA_WINDOW_DAYS * DAY_IN_MS).toISOString(),
  };
}

/** `now − 30 days → now`. */
export function pastMatchesWindowParams(now: Date = new Date()): GetDashboardParams {
  return {
    from: new Date(floorToSnap(now.getTime()) - PAST_MATCHES_WINDOW_DAYS * DAY_IN_MS).toISOString(),
    to: new Date(ceilToSnap(now.getTime())).toISOString(),
  };
}
