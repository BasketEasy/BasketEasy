import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PlatformRole } from '@prisma/client';
import {
  PLATFORM_ADMIN_LOCKED_CODE,
  PLATFORM_STEP_UP_REQUIRED_CODE,
  PLATFORM_TOKEN_HEADER,
} from '@basketeasy/types/platform-admin';
import { PrismaService } from '../../prisma/prisma.service';
import { clientIpOf, isIpAllowed } from '../../platform-admin/client-ip.util';
import { PLATFORM_TOKEN_SCOPE } from '../../platform-admin/platform-admin.constants';
import { PLATFORM_ROLES_KEY } from '../decorators/platform-roles.decorator';

interface PlatformTokenPayload {
  sub: string;
  scope: string;
}

/**
 * Gates every `/admin/*` route.
 *
 * Structurally `ClubRolesGuard`'s shape — reflector plus Prisma, failing
 * closed — but with no route param to key off: platform authority is not
 * scoped to anything in the URL. `@PlatformRoles('DATA_OFFICER')` narrows a
 * route further, exactly as `@ClubRoles('ADMIN')` does.
 *
 * The difference that matters is that a `PlatformAdmin` row is necessary but
 * *not sufficient*. A second credential — the short-lived `platformAccessToken`
 * minted by `POST /admin/login` against a TOTP code — must arrive in
 * `X-Platform-Token` as well, so an ordinary session token stolen from an
 * admin's browser opens nothing here. See the design record for why the
 * highest-blast-radius surface in the product is the one that gets step-up.
 *
 * Must run after `JwtAuthGuard` has populated `request.user`; order guards as
 * `@UseGuards(JwtAuthGuard, PlatformAdminGuard)`.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.config.get<string>('PLATFORM_JWT_SECRET');
    if (!secret) {
      // The back-office is opt-in per deployment, not merely
      // unreachable-in-practice: with no secret configured there is no way to
      // mint a step-up token, so the whole surface is off. 503 rather than
      // 403 because this is a deployment state, not a decision about the
      // caller.
      throw new ServiceUnavailableException("Le back-office n'est pas activé sur ce déploiement");
    }

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('Accès refusé');
    }

    const admin = await this.prisma.platformAdmin.findUnique({ where: { userId } });
    // Deliberately the same bare 403 a non-admin gets for a bad step-up
    // token below would *not* be: someone with no grant at all learns
    // nothing about whether this route exists or what it wants.
    if (!admin || !admin.totpSecret) {
      throw new ForbiddenException('Accès refusé');
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new ForbiddenException({
        message: 'Accès back-office verrouillé. Contactez un opérateur.',
        code: PLATFORM_ADMIN_LOCKED_CODE,
      });
    }

    if (!isIpAllowed(admin.allowedCidrs, clientIpOf(request))) {
      throw new ForbiddenException('Accès refusé');
    }

    await this.verifyStepUpToken(request, userId, secret);
    this.assertRole(context, admin.role);
    return true;
  }

  private async verifyStepUpToken(
    request: { headers: Record<string, unknown> },
    userId: string,
    secret: string,
  ): Promise<void> {
    const header = request.headers[PLATFORM_TOKEN_HEADER];
    const token = Array.isArray(header) ? header[0] : header;

    const stepUpRequired = new ForbiddenException({
      message: 'Authentification à deux facteurs requise pour le back-office',
      code: PLATFORM_STEP_UP_REQUIRED_CODE,
    });

    if (typeof token !== 'string' || token.length === 0) {
      throw stepUpRequired;
    }

    let payload: PlatformTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<PlatformTokenPayload>(token, {
        secret,
        algorithms: ['HS256'],
      });
    } catch {
      // Expired, tampered with, or signed by something else — all the same
      // answer, and all of them mean "enter a code again".
      throw stepUpRequired;
    }

    // The `sub` check is what stops a step-up token being lifted from one
    // admin and paired with another admin's access token: both credentials
    // must name the same account.
    if (payload.scope !== PLATFORM_TOKEN_SCOPE || payload.sub !== userId) {
      throw stepUpRequired;
    }
  }

  private assertRole(context: ExecutionContext, role: PlatformRole): void {
    const requiredRoles = this.reflector.getAllAndOverride<PlatformRole[] | undefined>(
      PLATFORM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles && !requiredRoles.includes(role)) {
      throw new ForbiddenException('Rôle plateforme insuffisant');
    }
  }
}
