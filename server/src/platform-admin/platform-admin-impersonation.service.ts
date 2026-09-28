import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import {
  IMPERSONATION_TOKEN_SCOPE,
  IMPERSONATION_TTL_SECONDS,
  type StartImpersonationResponse,
} from '@basketeasy/types/platform-admin-impersonation';
import { PrismaService } from '../prisma/prisma.service';
import { auditContextOf } from './audit-context';
import { resolvePlatformSecret } from './platform-admin.constants';
import { userRef } from './redaction';

interface Actor {
  userId: string;
  email: string;
}

/**
 * Starts and ends read-only impersonation sessions. The token it mints is
 * checked on every product request by ImpersonationStrategy
 * (server/src/auth/strategies), which is where read-only is enforced; this
 * service only decides who may start one and records it.
 *
 * A session is a disclosure (the subject's whole product view), so it is
 * DATA_OFFICER-only, takes a reason, and writes ADMIN_IMPERSONATION_STARTED /
 * _ENDED in the same transaction as the session row. See
 * docs/superpowers/specs/2026-09-28-backoffice-impersonation-design.md.
 */
@Injectable()
export class PlatformAdminImpersonationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async start(
    actor: Actor,
    subjectUserId: string,
    reason: string,
    request: Request,
  ): Promise<StartImpersonationResponse> {
    const secret = resolvePlatformSecret(this.config.get<string>('PLATFORM_JWT_SECRET'));
    if (!secret) {
      // PlatformAdminGuard already answers 503 here; kept so the service
      // never signs with an unusable secret whoever calls it.
      throw new ServiceUnavailableException("Le back-office n'est pas activé sur ce déploiement");
    }
    if (subjectUserId === actor.userId) {
      throw new BadRequestException('Vous ne pouvez pas vous consulter vous-même');
    }

    const subject = await this.prisma.user.findUnique({
      where: { id: subjectUserId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        platformAdmin: { select: { id: true } },
      },
    });
    if (!subject) {
      throw new NotFoundException('Compte introuvable');
    }
    if (subject.platformAdmin) {
      // Staff-on-staff viewing is not a support case, and it is the one
      // subject for whom a slip in the back-office refusal would matter.
      throw new ForbiddenException("Impossible de consulter le compte d'un membre du back-office");
    }

    const { ipAddress = null, userAgent = null } = auditContextOf(request);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + IMPERSONATION_TTL_SECONDS * 1000);

    const session = await this.prisma.$transaction(async (tx) => {
      // One live session per admin: a new one replaces the old.
      const live = await tx.impersonationSession.findMany({
        where: { actorUserId: actor.userId, endedAt: null, expiresAt: { gt: now } },
        select: { id: true, subjectUserId: true },
      });
      if (live.length > 0) {
        await tx.impersonationSession.updateMany({
          where: { id: { in: live.map((row) => row.id) } },
          data: { endedAt: now, endReason: 'REPLACED' },
        });
        await tx.auditLog.createMany({
          data: live.map((row) =>
            this.endedRow(actor, row.id, row.subjectUserId, 'REPLACED', ipAddress, userAgent),
          ),
        });
      }

      const created = await tx.impersonationSession.create({
        data: { actorUserId: actor.userId, subjectUserId, reason, expiresAt },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          type: 'ADMIN_IMPERSONATION_STARTED',
          userId: actor.userId,
          actorEmail: actor.email,
          ipAddress,
          userAgent,
          metadata: {
            sessionId: created.id,
            subjectUserId,
            reason,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });
      return created;
    });

    // Minted after the commit, from the row: a token never exists for a
    // session that didn't. `exp` is the row's own expiry, so the two agree.
    const token = await this.jwt.signAsync(
      {
        sub: subjectUserId,
        act: actor.userId,
        sid: session.id,
        scope: IMPERSONATION_TOKEN_SCOPE,
        exp: Math.floor(expiresAt.getTime() / 1000),
      },
      { secret, algorithm: 'HS256' },
    );

    return {
      sessionId: session.id,
      token,
      expiresAt: expiresAt.toISOString(),
      subject: { id: subject.id, displayName: userRef('DATA_OFFICER', subject).displayName },
    };
  }

  /**
   * « Quitter ». Idempotent on a session that already ended or expired;
   * someone else's session is a 404, never a way to end it.
   */
  async end(actor: Actor, sessionId: string, request: Request): Promise<void> {
    const session = await this.prisma.impersonationSession.findUnique({
      where: { id: sessionId },
      select: { actorUserId: true, subjectUserId: true, endedAt: true, expiresAt: true },
    });
    if (!session || session.actorUserId !== actor.userId) {
      throw new NotFoundException('Session introuvable');
    }
    const now = new Date();
    if (session.endedAt !== null || session.expiresAt <= now) {
      return;
    }

    const { ipAddress = null, userAgent = null } = auditContextOf(request);
    await this.prisma.$transaction(async (tx) => {
      // Conditional on still being live, so two concurrent « Quitter » write
      // one ENDED row between them.
      const { count } = await tx.impersonationSession.updateMany({
        where: { id: sessionId, endedAt: null },
        data: { endedAt: now, endReason: 'EXITED' },
      });
      if (count === 1) {
        await tx.auditLog.create({
          data: this.endedRow(
            actor,
            sessionId,
            session.subjectUserId,
            'EXITED',
            ipAddress,
            userAgent,
          ),
        });
      }
    });
  }

  private endedRow(
    actor: Actor,
    sessionId: string,
    subjectUserId: string,
    endReason: 'EXITED' | 'REPLACED',
    ipAddress: string | null,
    userAgent: string | null,
  ): Prisma.AuditLogCreateManyInput {
    return {
      type: 'ADMIN_IMPERSONATION_ENDED',
      userId: actor.userId,
      actorEmail: actor.email,
      ipAddress,
      userAgent,
      metadata: { sessionId, subjectUserId, endReason },
    };
  }
}
