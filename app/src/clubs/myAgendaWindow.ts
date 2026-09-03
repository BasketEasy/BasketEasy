import type { GetDashboardParams } from '@basketeasy/types/my-dashboard';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * `GET /me/dashboard` defaults to a 7-day window server-side
 * (`DEFAULT_AGENDA_WINDOW_DAYS`, `server/src/dashboard/dashboard.service.ts`)
 * — a match the *following* Saturday (10 days out, say) simply doesn't exist
 * on a Wednesday check-in, even though it's exactly the one with a
 * convocation to answer and travel to organise
 * (`docs/ux-audit/player-journey.md` §3.2). The server default stays put for
 * the manager view (unchanged in this phase); a player's « Ma semaine »
 * overrides it client-side with an explicit 14-day window instead.
 */
export const PLAYER_AGENDA_WINDOW_DAYS = 14;

/**
 * How far back « Après le match » looks for a played match to surface — the
 * inverted window `player-journey.md` §4.5 describes for the eventual
 * `/résultats` destination (phase 8), stubbed here against the *existing*
 * payload shape (no `result` field yet) rather than waiting on that phase.
 */
export const PAST_MATCHES_WINDOW_DAYS = 30;

/** `now → now + 14 days`, in the shape `useMyAgenda` expects. */
export function playerAgendaWindowParams(now: Date = new Date()): GetDashboardParams {
  return {
    from: now.toISOString(),
    to: new Date(now.getTime() + PLAYER_AGENDA_WINDOW_DAYS * DAY_IN_MS).toISOString(),
  };
}

/** `now − 30 days → now`. */
export function pastMatchesWindowParams(now: Date = new Date()): GetDashboardParams {
  return {
    from: new Date(now.getTime() - PAST_MATCHES_WINDOW_DAYS * DAY_IN_MS).toISOString(),
    to: now.toISOString(),
  };
}
