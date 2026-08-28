import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Gender } from '@prisma/client';
import type { Club } from '@basketeasy/types/clubs';
import type { ClubMember, ClubMemberSortBy } from '@basketeasy/types/club-members';
import type {
  ImportPlayersRow,
  ImportPlayersResult,
  Player,
  PlayerSortBy,
} from '@basketeasy/types/players';
import type { PaginatedResult, SortOrder } from '@basketeasy/types/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePagination } from '../common/pagination';
import { ListClubMembersDto } from './dto/list-club-members.dto';
import { ListPlayersDto } from './dto/list-players.dto';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  async createClub(userId: string, data: { name: string; ffbbClubCode?: string }): Promise<Club> {
    try {
      const club = await this.prisma.club.create({
        data: {
          name: data.name,
          ffbbClubCode: data.ffbbClubCode ?? null,
          memberships: { create: { userId, role: 'ADMIN' } },
        },
      });
      return this.toClub(club);
    } catch (err) {
      throw this.toFfbbClubCodeError(err);
    }
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

  // ffbbClubCode is stored unvalidated — no working lookup exists to
  // confirm a code is real (see docs/superpowers/specs/2026-08-26-ffbb-calendar-import-design.md).
  async setFfbbLink(clubId: string, ffbbClubCode: string): Promise<Club> {
    await this.assertClubExists(clubId);
    try {
      const club = await this.prisma.club.update({ where: { id: clubId }, data: { ffbbClubCode } });
      return this.toClub(club);
    } catch (err) {
      throw this.toFfbbClubCodeError(err);
    }
  }

  async removeFfbbLink(clubId: string): Promise<void> {
    await this.assertClubExists(clubId);
    await this.prisma.club.update({ where: { id: clubId }, data: { ffbbClubCode: null } });
  }

  private async assertClubExists(clubId: string): Promise<void> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }
  }

  private toFfbbClubCodeError(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      return new ConflictException('Ce code club FFBB est déjà utilisé par un autre club');
    }
    return err;
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

  async listMembers(
    clubId: string,
    query: ListClubMembersDto,
  ): Promise<PaginatedResult<ClubMember>> {
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
    data: {
      firstName: string;
      lastName: string;
      userId?: string;
      nationalId?: string;
      licenseNumber?: string;
      birthDate?: string;
      gender?: Gender;
      licenseType?: string;
    },
  ): Promise<Player> {
    if (data.userId) {
      await this.assertClubMember(clubId, data.userId);
    }
    try {
      const player = await this.prisma.player.create({
        data: {
          clubId,
          firstName: data.firstName,
          lastName: data.lastName,
          userId: data.userId,
          nationalId: data.nationalId,
          licenseNumber: data.licenseNumber,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          gender: data.gender,
          licenseType: data.licenseType,
        },
      });
      return this.toPlayer(player);
    } catch (err) {
      throw this.toPlayerLinkError(err);
    }
  }

  async updatePlayer(
    clubId: string,
    playerId: string,
    data: {
      firstName?: string;
      lastName?: string;
      userId?: string | null;
      nationalId?: string | null;
      licenseNumber?: string | null;
      birthDate?: string | null;
      gender?: Gender | null;
      licenseType?: string | null;
    },
  ): Promise<Player> {
    await this.findPlayerInClub(clubId, playerId);
    if (data.userId) {
      await this.assertClubMember(clubId, data.userId);
    }
    try {
      const player = await this.prisma.player.update({
        where: { id: playerId },
        data: {
          ...data,
          birthDate:
            data.birthDate === undefined
              ? undefined
              : data.birthDate
                ? new Date(data.birthDate)
                : null,
        },
      });
      return this.toPlayer(player);
    } catch (err) {
      throw this.toPlayerLinkError(err);
    }
  }

  async importPlayers(clubId: string, rows: ImportPlayersRow[]): Promise<ImportPlayersResult> {
    return this.prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      let conflicts = 0;

      for (const row of rows) {
        const data = {
          firstName: row.firstName,
          lastName: row.lastName,
          nationalId: row.nationalId ?? null,
          licenseNumber: row.licenseNumber ?? null,
          birthDate: row.birthDate ? new Date(row.birthDate) : null,
          gender: row.gender ?? null,
          licenseType: row.licenseType ?? null,
        };

        const byNationalId = row.nationalId
          ? await tx.player.findUnique({ where: { nationalId: row.nationalId } })
          : null;

        if (byNationalId) {
          if (byNationalId.clubId !== clubId) {
            conflicts++;
            continue;
          }
          await tx.player.update({ where: { id: byNationalId.id }, data });
          updated++;
          continue;
        }

        const byNameAndBirthDate =
          row.birthDate &&
          (await tx.player.findFirst({
            where: {
              clubId,
              firstName: row.firstName,
              lastName: row.lastName,
              birthDate: new Date(row.birthDate),
            },
          }));

        if (byNameAndBirthDate) {
          await tx.player.update({ where: { id: byNameAndBirthDate.id }, data });
          updated++;
          continue;
        }

        await tx.player.create({ data: { ...data, clubId } });
        created++;
      }

      return { created, updated, conflicts };
    });
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
    nationalId: string | null;
    licenseNumber: string | null;
    birthDate: Date | null;
    gender: Gender | null;
    licenseType: string | null;
    createdAt: Date;
  }): Player {
    return {
      id: player.id,
      clubId: player.clubId,
      firstName: player.firstName,
      lastName: player.lastName,
      userId: player.userId,
      nationalId: player.nationalId,
      licenseNumber: player.licenseNumber,
      birthDate: player.birthDate ? player.birthDate.toISOString() : null,
      gender: player.gender,
      licenseType: player.licenseType,
      createdAt: player.createdAt.toISOString(),
    };
  }

  private toClub(club: {
    id: string;
    name: string;
    ffbbClubCode: string | null;
    createdAt: Date;
  }): Club {
    return {
      id: club.id,
      name: club.name,
      ffbbClubCode: club.ffbbClubCode,
      createdAt: club.createdAt.toISOString(),
    };
  }
}
