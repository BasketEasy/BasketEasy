import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type {
  AuditLogEntry,
  ErasePlatformUserResponse,
  PlatformLoginResponse,
  PlatformUserDetail,
  PlatformUserExport,
  RedactedUserSummary,
  RetentionRunSummary,
  RetentionStepSummary,
} from '@basketeasy/types/platform-admin';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type AuditRequestContext } from '../audit/audit.service';
import { RetentionService } from '../retention/retention.service';
import {
  INACTIVE_ACCOUNT_RETENTION_MONTHS,
  INACTIVE_SOON_LEAD_MONTHS,
  subMonths,
} from '../retention/retention.constants';
import { clientIpOf, isIpAllowed } from './client-ip.util';
import {
  lockedUntilCleared,
  PLATFORM_LOGIN_MAX_ATTEMPTS,
  PLATFORM_LOGIN_WINDOW_MS,
  PLATFORM_TOKEN_SCOPE,
  PLATFORM_TOKEN_TTL_SECONDS,
} from './platform-admin.constants';
import { verifyTotp } from './totp.util';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Shipped inside every export so the file explains itself when it surfaces a
 * year later, detached from the request it answered — including *what it
 * deliberately leaves out*, so an omission reads as a decision rather than an
 * oversight. Each one is RGPD art. 15(4): a copy of one person's data must
 * not adversely affect the rights and freedoms of others.
 */
