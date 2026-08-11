import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Club } from '@basketeasy/types/clubs';
import type { ClubMember, ClubMemberSortBy } from '@basketeasy/types/club-members';
import type { Player, PlayerSortBy } from '@basketeasy/types/players';
import type { PaginatedResult, SortOrder } from '@basketeasy/types/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePagination } from '../common/pagination';
import { ListClubMembersDto } from './dto/list-club-members.dto';
import { ListPlayersDto } from './dto/list-players.dto';

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

  async listMembers(clubId: string, query: ListClubMembersDto): Promise<PaginatedResult<ClubMember>> {
    const { skip, take, page, pageSize } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.ClubMembershipWhereInput = {
      clubId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            user: {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' } },
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const orderBy = this.membersOrderBy(query.sortBy, query.sortOrder);

    const [memberships, total] = await Promise.all([
      this.prisma.clubMembership.findMany({ where, include: { user: true }, orderBy, skip, take }),
      this.prisma.clubMembership.count({ where }),
    ]);

    return { items: memberships.map((m) => this.toClubMember(m)), total, page, pageSize };
  }

  private membersOrderBy(
    sortBy?: ClubMemberSortBy,
    sortOrder?: SortOrder,
  ): Prisma.ClubMembershipOrderByWithRelationInput[] {
    const order = sortOrder ?? 'asc';
    switch (sortBy) {
      case 'email':
        return [{ user: { email: order } }];
      case 'joinedAt':
        return [{ createdAt: order }];
      case 'name':
      default:
        return [{ user: { lastName: order } }, { user: { firstName: order } }];
    }
  }

  private toClubMember(membership: {
    userId: string;
    role: ClubMember['role'];
    createdAt: Date;
    user: { email: string; firstName: string | null; lastName: string | null };
  }): ClubMember {
    return {
      userId: membership.userId,
      email: membership.user.email,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      role: membership.role,
      joinedAt: membership.createdAt.toISOString(),
    };
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

  async listPlayers(clubId: string, query: ListPlayersDto): Promise<PaginatedResult<Player>> {
    const { skip, take, page, pageSize } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.PlayerWhereInput = {
      clubId,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy = this.playersOrderBy(query.sortBy, query.sortOrder);

    const [players, total] = await Promise.all([
      this.prisma.player.findMany({ where, orderBy, skip, take }),
      this.prisma.player.count({ where }),
    ]);

    return { items: players.map((p) => this.toPlayer(p)), total, page, pageSize };
  }

  private playersOrderBy(
    sortBy?: PlayerSortBy,
    sortOrder?: SortOrder,
  ): Prisma.PlayerOrderByWithRelationInput[] {
    const order = sortOrder ?? 'asc';
    if (sortBy === 'createdAt') {
      return [{ createdAt: order }];
    }
    return [{ lastName: order }, { firstName: order }];
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
