import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: { getDashboard: jest.Mock };

  beforeEach(async () => {
    service = { getDashboard: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  it('delegates the current user id and query range to the service', async () => {
    service.getDashboard.mockResolvedValue({ totalPlayers: 3, upcomingEvents: [] });

    const result = await controller.getDashboard(
      { id: 'user-1', email: 'a@b.com' },
      { from: '2026-08-11T00:00:00.000Z', to: '2026-08-18T00:00:00.000Z' },
    );

    expect(service.getDashboard).toHaveBeenCalledWith(
      'user-1',
      '2026-08-11T00:00:00.000Z',
      '2026-08-18T00:00:00.000Z',
    );
    expect(result).toEqual({ totalPlayers: 3, upcomingEvents: [] });
  });
});
