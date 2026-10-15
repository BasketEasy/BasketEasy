import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { MatchStats, TeamSeasonStats } from '@basketeasy/types/team-stats';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { AllowGuardians } from '../auth/decorators/allow-guardians.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { TeamStatsService } from './team-stats.service';
import { GetTeamStatsDto } from './dto/get-team-stats.dto';
import { ActingAsQueryDto } from '../common/dto/acting-as-query.dto';

@Controller('clubs/:clubId/teams/:teamId/stats')
@UseGuards(JwtAuthGuard)
export class TeamStatsController {
  constructor(private readonly teamStatsService: TeamStatsService) {}

  // Read-only, and visible to the same audience as the team's events — a
  // season's box scores are the team's own record, not a manager's report.
  @Get()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  getTeamSeasonStats(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Query() query: GetTeamStatsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamSeasonStats> {
    return this.teamStatsService.getTeamSeasonStats(
      clubId,
      teamId,
      user.id,
      query.season,
      query.forPlayerId,
    );
  }

  // One match's lines, same audience as the event itself (and as the season
  // table above): the team's own record of a game its members played.
  @Get('matches/:eventId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  getMatchStats(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Query() query: ActingAsQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MatchStats> {
    return this.teamStatsService.getMatchStats(clubId, teamId, eventId, user.id, query.forPlayerId);
  }
}
