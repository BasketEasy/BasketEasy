// The FFBB integration boundary: if FFBB changes its API contract (renames
// fields, moves off its current page-rendering approach, restructures the
// ligue/comité/club/engagement hierarchy), only FfbbPageScrapeProvider should
// need to change — never the Prisma schema, DTOs, controllers, or frontend.
// See docs/decisions/ffbb.md.

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
  /**
   * The venue, as one human-readable French address line ("Salle de la
   * Herdrie, 12 rue des Sports, 44115 Basse-Goulaine"), read from the
   * match's own FFBB detail page. Null when the venue couldn't be resolved
   * (FFBB hasn't published one yet, the detail page didn't parse) or when
   * the fetch was made without `resolveVenues` — see GetMatchesOptions.
   */
  location: string | null;
  played: boolean;
}

/**
 * One page fetch yields both the match list and, when present, a
 * human-readable label for the competition — bundled in one result so
 * TeamsService can snapshot a label into TeamFfbbLink.ffbbEngagementLabel
 * without a second round-trip. FfbbMatch itself carries no label field, so
 * this wrapper is the minimal extension needed for the label to be "read off the
 * validated page fetch."
 */
export interface FfbbEngagementFetchResult {
  competitionLabel: string | null;
  matches: FfbbMatch[];
  /**
   * `ligues/<x>/comites/<y>/competitions/<code>?phase=<phaseId>&poule=<pouleId>`
   * — the full resolvable reference to this engagement's poule standings
   * page, read off the page's own `dataEngagement.idPoule` plus a fetched
   * match's `competitionId` (no second fetch needed) — see
   * FfbbPageScrapeProvider.derivePouleRef. Null when no poule id or match
   * detail link could be found at all (nothing published yet this season)
   * — see docs/decisions/ffbb.md.
   */
  pouleRef: string | null;
}

/** One team's row in a poule's standings — see FfbbProvider.getPouleStandings. */
export interface FfbbPouleTeamStanding {
  teamLabel: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  /** True for the team identified by getPouleStandings's ourEngagementId. */
  isOurTeam: boolean;
}

/** One final score from a poule matchday. */
export interface FfbbPouleResult {
  homeLabel: string;
  awayLabel: string;
  homeScore: number;
  awayScore: number;
  /** True when either side is the team identified by ourEngagementId. */
  involvesOurTeam: boolean;
}

/** Every result from one played journée, grouped under its own label (e.g. "Journée 3"). */
export interface FfbbPouleMatchday {
  matchdayLabel: string;
  results: FfbbPouleResult[];
}

export interface FfbbPouleStandings {
  standings: FfbbPouleTeamStanding[];
  /** Every played journée, most recent first. Empty before a poule's first journée is played — not an error. */
  matchdays: FfbbPouleMatchday[];
}

/** Thrown by FfbbProvider implementations on any fetch/parse failure — never let a partial or garbage result propagate. */
export class FfbbPageFormatError extends Error {
  /** `status` is FFBB's HTTP status when the page answered with a non-2xx one. */
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FfbbPageFormatError';
  }
}

/** Per-call knobs about what a fetch costs us — never about FFBB's page shape, which stays behind the adapter. */
export interface GetMatchesOptions {
  /**
   * Follow each unplayed match's detail page to resolve its venue address.
   * Off by default: validating a pasted link only needs the team page to
   * resolve, and paying for one page load per match there would make the
   * "paste a URL" form wait seconds for data it discards.
   */
  resolveVenues?: boolean;
  /**
   * Matches whose venue is already known locally. Still re-read when the
   * budget allows (FFBB can move a match), but only after every match with
   * no venue yet, so a re-sync spends its page loads where they're missing.
   */
  knownVenueMatchIds?: ReadonlySet<string>;
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
   * `parseEngagementRef` — not a bare id. Venue resolution is opt-in via
   * `options.resolveVenues` and is best-effort: it never fails the call,
   * it only leaves `location` null.
   */
  getMatchesForEngagement(
    engagementRef: string,
    options?: GetMatchesOptions,
  ): Promise<FfbbEngagementFetchResult>;

  /**
   * Standings and latest results for one poule. `pouleRef` is the full
   * resolvable path+query from FfbbEngagementFetchResult.pouleRef — never a
   * bare code/id, same "store the whole resolvable reference" rule
   * parseEngagementRef follows for TeamFfbbLink.ffbbEngagementRef.
   * `ourEngagementId` is the trailing numeric id of the TeamFfbbLink this
   * pouleRef came from, used to flag isOurTeam/involvesOurTeam.
   */
  getPouleStandings(pouleRef: string, ourEngagementId: string): Promise<FfbbPouleStandings>;
}
