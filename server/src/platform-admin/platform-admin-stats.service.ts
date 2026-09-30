import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { EventScoresheetStatus } from '@basketeasy/types/events';
import type {
  AdminRatio,
  AdminStatCount,
  AdminStatPoint,
  AdminStats,
  AdminStatsRange,
} from '@basketeasy/types/platform-admin-stats';
import { ADMIN_OCR_STUCK_AFTER_MS } from '@basketeasy/types/platform-admin-actions';
import { PrismaService } from '../prisma/prisma.service';
import {
  INACTIVE_ACCOUNT_RETENTION_MONTHS,
  INACTIVE_SOON_LEAD_MONTHS,
  subMonths,
} from '../retention/retention.constants';
import { seasonWindow, seasonYearFor } from '../team-stats/team-stats.service';
import { isTravelStale } from '../meeting-points/meeting-plan';
import { minorBirthDateBound } from './platform-admin-browse.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<Exclude<AdminStatsRange, 'season' | 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};
const UNVERIFIED_GRACE_DAYS = 7;
const STATS_CACHE_TTL_MS = 60_000;
const MEETING_LOOKAHEAD_DAYS = 7;
/** The WhatsApp sweep runs every 10 minutes: a send later than this lost its job. */
const WHATSAPP_OVERDUE_MS = 15 * 60 * 1000;

const SCORESHEET_STATUSES: EventScoresheetStatus[] = [
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'PARSED',
  'NEEDS_REVIEW',
  'CONFIRMED',
  'FAILED',
];

interface WeekRow {
  weekStart: string;
  a: number;
  b: number;
}

/**
 * The window a range covers, ending now. `season` starts on the current
 * FFBB season's 1 September (the Team stats rule); `all` at the first club.
 */
export function rangeWindow(range: AdminStatsRange, now: Date, firstClubAt: Date | null) {
  if (range === 'season') return { from: seasonWindow(seasonYearFor(now)).start, to: now };
  if (range === 'all') return { from: firstClubAt ?? now, to: now };
  return { from: new Date(now.getTime() - RANGE_DAYS[range] * DAY_MS), to: now };
}

/** A share, or null when there is nothing to divide by — « — », never « 0 % ». */
export function ratio(part: number, whole: number): AdminRatio {
  return whole > 0 ? part / whole : null;
}

/**
 * The back-office dashboard, platform-wide or for one club.
 *
 * Computed on read and cached for a minute: each metric is one aggregate
 * query (a `count`, a `groupBy`, or one SQL statement), run in parallel within
 * a section and one section at a time, never a query per row. Weekly series are bucketed by ISO week in
 * Europe/Paris and zero-filled in SQL, so every series of a response has the
 * same weeks.
 *
 * Club scoping follows ownership of the data, not of the team: a CTC team,
 * and every event, answer and sheet under it, counts in each of its clubs, so
 * per-club figures intentionally don't sum to the platform's.
 *
 * Queries PrismaService directly, the cross-module convention of Dashboard and
 * Team stats. Aggregates only: nothing here reaches a person.
 */
