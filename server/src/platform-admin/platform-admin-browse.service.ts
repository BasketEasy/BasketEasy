import { Injectable, NotFoundException } from '@nestjs/common';
import type { PlatformRole, Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import type {
  AdminBooleanParam,
  AdminClubDetail,
  AdminClubMember,
  AdminClubMembersQuery,
  AdminClubsQuery,
  AdminClubSummary,
  AdminConsentState,
  AdminEventDetail,
  AdminEventsQuery,
  AdminEventSummary,
  AdminInviteState,
  AdminPlayerDetail,
  AdminPlayersQuery,
  AdminPlayerSummary,
  AdminRosterEntry,
  AdminScoresheetsQuery,
  AdminScoresheetSummary,
  AdminTeamDetail,
  AdminTeamRef,
  AdminTeamsQuery,
  AdminTeamSummary,
  AdminUserDetail,
  AdminUsersQuery,
  AdminUserSummary,
} from '@basketeasy/types/platform-admin-browse';
import type { EventScoresheetStatus } from '@basketeasy/types/events';
import { isMinorBirthDate, MINOR_AGE_YEARS } from '@basketeasy/types/parental-consent';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolvePagination } from '../common/pagination';
import {
  INACTIVE_ACCOUNT_RETENTION_MONTHS,
  INACTIVE_SOON_LEAD_MONTHS,
  subMonths,
} from '../retention/retention.constants';
import { auditContextOf } from './audit-context';
import { playerRef, redactName, userRef } from './redaction';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Below this a person search is ignored rather than matching half the base. */
const MIN_QUERY_LENGTH = 2;

/** The caller, as the guard and JwtAuthGuard resolved them. */
export interface PlatformActor {
  id: string;
  email: string;
  role: PlatformRole;
}

const teamRefSelect = {
  id: true,
  name: true,
  category: true,
  gender: true,
} satisfies Prisma.TeamSelect;

const clubRefSelect = { id: true, name: true } satisfies Prisma.ClubSelect;

const personSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

const playerPersonSelect = {
  id: true,
  firstName: true,
  lastName: true,
  user: { select: { email: true } },
} satisfies Prisma.PlayerSelect;

/**
 * Read-only browsing over the club graph for the platform back-office.
 *
 * Queries PrismaService directly rather than injecting ClubsService /
 * TeamsService / EventsService — the same cross-module convention as
 * Events, Dashboard and Team stats — because none of those services has a
 * platform-wide read (every one is scoped to a club the caller belongs to).
 *
 * Every list is one `count` plus one `findMany` (plus at most one `groupBy`
 * for a counter Prisma can't express as `_count`), never a query per row.
 * Every person goes through `userRef` / `playerRef`, so what a SUPPORT caller
 * receives is decided here, once.
 *
 * Only the two person detail reads (user, player) are audited, and only for a
 * DATA_OFFICER: a SUPPORT response carries no personal data to log a view of.
 */
