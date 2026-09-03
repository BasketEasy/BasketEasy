import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessTokenResponse } from '@basketeasy/types/auth';
import type { PlayerInvitePreview } from '@basketeasy/types/player-invites';
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

    return { accessToken, refreshToken, user };
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

    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new NotFoundException('Invitation invalide ou expirée');
    }

    return invite;
  }
}
