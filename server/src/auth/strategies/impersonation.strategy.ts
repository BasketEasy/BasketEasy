import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  IMPERSONATION_READ_ONLY_CODE,
  IMPERSONATION_TOKEN_SCOPE,
} from '@basketeasy/types/platform-admin-impersonation';
import { PrismaService } from '../../prisma/prisma.service';
import { clientIpOf, isIpAllowed } from '../../platform-admin/client-ip.util';
import { resolvePlatformSecret } from '../../platform-admin/platform-admin.constants';
import type { RequestUser } from '../decorators/current-user.decorator';

export const IMPERSONATION_STRATEGY = 'jwt-impersonation';

const READ_METHODS = new Set(['GET', 'HEAD']);

interface ImpersonationTokenPayload {
  sub: string;
  act: string;
  sid: string;
  scope: string;
}

/**
 * Authenticates the token a DATA_OFFICER gets from
 * `POST /admin/users/:userId/impersonate`, and is the one place read-only is
 * enforced. It sits behind JwtAuthGuard, which every authenticated route
 * already uses, so a write can't slip through a route nobody annotated. A
 * global guard couldn't do this: it runs before JwtAuthGuard, when nothing
 * yet says who is calling.
 *
 * Signed with PLATFORM_JWT_SECRET, never JWT_ACCESS_SECRET, so a leaked
 * access secret mints nothing here. The step-up token shares that secret;
 * the `scope` claim is what keeps the two apart, in both directions.
 *
 * The token alone is not enough: every request re-reads the session row and
 * the actor's grant, so « Quitter », a replaced session, a revoked or locked
 * grant or an IP outside the actor's allowlist ends access at once. See
 * docs/decisions/rgpd-and-backoffice.md.
 */
@Injectable()
export class ImpersonationStrategy extends PassportStrategy(Strategy, IMPERSONATION_STRATEGY) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      passReqToCallback: true,
      // Read per request, like PlatformAdminGuard: with no usable secret the
      // back-office is off, and so is this. A provider error makes
      // passport-jwt *fail* the strategy (401), not error it.
      secretOrKeyProvider: (
        _request: Request,
        _rawToken: string,
        done: (err: Error | null, secret?: string) => void,
      ) => {
        const secret = resolvePlatformSecret(config.get<string>('PLATFORM_JWT_SECRET'));
        if (secret) {
          done(null, secret);
        } else {
          done(new Error('Impersonation is off on this deployment'));
        }
      },
    });
  }

  async validate(request: Request, payload: ImpersonationTokenPayload): Promise<RequestUser> {
    if (payload.scope !== IMPERSONATION_TOKEN_SCOPE) {
      throw new UnauthorizedException();
    }

    // Before the session lookup: a write is refused whatever the session's
    // state, and a 403 with its own code (not a 401) tells the client this
    // is read-only, not expiry.
    if (!READ_METHODS.has(request.method)) {
      throw new ForbiddenException({
        message: 'Consultation en lecture seule : aucune modification possible.',
        code: IMPERSONATION_READ_ONLY_CODE,
      });
    }

    const session = await this.prisma.impersonationSession.findUnique({
      where: { id: payload.sid },
      select: {
        actorUserId: true,
        subjectUserId: true,
        expiresAt: true,
        endedAt: true,
        subject: { select: { email: true } },
        actor: {
          select: {
            platformAdmin: { select: { role: true, lockedUntil: true, allowedCidrs: true } },
          },
        },
      },
    });

    const now = new Date();
    const grant = session?.actor.platformAdmin;
    if (
      !session ||
      session.endedAt !== null ||
      session.expiresAt <= now ||
      session.actorUserId !== payload.act ||
      session.subjectUserId !== payload.sub ||
      !grant ||
      grant.role !== 'DATA_OFFICER' ||
      (grant.lockedUntil !== null && grant.lockedUntil > now) ||
      !isIpAllowed(grant.allowedCidrs, clientIpOf(request))
    ) {
      throw new UnauthorizedException();
    }

    return {
      id: session.subjectUserId,
      email: session.subject.email,
      impersonation: { sessionId: payload.sid, actorUserId: session.actorUserId },
    };
  }
}
