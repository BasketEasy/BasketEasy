import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Team } from '@basketeasy/types/teams';
import type { TeamMember } from '@basketeasy/types/teams';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTeam(clubId: string, name: string): Promise<Team> {
    const team = await this.prisma.team.create({
      data: { name, clubs: { create: { clubId } } },
      include: { clubs: true },
    });
    return this.toTeam(team);
  }

  async listTeamsForClub(clubId: string): Promise<Team[]> {
    const teams = await this.prisma.team.findMany({
      where: { clubs: { some: { clubId } } },
      include: { clubs: true },
      orderBy: { createdAt: 'asc' },
    });
    return teams.map((t) => this.toTeam(t));
  }

  async getTeam(clubId: string, teamId: string): Promise<Team> {
    const team = await this.findTeamInClub(clubId, teamId);
    return this.toTeam(team);
  }

  async addMember(clubId: string, teamId: string, userId: string): Promise<TeamMember> {
    await this.findTeamInClub(clubId, teamId);

    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      include: { user: true },
    });
    if (!membership) {
      throw new NotFoundException('User is not a member of this club');
    }

    const existing = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (existing) {
      throw new ConflictException('User is already on this team');
    }

    const teamMembership = await this.prisma.teamMembership.create({
      data: { teamId, userId },
    });

    return {
      userId,
      email: membership.user.email,
      addedAt: teamMembership.createdAt.toISOString(),
    };
  }

  async listMembers(clubId: string, teamId: string): Promise<TeamMember[]> {
    await this.findTeamInClub(clubId, teamId);

    const memberships = await this.prisma.teamMembership.findMany({
      where: { teamId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      addedAt: m.createdAt.toISOString(),
    }));
  }

  async removeMember(clubId: string, teamId: string, userId: string): Promise<void> {
    await this.findTeamInClub(clubId, teamId);

    const membership = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Team membership not found');
    }

    await this.prisma.teamMembership.delete({
      where: { teamId_userId: { teamId, userId } },
    });
  }

  private async findTeamInClub(
    clubId: string,
    teamId: string,
  ): Promise<{ id: string; name: string; createdAt: Date; clubs: { clubId: string }[] }> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { clubs: true },
    });
    if (!team || !team.clubs.some((c) => c.clubId === clubId)) {
      throw new NotFoundException('Team not found');
    }
    return team;
  }

  private toTeam(team: {
    id: string;
    name: string;
    createdAt: Date;
    clubs: { clubId: string }[];
  }): Team {
    return {
      id: team.id,
      name: team.name,
      clubIds: team.clubs.map((c) => c.clubId),
      createdAt: team.createdAt.toISOString(),
    };
  }
}
