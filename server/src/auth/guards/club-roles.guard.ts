import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ClubRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CLUB_ROLES_KEY } from '../decorators/club-roles.decorator';
import { ALLOW_GUARDIANS_KEY } from '../decorators/allow-guardians.decorator';

/**
 * Enforces the roles set by `@ClubRoles(...)` on a route.
 *
 * Two preconditions the caller must satisfy, neither enforced by this guard
 * itself (both fail closed via the null-check below, but silently deny
 * everyone rather than erroring loudly if violated):
 *  - Must run *after* `JwtAuthGuard` has populated `request.user` — order
 *    guards accordingly, e.g. `@UseGuards(JwtAuthGuard, ClubRolesGuard)`.
 *  - The route must have a param literally named `clubId` (e.g.
 *    `:clubId` in the route path) — this guard reads `request.params.clubId`.
 *
 * On a route marked `@AllowGuardians()`, a caller who fails the membership
 * check still passes when they are a guardian of a player of `:clubId` — and,
 * on a route with a `:teamId`, of a player rostered on that team. That lookup
 * only runs on the failure path, so a member never pays for it.
 */
@Injectable()
export class ClubRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<ClubRole[] | undefined>(CLUB_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;
    const clubId: string | undefined = request.params?.clubId;

    if (!userId || !clubId) {
      throw new ForbiddenException('Insufficient club role');
    }

    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });

    if (membership && requiredRoles.includes(membership.role)) {
      return true;
    }

    const allowGuardians = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_GUARDIANS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowGuardians) {
      const teamId: string | undefined = request.params?.teamId;
      if (await this.isGuardianInClub(userId, clubId, teamId)) {
        return true;
      }
    }

    throw new ForbiddenException('Insufficient club role');
  }

  private async isGuardianInClub(
    userId: string,
    clubId: string,
    teamId: string | undefined,
  ): Promise<boolean> {
    const link = await this.prisma.playerGuardian.findFirst({
      where: {
        userId,
        player: { clubId, ...(teamId ? { teamPlayers: { some: { teamId } } } : {}) },
      },
      select: { playerId: true },
    });
    return link !== null;
  }
}