@Injectable()
export class PlatformAdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly cache = new Map<string, { at: number; value: Promise<AdminStats> }>();

  /**
   * Cached per range and club for STATS_CACHE_TTL_MS: a dashboard is a few
   * dozen aggregates, and every staff tab polling or reloading it would
   * otherwise recompute all of them. A concurrent request for the same key
   * shares the one in flight. Figures that are a minute old are fine for a
   * trends screen; nothing here drives an action.
   */
  async getStats(range: AdminStatsRange, clubId: string | undefined): Promise<AdminStats> {
    const key = `${range}|${clubId ?? ''}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.at < STATS_CACHE_TTL_MS) return cached.value;
    for (const [entryKey, entry] of this.cache) {
      if (now - entry.at >= STATS_CACHE_TTL_MS) this.cache.delete(entryKey);
    }
    const value = this.computeStats(range, clubId);
    this.cache.set(key, { at: now, value });
    // A failure is not cached: the next request tries again.
    value.catch(() => this.cache.delete(key));
    return value;
  }

  private async computeStats(
    range: AdminStatsRange,
    clubId: string | undefined,
  ): Promise<AdminStats> {
    const now = new Date();
    const firstClub = await this.prisma.club.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const { from, to } = rangeWindow(range, now, firstClub?.createdAt ?? null);
    const scope = new Scope(clubId);

    // One section at a time, each running its own queries in parallel: all
    // three at once was ~50 concurrent queries, enough to drain Prisma's
    // default connection pool and stall every other request behind it.
    const growth = await this.growth(scope, from, to, now);
    const engagement = await this.engagement(scope, from, to, now);
    const sharing = await this.sharing(scope, from, to, now);
    const health = await this.health(scope, from, to, now);

    return {
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      clubId: clubId ?? null,
      growth,
      engagement,
      sharing,
      health,
    };
  }

  private async sharing(
    scope: Scope,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<AdminStats['sharing']> {
    const eventInRange = { ...scope.event, startsAt: { gte: from, lt: to } };
    const inRange = { gte: from, lt: to };
    const shares = { team: scope.team };

    const [
      guestTeams,
      answers,
      answersViaLink,
      whatsappTeams,
      sent,
      pending,
      scheduled,
      expired,
      overdue,
    ] = await Promise.all([
      this.prisma.team.count({ where: { ...scope.team, guestLink: { isNot: null } } }),
      this.prisma.eventRsvp.count({ where: { event: eventInRange } }),
      this.prisma.eventRsvp.count({ where: { source: 'GUEST_LINK', event: eventInRange } }),
      this.prisma.team.count({ where: { ...scope.team, waReminderEnabled: true } }),
      this.prisma.eventShare.count({ where: { ...shares, state: 'SENT', sentAt: inRange } }),
      this.prisma.eventShare.count({ where: { ...shares, state: 'PENDING' } }),
      this.prisma.eventShare.count({ where: { ...shares, state: 'SCHEDULED' } }),
      this.prisma.eventShare.count({ where: { ...shares, state: 'EXPIRED', updatedAt: inRange } }),
      this.prisma.eventShare.count({
        where: {
          ...shares,
          state: 'SCHEDULED',
          dueAt: { lte: new Date(now.getTime() - WHATSAPP_OVERDUE_MS) },
          event: { startsAt: { gt: now } },
        },
      }),
    ]);

    return {
      guestLinks: {
        teamsEnabled: guestTeams,
        answersViaLink,
        answersViaLinkShare: ratio(answersViaLink, answers),
      },
      whatsapp: { teamsEnabled: whatsappTeams, sent, pending, scheduled, expired, overdue },
    };
  }

  private async growth(
    scope: Scope,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<AdminStats['growth']> {
    const inRange = { gte: from, lt: to };
    const since = (days: number) => ({ gte: new Date(now.getTime() - days * DAY_MS) });
    const count = async (
      total: () => Promise<number>,
      added: () => Promise<number>,
    ): Promise<AdminStatCount> => {
      const [t, a] = await Promise.all([total(), added()]);
      return { total: t, added: a };
    };

    const [
      users,
      clubs,
      teams,
      players,
      claimedPlayers,
      active7d,
      active30d,
      active90d,
      guardianOnlyAccounts,
      ctcTeams,
      newUsers,
      newClubs,
      newTeams,
      newPlayers,
      teamsByCategory,
    ] = await Promise.all([
      count(
        () => this.prisma.user.count({ where: scope.user }),
        () => this.prisma.user.count({ where: { ...scope.user, createdAt: inRange } }),
      ),
      count(
        () => this.prisma.club.count({ where: scope.club }),
        () => this.prisma.club.count({ where: { ...scope.club, createdAt: inRange } }),
      ),
      count(
        () => this.prisma.team.count({ where: scope.team }),
        () => this.prisma.team.count({ where: { ...scope.team, createdAt: inRange } }),
      ),
      count(
        () => this.prisma.player.count({ where: scope.player }),
        () => this.prisma.player.count({ where: { ...scope.player, createdAt: inRange } }),
      ),
      this.prisma.player.count({ where: { ...scope.player, userId: { not: null } } }),
      this.prisma.user.count({ where: { ...scope.user, lastActiveAt: since(7) } }),
      this.prisma.user.count({ where: { ...scope.user, lastActiveAt: since(30) } }),
      this.prisma.user.count({ where: { ...scope.user, lastActiveAt: since(90) } }),
      this.prisma.user.count({
        where: {
          memberships: { none: {} },
          guardianOf: { some: scope.clubId ? { player: { clubId: scope.clubId } } : {} },
        },
      }),
      this.countCtcTeams(scope),
      this.weekly(
        from,
        to,
        Prisma.sql`SELECT u."createdAt" AS ts FROM "User" u WHERE ${scope.userSql('u')}`,
      ),
      this.weekly(
        from,
        to,
        Prisma.sql`SELECT c."createdAt" AS ts FROM "Club" c WHERE ${scope.clubSql('c')}`,
      ),
      this.weekly(
        from,
        to,
        Prisma.sql`SELECT t."createdAt" AS ts FROM "Team" t WHERE ${scope.teamSql('t."id"')}`,
      ),
      this.weekly(
        from,
        to,
        Prisma.sql`SELECT p."createdAt" AS ts FROM "Player" p WHERE ${scope.playerSql('p')}`,
      ),
      this.prisma.team.groupBy({
        by: ['category', 'gender'],
        where: scope.team,
        _count: { _all: true },
        orderBy: [{ category: 'asc' }, { gender: 'asc' }],
      }),
    ]);

    return {
      users,
      clubs,
      teams,
      players,
      claimedPlayerShare: ratio(claimedPlayers, players.total),
      active7d,
      active30d,
      active90d,
      guardianOnlyAccounts,
      ctcTeams,
      newUsers: countSeries(newUsers),
      newClubs: countSeries(newClubs),
      newTeams: countSeries(newTeams),
      newPlayers: countSeries(newPlayers),
      teamsByCategory: teamsByCategory.map((row) => ({
        category: row.category,
        gender: row.gender,
        count: row._count._all,
      })),
    };
  }

  private async engagement(
    scope: Scope,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<AdminStats['engagement']> {
    const eventInRange = { ...scope.event, startsAt: { gte: from, lt: to } };
    // Answers and sheets only make sense for events that have happened.
    const pastEnd = to < now ? to : now;
    const pastEventInRange = { ...scope.event, startsAt: { gte: from, lt: pastEnd } };

    const [
      eventsByWeek,
      recurringEvents,
      rangeEvents,
      rsvpByWeek,
      rsvpSplit,
      guardianAnswers,
      convocationsByWeek,
      matches,
      travelSplit,
      votesCast,
      pastMatches,
      pastMatchesWithSheet,
      guardianLinksByWeek,
      users,
      optedOut,
      pushEnabledUsers,
      ffbbLinkedClubs,
      ffbbLinkedTeams,
    ] = await Promise.all([
      this.weekly(
        from,
        to,
        Prisma.sql`SELECT e."startsAt" AS ts, e."type"::text AS kind FROM "Event" e
          WHERE e."startsAt" >= ${from} AND e."startsAt" < ${to} AND ${scope.teamSql('e."teamId"')}`,
        Prisma.sql`count(*) FILTER (WHERE kind = 'MATCH')`,
        Prisma.sql`count(*) FILTER (WHERE kind = 'TRAINING')`,
      ),
      this.prisma.event.count({ where: { ...eventInRange, recurrenceId: { not: null } } }),
      this.prisma.event.count({ where: eventInRange }),
      this.weekly(
        from,
        to,
        Prisma.sql`SELECT e."startsAt" AS ts,
            (SELECT count(*) FROM "EventRsvp" r WHERE r."eventId" = e."id") AS answered,
            (SELECT count(*) FROM "TeamPlayer" tp WHERE tp."teamId" = e."teamId") AS roster
          FROM "Event" e
          WHERE e."startsAt" >= ${from} AND e."startsAt" < ${pastEnd} AND ${scope.teamSql('e."teamId"')}`,
        Prisma.sql`COALESCE(sum(answered), 0)`,
        Prisma.sql`COALESCE(sum(roster), 0)`,
      ),
      this.prisma.eventRsvp.groupBy({
        by: ['status'],
        where: { event: eventInRange },
        _count: { _all: true },
      }),
      this.countGuardianAnswers(scope, from, to),
      this.weekly(
        from,
        to,
        Prisma.sql`SELECT ec."convokedAt" AS ts FROM "EventConvocation" ec
          JOIN "Event" e ON e."id" = ec."eventId"
          WHERE ${scope.teamSql('e."teamId"')}`,
      ),
      this.countMatchesWithMeetingPoint(scope, from, to),
      this.prisma.eventRsvp.groupBy({
        by: ['travelMode'],
        where: { status: 'GOING', event: eventInRange },
        _count: { _all: true },
      }),
      this.prisma.eventVote.count({ where: { event: eventInRange } }),
      this.prisma.event.count({ where: { ...pastEventInRange, type: 'MATCH' } }),
      this.prisma.event.count({
        where: { ...pastEventInRange, type: 'MATCH', scoresheet: { isNot: null } },
      }),
      this.weekly(
        from,
        to,
        Prisma.sql`SELECT pg."createdAt" AS ts FROM "PlayerGuardian" pg
          JOIN "Player" p ON p."id" = pg."playerId"
          WHERE ${scope.playerSql('p')}`,
      ),
      this.prisma.user.count({ where: scope.user }),
      this.prisma.user.count({ where: { ...scope.user, emailNotificationsEnabled: false } }),
      this.prisma.user.count({ where: { ...scope.user, pushSubscriptions: { some: {} } } }),
      this.prisma.club.count({ where: { ...scope.club, ffbbClubCode: { not: null } } }),
      this.prisma.team.count({ where: { ...scope.team, ffbbLinks: { some: {} } } }),
    ]);

    const answered = rsvpByWeek.reduce((sum, row) => sum + row.a, 0);
    const roster = rsvpByWeek.reduce((sum, row) => sum + row.b, 0);
    const rsvpCount = (status: 'GOING' | 'NOT_GOING' | 'MAYBE') =>
      rsvpSplit.find((row) => row.status === status)?._count._all ?? 0;
    const travelCount = (mode: 'MEETING_POINT' | 'DIRECT') =>
      travelSplit.find((row) => row.travelMode === mode)?._count._all ?? 0;

    return {
      matchesByWeek: eventsByWeek.map((row) => ({ weekStart: row.weekStart, value: row.a })),
      trainingsByWeek: eventsByWeek.map((row) => ({ weekStart: row.weekStart, value: row.b })),
      recurringShare: ratio(recurringEvents, rangeEvents),
      rsvpResponseRate: ratio(answered, roster),
      rsvpResponseRateByWeek: rsvpByWeek.map((row) => ({
        weekStart: row.weekStart,
        value: ratio(row.a, row.b),
      })),
      rsvpSplit: {
        going: rsvpCount('GOING'),
        notGoing: rsvpCount('NOT_GOING'),
        maybe: rsvpCount('MAYBE'),
      },
      guardianAnswers,
      convocationsByWeek: countSeries(convocationsByWeek),
      matchesWithMeetingPointShare: ratio(matches.withMeetingPoint, matches.total),
      travelSplit: { meetingPoint: travelCount('MEETING_POINT'), direct: travelCount('DIRECT') },
      votesCast,
      scoresheetCoverage: ratio(pastMatchesWithSheet, pastMatches),
      guardianLinksByWeek: countSeries(guardianLinksByWeek),
      emailOptOutShare: ratio(optedOut, users),
      pushEnabledUsers,
      ffbbLinkedClubs,
      ffbbLinkedTeams,
    };
  }

  private async health(
    scope: Scope,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<AdminStats['health']> {
    const sheetScope = scope.clubId ? { event: scope.event } : {};
    const inviteScope = scope.clubId ? { player: { clubId: scope.clubId } } : {};
    const minorBound = minorBirthDateBound(now);

    const [
      sheetsByStatus,
      attempts,
      needsReview,
      stuckScoresheets,
      unverifiedUsers,
      unverifiedOlderThan7d,
      playerInvitesLive,
      playerInvitesExpired,
      guardianInvitesLive,
      guardianInvitesExpired,
      minorsMissingConsent,
      accountsNearingErasure,
      clubsWithoutAdmin,
      teamsWithoutManager,
      lastRun,
      upcomingMatches,
    ] = await Promise.all([
      this.prisma.eventScoresheet.groupBy({
        by: ['status'],
        where: { ...sheetScope, uploadedAt: { gte: from, lt: to } },
        _count: { _all: true },
      }),
      this.prisma.scoresheetExtraction.aggregate({
        where: { eventScoresheet: { ...sheetScope, uploadedAt: { gte: from, lt: to } } },
        _avg: { attemptCount: true },
      }),
      this.prisma.eventScoresheet.count({ where: { ...sheetScope, status: 'NEEDS_REVIEW' } }),
      this.prisma.eventScoresheet.count({
        where: {
          ...sheetScope,
          status: { in: ['QUEUED', 'PROCESSING'] },
          uploadedAt: { lt: new Date(now.getTime() - ADMIN_OCR_STUCK_AFTER_MS) },
        },
      }),
      this.prisma.user.count({ where: { ...scope.user, emailVerifiedAt: null } }),
      this.prisma.user.count({
        where: {
          ...scope.user,
          emailVerifiedAt: null,
          createdAt: { lt: new Date(now.getTime() - UNVERIFIED_GRACE_DAYS * DAY_MS) },
        },
      }),
      this.prisma.playerInvite.count({
        where: { ...inviteScope, acceptedAt: null, expiresAt: { gt: now } },
      }),
      this.prisma.playerInvite.count({
        where: { ...inviteScope, acceptedAt: null, expiresAt: { lte: now } },
      }),
      this.prisma.guardianInvite.count({
        where: { ...inviteScope, acceptedAt: null, expiresAt: { gt: now } },
      }),
      this.prisma.guardianInvite.count({
        where: { ...inviteScope, acceptedAt: null, expiresAt: { lte: now } },
      }),
      this.prisma.player.count({
        where: { ...scope.player, birthDate: { gt: minorBound }, parentalConsents: { none: {} } },
      }),
      this.prisma.user.count({
        where: {
          ...scope.user,
          lastActiveAt: {
            lt: subMonths(now, INACTIVE_ACCOUNT_RETENTION_MONTHS - INACTIVE_SOON_LEAD_MONTHS),
          },
        },
      }),
      this.prisma.club.count({
        where: { ...scope.club, memberships: { none: { role: 'ADMIN' } } },
      }),
      this.prisma.team.count({ where: { ...scope.team, teamAdmins: { none: {} } } }),
      this.prisma.retentionRun.findFirst({
        where: { dryRun: false },
        orderBy: { ranAt: 'desc' },
        select: { ranAt: true, summary: true },
      }),
      this.prisma.event.findMany({
        where: {
          ...scope.event,
          type: 'MATCH',
          startsAt: { gte: now, lt: new Date(now.getTime() + MEETING_LOOKAHEAD_DAYS * DAY_MS) },
        },
        select: {
          type: true,
          startsAt: true,
          location: true,
          meeting: {
            select: {
              meetingPointName: true,
              meetingPointAddress: true,
              travelMinutes: true,
              travelMinutesManual: true,
              travelRouteKey: true,
              meetsAtOverride: true,
            },
          },
          team: {
            select: {
              meetingPointName: true,
              meetingPointAddress: true,
              arrivalBufferMinutes: true,
              clubTeams: {
                where: { isOwner: true },
                select: {
                  club: {
                    select: {
                      meetingPointName: true,
                      meetingPointAddress: true,
                      arrivalBufferMinutes: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const scoresheetsByStatus = Object.fromEntries(
      SCORESHEET_STATUSES.map((status) => [
        status,
        sheetsByStatus.find((row) => row.status === status)?._count._all ?? 0,
      ]),
    ) as Record<EventScoresheetStatus, number>;
    const totalSheets = Object.values(scoresheetsByStatus).reduce((sum, n) => sum + n, 0);

    return {
      scoresheetsByStatus,
      ocrFailureRate: ratio(scoresheetsByStatus.FAILED, totalSheets),
      avgOcrAttempts: attempts._avg.attemptCount,
      needsReview,
      stuckScoresheets,
      unverifiedUsers,
      unverifiedOlderThan7d,
      pendingPlayerInvites: { live: playerInvitesLive, expired: playerInvitesExpired },
      pendingGuardianInvites: { live: guardianInvitesLive, expired: guardianInvitesExpired },
      minorsMissingConsent,
      accountsNearingErasure,
      clubsWithoutAdmin,
      teamsWithoutManager,
      lastRetentionRun: lastRun
        ? { ranAt: lastRun.ranAt.toISOString(), ok: retentionRunOk(lastRun.summary) }
        : null,
      staleMeetingRoutes: upcomingMatches.filter((match) =>
        isTravelStale(match, match.meeting, match.team, match.team.clubTeams[0]?.club ?? null),
      ).length,
    };
  }

  /** Teams linked to two clubs or more, among the scope's teams. */
  private async countCtcTeams(scope: Scope): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM (
        SELECT ct."teamId" FROM "ClubTeam" ct
        WHERE ${scope.teamSql('ct."teamId"')}
        GROUP BY ct."teamId" HAVING count(*) > 1
      ) ctc`;
    return rows[0]?.count ?? 0;
  }

  /**
   * Answers given by an account other than the player's own — a parent.
   * A column comparison Prisma's filters can't express, hence SQL.
   */
  private async countGuardianAnswers(scope: Scope, from: Date, to: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "EventRsvp" r
      JOIN "Event" e ON e."id" = r."eventId"
      JOIN "TeamPlayer" tp ON tp."id" = r."teamPlayerId"
      JOIN "Player" p ON p."id" = tp."playerId"
      WHERE e."startsAt" >= ${from} AND e."startsAt" < ${to}
        AND r."respondedByUserId" IS NOT NULL
        AND r."respondedByUserId" IS DISTINCT FROM p."userId"
        AND ${scope.teamSql('e."teamId"')}`;
    return rows[0]?.count ?? 0;
  }

  /**
   * One zero-filled weekly series. `source` selects a `ts` timestamp (plus
   * whatever the aggregates read); `a` and `b` are the per-week aggregates,
   * `count(*)` and nothing by default. Weeks run Monday to Sunday in
   * Europe/Paris, from the week holding `from` to the one holding `to`.
   * Timestamps are stored as UTC `timestamp(3)`, hence the double AT TIME ZONE.
   */
  /**
   * Matches in range, and those with a meeting point at any level (the match's
   * own override, its team's default, its owner club's default — the order
   * `resolveMeetingPlan` reads them in). One SQL count: it used to load every
   * match with three nested selects, unbounded for `range=all`.
   */
  private async countMatchesWithMeetingPoint(
    scope: Scope,
    from: Date,
    to: Date,
  ): Promise<{ total: number; withMeetingPoint: number }> {
    const set = (alias: string) =>
      Prisma.raw(
        `(COALESCE(${alias}."meetingPointName", '') <> '' AND COALESCE(${alias}."meetingPointAddress", '') <> '')`,
      );
    const [row] = await this.prisma.$queryRaw<{ total: number; withMeetingPoint: number }[]>`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE ${set('m')} OR ${set('t')} OR ${set('c')})::int AS "withMeetingPoint"
      FROM "Event" e
      JOIN "Team" t ON t."id" = e."teamId"
      LEFT JOIN "EventMeeting" m ON m."eventId" = e."id"
      LEFT JOIN "ClubTeam" o ON o."teamId" = t."id" AND o."isOwner" = TRUE
      LEFT JOIN "Club" c ON c."id" = o."clubId"
      WHERE e."type" = 'MATCH' AND e."startsAt" >= ${from} AND e."startsAt" < ${to}
        AND ${scope.teamSql('e."teamId"')}`;
    return row ?? { total: 0, withMeetingPoint: 0 };
  }

  private async weekly(
    from: Date,
    to: Date,
    source: Prisma.Sql,
    a: Prisma.Sql = Prisma.sql`count(*)`,
    b: Prisma.Sql = Prisma.sql`0`,
  ): Promise<WeekRow[]> {
    return this.prisma.$queryRaw<WeekRow[]>`
      WITH weeks AS (
        SELECT generate_series(
          date_trunc('week', ${from.toISOString()}::timestamptz AT TIME ZONE 'Europe/Paris'),
          date_trunc('week', ${to.toISOString()}::timestamptz AT TIME ZONE 'Europe/Paris'),
          interval '1 week'
        ) AS week
      ),
      src AS (${source}),
      counted AS (
        SELECT date_trunc('week', (ts AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris') AS week,
          (${a})::int AS a, (${b})::int AS b
        FROM src
        GROUP BY 1
      )
      SELECT to_char(w.week, 'YYYY-MM-DD') AS "weekStart",
        COALESCE(c.a, 0)::int AS a, COALESCE(c.b, 0)::int AS b
      FROM weeks w LEFT JOIN counted c ON c.week = w.week
      ORDER BY w.week`;
  }
}

function countSeries(rows: WeekRow[]): AdminStatPoint[] {
  return rows.map((row) => ({ weekStart: row.weekStart, value: row.a }));
}

/** A sweep with any step in error is not OK, whatever the others did. */
function retentionRunOk(summary: Prisma.JsonValue): boolean {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return false;
  return Object.values(summary).every(
    (step) =>
      !!step &&
      typeof step === 'object' &&
      !Array.isArray(step) &&
      (step as Record<string, unknown>).status !== 'error',
  );
}

/**
 * What « this club » means for each kind of row, as a Prisma filter and as a
 * SQL predicate. Empty (everything) without a club.
 */
class Scope {
  constructor(readonly clubId: string | undefined) {}

  get user(): Prisma.UserWhereInput {
    return this.clubId ? { memberships: { some: { clubId: this.clubId } } } : {};
  }

  get club(): Prisma.ClubWhereInput {
    return this.clubId ? { id: this.clubId } : {};
  }

  get team(): Prisma.TeamWhereInput {
    return this.clubId ? { clubTeams: { some: { clubId: this.clubId } } } : {};
  }

  get player(): Prisma.PlayerWhereInput {
    return this.clubId ? { clubId: this.clubId } : {};
  }

  get event(): Prisma.EventWhereInput {
    return this.clubId ? { team: this.team } : {};
  }

  userSql(alias: string): Prisma.Sql {
    return this.clubId
      ? Prisma.sql`EXISTS (SELECT 1 FROM "ClubMembership" m WHERE m."userId" = ${Prisma.raw(`${alias}."id"`)} AND m."clubId" = ${this.clubId})`
      : Prisma.sql`TRUE`;
  }

  clubSql(alias: string): Prisma.Sql {
    return this.clubId
      ? Prisma.sql`${Prisma.raw(`${alias}."id"`)} = ${this.clubId}`
      : Prisma.sql`TRUE`;
  }

  /** `teamColumn` is a trusted, code-written column reference, never input. */
  teamSql(teamColumn: string): Prisma.Sql {
    return this.clubId
      ? Prisma.sql`EXISTS (SELECT 1 FROM "ClubTeam" s WHERE s."teamId" = ${Prisma.raw(teamColumn)} AND s."clubId" = ${this.clubId})`
      : Prisma.sql`TRUE`;
  }

  playerSql(alias: string): Prisma.Sql {
    return this.clubId
      ? Prisma.sql`${Prisma.raw(`${alias}."clubId"`)} = ${this.clubId}`
      : Prisma.sql`TRUE`;
  }
}
