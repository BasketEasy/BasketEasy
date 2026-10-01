// The back-office statistics: growth, engagement and health, for the whole
// platform or one club, over a selectable range bucketed by week.
// Decisions: docs/decisions/rgpd-and-backoffice.md.
//
// Aggregates only: nothing here names or counts a single person.

import type { EventScoresheetStatus } from './events';
import type { Gender, TeamCategory } from './teams';

export type AdminStatsRange = '7d' | '30d' | '90d' | 'season' | 'all';

export const ADMIN_STATS_RANGES: readonly AdminStatsRange[] = ['7d', '30d', '90d', 'season', 'all'];

export interface AdminStatsQuery {
  range?: AdminStatsRange;
  clubId?: string;
}

/**
 * One week of a series. `weekStart` is the Monday (Europe/Paris) as
 * `YYYY-MM-DD`; every series of a response has the same weeks, zeros
 * included. `value` is null for a ratio with nothing to divide by.
 */
export interface AdminStatPoint {
  weekStart: string;
  value: number | null;
}

/** A count and how many of it were created within the range. */
export interface AdminStatCount {
  total: number;
  added: number;
}

/** Ratios are 0–1, and null when their denominator is 0 (rendered « — », never « 0 % »). */
export type AdminRatio = number | null;

export interface AdminInviteCounts {
  live: number;
  expired: number;
}

export interface AdminStats {
  range: AdminStatsRange;
  /** ISO, inclusive. */
  from: string;
  /** ISO, exclusive: the moment the stats were computed. */
  to: string;
  clubId: string | null;
  growth: {
    users: AdminStatCount;
    clubs: AdminStatCount;
    teams: AdminStatCount;
    players: AdminStatCount;
    claimedPlayerShare: AdminRatio;
    /** Current snapshots from `lastActiveAt`; there is no activity history to chart. */
    active7d: number;
    active30d: number;
    active90d: number;
    guardianOnlyAccounts: number;
    ctcTeams: number;
    newUsers: AdminStatPoint[];
    newClubs: AdminStatPoint[];
    newTeams: AdminStatPoint[];
    newPlayers: AdminStatPoint[];
    teamsByCategory: { category: TeamCategory; gender: Gender; count: number }[];
  };
  engagement: {
    matchesByWeek: AdminStatPoint[];
    trainingsByWeek: AdminStatPoint[];
    recurringShare: AdminRatio;
    /** Answers ÷ (current roster size × past events). Roster history isn't stored. */
    rsvpResponseRate: AdminRatio;
    rsvpResponseRateByWeek: AdminStatPoint[];
    rsvpSplit: { going: number; notGoing: number; maybe: number };
    /** Answers given by someone other than the player's own account (a parent). */
    guardianAnswers: number;
    convocationsByWeek: AdminStatPoint[];
    matchesWithMeetingPointShare: AdminRatio;
    travelSplit: { meetingPoint: number; direct: number };
    votesCast: number;
    /** Past matches with an uploaded scoresheet ÷ past matches. */
    scoresheetCoverage: AdminRatio;
    guardianLinksByWeek: AdminStatPoint[];
    emailOptOutShare: AdminRatio;
    pushEnabledUsers: number;
    ffbbLinkedClubs: number;
    ffbbLinkedTeams: number;
  };
  /** Team-shared channels: the guest RSVP link and the WhatsApp reminder. */
  sharing: {
    guestLinks: {
      /** Teams whose link is currently on (a snapshot: disabling deletes the row). */
      teamsEnabled: number;
      /** Answers in the range given through a link, and their share of all answers. */
      answersViaLink: number;
      answersViaLinkShare: AdminRatio;
    };
    whatsapp: {
      /** Teams with scheduled reminders on (a snapshot). */
      teamsEnabled: number;
      /** Shares confirmed sent within the range. */
      sent: number;
      /** Prompted to a manager, not yet confirmed (a snapshot). */
      pending: number;
      /** Queued for a later send (a snapshot). */
      scheduled: number;
      /** Never confirmed and past their event or expiry, within the range. */
      expired: number;
      /** Scheduled sends overdue by 15 minutes or more: their job is likely lost. */
      overdue: number;
    };
  };
  health: {
    scoresheetsByStatus: Record<EventScoresheetStatus, number>;
    ocrFailureRate: AdminRatio;
    avgOcrAttempts: number | null;
    needsReview: number;
    /** Queued or being read for more than an hour. */
    stuckScoresheets: number;
    unverifiedUsers: number;
    unverifiedOlderThan7d: number;
    pendingPlayerInvites: AdminInviteCounts;
    pendingGuardianInvites: AdminInviteCounts;
    minorsMissingConsent: number;
    accountsNearingErasure: number;
    clubsWithoutAdmin: number;
    teamsWithoutManager: number;
    /** Platform-wide whatever the club filter: the sweep runs once for everyone. */
    lastRetentionRun: { ranAt: string; ok: boolean } | null;
    /** Matches in the next 7 days whose travel time belongs to an older route. */
    staleMeetingRoutes: number;
  };
}
