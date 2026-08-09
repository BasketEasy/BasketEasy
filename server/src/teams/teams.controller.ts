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
  UseGuards,
} from '@nestjs/common';
import type { Team, TeamClubLink, TeamPlayer } from '@basketeasy/types/teams';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddTeamClubDto } from './dto/add-team-club.dto';
import { AddTeamPlayerDto } from './dto/add-team-player.dto';

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
  listTeams(@Param('clubId') clubId: string): Promise<Team[]> {
    return this.teamsService.listTeams(clubId);
  }

  @Get(':teamId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  getTeam(@Param('clubId') clubId: string, @Param('teamId') teamId: string): Promise<Team> {
    return this.teamsService.getTeam(clubId, teamId);
  }

  @Patch(':teamId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
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
  ): Promise<TeamClubLink[]> {
    return this.teamsService.listTeamClubs(clubId, teamId);
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
  ): Promise<TeamPlayer[]> {
    return this.teamsService.listTeamPlayers(clubId, teamId);
  }

  @Post(':teamId/players')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  addTeamPlayer(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamPlayerDto,
  ): Promise<TeamPlayer> {
    return this.teamsService.addTeamPlayer(clubId, teamId, dto.playerId);
  }

  @Delete(':teamId/players/:playerId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTeamPlayer(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('playerId') playerId: string,
  ): Promise<void> {
    return this.teamsService.removeTeamPlayer(clubId, teamId, playerId);
  }
}
