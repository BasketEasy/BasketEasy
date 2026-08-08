import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Team, TeamMember } from '@basketeasy/types/teams';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';

@Controller('clubs/:clubId/teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  createTeam(@Param('clubId') clubId: string, @Body() dto: CreateTeamDto): Promise<Team> {
    return this.teamsService.createTeam(clubId, dto.name);
  }

  @Get()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listTeams(@Param('clubId') clubId: string): Promise<Team[]> {
    return this.teamsService.listTeamsForClub(clubId);
  }

  @Get(':teamId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  getTeam(@Param('clubId') clubId: string, @Param('teamId') teamId: string): Promise<Team> {
    return this.teamsService.getTeam(clubId, teamId);
  }

  @Post(':teamId/members')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  addMember(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamMemberDto,
  ): Promise<TeamMember> {
    return this.teamsService.addMember(clubId, teamId, dto.userId);
  }

  @Get(':teamId/members')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listMembers(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
  ): Promise<TeamMember[]> {
    return this.teamsService.listMembers(clubId, teamId);
  }

  @Delete(':teamId/members/:userId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.teamsService.removeMember(clubId, teamId, userId);
  }
}
