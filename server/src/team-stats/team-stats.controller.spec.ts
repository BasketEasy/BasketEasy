import { Test, TestingModule } from '@nestjs/testing';
import { TeamStatsController } from './team-stats.controller';
import { TeamStatsService } from './team-stats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';

describe('TeamStatsController', () => {
  let controller: TeamStatsController;
  let service: { getTeamSeasonStats: jest.Mock; getMatchStats: jest.Mock };

  beforeEach(async () => {
    service = {
      getTeamSeasonStats: jest.fn().mockResolvedValue({ seasonYear: 2026 }),
      getMatchStats: jest.fn().mockResolvedValue({ hasStats: false, lines: [] }),
    };

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
    await controller.getTeamSeasonStats(
      'club-1',
      'team-1',
      { season: 2025 },
      { id: 'user-1', email: 'a@example.com' },
    );

    expect(service.getTeamSeasonStats).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'user-1',
      2025,
      undefined,
    );
  });

  it('leaves the season undefined so the service picks the current one', async () => {
    const result = await controller.getTeamSeasonStats(
      'club-1',
      'team-1',
      {},
      { id: 'user-1', email: 'a@example.com' },
    );

    expect(service.getTeamSeasonStats).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'user-1',
      undefined,
      undefined,
    );
    expect(result).toEqual({ seasonYear: 2026 });
  });

  it("passes the caller's id through so the service can resolve isMe", async () => {
    await controller.getTeamSeasonStats(
      'club-1',
      'team-1',
      {},
      { id: 'user-caller', email: 'a@example.com' },
    );

    expect(service.getTeamSeasonStats).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'user-caller',
      undefined,
      undefined,
    );
  });

  it('passes the match and the persona through for one match’s stats', async () => {
    const result = await controller.getMatchStats(
      'club-1',
      'team-1',
      'event-1',
      { forPlayerId: 'child-1' },
      { id: 'user-1', email: 'a@example.com' },
    );

    expect(service.getMatchStats).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      'user-1',
      'child-1',
    );
    expect(result).toEqual({ hasStats: false, lines: [] });
  });
});
