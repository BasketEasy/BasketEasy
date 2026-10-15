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
import type { FfbbImportResult, PouleResults, TeamFfbbLink } from '@basketeasy/types/ffbb';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { AllowGuardians } from '../auth/decorators/allow-guardians.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { FfbbImportService } from '../ffbb/ffbb-import.service';
import { FfbbPouleService } from '../ffbb/ffbb-poule.service';
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
import { AddFfbbLinkDto } from './dto/add-ffbb-link.dto';

@Controller('clubs/:clubId/teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly ffbbImportService: FfbbImportService,
    private readonly ffbbPouleService: FfbbPouleService,
  ) {}

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
  @AllowGuardians()
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
  @AllowGuardians()
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
  @AllowGuardians()
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
  updateTeamPlayer(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('playerId') playerId: string,
    @Body() dto: UpdateTeamPlayerDto,
  ): Promise<TeamPlayer> {
    return this.teamsService.updateTeamPlayer(clubId, teamId, playerId, dto);
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

  @Get(':teamId/ffbb-links')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  listFfbbLinks(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
  ): Promise<TeamFfbbLink[]> {
    return this.teamsService.listFfbbLinks(clubId, teamId);
  }

  @Post(':teamId/ffbb-links')
  @UseGuards(TeamManagerGuard)
  addFfbbLink(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: AddFfbbLinkDto,
  ): Promise<TeamFfbbLink> {
    return this.teamsService.addFfbbLink(clubId, teamId, dto.ffbbTeamUrl);
  }

  @Delete(':teamId/ffbb-links/:linkId')
  @UseGuards(TeamManagerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFfbbLink(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('linkId') linkId: string,
  ): Promise<void> {
    return this.teamsService.removeFfbbLink(clubId, teamId, linkId);
  }

  @Post(':teamId/ffbb-import')
  @UseGuards(TeamManagerGuard)
  importFfbbSchedule(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
  ): Promise<FfbbImportResult> {
    return this.ffbbImportService.importSchedule(clubId, teamId);
  }

  @Get(':teamId/ffbb-poule-results')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  getFfbbPouleResults(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
  ): Promise<PouleResults> {
    return this.ffbbPouleService.getPouleResults(clubId, teamId);
  }

  // Not @AllowGuardians(): TeamAdmin carries each coach's e-mail, and a
  // parent who is nothing else in the club never sees other people's
  // addresses (guardians design, decision 17).
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

  // Gated on a verified address: a TeamAdmin grant hands someone else the
  // roster, the events and the team's info. See EmailVerifiedGuard.
  @Post(':teamId/admins')
  @UseGuards(TeamManagerGuard, EmailVerifiedGuard)
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
