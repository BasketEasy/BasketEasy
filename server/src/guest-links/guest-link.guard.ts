import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** What the guard puts on the request: the team a valid token opens, nothing else. */
export interface GuestLinkContext {
  teamId: string;
  token: string;
}

/**
 * Resolves `:token` to a team for the public guest routes. An unknown,
 * regenerated or disabled token is always the same plain 404, so a request
 * never reveals whether a link ever existed.
 */
@Injectable()
export class GuestLinkGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token: unknown = request.params?.token;
    if (typeof token !== 'string' || token.length === 0) {
      throw new NotFoundException();
    }
    const link = await this.prisma.teamGuestLink.findUnique({
      where: { token },
      select: { teamId: true },
    });
    if (!link) {
      throw new NotFoundException();
    }
    request.guestLink = { teamId: link.teamId, token } satisfies GuestLinkContext;
    return true;
  }
}
