import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Club } from '@basketeasy/types/clubs';
import type { ClubMember } from '@basketeasy/types/club-members';
import { PrismaService } from '../prisma/prisma.service';

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

    await this.prisma.clubMembership.delete({
      where: { userId_clubId: { userId, clubId } },
    });
  }

  private toClub(club: { id: string; name: string; createdAt: Date }): Club {
    return { id: club.id, name: club.name, createdAt: club.createdAt.toISOString() };
  }
}