@Injectable()
export class PlatformAdminBrowseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ clubs

  async listClubs(query: AdminClubsQuery): Promise<PaginatedResult<AdminClubSummary>> {
    const { page, pageSize, skip, take } = resolvePagination(query.page, query.pageSize);
    const and: Prisma.ClubWhereInput[] = [];
    const q = normaliseQuery(query.q);
    if (q) {
      and.push({
        OR: [{ name: { contains: q, mode: 'insensitive' } }, { ffbbClubCode: q.toUpperCase() }],
      });
    }
    const hasAdmin = parseBoolean(query.hasAdmin);
    if (hasAdmin !== undefined) {
      and.push({
        memberships: hasAdmin ? { some: { role: 'ADMIN' } } : { none: { role: 'ADMIN' } },
      });
    }
    const where: Prisma.ClubWhereInput = { AND: and };
    const order = query.order ?? (query.sort === 'createdAt' ? 'desc' : 'asc');

    const [total, clubs] = await Promise.all([
      this.prisma.club.count({ where }),
      this.prisma.club.findMany({
        where,
        orderBy: query.sort === 'createdAt' ? { createdAt: order } : { name: order },
        skip,
        take,
        select: clubSummarySelect,
      }),
    ]);
    const adminCounts = await this.countClubAdmins(clubs.map((club) => club.id));

    return {
      items: clubs.map((club) => toClubSummary(club, adminCounts.get(club.id) ?? 0)),
      total,
      page,
      pageSize,
    };
  }

  async getClub(clubId: string): Promise<AdminClubDetail> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        ...clubSummarySelect,
        meetingPointName: true,
        meetingPointAddress: true,
        arrivalBufferMinutes: true,
      },
    });
    if (!club) {
      throw new NotFoundException('Club introuvable');
    }
    const adminCounts = await this.countClubAdmins([club.id]);
    return {
      ...toClubSummary(club, adminCounts.get(club.id) ?? 0),
      meetingPointName: club.meetingPointName,
      meetingPointAddress: club.meetingPointAddress,
      arrivalBufferMinutes: club.arrivalBufferMinutes,
    };
  }

  async listClubMembers(
    role: PlatformRole,
    clubId: string,
    query: AdminClubMembersQuery,
  ): Promise<PaginatedResult<AdminClubMember>> {
    await this.assertExists('club', clubId);
    const { page, pageSize, skip, take } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.ClubMembershipWhereInput = {
      clubId,
      ...(query.role ? { role: query.role } : {}),
    };

    const [total, memberships] = await Promise.all([
      this.prisma.clubMembership.count({ where }),
      this.prisma.clubMembership.findMany({
        where,
        // ClubRole's declaration order puts ADMIN first.
        orderBy: [{ role: 'asc' }, { user: { lastName: 'asc' } }, { createdAt: 'asc' }],
        skip,
        take,
        select: { role: true, createdAt: true, user: { select: personSelect } },
      }),
    ]);

    return {
      items: memberships.map((membership) => ({
        person: userRef(role, membership.user),
        role: membership.role,
        joinedAt: membership.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  // ------------------------------------------------------------------ teams

  async listTeams(query: AdminTeamsQuery): Promise<PaginatedResult<AdminTeamSummary>> {
    const { page, pageSize, skip, take } = resolvePagination(query.page, query.pageSize);
    const and: Prisma.TeamWhereInput[] = [];
    const q = normaliseQuery(query.q);
    if (q) and.push({ name: { contains: q, mode: 'insensitive' } });
    if (query.clubId) and.push({ clubTeams: { some: { clubId: query.clubId } } });
    if (query.category) and.push({ category: query.category });
    if (query.gender) and.push({ gender: query.gender });
    const hasAdmin = parseBoolean(query.hasAdmin);
    if (hasAdmin !== undefined) {
      and.push({ teamAdmins: hasAdmin ? { some: {} } : { none: {} } });
    }
    const where: Prisma.TeamWhereInput = { AND: and };

    const [total, teams] = await Promise.all([
      this.prisma.team.count({ where }),
      this.prisma.team.findMany({
        where,
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
        skip,
        take,
        select: teamSummarySelect,
      }),
    ]);

    return { items: teams.map(toTeamSummary), total, page, pageSize };
  }

  async getTeam(role: PlatformRole, teamId: string): Promise<AdminTeamDetail> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        ...teamSummarySelect,
        teamAdmins: {
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true, user: { select: personSelect } },
        },
        ffbbLinks: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, ffbbEngagementRef: true, ffbbEngagementLabel: true },
        },
      },
    });
    if (!team) {
      throw new NotFoundException('Équipe introuvable');
    }
    return {
      ...toTeamSummary(team),
      teamAdmins: team.teamAdmins.map((grant) => ({
        person: userRef(role, grant.user),
        grantedAt: grant.createdAt.toISOString(),
      })),
      ffbbLinks: team.ffbbLinks.map((link) => ({
        id: link.id,
        engagementRef: link.ffbbEngagementRef,
        label: link.ffbbEngagementLabel,
      })),
    };
  }

  /** Not paginated: a roster is bounded by the sport. */
  async getTeamRoster(role: PlatformRole, teamId: string): Promise<AdminRosterEntry[]> {
    await this.assertExists('team', teamId);
    const entries = await this.prisma.teamPlayer.findMany({
      where: { teamId },
      // TeamMemberRole's declaration order puts COACH first.
      orderBy: [{ role: 'asc' }, { player: { lastName: 'asc' } }, { createdAt: 'asc' }],
      select: {
        id: true,
        role: true,
        createdAt: true,
        player: {
          select: {
            ...playerPersonSelect,
            club: { select: clubRefSelect },
            user: { select: personSelect },
          },
        },
      },
    });

    return entries.map((entry) => ({
      teamPlayerId: entry.id,
      player: playerRef(role, entry.player),
      club: entry.player.club,
      role: entry.role,
      linkedUser: entry.player.user ? userRef(role, entry.player.user) : null,
      joinedAt: entry.createdAt.toISOString(),
    }));
  }

  // ------------------------------------------------------------------ users

  async listUsers(
    role: PlatformRole,
    query: AdminUsersQuery,
  ): Promise<PaginatedResult<AdminUserSummary>> {
    const { page, pageSize, skip, take } = resolvePagination(query.page, query.pageSize);
    const now = new Date();
    const and: Prisma.UserWhereInput[] = [];

    const q = normaliseQuery(query.q);
    if (q) and.push(userSearchWhere(role, q));
    if (query.clubId || query.clubRole) {
      and.push({
        memberships: {
          some: {
            ...(query.clubId ? { clubId: query.clubId } : {}),
            ...(query.clubRole ? { role: query.clubRole } : {}),
          },
        },
      });
    }
    if (query.teamId) {
      // "The users of a team": its managers, the accounts linked to its
      // roster, and the parents of anyone on it.
      const onTeam = { teamPlayers: { some: { teamId: query.teamId } } };
      and.push({
        OR: [
          { teamAdmins: { some: { teamId: query.teamId } } },
          { linkedPlayers: { some: onTeam } },
          { guardianOf: { some: { player: onTeam } } },
        ],
      });
    }
    const verified = parseBoolean(query.verified);
    if (verified !== undefined) {
      and.push({ emailVerifiedAt: verified ? { not: null } : null });
    }
    const inactiveSoon = parseBoolean(query.inactiveSoon);
    if (inactiveSoon) {
      // No lower bound on purpose: an account already past the cutoff that
      // the sweep has not yet taken belongs on the same list, with a
      // negative countdown, not hidden.
      and.push({
        lastActiveAt: {
          lt: subMonths(now, INACTIVE_ACCOUNT_RETENTION_MONTHS - INACTIVE_SOON_LEAD_MONTHS),
        },
      });
    }
    const isGuardian = parseBoolean(query.isGuardian);
    if (isGuardian !== undefined) {
      and.push({ guardianOf: isGuardian ? { some: {} } : { none: {} } });
    }
    const hasPlatformRole = parseBoolean(query.hasPlatformRole);
    if (hasPlatformRole !== undefined) {
      and.push({ platformAdmin: hasPlatformRole ? { isNot: null } : { is: null } });
    }
    const where: Prisma.UserWhereInput = { AND: and };

    // The inactivity list reads oldest-first: the next account the sweep
    // takes is at the top.
    const sort = query.sort ?? (inactiveSoon ? 'lastActiveAt' : 'createdAt');
    const order = query.order ?? (inactiveSoon ? 'asc' : 'desc');

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ [sort]: order }, { id: 'asc' }],
        skip,
        take,
        select: userSummarySelect,
      }),
    ]);

    return {
      items: users.map((user) => toUserSummary(role, user, now)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * A DATA_OFFICER's read is the audited ADMIN_PII_VIEWED moment, and the row
   * is awaited *before* the profile is returned: a crash between the two
   * would lose exactly the evidence the log exists for. A SUPPORT read
   * carries no personal data and is not logged.
   */
  async getUser(actor: PlatformActor, userId: string, request: Request): Promise<AdminUserDetail> {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...userSummarySelect,
        memberships: {
          orderBy: { createdAt: 'asc' },
          select: { role: true, createdAt: true, club: { select: clubRefSelect } },
        },
        teamAdmins: {
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true, team: { select: teamRefSelect } },
        },
        linkedPlayers: {
          orderBy: { createdAt: 'asc' },
          select: {
            ...playerPersonSelect,
            club: { select: clubRefSelect },
            teamPlayers: { select: { team: { select: teamRefSelect } } },
          },
        },
        guardianOf: {
          orderBy: { createdAt: 'asc' },
          select: {
            createdAt: true,
            player: { select: { ...playerPersonSelect, club: { select: clubRefSelect } } },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Compte introuvable');
    }

    const activeSessionCount = await this.prisma.refreshToken.count({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
    });

    if (actor.role === 'DATA_OFFICER') {
      await this.audit.recordAndWait({
        type: 'ADMIN_PII_VIEWED',
        userId: actor.id,
        actorEmail: actor.email,
        metadata: { subjectUserId: userId, subjectEmail: user.email },
        context: auditContextOf(request),
      });
    }

    return {
      ...toUserSummary(actor.role, user, now),
      memberships: user.memberships.map((membership) => ({
        club: membership.club,
        role: membership.role,
        joinedAt: membership.createdAt.toISOString(),
      })),
      teamAdminOf: user.teamAdmins.map((grant) => ({
        team: grant.team,
        grantedAt: grant.createdAt.toISOString(),
      })),
      linkedPlayers: user.linkedPlayers.map((player) => ({
        player: playerRef(actor.role, player),
        club: player.club,
        teams: player.teamPlayers.map((entry) => entry.team),
      })),
      guardianOf: user.guardianOf.map((link) => ({
        player: playerRef(actor.role, link.player),
        club: link.player.club,
        linkedAt: link.createdAt.toISOString(),
      })),
      activeSessionCount,
    };
  }

  // ---------------------------------------------------------------- players

  async listPlayers(
    role: PlatformRole,
    query: AdminPlayersQuery,
  ): Promise<PaginatedResult<AdminPlayerSummary>> {
    const { page, pageSize, skip, take } = resolvePagination(query.page, query.pageSize);
    const now = new Date();
    const minorBound = minorBirthDateBound(now);
    const and: Prisma.PlayerWhereInput[] = [];

    const q = normaliseQuery(query.q);
    if (q) and.push(playerSearchWhere(role, q));
    if (query.clubId) and.push({ clubId: query.clubId });
    if (query.teamId) and.push({ teamPlayers: { some: { teamId: query.teamId } } });
    const claimed = parseBoolean(query.claimed);
    if (claimed !== undefined) and.push({ userId: claimed ? { not: null } : null });
    const minor = parseBoolean(query.minor);
    if (minor !== undefined) {
      // An unknown birth date is neither: it matches no value of the filter.
      and.push({ birthDate: minor ? { gt: minorBound } : { lte: minorBound } });
    }
    const missingConsent = parseBoolean(query.missingConsent);
    if (missingConsent === true) {
      and.push({ birthDate: { gt: minorBound }, parentalConsents: { none: {} } });
    } else if (missingConsent === false) {
      and.push({
        OR: [
          { birthDate: null },
          { birthDate: { lte: minorBound } },
          { parentalConsents: { some: {} } },
        ],
      });
    }
    const where: Prisma.PlayerWhereInput = { AND: and };

    const [total, players] = await Promise.all([
      this.prisma.player.count({ where }),
      this.prisma.player.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        skip,
        take,
        select: playerSummarySelect,
      }),
    ]);

    return {
      items: players.map((player) => toPlayerSummary(role, player, now)),
      total,
      page,
      pageSize,
    };
  }

  /** Same audit rule as `getUser`, with the player as the subject. */
  async getPlayer(
    actor: PlatformActor,
    playerId: string,
    request: Request,
  ): Promise<AdminPlayerDetail> {
    const now = new Date();
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: {
        ...playerSummarySelect,
        gender: true,
        licenseNumber: true,
        user: { select: personSelect },
        teamPlayers: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, team: { select: teamRefSelect } },
        },
        guardians: {
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true, user: { select: personSelect } },
        },
        guardianInvites: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, createdAt: true, expiresAt: true, acceptedAt: true },
        },
        invite: { select: { createdAt: true, expiresAt: true, acceptedAt: true } },
        parentalConsents: {
          orderBy: { consentGivenAt: 'desc' },
          select: { id: true, source: true, attestedByName: true, consentGivenAt: true },
        },
      },
    });
    if (!player) {
      throw new NotFoundException('Joueur introuvable');
    }

    const full = actor.role === 'DATA_OFFICER';
    if (full) {
      await this.audit.recordAndWait({
        type: 'ADMIN_PII_VIEWED',
        userId: actor.id,
        actorEmail: actor.email,
        metadata: {
          subjectPlayerId: playerId,
          ...(player.userId ? { subjectUserId: player.userId } : {}),
        },
        context: auditContextOf(request),
      });
    }

    return {
      ...toPlayerSummary(actor.role, player, now),
      birthDate: full && player.birthDate ? player.birthDate.toISOString() : null,
      licenseNumber: full ? player.licenseNumber : null,
      gender: player.gender,
      linkedUser: player.user ? userRef(actor.role, player.user) : null,
      teams: player.teamPlayers.map((entry) => ({
        teamPlayerId: entry.id,
        team: entry.team,
        role: entry.role,
      })),
      guardians: player.guardians.map((link) => ({
        person: userRef(actor.role, link.user),
        linkedAt: link.createdAt.toISOString(),
      })),
      guardianInvites: player.guardianInvites.map((invite) => ({
        id: invite.id,
        createdAt: invite.createdAt.toISOString(),
        expiresAt: invite.expiresAt.toISOString(),
        state: inviteStateOf(invite, now),
      })),
      playerInvite: player.invite
        ? {
            createdAt: player.invite.createdAt.toISOString(),
            expiresAt: player.invite.expiresAt.toISOString(),
            state: inviteStateOf(player.invite, now),
          }
        : null,
      consents: player.parentalConsents.map((consent) => ({
        id: consent.id,
        source: consent.source,
        attestedBy: redactName(actor.role, consent.attestedByName),
        consentGivenAt: consent.consentGivenAt.toISOString(),
      })),
    };
  }

  // ----------------------------------------------------------------- events

  async listEvents(query: AdminEventsQuery): Promise<PaginatedResult<AdminEventSummary>> {
    const { page, pageSize, skip, take } = resolvePagination(query.page, query.pageSize);
    const and: Prisma.EventWhereInput[] = [];
    if (query.teamId) and.push({ teamId: query.teamId });
    if (query.clubId) and.push({ team: { clubTeams: { some: { clubId: query.clubId } } } });
    if (query.type) and.push({ type: query.type });
    if (query.from) and.push({ startsAt: { gte: new Date(query.from) } });
    if (query.to) and.push({ startsAt: { lt: new Date(query.to) } });
    if (query.scoresheetStatus) and.push({ scoresheet: { status: query.scoresheetStatus } });
    const where: Prisma.EventWhereInput = { AND: and };

    const [total, events] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
        select: eventSummarySelect,
      }),
    ]);
    const rsvpCounts = await this.countRsvps(events.map((event) => event.id));

    return {
      items: events.map((event) => toEventSummary(event, rsvpCounts.get(event.id))),
      total,
      page,
      pageSize,
    };
  }

  async getEvent(role: PlatformRole, eventId: string): Promise<AdminEventDetail> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        ...eventSummarySelect,
        venue: true,
        notes: true,
        recurrenceId: true,
        team: {
          select: {
            ...teamRefSelect,
            teamPlayers: {
              orderBy: [{ role: 'asc' }, { player: { lastName: 'asc' } }],
              select: { id: true, role: true, player: { select: playerPersonSelect } },
            },
          },
        },
        rsvps: {
          select: {
            teamPlayerId: true,
            status: true,
            respondedBy: { select: personSelect },
          },
        },
        convocations: { select: { teamPlayerId: true } },
        scoresheet: { select: scoresheetSelect },
      },
    });
    if (!event) {
      throw new NotFoundException('Événement introuvable');
    }

    const rsvpByPlayer = new Map(event.rsvps.map((rsvp) => [rsvp.teamPlayerId, rsvp]));
    const convoked = new Set(event.convocations.map((row) => row.teamPlayerId));
    const counts = { going: 0, notGoing: 0, maybe: 0 };
    for (const rsvp of event.rsvps) addRsvp(counts, rsvp.status, 1);

    return {
      ...toEventSummary(event, counts),
      venue: event.venue,
      notes: event.notes,
      recurrenceId: event.recurrenceId,
      roster: event.team.teamPlayers.map((entry) => {
        const rsvp = rsvpByPlayer.get(entry.id);
        return {
          teamPlayerId: entry.id,
          player: playerRef(role, entry.player),
          role: entry.role,
          rsvp: rsvp?.status ?? null,
          respondedBy: rsvp?.respondedBy ? userRef(role, rsvp.respondedBy) : null,
          convoked: convoked.has(entry.id),
        };
      }),
      scoresheet: event.scoresheet
        ? toScoresheetSummary({
            ...event.scoresheet,
            event: {
              id: event.id,
              startsAt: event.startsAt,
              opponentName: event.opponentName,
              team: event.team,
            },
          })
        : null,
    };
  }

  async listScoresheets(
    query: AdminScoresheetsQuery,
  ): Promise<PaginatedResult<AdminScoresheetSummary>> {
    const { page, pageSize, skip, take } = resolvePagination(query.page, query.pageSize);
    const and: Prisma.EventScoresheetWhereInput[] = [];
    const statuses = parseStatusList(query.status);
    if (statuses.length > 0) and.push({ status: { in: statuses } });
    if (query.clubId) {
      and.push({ event: { team: { clubTeams: { some: { clubId: query.clubId } } } } });
    }
    if (query.from) and.push({ uploadedAt: { gte: new Date(query.from) } });
    if (query.to) and.push({ uploadedAt: { lt: new Date(query.to) } });
    const where: Prisma.EventScoresheetWhereInput = { AND: and };

    const [total, sheets] = await Promise.all([
      this.prisma.eventScoresheet.count({ where }),
      this.prisma.eventScoresheet.findMany({
        where,
        orderBy: [{ uploadedAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
        select: {
          ...scoresheetSelect,
          event: {
            select: {
              id: true,
              startsAt: true,
              opponentName: true,
              team: { select: teamRefSelect },
            },
          },
        },
      }),
    ]);

    return { items: sheets.map(toScoresheetSummary), total, page, pageSize };
  }

  // ---------------------------------------------------------------- helpers

  private async countClubAdmins(clubIds: string[]): Promise<Map<string, number>> {
    if (clubIds.length === 0) return new Map();
    const rows = await this.prisma.clubMembership.groupBy({
      by: ['clubId'],
      where: { clubId: { in: clubIds }, role: 'ADMIN' },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.clubId, row._count._all]));
  }

  private async countRsvps(
    eventIds: string[],
  ): Promise<Map<string, AdminEventSummary['rsvpCounts']>> {
    const counts = new Map<string, AdminEventSummary['rsvpCounts']>();
    if (eventIds.length === 0) return counts;
    const rows = await this.prisma.eventRsvp.groupBy({
      by: ['eventId', 'status'],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    });
    for (const row of rows) {
      const current = counts.get(row.eventId) ?? { going: 0, notGoing: 0, maybe: 0 };
      addRsvp(current, row.status, row._count._all);
      counts.set(row.eventId, current);
    }
    return counts;
  }

  private async assertExists(kind: 'club' | 'team', id: string): Promise<void> {
    const found =
      kind === 'club'
        ? await this.prisma.club.findUnique({ where: { id }, select: { id: true } })
        : await this.prisma.team.findUnique({ where: { id }, select: { id: true } });
    if (!found) {
      throw new NotFoundException(kind === 'club' ? 'Club introuvable' : 'Équipe introuvable');
    }
  }
}