const EXPORT_NOTICE = {
  basis:
    'Copie des données à caractère personnel traitées par Kluvo, au titre des articles 15 et 20 du RGPD.',
  omissions: [
    'Les votes émis par la personne sont listés sans le joueur désigné : le vote entre coéquipiers est anonyme par construction, et la désignation est une donnée relative à un tiers (art. 15.4).',
    "Les consultations et actions effectuées par un administrateur sur ce compte sont datées mais n'identifient pas l'administrateur concerné (art. 15.4).",
    "Les abonnements aux notifications push sont listés sans leur adresse technique ni leurs clés : celles-ci constituent un moyen d'envoi actif vers l'appareil, et non une donnée descriptive de la personne.",
  ],
};

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly retention: RetentionService,
  ) {}

  /**
   * The step-up. A caller arrives here already holding a normal session (the
   * route is behind JwtAuthGuard) and trades a TOTP code for a second,
   * separately-signed, 15-minute token that PlatformAdminGuard requires.
   *
   * Every outcome is audited, success and failure alike — the failures are
   * both the brute-force signal and the input to the lockout below.
   */
  async login(
    userId: string,
    email: string,
    totpCode: string,
    request: Request,
  ): Promise<PlatformLoginResponse> {
    const secret = this.getPlatformSecret();
    const admin = await this.prisma.platformAdmin.findUnique({ where: { userId } });

    // No grant, or a grant that was never armed with a secret. Audited
    // without a userId-scoped lockout: there is no grant to lock, and the
    // caller must not learn from the response that no grant exists.
    if (!admin?.totpSecret) {
      await this.audit.recordAndWait({
        type: 'ADMIN_LOGIN_FAILURE',
        userId,
        actorEmail: email,
        metadata: { reason: 'no_grant' },
        context: auditContextOf(request),
      });
      throw new UnauthorizedException('Code invalide');
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new ForbiddenException('Accès back-office verrouillé. Contactez un opérateur.');
    }

    // Checked here as well as in the guard: an allowlisted admin's TOTP code
    // must not even be *testable* from outside their network, or the
    // allowlist protects the data but not the credential.
    if (!isIpAllowed(admin.allowedCidrs, clientIpOf(request))) {
      await this.audit.recordAndWait({
        type: 'ADMIN_LOGIN_FAILURE',
        userId,
        actorEmail: email,
        metadata: { reason: 'ip_not_allowed' },
        context: auditContextOf(request),
      });
      throw new ForbiddenException('Accès refusé');
    }

    if (!verifyTotp(admin.totpSecret, totpCode)) {
      await this.audit.recordAndWait({
        type: 'ADMIN_LOGIN_FAILURE',
        userId,
        actorEmail: email,
        metadata: { reason: 'bad_code' },
        context: auditContextOf(request),
      });
      await this.lockOutIfOverAttemptLimit(userId);
      throw new UnauthorizedException('Code invalide');
    }

    await this.audit.recordAndWait({
      type: 'ADMIN_LOGIN_SUCCESS',
      userId,
      actorEmail: email,
      metadata: { role: admin.role },
      context: auditContextOf(request),
    });

    const platformAccessToken = await this.jwt.signAsync(
      { sub: userId, scope: PLATFORM_TOKEN_SCOPE },
      { secret, expiresIn: PLATFORM_TOKEN_TTL_SECONDS, algorithm: 'HS256' },
    );

    return {
      platformAccessToken,
      expiresAt: new Date(Date.now() + PLATFORM_TOKEN_TTL_SECONDS * 1000).toISOString(),
      role: admin.role,
    };
  }

  /**
   * Counts this account's failures inside the window from the audit rows that
   * were just written, and locks the grant once it reaches the limit. The
   * lock does not expire on its own — see `lockedUntilCleared`.
   */
  private async lockOutIfOverAttemptLimit(userId: string): Promise<void> {
    const failures = await this.prisma.auditLog.count({
      where: {
        type: 'ADMIN_LOGIN_FAILURE',
        userId,
        createdAt: { gte: new Date(Date.now() - PLATFORM_LOGIN_WINDOW_MS) },
      },
    });

    if (failures >= PLATFORM_LOGIN_MAX_ATTEMPTS) {
      await this.prisma.platformAdmin.updateMany({
        where: { userId },
        data: { lockedUntil: lockedUntilCleared() },
      });
    }
  }

  /**
   * The sweep's run history, projected onto the back-office's wire format.
   *
   * The projection lives here rather than in RetentionService because the
   * shape is this API's contract, not the retention policy's: the sweep
   * writes its `summary` as a Json blob keyed by step name, and how the
   * back-office chooses to render that is nobody else's concern.
   */
  async listRetentionRuns(limit: number): Promise<RetentionRunSummary[]> {
    const runs = await this.retention.listRuns(limit);
    return runs.map((run) => ({
      id: run.id,
      dryRun: run.dryRun,
      ranAt: run.ranAt.toISOString(),
      steps: toStepSummaries(run.summary),
    }));
  }

  /**
   * An on-demand dry run: every policy is evaluated and a RetentionRun row is
   * written for the compliance record, but nothing is deleted.
   *
   * Returns only the steps, not a full RetentionRunSummary: the persisted
   * row's id would have to be read back in a second query, and reading back
   * "the newest row" could hand the caller the nightly sweep's row instead of
   * their own. The client refreshes the history list anyway.
   */
  async runRetentionDryRun(): Promise<RetentionStepSummary[]> {
    const summary = await this.retention.run(true);
    return toStepSummaries(summary as unknown as Prisma.JsonValue);
  }

  /**
   * The redacted list. No local-part, no name, no club names — opening one
   * specific record is the audited ADMIN_PII_VIEWED moment, and a list that
   * already identified the person would make that audit trail a lie.
   *
   * The window has no upper bound on purpose: an account already past the
   * 12-month cutoff that the sweep has not yet taken belongs on the same
   * screen (with a negative `daysUntilErasure`), not hidden.
   */
  async listInactiveSoonUsers(
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<RedactedUserSummary>> {
    const now = new Date();
    const cutoff = subMonths(now, INACTIVE_ACCOUNT_RETENTION_MONTHS - INACTIVE_SOON_LEAD_MONTHS);
    const where = { lastActiveAt: { lt: cutoff } };

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { lastActiveAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          lastActiveAt: true,
          _count: { select: { memberships: true } },
        },
      }),
    ]);

    return {
      items: users.map((user) => ({
        id: user.id,
        emailDomain: emailDomainOf(user.email),
        lastActiveAt: user.lastActiveAt.toISOString(),
        daysUntilErasure: daysBetween(
          now,
          addMonths(user.lastActiveAt, INACTIVE_ACCOUNT_RETENTION_MONTHS),
        ),
        clubCount: user._count.memberships,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * The one route that returns a data subject's PII, and therefore the one
   * that writes ADMIN_PII_VIEWED. The audit row is awaited *before* the
   * profile is returned: a crash between the two would lose exactly the
   * evidence the log exists for.
   */
  async getUserDetail(
    adminUserId: string,
    adminEmail: string,
    subjectUserId: string,
    request: Request,
  ): Promise<PlatformUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: subjectUserId },
      include: {
        memberships: { include: { club: { select: { id: true, name: true } } } },
        linkedPlayers: { include: { club: { select: { name: true } } } },
      },
    });

    if (!user) {
      throw new NotFoundException('Compte introuvable');
    }

    await this.audit.recordAndWait({
      type: 'ADMIN_PII_VIEWED',
      userId: adminUserId,
      actorEmail: adminEmail,
      metadata: { subjectUserId, subjectEmail: user.email },
      context: auditContextOf(request),
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      emailVerified: user.emailVerifiedAt !== null,
      lastActiveAt: user.lastActiveAt.toISOString(),
      createdAt: user.createdAt.toISOString(),
      clubs: user.memberships.map((membership) => ({
        id: membership.club.id,
        name: membership.club.name,
        role: membership.role,
      })),
      linkedPlayers: user.linkedPlayers.map((player) => ({
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        clubName: player.club.name,
      })),
    };
  }

  /**
   * Manual erasure, ahead of the sweep — the case the automated policy alone
   * cannot cover: a named request that has to be handled before the 12-month
   * clock fires.
   *
   * The erasure and its audit row commit in one transaction. `reason` is
   * carried into that row because a manual erasure with no recorded
   * justification is precisely the gap an audit log exists to close.
   */
  async eraseUser(
    adminUserId: string,
    adminEmail: string,
    subjectUserId: string,
    reason: string,
    request: Request,
  ): Promise<ErasePlatformUserResponse> {
    if (subjectUserId === adminUserId) {
      // Not a safety rail against mistakes so much as against losing the
      // grant mid-request: erasing your own account cascades the
      // PlatformAdmin row the guard just authorized.
      throw new ForbiddenException('Un administrateur ne peut pas effacer son propre compte');
    }

    const subject = await this.prisma.user.findUnique({
      where: { id: subjectUserId },
      select: { email: true },
    });
    if (!subject) {
      throw new NotFoundException('Compte introuvable');
    }

    const ipAddress = clientIpOf(request);
    const userAgent = request.headers['user-agent'] ?? null;

    const unlinkedPlayerCount = await this.prisma.$transaction(async (tx) => {
      const result = await this.retention.eraseUserAccount(tx, subjectUserId);
      await tx.auditLog.create({
        data: {
          type: 'ADMIN_USER_ERASED',
          userId: adminUserId,
          actorEmail: adminEmail,
          ipAddress,
          userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
          metadata: {
            subjectUserId,
            // The erased account's own address, denormalised here for the
            // same reason AuditLog.actorEmail is: the row has to still say
            // whose data was erased once that account no longer exists.
            subjectEmail: subject.email,
            reason,
            unlinkedPlayerCount: result.unlinkedPlayerCount,
          },
        },
      });
      return result.unlinkedPlayerCount;
    });

    return { erasedUserId: subjectUserId, unlinkedPlayerCount };
  }

  /**
   * The RGPD art. 15 / art. 20 export: one machine-readable copy of everything
   * this deployment knows about one person.
   *
   * A POST rather than a GET, and carrying a mandatory `reason`, for the same
   * reason erasure does — this materialises a complete copy of someone's data
   * for handover *outside* the system, which is a larger disclosure than the
   * single-profile view that already earns an ADMIN_PII_VIEWED row, and an
   * audit trail that cannot say which request a disclosure answered is not a
   * trail.
   *
   * Emits ADMIN_EXPORT_GENERATED and deliberately *not* ADMIN_PII_VIEWED: the
   * two are different disclosures with different scopes, and folding one into
   * the other would make a DPO's "who saw what" filter wrong in both
   * directions.
   *
   * Generate this *before* an erasure, never after: erasure detaches roster
   * entries (`Player.userId = null`) rather than deleting them, so afterwards
   * nothing links those rows back to the person.
   */
  async exportUser(
    adminUserId: string,
    adminEmail: string,
    subjectUserId: string,
    reason: string,
    request: Request,
  ): Promise<PlatformUserExport> {
    const user = await this.prisma.user.findUnique({
      where: { id: subjectUserId },
      include: {
        memberships: { include: { club: { select: { name: true } } } },
        notifications: { orderBy: { createdAt: 'asc' } },
        pushSubscriptions: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Compte introuvable');
    }

    const [players, auditEntries, reviewedExtractions] = await Promise.all([
      this.prisma.player.findMany({
        where: { userId: subjectUserId },
        include: {
          club: { select: { name: true } },
          teamPlayers: {
            include: {
              team: {
                select: {
                  name: true,
                  clubTeams: { select: { club: { select: { name: true } } } },
                },
              },
              rsvps: { include: { event: { select: { startsAt: true } } } },
              convocations: { include: { event: { select: { startsAt: true } } } },
              matchStats: { include: { event: { select: { startsAt: true } } } },
              votesCast: { include: { event: { select: { startsAt: true } } } },
              uploadedScoresheets: { include: { event: { select: { startsAt: true } } } },
              jerseysAssignedEvents: { select: { startsAt: true } },
              ballsAssignedEvents: { select: { startsAt: true } },
            },
          },
        },
      }),
      this.prisma.auditLog.findMany({
        where: {
          OR: [
            { userId: subjectUserId },
            { metadata: { path: ['subjectUserId'], equals: subjectUserId } },
          ],
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.scoresheetExtraction.findMany({
        where: { reviewedByUserId: subjectUserId },
        include: { eventScoresheet: { include: { event: { select: { startsAt: true } } } } },
      }),
    ]);

    await this.audit.recordAndWait({
      type: 'ADMIN_EXPORT_GENERATED',
      userId: adminUserId,
      actorEmail: adminEmail,
      metadata: { subjectUserId, subjectEmail: user.email, reason },
      context: auditContextOf(request),
    });

    return {
      generatedAt: new Date().toISOString(),
      subjectUserId,
      notice: EXPORT_NOTICE,
      account: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerifiedAt !== null,
        emailNotificationsEnabled: user.emailNotificationsEnabled,
        lastActiveAt: user.lastActiveAt.toISOString(),
        createdAt: user.createdAt.toISOString(),
      },
      clubMemberships: user.memberships.map((membership) => ({
        clubName: membership.club.name,
        role: membership.role,
        joinedAt: membership.createdAt.toISOString(),
      })),
      playerRecords: players.map((player) => ({
        clubName: player.club.name,
        firstName: player.firstName,
        lastName: player.lastName,
        birthDate: player.birthDate?.toISOString() ?? null,
        gender: player.gender,
        licenseNumber: player.licenseNumber,
        licenseType: player.licenseType,
        nationalId: player.nationalId,
        createdAt: player.createdAt.toISOString(),
        rosterEntries: player.teamPlayers.map((teamPlayer) => ({
          teamName: teamPlayer.team.name,
          clubNames: teamPlayer.team.clubTeams.map((clubTeam) => clubTeam.club.name),
          role: teamPlayer.role,
          joinedAt: teamPlayer.createdAt.toISOString(),
          rsvps: teamPlayer.rsvps.map((rsvp) => ({
            eventStartsAt: rsvp.event.startsAt.toISOString(),
            status: rsvp.status,
            respondedAt: rsvp.respondedAt.toISOString(),
          })),
          convocations: teamPlayer.convocations.map((convocation) => ({
            eventStartsAt: convocation.event.startsAt.toISOString(),
            convokedAt: convocation.convokedAt.toISOString(),
          })),
          matchStats: teamPlayer.matchStats.map((stat) => ({
            eventStartsAt: stat.event.startsAt.toISOString(),
            jerseyNumber: stat.jerseyNumber,
            points: stat.points,
            fouls: stat.fouls,
          })),
          // votedTeamPlayerId is deliberately not read. See EXPORT_NOTICE.
          votesCast: teamPlayer.votesCast.map((vote) => ({
            eventStartsAt: vote.event.startsAt.toISOString(),
            category: vote.category,
            castAt: vote.createdAt.toISOString(),
          })),
          scoresheetUploads: teamPlayer.uploadedScoresheets.map((scoresheet) => ({
            eventStartsAt: scoresheet.event.startsAt.toISOString(),
            uploadedAt: scoresheet.uploadedAt.toISOString(),
          })),
          logisticsAssignments: [
            ...teamPlayer.jerseysAssignedEvents.map((event) => ({
              eventStartsAt: event.startsAt.toISOString(),
              duty: 'JERSEYS' as const,
            })),
            ...teamPlayer.ballsAssignedEvents.map((event) => ({
              eventStartsAt: event.startsAt.toISOString(),
              duty: 'BALLS' as const,
            })),
          ],
        })),
      })),
      notifications: user.notifications.map((notification) => ({
        type: notification.type,
        title: notification.title,
        body: notification.body,
        createdAt: notification.createdAt.toISOString(),
      })),
      // endpoint/p256dh/auth are never selected: together they are a live
      // capability to push to that browser, not a description of the person.
      pushSubscriptions: user.pushSubscriptions.map((subscription) => ({
        userAgent: subscription.userAgent,
        createdAt: subscription.createdAt.toISOString(),
      })),
      reviewedScoresheets: reviewedExtractions.flatMap((extraction) =>
        extraction.reviewedAt
          ? [
              {
                eventStartsAt: extraction.eventScoresheet.event.startsAt.toISOString(),
                reviewedAt: extraction.reviewedAt.toISOString(),
              },
            ]
          : [],
      ),
      securityLog: auditEntries.map((entry) => {
        const actedByThisPerson = entry.userId === subjectUserId;
        return {
          type: entry.type,
          createdAt: entry.createdAt.toISOString(),
          // A row where the subject is not the actor is an administrator's
          // action *on* them: they are entitled to know it happened, not to a
          // named staff member or that person's address.
          ipAddress: actedByThisPerson ? entry.ipAddress : null,
          actedByThisPerson,
        };
      }),
    };
  }

  /**
   * "Who accessed this person's data".
   *
   * An ADMIN_* row's `userId` is the acting admin and the subject lives in
   * `metadata.subjectUserId`, so filtering by one alone answers only half the
   * question. Both are matched: what this account did, and what was done to
   * it. That union is also what a DSAR response needs.
   */
  async listAuditLog(
    subjectUserId: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<AuditLogEntry>> {
    const where: Prisma.AuditLogWhereInput = subjectUserId
      ? {
          OR: [
            { userId: subjectUserId },
            { metadata: { path: ['subjectUserId'], equals: subjectUserId } },
          ],
        }
      : {};

    const [total, entries] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: entries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        userId: entry.userId,
        actorEmail: entry.actorEmail,
        ipAddress: entry.ipAddress,
        metadata: asMetadata(entry.metadata),
        createdAt: entry.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  private getPlatformSecret(): string {
    const secret = this.config.get<string>('PLATFORM_JWT_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException("Le back-office n'est pas activé sur ce déploiement");
    }
    return secret;
  }
}

/**
 * Turns the sweep's `summary` Json — a record keyed by step name, per
 * RetentionService — into the flat, ordered list the UI renders.
 *
 * Treats anything that isn't the expected shape as no steps at all rather
 * than indexing into it, the same rule `asParsedScoresheetData` applies to a
 * scoresheet's `parsedData`: a row written by an older or newer sweep must
 * not crash the one screen that proves the policy runs.
 */
function toStepSummaries(summary: Prisma.JsonValue): RetentionStepSummary[] {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return [];

  return Object.entries(summary).flatMap(([step, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const { status, count, error } = value as Record<string, unknown>;
    if (typeof count !== 'number') return [];
    return [
      {
        step,
        status: status === 'error' ? ('error' as const) : ('ok' as const),
        count,
        error: typeof error === 'string' ? error : null,
      },
    ];
  });
}

/**
 * The request-shaped half of an audit entry, resolved with the back-office's
 * own stricter IP rule rather than Express's `req.ip`: the same value gates
 * the per-admin network allowlist, so a spoofable one is an access decision
 * made on attacker-supplied input.
 */
function auditContextOf(request: Request): AuditRequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: clientIpOf(request),
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 400) : null,
  };
}

/**
 * The domain alone, never the local part — enough to tell a real club
 * volunteer from an obvious test account without identifying anybody.
 */
function emailDomainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1);
}

function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function asMetadata(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
