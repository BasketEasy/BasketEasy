import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { EMAIL_NOT_VERIFIED_CODE } from '@basketeasy/types/account-security';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Requires the caller's e-mail address to be confirmed.
 *
 * Applied to exactly three routes — creating a club, adding a club member,
 * and granting a TeamAdmin — because those are the actions that hand out
 * authority over *other people's* data, and an unconfirmed address means
 * nobody has proved they can be reached at it. Everything else in the app
 * (reading, RSVP, roster edits, events) deliberately works unverified: a
 * player invited to a roster who mistyped their address must never be locked
 * out of their own team.
 *
 * Must run after `JwtAuthGuard` has populated `request.user` — order guards
 * as `@UseGuards(JwtAuthGuard, EmailVerifiedGuard)`. Like `ClubRolesGuard`
 * it fails closed if that precondition is violated.
 *
 * The 403 carries a machine-readable `code` so the frontend can tell "you may
 * not do this" from "confirm your address first" and offer the resend button
 * instead of a dead end.
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;

    if (!userId) {
      throw new ForbiddenException({
        message: 'Confirmez votre adresse e-mail pour effectuer cette action',
        code: EMAIL_NOT_VERIFIED_CODE,
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });

    if (!user?.emailVerifiedAt) {
      throw new ForbiddenException({
        message: 'Confirmez votre adresse e-mail pour effectuer cette action',
        code: EMAIL_NOT_VERIFIED_CODE,
      });
    }

    return true;
  }
}