// ------------------------------------------------------------------ selects

const clubSummarySelect = {
  id: true,
  name: true,
  ffbbClubCode: true,
  createdAt: true,
  _count: { select: { memberships: true, clubTeams: true, players: true } },
} satisfies Prisma.ClubSelect;

const teamSummarySelect = {
  ...teamRefSelect,
  createdAt: true,
  clubTeams: {
    orderBy: { createdAt: 'asc' },
    select: { isOwner: true, club: { select: clubRefSelect } },
  },
  _count: { select: { teamPlayers: true, teamAdmins: true } },
} satisfies Prisma.TeamSelect;

const userSummarySelect = {
  ...personSelect,
  emailVerifiedAt: true,
  createdAt: true,
  lastActiveAt: true,
  platformAdmin: { select: { role: true } },
  _count: { select: { memberships: true, guardianOf: true } },
} satisfies Prisma.UserSelect;

const playerSummarySelect = {
  ...playerPersonSelect,
  userId: true,
  birthDate: true,
  createdAt: true,
  club: { select: clubRefSelect },
  _count: { select: { teamPlayers: true, parentalConsents: true } },
} satisfies Prisma.PlayerSelect;

const eventSummarySelect = {
  id: true,
  type: true,
  startsAt: true,
  location: true,
  opponentName: true,
  team: { select: teamRefSelect },
  scoresheet: { select: { status: true } },
  _count: { select: { convocations: true } },
} satisfies Prisma.EventSelect;

