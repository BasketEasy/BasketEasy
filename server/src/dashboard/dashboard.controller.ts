import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { MyDashboardSummary } from '@basketeasy/types/my-dashboard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { GetDashboardDto } from './dto/get-dashboard.dto';

// Not club-scoped, same reasoning as MyTeamsController — "my dashboard" has
// no :clubId in the URL to key off, it spans every club/team the caller is
// part of.
@Controller('me/dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getDashboard(
    @CurrentUser() user: RequestUser,
    @Query() query: GetDashboardDto,
  ): Promise<MyDashboardSummary> {
    return this.dashboardService.getDashboard(user.id, query.from, query.to, query.forPlayerId);
  }
}
