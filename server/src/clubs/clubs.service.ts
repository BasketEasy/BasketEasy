import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Club } from '@basketeasy/types/clubs';
import type { ClubMember } from '@basketeasy/types/club-members';
import type { Player } from '@basketeasy/types/players';
import { PrismaService } from '../prisma/prisma.service';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  async createClub(userId: string, name: string): Promise<Club> {
    const club = await this.prisma.club.create({
      data: {
        name,
        memberships: { create: { userId, role: 'ADMIN' } },
      },
    });
    return this.toClub(club);
  }

  async listClubsForUser(userId: string): Promise<Club[]> {
    const clubs = await this.prisma.club.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
    });
    return clubs.map((club) => this.toClub(club));
  }

  async getClub(clubId: string): Promise<Club> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }
    return this.toClub(club);
  }

  async addMember(clubId: string, email: string): Promise<ClubMember> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('No account with that email');
    }

    const existing = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: user.id, clubId } },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this club');
    }

    const membership = await this.prisma.clubMembership.create({
      data: { userId: user.id, clubId, role: 'MEMBER' },
    });

    return {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: membership.role,
      joinedAt: membership.createdAt.toISOString(),
    };
  }

  async listMembers(clubId: string): Promise<ClubMember[]> {
    const memberships = await this.prisma.clubMembership.findMany({
      where: { clubId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
    }));
  }

  async removeMember(clubId: string, userId: string): Promise<void> {
    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === 'ADMIN') {
      const adminCount = await this.prisma.clubMembership.count({
        where: { clubId, role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot remove the last admin of a club');
      }
    }

    // Unlink (not delete) any player tied to this account — the account no
    // longer has club access, but the roster entry and its history (stats,
    // attendance) are independent of that and should survive.
    await this.prisma.$transaction([
      this.prisma.player.updateMany({
        where: { clubId, userId },
        data: { userId: null },
      }),
      this.prisma.clubMembership.delete({
        where: { userId_clubId: { userId, clubId } },
      }),
    ]);
  }

  async listPlayers(clubId: string): Promise<Player[]> {
    const players = await this.prisma.player.findMany({
      where: { clubId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return players.map((p) => this.toPlayer(p));
  }

  async createPlayer(
    clubId: string,
    data: { firstName: string; lastName: string; userId?: string },
  ): Promise<Player> {
    if (data.userId) {
      await this.assertClubMember(clubId, data.userId);
    }
    try {
      const player = await this.prisma.player.create({
        data: { clubId, firstName: data.firstName, lastName: data.lastName, userId: data.userId },
      });
      return this.toPlayer(player);
    } catch (err) {
      throw this.toPlayerLinkError(err);
    }
  }

  async updatePlayer(
    clubId: string,
    playerId: string,
    data: { firstName?: string; lastName?: string; userId?: string | null },
  ): Promise<Player> {
    await this.findPlayerInClub(clubId, playerId);
    if (data.userId) {
      await this.assertClubMember(clubId, data.userId);
    }
    try {
      const player = await this.prisma.player.update({ where: { id: playerId }, data });
      return this.toPlayer(player);
    } catch (err) {
      throw this.toPlayerLinkError(err);
    }
  }

  private async assertClubMember(clubId: string, userId: string): Promise<void> {
    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!membership) {
      throw new BadRequestException('Le compte lié doit être membre du club');
    }
  }

  private toPlayerLinkError(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      return new ConflictException('Ce membre est déjà lié à un autre joueur');
    }
    return err;
  }

  async deletePlayer(clubId: string, playerId: string): Promise<void> {
    await this.findPlayerInClub(clubId, playerId);
    await this.prisma.player.delete({ where: { id: playerId } });
  }

  private async findPlayerInClub(clubId: string, playerId: string): Promise<void> {
    const existing = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!existing || existing.clubId !== clubId) {
      throw new NotFoundException('Player not found');
    }
  }

  private toPlayer(player: {
    id: string;
    clubId: string;
    firstName: string;
    lastName: string;
    userId: string | null;
    createdAt: Date;
  }): Player {
    return {
      id: player.id,
      clubId: player.clubId,
      firstName: player.firstName,
      lastName: player.lastName,
      userId: player.userId,
      createdAt: player.createdAt.toISOString(),
    };
  }

  private toClub(club: { id: string; name: string; createdAt: Date }): Club {
    return { id: club.id, name: club.name, createdAt: club.createdAt.toISOString() };
  }
}
