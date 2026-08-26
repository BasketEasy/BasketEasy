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