const scoresheetSelect = {
  id: true,
  status: true,
  uploadedAt: true,
  extraction: { select: { attemptCount: true, failureReason: true } },
} satisfies Prisma.EventScoresheetSelect;

// ----------------------------------------------------------------- mappers

type ClubSummaryRow = Prisma.ClubGetPayload<{ select: typeof clubSummarySelect }>;
type TeamSummaryRow = Prisma.TeamGetPayload<{ select: typeof teamSummarySelect }>;
type UserSummaryRow = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;
type PlayerSummaryRow = Prisma.PlayerGetPayload<{ select: typeof playerSummarySelect }>;
type EventSummaryRow = Prisma.EventGetPayload<{ select: typeof eventSummarySelect }>;
type ScoresheetRow = Prisma.EventScoresheetGetPayload<{ select: typeof scoresheetSelect }> & {
  event: { id: string; startsAt: Date; opponentName: string | null; team: AdminTeamRef };
};

function toClubSummary(club: ClubSummaryRow, adminCount: number): AdminClubSummary {
  return {
    id: club.id,
    name: club.name,
    ffbbClubCode: club.ffbbClubCode,
    createdAt: club.createdAt.toISOString(),
    memberCount: club._count.memberships,
    adminCount,
    teamCount: club._count.clubTeams,
    playerCount: club._count.players,
  };
}

