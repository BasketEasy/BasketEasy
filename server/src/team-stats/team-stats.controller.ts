import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { TeamSeasonStats } from '@basketeasy/types/team-stats';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { TeamStatsService } from './team-stats.service';
import { GetTeamStatsDto } from './dto/get-team-stats.dto';

@Controller('clubs/:clubId/teams/:teamId/stats')
@UseGuards(JwtAuthGuard)
export class TeamStatsController {
  constructor(private readonly teamStatsService: TeamStatsService) {}

  // Read-only, and visible to the same audience as the team's events — a
  // season's box scores are the team's own record, not a manager's report.
  @Get()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  getTeamSeasonStats(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Query() query: GetTeamStatsDto,
  ): Promise<TeamSeasonStats> {
    return this.teamStatsService.getTeamSeasonStats(clubId, teamId, query.season);
  }
}
