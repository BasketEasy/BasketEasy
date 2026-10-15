import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { TeamsService } from './teams.service';
import { ActingAsQueryDto } from '../common/dto/acting-as-query.dto';

// Not club-scoped (unlike TeamsController), so it's a separate controller
// rather than a route on `clubs/:clubId/teams` — "which teams am I part of"
// has no :clubId in the URL to key off.
@Controller('me/teams')
@UseGuards(JwtAuthGuard)
export class MyTeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  listMyTeams(
    @CurrentUser() user: RequestUser,
    @Query() query: ActingAsQueryDto,
  ): Promise<MyTeamSummary[]> {
    return this.teamsService.listTeamsForUser(user.id, query.forPlayerId);
  }
}
