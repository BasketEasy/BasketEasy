import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TeamCategory, TeamGender } from '@prisma/client';
import type {
  Team,
  TeamClubLink,
  TeamClubSortBy,
  TeamPlayer,
  TeamPlayerSortBy,
  TeamSortBy,
} from '@basketeasy/types/teams';
import type { PaginatedResult, SortOrder } from '@basketeasy/types/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePagination } from '../common/pagination';
import { ListTeamsDto } from './dto/list-teams.dto';
import { ListTeamClubsDto } from './dto/list-team-clubs.dto';
import { ListTeamPlayersDto } from './dto/list-team-players.dto';

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

  async listTeams(clubId: string, query: ListTeamsDto): Promise<PaginatedResult<Team>> {
    const { skip, take, page, pageSize } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.TeamWhereInput = {
      clubTeams: { some: { clubId } },
      ...(query.category ? { category: query.category } : {}),
      ...(query.gender ? { gender: query.gender } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const orderBy = this.teamsOrderBy(query.sortBy, query.sortOrder);

    const [teams, total] = await Promise.all([
      this.prisma.team.findMany({ where, orderBy, skip, take }),
      this.prisma.team.count({ where }),
    ]);

    return { items: teams.map((t) => this.toTeam(t)), total, page, pageSize };
  }

  private teamsOrderBy(
    sortBy?: TeamSortBy,
    sortOrder?: SortOrder,
  ): Prisma.TeamOrderByWithRelationInput[] {
    const order = sortOrder ?? 'asc';
    switch (sortBy) {
      case 'category':
        return [{ category: order }];
      case 'createdAt':
        return [{ createdAt: order }];
      case 'name':
      default:
        return [{ name: order }];
    }
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

  async listTeamClubs(
    clubId: string,
    teamId: string,
    query: ListTeamClubsDto,
  ): Promise<PaginatedResult<TeamClubLink>> {
    await this.assertTeamInClub(clubId, teamId);
    const { skip, take, page, pageSize } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.ClubTeamWhereInput = {
      teamId,
      ...(query.search
        ? { club: { name: { contains: query.search, mode: 'insensitive' } } }
        : {}),
    };
    const orderBy = this.teamClubsOrderBy(query.sortBy, query.sortOrder);

    const [clubTeams, total] = await Promise.all([
      this.prisma.clubTeam.findMany({ where, include: { club: true }, orderBy, skip, take }),
      this.prisma.clubTeam.count({ where }),
    ]);

    return { items: clubTeams.map((ct) => this.toTeamClubLink(ct)), total, page, pageSize };
  }

  // The owning club always sorts first — a structural fact about who can
  // manage the CTC, not a sortable attribute — regardless of sortBy/sortOrder.
  private teamClubsOrderBy(
    sortBy?: TeamClubSortBy,
    sortOrder?: SortOrder,
  ): Prisma.ClubTeamOrderByWithRelationInput[] {
    const order = sortOrder ?? 'asc';
    if (sortBy === 'linkedAt') {
      return [{ isOwner: 'desc' }, { createdAt: order }];
    }
    return [{ isOwner: 'desc' }, { club: { name: order } }];
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

  async listTeamPlayers(
    clubId: string,
    teamId: string,
    query: ListTeamPlayersDto,
  ): Promise<PaginatedResult<TeamPlayer>> {
    await this.assertTeamInClub(clubId, teamId);
    const { skip, take, page, pageSize } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.TeamPlayerWhereInput = {
      teamId,
      ...(query.search
        ? {
            player: {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const orderBy = this.teamPlayersOrderBy(query.sortBy, query.sortOrder);

    const [teamPlayers, total] = await Promise.all([
      this.prisma.teamPlayer.findMany({ where, include: { player: true }, orderBy, skip, take }),
      this.prisma.teamPlayer.count({ where }),
    ]);

    return { items: teamPlayers.map((tp) => this.toTeamPlayer(tp)), total, page, pageSize };
  }

  private teamPlayersOrderBy(
    sortBy?: TeamPlayerSortBy,
    sortOrder?: SortOrder,
  ): Prisma.TeamPlayerOrderByWithRelationInput[] {
    const order = sortOrder ?? 'asc';
    if (sortBy === 'createdAt') {
      return [{ createdAt: order }];
    }
    return [{ player: { lastName: order } }, { player: { firstName: order } }];
  }

  async addTeamPlayer(clubId: string, teamId: string, playerId: string): Promise<TeamPlayer> {
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
        data: { teamId, playerId },
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
      createdAt: teamPlayer.createdAt.toISOString(),
    };
  }
}
