import { Test, TestingModule } from '@nestjs/testing';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';

describe('TeamsController', () => {
  let controller: TeamsController;
  let service: {
    createTeam: jest.Mock;
    listTeams: jest.Mock;
    getTeam: jest.Mock;
    updateTeam: jest.Mock;
    deleteTeam: jest.Mock;
    listTeamClubs: jest.Mock;
    addTeamClub: jest.Mock;
    removeTeamClub: jest.Mock;
    listTeamPlayers: jest.Mock;
    addTeamPlayer: jest.Mock;
    removeTeamPlayer: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createTeam: jest.fn(),
      listTeams: jest.fn(),
      getTeam: jest.fn(),
      updateTeam: jest.fn(),
      deleteTeam: jest.fn(),
      listTeamClubs: jest.fn(),
      addTeamClub: jest.fn(),
      removeTeamClub: jest.fn(),
      listTeamPlayers: jest.fn(),
      addTeamPlayer: jest.fn(),
      removeTeamPlayer: jest.fn(),
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

  it('createTeam delegates clubId and the DTO', async () => {
    service.createTeam.mockResolvedValue({
      id: 'team-1',
      name: 'U15',
      category: 'U15',
      gender: 'MEN',
      createdAt: 'x',
    });

    const dto = { name: 'U15', category: 'U15' as const, gender: 'MEN' as const };
    const result = await controller.createTeam('club-1', dto);

    expect(service.createTeam).toHaveBeenCalledWith('club-1', dto);
    expect(result.id).toBe('team-1');
  });

  it('listTeams delegates clubId', async () => {
    service.listTeams.mockResolvedValue([]);

    await controller.listTeams('club-1');

    expect(service.listTeams).toHaveBeenCalledWith('club-1');
  });

  it('updateTeam delegates clubId, teamId, and the DTO', async () => {
    service.updateTeam.mockResolvedValue({
      id: 'team-1',
      name: 'U15 elite',
      category: 'U15',
      gender: 'MEN',
      createdAt: 'x',
    });

    const result = await controller.updateTeam('club-1', 'team-1', { name: 'U15 elite' });

    expect(service.updateTeam).toHaveBeenCalledWith('club-1', 'team-1', { name: 'U15 elite' });
    expect(result.name).toBe('U15 elite');
  });

  it('deleteTeam delegates clubId and teamId', async () => {
    service.deleteTeam.mockResolvedValue(undefined);

    await controller.deleteTeam('club-1', 'team-1');

    expect(service.deleteTeam).toHaveBeenCalledWith('club-1', 'team-1');
  });

  it('addTeamClub delegates clubId, teamId, and the partner clubId', async () => {
    service.addTeamClub.mockResolvedValue({
      clubId: 'club-3',
      clubName: 'Club B',
      isOwner: false,
      linkedAt: 'x',
    });

    const result = await controller.addTeamClub('club-1', 'team-1', { clubId: 'club-3' });

    expect(service.addTeamClub).toHaveBeenCalledWith('club-1', 'team-1', 'club-3');
    expect(result.clubId).toBe('club-3');
  });

  it('removeTeamClub delegates clubId, teamId, and partnerClubId', async () => {
    service.removeTeamClub.mockResolvedValue(undefined);

    await controller.removeTeamClub('club-1', 'team-1', 'club-3');

    expect(service.removeTeamClub).toHaveBeenCalledWith('club-1', 'team-1', 'club-3');
  });

  it('addTeamPlayer delegates clubId, teamId, and playerId', async () => {
    service.addTeamPlayer.mockResolvedValue({
      id: 'tp-1',
      teamId: 'team-1',
      playerId: 'player-1',
      firstName: 'A',
      lastName: 'B',
      clubId: 'club-1',
      createdAt: 'x',
    });

    const result = await controller.addTeamPlayer('club-1', 'team-1', { playerId: 'player-1' });

    expect(service.addTeamPlayer).toHaveBeenCalledWith('club-1', 'team-1', 'player-1');
    expect(result.id).toBe('tp-1');
  });

  it('removeTeamPlayer delegates clubId, teamId, and playerId', async () => {
    service.removeTeamPlayer.mockResolvedValue(undefined);

    await controller.removeTeamPlayer('club-1', 'team-1', 'player-1');

    expect(service.removeTeamPlayer).toHaveBeenCalledWith('club-1', 'team-1', 'player-1');
  });
});
