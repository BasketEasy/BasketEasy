import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Grants access to a team's day-to-day management routes (roster, roster
 * roles, team-admin assignment, events) to either a club ADMIN of the
 * route's :clubId or a user holding a TeamAdmin row for the route's :teamId.
 *
 * Unlike ClubRolesGuard this isn't metadata-driven (no @TeamRoles decorator)
 * — every route it's applied to requires the same "manager" check, so it's
 * applied directly via @UseGuards(TeamManagerGuard).
 *
 * Does NOT verify :teamId actually belongs to :clubId — the service method
 * behind the route re-verifies that via assertTeamInClub, same
 * defense-in-depth split ClubRolesGuard already relies on.
 *
 * Must run after JwtAuthGuard, and only on routes with both :clubId and
 * :teamId params.
 */
@Injectable()
export class TeamManagerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;
    const clubId: string | undefined = request.params?.clubId;
    const teamId: string | undefined = request.params?.teamId;

    if (!userId || !clubId || !teamId) {
      throw new ForbiddenException('Insufficient team role');
    }

    if (!(await this.isTeamManager(clubId, teamId, userId))) {
      throw new ForbiddenException('Insufficient team role');
    }
    return true;
  }

  // The check itself, extracted so EventsService can reuse it for a
  // non-route-level authorization decision (assigning/clearing someone
  // else's jersey/ball logistics slot) without duplicating the query logic
  // or going through a route guard.
  async isTeamManager(clubId: string, teamId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (membership?.role === 'ADMIN') {
      return true;
    }

    const teamAdmin = await this.prisma.teamAdmin.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    return teamAdmin !== null;
  }
}
