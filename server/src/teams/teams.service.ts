import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TeamCategory, TeamGender, TeamMemberRole } from '@prisma/client';
import type { Team, TeamClubLink, TeamPlayer } from '@basketeasy/types/teams';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
import { PrismaService } from '../prisma/prisma.service';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTeam(
    clubId: string,
    data: { name: string; category: TeamCategory; gender: TeamGender },
  ): Promise<Team> {
    const team = await this.prisma.team.create({
      data: {
        name: data.name,
        category: data.category,
        gender: data.gender,
        clubTeams: { create: { clubId, isOwner: true } },
      },
    });
    return this.toTeam(team);
  }

  async listTeams(clubId: string): Promise<Team[]> {
    const teams = await this.prisma.team.findMany({
      where: { clubTeams: { some: { clubId } } },
      orderBy: { createdAt: 'asc' },
    });
    return teams.map((t) => this.toTeam(t));
  }

  async getTeam(clubId: string, teamId: string): Promise<Team> {
    await this.assertTeamInClub(clubId, teamId);
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    return this.toTeam(team);
  }

  async updateTeam(
    clubId: string,
    teamId: string,
    data: { name?: string; category?: TeamCategory; gender?: TeamGender },
  ): Promise<Team> {
    await this.assertTeamInClub(clubId, teamId);
    const team = await this.prisma.team.update({ where: { id: teamId }, data });
    return this.toTeam(team);
  }

  async deleteTeam(clubId: string, teamId: string): Promise<void> {
    await this.assertTeamOwner(clubId, teamId);
    // ClubTeam and TeamPlayer rows cascade-delete at the DB level.
    await this.prisma.team.delete({ where: { id: teamId } });
  }

  async listTeamClubs(clubId: string, teamId: string): Promise<TeamClubLink[]> {
    await this.assertTeamInClub(clubId, teamId);
    const clubTeams = await this.prisma.clubTeam.findMany({
      where: { teamId },
      include: { club: true },
      orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }],
    });
    return clubTeams.map((ct) => this.toTeamClubLink(ct));
  }

  async addTeamClub(clubId: string, teamId: string, partnerClubId: string): Promise<TeamClubLink> {
    await this.assertTeamOwner(clubId, teamId);

    const partnerClub = await this.prisma.club.findUnique({ where: { id: partnerClubId } });
    if (!partnerClub) {
      throw new NotFoundException('Club not found');
    }

    try {
      const clubTeam = await this.prisma.clubTeam.create({
        data: { clubId: partnerClubId, teamId, isOwner: false },
        include: { club: true },
      });
      return this.toTeamClubLink(clubTeam);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException('Ce club est déjà associé à cette équipe');
      }
      throw err;
    }
  }

  async removeTeamClub(clubId: string, teamId: string, partnerClubId: string): Promise<void> {
    await this.assertTeamOwner(clubId, teamId);

    if (partnerClubId === clubId) {
      throw new BadRequestException(
        "Impossible de retirer le club propriétaire ; supprimez l'équipe à la place",
      );
    }

    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId: partnerClubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Club not found on this team');
    }

    await this.prisma.$transaction([
      this.prisma.teamPlayer.deleteMany({
        where: { teamId, player: { clubId: partnerClubId } },
      }),
      this.prisma.clubTeam.delete({
        where: { clubId_teamId: { clubId: partnerClubId, teamId } },
      }),
    ]);
  }

  async listTeamPlayers(clubId: string, teamId: string): Promise<TeamPlayer[]> {
    await this.assertTeamInClub(clubId, teamId);
    const teamPlayers = await this.prisma.teamPlayer.findMany({
      where: { teamId },
      include: { player: true },
      orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
    });
    return teamPlayers.map((tp) => this.toTeamPlayer(tp));
  }

  async addTeamPlayer(
    clubId: string,
    teamId: string,
    playerId: string,
    role: TeamMemberRole = 'PLAYER',
  ): Promise<TeamPlayer> {
    await this.assertTeamInClub(clubId, teamId);

    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) {
      throw new NotFoundException('Player not found');
    }

    const playerClubLinked = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId: player.clubId, teamId } },
    });
    if (!playerClubLinked) {
      throw new BadRequestException('Le joueur doit appartenir à un club associé à cette équipe');
    }

    try {
      const teamPlayer = await this.prisma.teamPlayer.create({
        data: { teamId, playerId, role },
        include: { player: true },
      });
      return this.toTeamPlayer(teamPlayer);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException("Ce joueur fait déjà partie de l'effectif");
      }
      throw err;
    }
  }

  async updateTeamPlayerRole(
    clubId: string,
    teamId: string,
    playerId: string,
    role: TeamMemberRole,
  ): Promise<TeamPlayer> {
    await this.assertTeamInClub(clubId, teamId);

    const teamPlayer = await this.prisma.teamPlayer.findUnique({
      where: { teamId_playerId: { teamId, playerId } },
    });
    if (!teamPlayer) {
      throw new NotFoundException('Player not found on this team');
    }

    const updated = await this.prisma.teamPlayer.update({
      where: { id: teamPlayer.id },
      data: { role },
      include: { player: true },
    });
    return this.toTeamPlayer(updated);
  }

  async removeTeamPlayer(clubId: string, teamId: string, playerId: string): Promise<void> {
    await this.assertTeamInClub(clubId, teamId);

    const teamPlayer = await this.prisma.teamPlayer.findUnique({
      where: { teamId_playerId: { teamId, playerId } },
    });
    if (!teamPlayer) {
      throw new NotFoundException('Player not found on this team');
    }

    await this.prisma.teamPlayer.delete({ where: { id: teamPlayer.id } });
  }

  async listTeamAdmins(clubId: string, teamId: string): Promise<TeamAdmin[]> {
    await this.assertTeamInClub(clubId, teamId);
    const teamAdmins = await this.prisma.teamAdmin.findMany({
      where: { teamId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return teamAdmins.map((ta) => this.toTeamAdmin(ta));
  }

  async addTeamAdmin(clubId: string, teamId: string, email: string): Promise<TeamAdmin> {
    await this.assertTeamInClub(clubId, teamId);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('No account with that email');
    }

    const membership = await this.prisma.clubMembership.findFirst({
      where: { userId: user.id, club: { clubTeams: { some: { teamId } } } },
    });
    if (!membership) {
      throw new BadRequestException(
        "L'utilisateur doit être membre d'un club associé à cette équipe",
      );
    }

    try {
      const teamAdmin = await this.prisma.teamAdmin.create({
        data: { teamId, userId: user.id },
        include: { user: true },
      });
      return this.toTeamAdmin(teamAdmin);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException('Cet utilisateur est déjà administrateur de cette équipe');
      }
      throw err;
    }
  }

  async removeTeamAdmin(clubId: string, teamId: string, userId: string): Promise<void> {
    await this.assertTeamInClub(clubId, teamId);

    const teamAdmin = await this.prisma.teamAdmin.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!teamAdmin) {
      throw new NotFoundException('Team admin not found');
    }

    await this.prisma.teamAdmin.delete({ where: { id: teamAdmin.id } });
  }

  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Team not found');
    }
  }

  private async assertTeamOwner(clubId: string, teamId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Team not found');
    }
    if (!clubTeam.isOwner) {
      throw new ForbiddenException('Only the owning club can manage this team');
    }
  }

  private toTeam(team: {
    id: string;
    name: string;
    category: TeamCategory;
    gender: TeamGender;
    createdAt: Date;
  }): Team {
    return {
      id: team.id,
      name: team.name,
      category: team.category,
      gender: team.gender,
      createdAt: team.createdAt.toISOString(),
    };
  }

  private toTeamClubLink(clubTeam: {
    clubId: string;
    isOwner: boolean;
    createdAt: Date;
    club: { name: string };
  }): TeamClubLink {
    return {
      clubId: clubTeam.clubId,
      clubName: clubTeam.club.name,
      isOwner: clubTeam.isOwner,
      linkedAt: clubTeam.createdAt.toISOString(),
    };
  }

  private toTeamPlayer(teamPlayer: {
    id: string;
    teamId: string;
    playerId: string;
    role: TeamMemberRole;
    createdAt: Date;
    player: { firstName: string; lastName: string; clubId: string };
  }): TeamPlayer {
    return {
      id: teamPlayer.id,
      teamId: teamPlayer.teamId,
      playerId: teamPlayer.playerId,
      firstName: teamPlayer.player.firstName,
      lastName: teamPlayer.player.lastName,
      clubId: teamPlayer.player.clubId,
      role: teamPlayer.role,
      createdAt: teamPlayer.createdAt.toISOString(),
    };
  }

  private toTeamAdmin(teamAdmin: {
    userId: string;
    teamId: string;
    createdAt: Date;
    user: { email: string };
  }): TeamAdmin {
    return {
      userId: teamAdmin.userId,
      email: teamAdmin.user.email,
      teamId: teamAdmin.teamId,
      createdAt: teamAdmin.createdAt.toISOString(),
    };
  }
}