function toTeamSummary(team: TeamSummaryRow): AdminTeamSummary {
  const owner = team.clubTeams.find((link) => link.isOwner);
  return {
    id: team.id,
    name: team.name,
    category: team.category,
    gender: team.gender,
    createdAt: team.createdAt.toISOString(),
    ownerClub: owner?.club ?? null,
    partnerClubs: team.clubTeams.filter((link) => !link.isOwner).map((link) => link.club),
    rosterCount: team._count.teamPlayers,
    teamAdminCount: team._count.teamAdmins,
  };
}

function toUserSummary(role: PlatformRole, user: UserSummaryRow, now: Date): AdminUserSummary {
  const erasureAt = new Date(user.lastActiveAt.getTime());
  erasureAt.setUTCMonth(erasureAt.getUTCMonth() + INACTIVE_ACCOUNT_RETENTION_MONTHS);
  return {
    person: userRef(role, user),
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
    lastActiveAt: user.lastActiveAt.toISOString(),
    daysUntilErasure: Math.ceil((erasureAt.getTime() - now.getTime()) / MS_PER_DAY),
    clubCount: user._count.memberships,
    guardianOfCount: user._count.guardianOf,
    platformRole: user.platformAdmin?.role ?? null,
  };
}

function toPlayerSummary(
  role: PlatformRole,
  player: PlayerSummaryRow,
  now: Date,
): AdminPlayerSummary {
  const isMinor = player.birthDate ? isMinorBirthDate(player.birthDate.toISOString(), now) : null;
  return {
    person: playerRef(role, player),
    club: player.club,
    linkedUserId: player.userId,
    isMinor,
    consentState: consentStateOf(isMinor, player._count.parentalConsents),
    teamCount: player._count.teamPlayers,
    createdAt: player.createdAt.toISOString(),
  };
}

