import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Team, TeamClubLink, TeamPlayer } from '@basketeasy/types/teams';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import type { TeamAdmin, TeamAdminCandidate } from '@basketeasy/types/team-admins';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddTeamClubDto } from './dto/add-team-club.dto';
import { AddTeamPlayerDto } from './dto/add-team-player.dto';
import { ListTeamsDto } from './dto/list-teams.dto';
import { ListTeamClubsDto } from './dto/list-team-clubs.dto';
import { ListTeamPlayersDto } from './dto/list-team-players.dto';
import { UpdateTeamPlayerDto } from './dto/update-team-player.dto';
import { AddTeamAdminDto } from './dto/add-team-admin.dto';

@Controller('clubs/:clubId/teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  createTeam(@Param('clubId') clubId: string, @Body() dto: CreateTeamDto): Promise<Team> {
    return this.teamsService.createTeam(clubId, dto);
  }

  @Get()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listTeams(
    @Param('clubId') clubId: string,
    @Query() query: ListTeamsDto,
  ): Promise<PaginatedResult<Team>> {
    return this.teamsService.listTeams(clubId, query);
  }

  @Get(':teamId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  getTeam(@Param('clubId') clubId: string, @Param('teamId') teamId: string): Promise<Team> {
    return this.teamsService.getTeam(clubId, teamId);
  }

  @Patch(':teamId')
  @UseGuards(TeamManagerGuard)
  updateTeam(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<Team> {
    return this.teamsService.updateTeam(clubId, teamId, dto);
  }

  @Delete(':teamId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTeam(@Param('clubId') clubId: string, @Param('teamId') teamId: string): Promise<void> {
    return this.teamsService.deleteTeam(clubId, teamId);
  }

  @Get(':teamId/clubs')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listTeamClubs(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Query() query: ListTeamClubsDto,
  ): Promise<PaginatedResult<TeamClubLink>> {
    return this.teamsService.listTeamClubs(clubId, teamId, query);
  }

  @Post(':teamId/clubs')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  addTeamClub(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamClubDto,
  ): Promise<TeamClubLink> {
    return this.teamsService.addTeamClub(clubId, teamId, dto.clubId);
  }

  @Delete(':teamId/clubs/:partnerClubId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTeamClub(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('partnerClubId') partnerClubId: string,
  ): Promise<void> {
    return this.teamsService.removeTeamClub(clubId, teamId, partnerClubId);
  }

  @Get(':teamId/players')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listTeamPlayers(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Query() query: ListTeamPlayersDto,
  ): Promise<PaginatedResult<TeamPlayer>> {
    return this.teamsService.listTeamPlayers(clubId, teamId, query);
  }

  @Post(':teamId/players')
  @UseGuards(TeamManagerGuard)
  addTeamPlayer(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamPlayerDto,
  ): Promise<TeamPlayer> {
    return this.teamsService.addTeamPlayer(clubId, teamId, dto.playerId, dto.role);
  }

  @Patch(':teamId/players/:playerId')
  @UseGuards(TeamManagerGuard)
  updateTeamPlayerRole(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('playerId') playerId: string,
    @Body() dto: UpdateTeamPlayerDto,
  ): Promise<TeamPlayer> {
    return this.teamsService.updateTeamPlayerRole(clubId, teamId, playerId, dto.role);
  }

  @Delete(':teamId/players/:playerId')
  @UseGuards(TeamManagerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTeamPlayer(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('playerId') playerId: string,
  ): Promise<void> {
    return this.teamsService.removeTeamPlayer(clubId, teamId, playerId);
  }

  @Get(':teamId/admins')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listTeamAdmins(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
  ): Promise<TeamAdmin[]> {
    return this.teamsService.listTeamAdmins(clubId, teamId);
  }

  @Get(':teamId/admins/eligible')
  @UseGuards(TeamManagerGuard)
  listEligibleAdmins(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
  ): Promise<TeamAdminCandidate[]> {
    return this.teamsService.listEligibleAdmins(clubId, teamId);
  }

  @Post(':teamId/admins')
  @UseGuards(TeamManagerGuard)
  addTeamAdmin(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamAdminDto,
  ): Promise<TeamAdmin> {
    return this.teamsService.addTeamAdmin(clubId, teamId, dto.userId);
  }

  @Delete(':teamId/admins/:userId')
  @UseGuards(TeamManagerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTeamAdmin(
    @CurrentUser() user: RequestUser,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.teamsService.removeTeamAdmin(clubId, teamId, userId, user.id);
  }
}
