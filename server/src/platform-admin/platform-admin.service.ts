import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PLATFORM_ADMIN_LOCKED_CODE } from '@basketeasy/types/platform-admin';
import type {
  AuditLogEntry,
  ErasePlatformUserResponse,
  PlatformLoginResponse,
  PlatformUserExport,
  RetentionRunSummary,
  RetentionStepSummary,
} from '@basketeasy/types/platform-admin';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { auditContextOf } from './audit-context';
import { RetentionService } from '../retention/retention.service';
import { jerseyDutyStatus } from '../events/jersey-duty-rules';
import { clientIpOf, isIpAllowed } from './client-ip.util';
import {
  lockedUntilCleared,
  PLATFORM_LOGIN_MAX_ATTEMPTS,
  PLATFORM_LOGIN_WINDOW_MS,
  PLATFORM_TOKEN_SCOPE,
  PLATFORM_TOKEN_TTL_SECONDS,
  resolvePlatformSecret,
} from './platform-admin.constants';
import { matchTotpCounter } from './totp.util';
import { decryptTotpSecret, resolveTotpEncryptionKey } from './totp-secret-crypto';

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
    "Les actions « Fait » ou « Annulé » d'un responsable d'équipe sur un tour de lavage des maillots de la personne ne sont pas incluses : ce sont des actes de ce responsable (art. 15.4). Un tour accepté en son nom par un parent est signalé sans identifier ce parent.",
    "L'historique des réponses indique la source de chaque changement (appli ou lien partagé) et, pour un changement fait depuis l'appli, s'il a été fait par la personne ou par quelqu'un d'autre, sans identifier cette personne (art. 15.4). Une réponse donnée par le lien partagé de l'équipe n'a pas d'auteur identifié par construction.",
    "Les enfants dont la personne est responsable légal·e sont nommés, mais leur profil, leurs statistiques et leurs propres réponses n'y figurent pas : ce sont les données de l'enfant (art. 15.4). Une réponse donnée au nom de la personne par un parent est signalée sans identifier ce parent, et un consentement parental la concernant est daté sans nommer qui l'a donné.",
  ],
};

/** Who gave an answer, without naming them: art. 15(4) keeps a guardian's identity out. */
function rsvpAuthor(
  answer: { source: 'APP' | 'GUEST_LINK'; respondedByUserId: string | null },
  subjectUserId: string,
): 'SELF' | 'SOMEONE_ELSE' | 'LINK' | 'UNKNOWN' {
  if (answer.source === 'GUEST_LINK') return 'LINK';
  if (answer.respondedByUserId === null) return 'UNKNOWN';
  return answer.respondedByUserId === subjectUserId ? 'SELF' : 'SOMEONE_ELSE';
}