function toEventSummary(
  event: EventSummaryRow,
  rsvpCounts: AdminEventSummary['rsvpCounts'] | undefined,
): AdminEventSummary {
  return {
    id: event.id,
    team: event.team,
    type: event.type,
    startsAt: event.startsAt.toISOString(),
    location: event.location,
    opponentName: event.opponentName,
    rsvpCounts: rsvpCounts ?? { going: 0, notGoing: 0, maybe: 0 },
    convocationCount: event._count.convocations,
    scoresheetStatus: event.scoresheet?.status ?? null,
  };
}

function toScoresheetSummary(sheet: ScoresheetRow): AdminScoresheetSummary {
  return {
    id: sheet.id,
    event: {
      id: sheet.event.id,
      startsAt: sheet.event.startsAt.toISOString(),
      opponentName: sheet.event.opponentName,
    },
    team: sheet.event.team,
    status: sheet.status,
    attemptCount: sheet.extraction?.attemptCount ?? null,
    failureReason: sheet.extraction?.failureReason ?? null,
    uploadedAt: sheet.uploadedAt.toISOString(),
  };
}

function consentStateOf(isMinor: boolean | null, consentCount: number): AdminConsentState {
  if (isMinor === null) return 'unknown';
  if (!isMinor) return 'not-required';
  return consentCount > 0 ? 'recorded' : 'missing';
}

