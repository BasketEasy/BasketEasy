import type { TeamMemberRole } from './teams';

/**
 * One roster member's season, aggregated over the team's confirmed
 * scoresheets. Averages are null rather than 0 when nothing contributed a
 * known value: a player whose only match had an illegible running-score
 * column has no measured average, and reporting that as 0 would read as
 * "scored nothing" (docs/decisions/scoresheets-and-stats.md).
 */
export interface TeamSeasonPlayerStats {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
  role: TeamMemberRole;
  /** Matches this player has a confirmed stat row for. */
  gamesPlayed: number;
  /** Rounded to one decimal server-side, so every client shows the same number. */
  pointsPerGame: number | null;
  foulsPerGame: number | null;
  seasonHighPoints: number | null;
  seasonHighFouls: number | null;
  /**
   * Season point totals per play value. The screen renders them as shares of
   * `totalPoints` — a repartition of points scored, never a shooting
   * percentage: the scoresheet records makes but no attempts, so there is no
   * accuracy to compute. Stored and sent as counts because a share of a sum
   * of sums is not the average of per-match shares.
   */
  freeThrowPoints: number;
  twoPointPoints: number;
  threePointPoints: number;
  totalPoints: number;
  /** Times voted best player ("MVP") over the season's matches. */
  mvpAwards: number;
  /** Times voted "joueur en difficulté" over the season's matches. */
  worstPlayerAwards: number;
  /** True when this roster row is the persona's (the caller's own, or `forPlayerId`'s). */
  isMe: boolean;
}

/**
 * A team's season, via GET clubs/:clubId/teams/:teamId/stats. Every roster
 * member gets an entry, including one who has never played — the screen is a
 * view of the squad, not of the matches.
 */
export interface TeamSeasonStats {
  /**
   * The year the season starts: 2026 means "saison 2026-2027", running from
   * 1 September 2026 to 31 August 2027, the way the FFBB labels one.
   */
  seasonYear: number;
  seasonStart: string;
  seasonEnd: string;
  /**
   * Matches in the window that carry confirmed stats — the denominator the
   * screen shows, so "only analysed matches count" is visible rather than
   * left to a coach to work out from a missing row.
   */
  matchesPlayed: number;
  /** Seasons that actually have data, for the selector. Newest first. */
  availableSeasons: number[];
  players: TeamSeasonPlayerStats[];
}

/** One player's line on one match, from its confirmed scoresheet. */
export interface MatchStatLine {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  /** Null when the sheet didn't say — rendered `—`, never 0. */
  points: number | null;
  fouls: number | null;
  /** Point counts per basket value, never a shooting percentage. */
  freeThrowPoints: number | null;
  twoPointPoints: number | null;
  threePointPoints: number | null;
  /** True when this line is the persona's. */
  isMe: boolean;
}

/** One match's lines, via GET clubs/:clubId/teams/:teamId/stats/matches/:eventId. */
export interface MatchStats {
  /** True once a confirmed sheet produced rows; false → the UI shows the scoresheet flow instead. */
  hasStats: boolean;
  /** Points desc, nulls last, then lastName. */
  lines: MatchStatLine[];
}