@Injectable()
export class PlatformAdminService {
  private readonly logger = new Logger(PlatformAdminService.name);

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
   * Every attempt is audited, success and failure alike — the failures are
   * both the brute-force signal and the input to the throttle and lockout.
   *
   * The whole decision runs in one transaction holding a row lock on the
   * grant, so concurrent guesses are evaluated one after another: each sees
   * the failures the previous one committed, and the lockout lands on exactly
   * the fifth. Without the lock, a burst of parallel requests could all pass
   * the check before any of them recorded its failure.
   *
   * The audit rows are written through the transaction rather than
   * AuditService so they count towards the next attempt the moment it takes
   * the lock. That is also why a refusal is returned out of the transaction
   * and thrown afterwards: throwing inside would roll back the failure row
   * that is the whole point of recording it.
   */
  async login(
    userId: string,
    email: string,
    totpCode: string,
    request: Request,
  ): Promise<PlatformLoginResponse> {
    const secret = this.getPlatformSecret();
    const totpKey = this.getTotpEncryptionKey();
    const context = auditContextOf(request);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const recordFailure = (reason: string) =>
        tx.auditLog.create({
          data: {
            type: 'ADMIN_LOGIN_FAILURE',
            userId,
            actorEmail: email,
            ipAddress: context.ipAddress ?? null,
            userAgent: context.userAgent ?? null,
            metadata: { reason },
          },
        });
      const recentFailures = () =>
        tx.auditLog.count({
          where: {
            type: 'ADMIN_LOGIN_FAILURE',
            userId,
            createdAt: { gte: new Date(Date.now() - PLATFORM_LOGIN_WINDOW_MS) },
          },
        });

      // A no-op for an account with no grant: there is nothing to guess and
      // nothing to lock, only the throttle below to bound its audit rows.
      await tx.$queryRaw`SELECT 1 FROM "PlatformAdmin" WHERE "userId" = ${userId} FOR UPDATE`;
      const admin = await tx.platformAdmin.findUnique({ where: { userId } });

      if (admin?.lockedUntil && admin.lockedUntil > new Date()) {
        return { kind: 'locked' } as const;
      }

      // The throttle, for every caller. Past the limit nothing is written:
      // any logged-in account could otherwise fill the security log with
      // failure rows at request rate. For a grant holder the lockout below
      // normally fires first; this also covers a grant unlocked by an operator
      // while its failures are still inside the window.
      if ((await recentFailures()) >= PLATFORM_LOGIN_MAX_ATTEMPTS) {
        return { kind: 'throttled' } as const;
      }

      // No grant, or a grant that was never armed. Same answer as a wrong
      // code: the caller must not learn from the response that no grant exists.
      if (!admin?.totpSecret) {
        await recordFailure('no_grant');
        return { kind: 'invalid' } as const;
      }

      // Checked here as well as in the guard: an allowlisted admin's TOTP code
      // must not even be *testable* from outside their network, or the
      // allowlist protects the data but not the credential.
      if (!isIpAllowed(admin.allowedCidrs, clientIpOf(request))) {
        await recordFailure('ip_not_allowed');
        return { kind: 'forbidden' } as const;
      }

      const totpSecret = decryptTotpSecret(admin.totpSecret, totpKey, userId);
      if (totpSecret === null) {
        // Wrong key, a tampered or transplanted row, or a value written before
        // secrets were encrypted. An operator problem, not a guess: logged and
        // audited, but it never locks the grant by itself (only a wrong or
        // replayed code does). Re-running `platform-admin.ts grant` fixes it.
        this.logger.error(`TOTP secret for platform admin ${userId} does not decrypt`);
        await recordFailure('secret_unreadable');
        return { kind: 'invalid' } as const;
      }

      const counter = matchTotpCounter(totpSecret, totpCode);
      // A code at or before the last accepted step is a replay, even if it is
      // still inside its ±1-step validity window.
      const replayed =
        counter !== null &&
        admin.lastUsedTotpCounter !== null &&
        counter <= admin.lastUsedTotpCounter;

      if (counter === null || replayed) {
        await recordFailure(replayed ? 'replayed_code' : 'bad_code');
        if ((await recentFailures()) >= PLATFORM_LOGIN_MAX_ATTEMPTS) {
          await tx.platformAdmin.update({
            where: { userId },
            data: { lockedUntil: lockedUntilCleared() },
          });
        }
        return { kind: 'invalid' } as const;
      }

      await tx.platformAdmin.update({
        where: { userId },
        data: { lastUsedTotpCounter: counter },
      });
      await tx.auditLog.create({
        data: {
          type: 'ADMIN_LOGIN_SUCCESS',
          userId,
          actorEmail: email,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
          metadata: { role: admin.role },
        },
      });
      return { kind: 'ok', role: admin.role } as const;
    });

    switch (outcome.kind) {
      case 'locked':
        throw new ForbiddenException({
          message: 'Accès back-office verrouillé. Contactez un opérateur.',
          code: PLATFORM_ADMIN_LOCKED_CODE,
        });
      case 'throttled':
        throw new HttpException(
          'Trop de tentatives. Réessayez dans quelques minutes.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case 'forbidden':
        throw new ForbiddenException('Accès refusé');
      case 'invalid':
        throw new UnauthorizedException('Code invalide');
    }

    const platformAccessToken = await this.jwt.signAsync(
      { sub: userId, scope: PLATFORM_TOKEN_SCOPE },
      { secret, expiresIn: PLATFORM_TOKEN_TTL_SECONDS, algorithm: 'HS256' },
    );

    return {
      platformAccessToken,
      expiresAt: new Date(Date.now() + PLATFORM_TOKEN_TTL_SECONDS * 1000).toISOString(),
      role: outcome.role,
    };
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
  async runRetentionDryRun(adminUserId: string): Promise<RetentionStepSummary[]> {
    const summary = await this.retention.run(true, adminUserId);
    return toStepSummaries(summary as unknown as Prisma.JsonValue);
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
      select: { email: true, platformAdmin: { select: { userId: true } } },
    });
    if (!subject) {
      throw new NotFoundException('Compte introuvable');
    }
    // Same line as impersonation: staff accounts are managed out-of-band
    // (the CLI revokes the grant first), never by another staff member here.
    if (subject.platformAdmin) {
      throw new ForbiddenException(
        'Ce compte détient un accès back-office : révoquez-le d’abord avec la CLI',
      );
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
        teamAdmins: { include: { team: { select: { name: true } } } },
        guardianOf: {
          include: {
            player: {
              select: { firstName: true, lastName: true, club: { select: { name: true } } },
            },
          },
        },
        guardianInvitesAccepted: {
          where: { acceptedAt: { not: null } },
          include: { player: { select: { firstName: true } } },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Compte introuvable');
    }

    const [
      players,
      auditEntries,
      reviewedExtractions,
      answersGivenForOthers,
      jerseyDutiesAcceptedForOthers,
      consentsGiven,
      consentsAboutSubject,
    ] = await Promise.all([
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
              rsvpChanges: {
                include: { event: { select: { startsAt: true } } },
                orderBy: { createdAt: 'asc' },
              },
              convocations: { include: { event: { select: { startsAt: true } } } },
              matchStats: { include: { event: { select: { startsAt: true } } } },
              votesCast: { include: { event: { select: { startsAt: true } } } },
              uploadedScoresheets: { include: { event: { select: { startsAt: true } } } },
              jerseysAssignedEvents: { select: { startsAt: true } },
              ballsAssignedEvents: { select: { startsAt: true } },
              // doneBy/voidedBy are never read: a manager's act on this turn, art. 15(4).
              jerseyDuties: {
                include: { event: { select: { startsAt: true } } },
              },
            },
          },
        },
      }),
      this.prisma.auditLog.findMany({
        where: {
          OR: [
            { userId: subjectUserId },
            { metadata: { path: ['subjectUserId'], equals: subjectUserId } },
            // A parent removed by a club admin: the row's actor is the admin.
            { metadata: { path: ['guardianUserId'], equals: subjectUserId } },
          ],
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.scoresheetExtraction.findMany({
        where: { reviewedByUserId: subjectUserId },
        include: { eventScoresheet: { include: { event: { select: { startsAt: true } } } } },
      }),
      // Answers this person gave for someone else's roster slot — a parent
      // answering for a child. The subject's own slots are already under
      // playerRecords; a null userId is an unclaimed child and still counts.
      this.prisma.eventRsvp.findMany({
        where: {
          respondedByUserId: subjectUserId,
          teamPlayer: {
            player: { OR: [{ userId: null }, { userId: { not: subjectUserId } }] },
          },
        },
        include: {
          event: { select: { startsAt: true } },
          teamPlayer: { select: { player: { select: { firstName: true } } } },
        },
        orderBy: { respondedAt: 'asc' },
      }),
      this.prisma.eventJerseyDuty.findMany({
        where: {
          acceptedByUserId: subjectUserId,
          teamPlayer: {
            player: { OR: [{ userId: null }, { userId: { not: subjectUserId } }] },
          },
        },
        select: {
          acceptedAt: true,
          event: { select: { startsAt: true } },
          teamPlayer: { select: { player: { select: { firstName: true } } } },
        },
        orderBy: { acceptedAt: 'asc' },
      }),
      this.prisma.parentalConsent.findMany({
        where: { attestedByUserId: subjectUserId },
        include: { club: { select: { name: true } } },
        orderBy: { consentGivenAt: 'asc' },
      }),
      this.prisma.parentalConsent.findMany({
        where: { player: { userId: subjectUserId } },
        include: { club: { select: { name: true } } },
        orderBy: { consentGivenAt: 'asc' },
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
            travelMode: rsvp.travelMode,
            respondedAt: rsvp.respondedAt.toISOString(),
            source: rsvp.source,
            // Never the responder's id: a guardian's identity is their data. A guest-link
            // answer has no author account by design, so it reads `LINK`, not an erased one.
            respondedBy: rsvpAuthor(rsvp, subjectUserId),
          })),
          // The answer history a manager sees (art. 15), author reduced as above.
          rsvpHistory: teamPlayer.rsvpChanges.map((change) => ({
            eventStartsAt: change.event.startsAt.toISOString(),
            status: change.status,
            travelMode: change.travelMode,
            source: change.source,
            via: change.via,
            changedAt: change.createdAt.toISOString(),
            changedBy: rsvpAuthor(change, subjectUserId),
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
            ...teamPlayer.jerseyDuties.map((duty) => ({
              eventStartsAt: duty.event.startsAt.toISOString(),
              duty: 'JERSEY_WASH' as const,
              status: jerseyDutyStatus(duty),
              // Who accepted, never by name: a guardian is a third party.
              acceptedBy:
                duty.acceptedAt === null
                  ? null
                  : duty.acceptedByUserId === null
                    ? ('UNKNOWN' as const)
                    : duty.acceptedByUserId === subjectUserId
                      ? ('SELF' as const)
                      : ('SOMEONE_ELSE' as const),
            })),
          ],
        })),
      })),
      teamAdminGrants: user.teamAdmins.map((grant) => ({
        teamName: grant.team.name,
        grantedAt: grant.createdAt.toISOString(),
      })),
      notifications: user.notifications.map((notification) => ({
        type: notification.type,
        title: notification.title,
        body: notification.body,
        aboutFirstName: notification.subjectFirstName,
        createdAt: notification.createdAt.toISOString(),
      })),
      // The parent's own actions only. A child is named so each line is
      // intelligible; their profile, stats and own answers are theirs.
      guardian: {
        children: user.guardianOf.map((link) => ({
          firstName: link.player.firstName,
          lastName: link.player.lastName,
          clubName: link.player.club.name,
          linkedAt: link.createdAt.toISOString(),
        })),
        invitesAccepted: user.guardianInvitesAccepted.flatMap((invite) =>
          invite.acceptedAt
            ? [
                {
                  childFirstName: invite.player.firstName,
                  acceptedAt: invite.acceptedAt.toISOString(),
                },
              ]
            : [],
        ),
        answersGivenForOthers: answersGivenForOthers.map((rsvp) => ({
          childFirstName: rsvp.teamPlayer.player.firstName,
          eventStartsAt: rsvp.event.startsAt.toISOString(),
          status: rsvp.status,
          travelMode: rsvp.travelMode,
          respondedAt: rsvp.respondedAt.toISOString(),
        })),
        jerseyDutyAcceptedForOthers: jerseyDutiesAcceptedForOthers.flatMap((duty) =>
          duty.acceptedAt
            ? [
                {
                  childFirstName: duty.teamPlayer?.player.firstName ?? '',
                  eventStartsAt: duty.event.startsAt.toISOString(),
                  acceptedAt: duty.acceptedAt.toISOString(),
                },
              ]
            : [],
        ),
      },
      parentalConsents: {
        // playerBirthDate is deliberately not read: it is the minor's data.
        given: consentsGiven.map((consent) => ({
          source: consent.source,
          clubName: consent.club?.name ?? consent.clubName ?? 'Club supprimé',
          minorFirstName: consent.playerFirstName,
          minorLastName: consent.playerLastName,
          consentGivenAt: consent.consentGivenAt.toISOString(),
        })),
        // attestedByName/attestedByUserId deliberately not read: art. 15(4).
        aboutThisPerson: consentsAboutSubject.map((consent) => ({
          source: consent.source,
          clubName: consent.club?.name ?? consent.clubName ?? 'Club supprimé',
          consentGivenAt: consent.consentGivenAt.toISOString(),
        })),
      },
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
        // A reset link staff sent carries the subject's userId but was not
        // something the subject did.
        const byStaff = asMetadata(entry.metadata)?.requestedByStaff === true;
        const actedByThisPerson = entry.userId === subjectUserId && !byStaff;
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
   *
   * `subjectPlayerId` covers views of a player record, which may have no
   * account at all. Given together, the two filters narrow each other.
   */
  /**
   * The log holds subject addresses and free-text reasons, so reading it is
   * itself recorded (ADMIN_PII_LISTED, view `audit-log`), awaited first.
   */
  async listAuditLog(
    actor: { id: string; email: string },
    filter: { subjectUserId?: string; subjectPlayerId?: string; action?: string },
    page: number,
    pageSize: number,
    request: Request,
  ): Promise<PaginatedResult<AuditLogEntry>> {
    await this.audit.recordAndWait({
      type: 'ADMIN_PII_LISTED',
      userId: actor.id,
      actorEmail: actor.email,
      metadata: {
        view: 'audit-log',
        filters: Object.fromEntries(
          Object.entries({ ...filter, page }).filter(([, value]) => value !== undefined),
        ),
      },
      context: auditContextOf(request),
    });
    const clauses: Prisma.AuditLogWhereInput[] = [];
    if (filter.subjectUserId) {
      clauses.push({
        OR: [
          { userId: filter.subjectUserId },
          { metadata: { path: ['subjectUserId'], equals: filter.subjectUserId } },
          // GUARDIAN_LINK_REMOVED names the parent here, the actor being the admin.
          { metadata: { path: ['guardianUserId'], equals: filter.subjectUserId } },
          // Shown on someone else's profile, or on a list page.
          {
            metadata: { path: ['disclosedUserIds'], array_contains: [filter.subjectUserId] },
          },
        ],
      });
    }
    if (filter.subjectPlayerId) {
      clauses.push({
        OR: [
          { metadata: { path: ['subjectPlayerId'], equals: filter.subjectPlayerId } },
          // GUARDIAN_* rows (who was given access to this player's data).
          { metadata: { path: ['playerId'], equals: filter.subjectPlayerId } },
          {
            metadata: { path: ['disclosedPlayerIds'], array_contains: [filter.subjectPlayerId] },
          },
        ],
      });
    }
    if (filter.action) {
      clauses.push({
        type: 'ADMIN_SUPPORT_ACTION',
        metadata: { path: ['action'], equals: filter.action },
      });
    }
    const where: Prisma.AuditLogWhereInput =
      clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0] : { AND: clauses };

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

  /**
   * Same opt-in rule as the signing secret: without a usable key there is no
   * way to read a TOTP secret, so the back-office is off rather than armed.
   */
  private getTotpEncryptionKey(): Buffer {
    const key = resolveTotpEncryptionKey(this.config.get<string>('PLATFORM_TOTP_ENCRYPTION_KEY'));
    if (!key) {
      throw new ServiceUnavailableException("Le back-office n'est pas activé sur ce déploiement");
    }
    return key;
  }

  private getPlatformSecret(): string {
    const secret = resolvePlatformSecret(this.config.get<string>('PLATFORM_JWT_SECRET'));
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

function asMetadata(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
