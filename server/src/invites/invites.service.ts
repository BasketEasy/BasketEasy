import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessTokenResponse } from '@basketeasy/types/auth';
import {
  INVITE_ALREADY_ACCEPTED_CODE,
  type PlayerInvitePreview,
} from '@basketeasy/types/player-invites';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { hashToken } from '../common/token-hash';

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async getPreview(token: string): Promise<PlayerInvitePreview> {
    const invite = await this.findValidInvite(token);
    return {
      playerFirstName: invite.player.firstName,
      playerLastName: invite.player.lastName,
      clubName: invite.player.club.name,
    };
  }

  // Creates the account (reusing AuthService.register, so this endpoint never
  // duplicates password-hashing or token-issuance logic) then links it to the
  // invited player. The two steps aren't atomic — a login/register race on
  // the exact same invite could leave a registered-but-unlinked account
  // behind, since AuthService.register commits its own User row before this
  // method's transaction runs — but that's a harmless orphan account, not a
  // data-corruption risk, and cheap to accept for how rare it is.
  async accept(
    token: string,
    email: string,
    password: string,
  ): Promise<AccessTokenResponse & { refreshToken: string }> {
    const invite = await this.findValidInvite(token);

    const { accessToken, refreshToken, user } = await this.authService.register(email, password);

    await this.linkAcceptedInvite(invite.id, invite.playerId, invite.player.clubId, user.id);

    // Re-fetch: authService.register()'s `user` was captured before
    // linkAcceptedInvite() granted the ClubMembership, so it would otherwise
    // carry an empty memberships list into a response the frontend caches
    // indefinitely (sessionQueryKey, staleTime: Infinity).
    const linkedUser = await this.authService.me(user.id);

    return { accessToken, refreshToken, user: linkedUser };
  }

  private async linkAcceptedInvite(
    inviteId: string,
    playerId: string,
    clubId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // updateMany + count check rather than a plain update: guards against a
      // second accept racing this one for the same (already-claimed) player.
      const claimed = await tx.player.updateMany({
        where: { id: playerId, userId: null },
        data: { userId },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Ce joueur est déjà lié à un compte');
      }

      await tx.clubMembership.upsert({
        where: { userId_clubId: { userId, clubId } },
        create: { userId, clubId, role: 'MEMBER' },
        update: {},
      });

      await tx.playerInvite.update({ where: { id: inviteId }, data: { acceptedAt: new Date() } });
    });
  }

  private async findValidInvite(token: string): Promise<{
    id: string;
    playerId: string;
    player: { firstName: string; lastName: string; clubId: string; club: { name: string } };
  }> {
    const invite = await this.prisma.playerInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { player: { include: { club: true } } },
    });

    if (!invite || invite.expiresAt < new Date()) {
      throw new NotFoundException('Invitation invalide ou expirée');
    }

    // Distinct from the generic 404 above: reaching this point means the
    // token did exist and was valid at some point, so revealing "already
    // accepted" here doesn't create a way to probe for unknown tokens — only
    // a token that once worked can produce this response.
    if (invite.acceptedAt) {
      throw new ConflictException({
        message: 'Cette invitation a déjà été acceptée',
        code: INVITE_ALREADY_ACCEPTED_CODE,
      });
    }

    return invite;
  }
}