function inviteStateOf(
  invite: { expiresAt: Date; acceptedAt: Date | null },
  now: Date,
): AdminInviteState {
  if (invite.acceptedAt) return 'accepted';
  return invite.expiresAt <= now ? 'expired' : 'live';
}

function addRsvp(
  counts: AdminEventSummary['rsvpCounts'],
  status: 'GOING' | 'NOT_GOING' | 'MAYBE',
  n: number,
): void {
  if (status === 'GOING') counts.going += n;
  else if (status === 'NOT_GOING') counts.notGoing += n;
  else counts.maybe += n;
}

// ----------------------------------------------------------------- filters

function normaliseQuery(q: string | undefined): string | null {
  const trimmed = q?.trim() ?? '';
  return trimmed.length >= MIN_QUERY_LENGTH ? trimmed : null;
}

function parseBoolean(value: AdminBooleanParam | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

const SCORESHEET_STATUSES: readonly EventScoresheetStatus[] = [
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'PARSED',
  'NEEDS_REVIEW',
  'CONFIRMED',
  'FAILED',
];

export function parseStatusList(value: string | undefined): EventScoresheetStatus[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is EventScoresheetStatus =>
      (SCORESHEET_STATUSES as readonly string[]).includes(part),
    );
}

/**
 * A birth date after this bound makes someone a minor today. The same rule
 * as `isMinorBirthDate`, turned into a date so it can run in SQL.
 */
