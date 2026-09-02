import { Test, TestingModule } from '@nestjs/testing';
import { TeamStatsController } from './team-stats.controller';
import { TeamStatsService } from './team-stats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';

describe('TeamStatsController', () => {
  let controller: TeamStatsController;
  let service: { getTeamSeasonStats: jest.Mock };

  beforeEach(async () => {
    service = { getTeamSeasonStats: jest.fn().mockResolvedValue({ seasonYear: 2026 }) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamStatsController],
      providers: [{ provide: TeamStatsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ClubRolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TeamStatsController>(TeamStatsController);
  });

  it('passes the requested season through', async () => {
    await controller.getTeamSeasonStats('club-1', 'team-1', { season: 2025 });

    expect(service.getTeamSeasonStats).toHaveBeenCalledWith('club-1', 'team-1', 2025);
  });

  it('leaves the season undefined so the service picks the current one', async () => {
    const result = await controller.getTeamSeasonStats('club-1', 'team-1', {});

    expect(service.getTeamSeasonStats).toHaveBeenCalledWith('club-1', 'team-1', undefined);
    expect(result).toEqual({ seasonYear: 2026 });
  });
});
