import { Test, TestingModule } from '@nestjs/testing';
import { MyTeamsController } from './my-teams.controller';
import { TeamsService } from './teams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('MyTeamsController', () => {
  let controller: MyTeamsController;
  let service: { listTeamsForUser: jest.Mock };

  beforeEach(async () => {
    service = { listTeamsForUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MyTeamsController],
      providers: [{ provide: TeamsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MyTeamsController>(MyTeamsController);
  });

  it('listMyTeams delegates the current user id', async () => {
    service.listTeamsForUser.mockResolvedValue([
      {
        teamId: 'team-1',
        teamName: 'U15',
        category: 'U15',
        gender: 'MEN',
        clubId: 'club-1',
        clubName: 'COC Basket',
        isTeamAdmin: true,
        rosterRole: null,
      },
    ]);

    const result = await controller.listMyTeams({ id: 'user-1', email: 'a@b.com' }, {});

    expect(service.listTeamsForUser).toHaveBeenCalledWith('user-1', undefined);
    expect(result).toHaveLength(1);
  });
});
