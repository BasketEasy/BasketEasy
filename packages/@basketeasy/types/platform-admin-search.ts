// The back-office global search: one box that finds a club, team, account,
// player or event by id, and the first four by name.
// Decisions: docs/decisions/rgpd-and-backoffice.md.

export type AdminSearchKind = 'club' | 'team' | 'user' | 'player' | 'event';

export interface AdminSearchHit {
  kind: AdminSearchKind;
  id: string;
  /** A person's label follows the same redaction as everywhere else ("J. D." for SUPPORT). */
  label: string;
  /** Context that tells two hits apart: a club, an e-mail domain, a date. */
  sublabel: string | null;
  /** Users only: whether the account confirmed its address. Picking a first club admin warns on false. */
  emailVerified?: boolean;
}

export interface AdminSearchResult {
  query: string;
  /** Set when the query is an id that matched a record; the groups are then empty. */
  exactId: AdminSearchHit | null;
  /** True when the query was an id that matched nothing. */
  unknownId: boolean;
  groups: Record<Exclude<AdminSearchKind, 'event'>, AdminSearchHit[]>;
}

export interface AdminSearchQuery {
  q: string;
}

/** Below this the box shows nothing and the API answers 400. */
export const ADMIN_SEARCH_MIN_LENGTH = 2;
export const ADMIN_SEARCH_MAX_LENGTH = 100;
/** Hits per group; the full lists are one link away. */
export const ADMIN_SEARCH_GROUP_LIMIT = 5;
