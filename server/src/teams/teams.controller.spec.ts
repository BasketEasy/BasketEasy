import { Test, TestingModule } from '@nestjs/testing';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';

describe('TeamsController', () => {
  let controller: TeamsController;
  let service: {
    createTeam: jest.Mock;
    listTeamsForClub: jest.Mock;
    getTeam: jest.Mock;
    addMember: jest.Mock;
    listMembers: jest.Mock;
    removeMember: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createTeam: jest.fn(),
      listTeamsForClub: jest.fn(),
      getTeam: jest.fn(),
      addMember: jest.fn(),
      listMembers: jest.fn(),
      removeMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [{ provide: TeamsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ClubRolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TeamsController>(TeamsController);
  });

  it('createTeam delegates clubId and name', async () => {
    service.createTeam.mockResolvedValue({
      id: 'team-1',
      name: 'U15',
      clubIds: ['club-1'],
      createdAt: 'x',
    });

    const result = await controller.createTeam('club-1', { name: 'U15' });

    expect(service.createTeam).toHaveBeenCalledWith('club-1', 'U15');
    expect(result.id).toBe('team-1');
  });

  it('addMember delegates clubId, teamId, and userId', async () => {
    service.addMember.mockResolvedValue({ userId: 'user-2', email: 'a@b.com', addedAt: 'x' });

    const result = await controller.addMember('club-1', 'team-1', { userId: 'user-2' });

    expect(service.addMember).toHaveBeenCalledWith('club-1', 'team-1', 'user-2');
    expect(result.userId).toBe('user-2');
  });

  it('removeMember delegates clubId, teamId, and userId', async () => {
    service.removeMember.mockResolvedValue(undefined);

    await controller.removeMember('club-1', 'team-1', 'user-2');

    expect(service.removeMember).toHaveBeenCalledWith('club-1', 'team-1', 'user-2');
  });

  it('getTeam delegates clubId and teamId', async () => {
    service.getTeam.mockResolvedValue({
      id: 'team-1',
      name: 'U15',
      clubIds: ['club-1'],
      createdAt: 'x',
    });

    const result = await controller.getTeam('club-1', 'team-1');

    expect(service.getTeam).toHaveBeenCalledWith('club-1', 'team-1');
    expect(result.id).toBe('team-1');
  });
});