export function minorBirthDateBound(now: Date): Date {
  const bound = new Date(now.getTime());
  bound.setUTCFullYear(bound.getUTCFullYear() - MINOR_AGE_YEARS);
  return bound;
}

/**
 * Free text is itself a way to read data, so what it may match depends on
 * the role. A DATA_OFFICER searches names and addresses by substring. SUPPORT
 * gets an exact e-mail match only — enough to find the person on the phone,
 * not enough to rebuild names a letter at a time from result counts. A name
 * typed by SUPPORT matches nothing rather than erroring, so the UI needs no
 * role branch to render it.
 */
export function userSearchWhere(role: PlatformRole, q: string): Prisma.UserWhereInput {
  if (role !== 'DATA_OFFICER') {
    return { email: { equals: q, mode: 'insensitive' } };
  }
  return {
    OR: [{ email: { contains: q, mode: 'insensitive' } }, ...nameSearchClauses(q)],
  };
}

export function playerSearchWhere(role: PlatformRole, q: string): Prisma.PlayerWhereInput {
  if (role !== 'DATA_OFFICER') {
    return { user: { email: { equals: q, mode: 'insensitive' } } };
  }
  return {
    OR: [{ user: { email: { contains: q, mode: 'insensitive' } } }, ...nameSearchClauses(q)],
  };
}

function nameSearchClauses(q: string): { firstName?: object; lastName?: object; AND?: object[] }[] {
  const clauses: { firstName?: object; lastName?: object; AND?: object[] }[] = [
    { firstName: { contains: q, mode: 'insensitive' } },
    { lastName: { contains: q, mode: 'insensitive' } },
  ];
  const space = q.indexOf(' ');
  if (space > 0) {
    const first = q.slice(0, space).trim();
    const last = q.slice(space + 1).trim();
    if (first && last) {
      clauses.push({
        AND: [
          { firstName: { contains: first, mode: 'insensitive' } },
          { lastName: { contains: last, mode: 'insensitive' } },
        ],
      });
    }
  }
  return clauses;
}
