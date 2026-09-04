export interface LinkFfbbClubRequest {
  /** Opaque code from the club's competitions.ffbb.com URL, stored unvalidated — no lookup exists to confirm it's real. */
  ffbbClubCode: string;
}

export interface LinkFfbbTeamRequest {
  /** Full competitions.ffbb.com/.../equipes/<id> URL — a bare id can't be resolved and is rejected server-side. */
  ffbbTeamUrl: string;
}

/** One FFBB competition a team is linked to. `ffbbEngagementRef` is an internal lookup key, never exposed here. */
export interface TeamFfbbLink {
  id: string;
  /** Display-name snapshot taken at link time (e.g. "Seniors M D3"); null when FFBB's page didn't yield one. */
  ffbbEngagementLabel: string | null;
}

/** The two ways adding an FFBB link can fail, shared so the frontend can bind the error to the field rather than a generic message. */
export type FfbbLinkErrorCode = 'FFBB_LINK_INVALID' | 'FFBB_LINK_UNREACHABLE';

export interface FfbbImportResult {
  created: number;
  updated: number;
  unchanged: number;
}

/** One team's row in a poule's standings table. */
export interface PouleTeamStanding {
  teamLabel: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  /** True for our own team's row — the frontend highlights it. */
  isOurTeam: boolean;
}

/** One final score from a poule matchday. */
export interface PouleResult {
  homeLabel: string;
  awayLabel: string;
  homeScore: number;
  awayScore: number;
  /** True when either side is our own team — the frontend highlights it. */
  involvesOurTeam: boolean;
}

/** Every result from one played journée, grouped under its own label (e.g. "Journée 3"). */
export interface PouleMatchday {
  matchdayLabel: string;
  results: PouleResult[];
}

/**
 * A team's whole poule, read live from FFBB — never persisted (see
 * docs/superpowers/specs/2026-09-03-poule-weekend-results-design.md). Empty
 * `standings`/`matchdays` is not an error: it's the normal shape before a
 * poule's first journée has been played.
 */
export interface PouleResults {
  competitionLabel: string | null;
  standings: PouleTeamStanding[];
  /** Every played journée, most recent first. */
  matchdays: PouleMatchday[];
}
