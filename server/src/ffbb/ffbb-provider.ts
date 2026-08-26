// The FFBB integration boundary: if FFBB changes its API contract (renames
// fields, moves off its current page-rendering approach, restructures the
// ligue/comité/club/engagement hierarchy), only FfbbPageScrapeProvider should
// need to change — never the Prisma schema, DTOs, controllers, or frontend.
// See docs/superpowers/specs/2026-08-26-ffbb-calendar-import-design.md.

export const FFBB_PROVIDER = Symbol('FFBB_PROVIDER');

/** FFBB calls this a "rencontre" in its own payload; this is our name for it. */
export interface FfbbMatch {
  /** Stable external id, drawn from a shared pool across the whole competition (not scoped per engagement). */
  id: string;
  /** ISO 8601, no offset. */
  startsAt: string;
  /** False when startsAt's time-of-day is FFBB's 00:00:00 "not yet confirmed" placeholder. */
  timeConfirmed: boolean;
  opponentLabel: string;
  isHome: boolean;
  /** Usually null — FFBB rarely publishes a venue this far ahead of matchday. */
  location: string | null;
  played: boolean;
}

/**
 * One page fetch yields both the match list and, when present, a
 * human-readable label for the competition — bundled in one result so
 * TeamsService can snapshot a label into TeamFfbbLink.ffbbEngagementLabel
 * without a second round-trip. The spec's literal FfbbMatch shape carries no
 * label field, so this wrapper is the minimal extension needed to satisfy
 * the Data model section's requirement that the label be "read off the
 * validated page fetch."
 */
export interface FfbbEngagementFetchResult {
  competitionLabel: string | null;
  matches: FfbbMatch[];
}

/** Thrown by FfbbProvider implementations on any fetch/parse failure — never let a partial or garbage result propagate. */
export class FfbbPageFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FfbbPageFormatError';
  }
}

export interface FfbbProvider {
  /**
   * Validates a pasted competitions.ffbb.com team URL. If it matches the
   * expected `ligues/<x>/comites/<y>/clubs/<z>/equipes/<id>` shape, returns
   * that full path string — NOT the bare trailing id, since a bare id alone
   * can't be resolved back into a page. Returns null if the URL doesn't
   * match.
   */
  parseEngagementRef(url: string): string | null;
  /**
   * Matches for one engagement, already normalized (home/away resolved,
   * opponent named). `engagementRef` is the full path string returned by
   * `parseEngagementRef` — not a bare id.
   */
  getMatchesForEngagement(engagementRef: string): Promise<FfbbEngagementFetchResult>;
}
