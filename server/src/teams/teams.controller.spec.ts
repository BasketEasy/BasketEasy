import { Test, TestingModule } from '@nestjs/testing';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { FfbbImportService } from '../ffbb/ffbb-import.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';

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
    updateTeamPlayerRole: jest.Mock;
    listTeamAdmins: jest.Mock;
    listEligibleAdmins: jest.Mock;
    addTeamAdmin: jest.Mock;
    removeTeamAdmin: jest.Mock;
    listFfbbLinks: jest.Mock;
    addFfbbLink: jest.Mock;
    removeFfbbLink: jest.Mock;
  };
  let ffbbImportService: { importSchedule: jest.Mock };

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
      updateTeamPlayerRole: jest.fn(),
      listTeamAdmins: jest.fn(),
      listEligibleAdmins: jest.fn(),
      addTeamAdmin: jest.fn(),
      removeTeamAdmin: jest.fn(),
      listFfbbLinks: jest.fn(),
      addFfbbLink: jest.fn(),
      removeFfbbLink: jest.fn(),
    };
    ffbbImportService = { importSchedule: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [
        { provide: TeamsService, useValue: service },
        { provide: FfbbImportService, useValue: ffbbImportService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ClubRolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TeamManagerGuard)
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

  it('listTeams delegates clubId and the query params', async () => {
    service.listTeams.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });

    const query = { category: 'U15' as const };
    const result = await controller.listTeams('club-1', query);

    expect(service.listTeams).toHaveBeenCalledWith('club-1', query);
    expect(result.total).toBe(0);
  });

  it('listTeamClubs delegates clubId, teamId, and the query params', async () => {
    service.listTeamClubs.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });

    const query = { search: 'coc' };
    const result = await controller.listTeamClubs('club-1', 'team-1', query);

    expect(service.listTeamClubs).toHaveBeenCalledWith('club-1', 'team-1', query);
    expect(result.total).toBe(0);
  });

  it('listTeamPlayers delegates clubId, teamId, and the query params', async () => {
    service.listTeamPlayers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });

    const query = { sortBy: 'createdAt' as const };
    const result = await controller.listTeamPlayers('club-1', 'team-1', query);

    expect(service.listTeamPlayers).toHaveBeenCalledWith('club-1', 'team-1', query);
    expect(result.total).toBe(0);
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

    expect(service.addTeamPlayer).toHaveBeenCalledWith('club-1', 'team-1', 'player-1', undefined);
    expect(result.id).toBe('tp-1');
  });

  it('removeTeamPlayer delegates clubId, teamId, and playerId', async () => {
    service.removeTeamPlayer.mockResolvedValue(undefined);

    await controller.removeTeamPlayer('club-1', 'team-1', 'player-1');

    expect(service.removeTeamPlayer).toHaveBeenCalledWith('club-1', 'team-1', 'player-1');
  });

  it('updateTeamPlayerRole delegates clubId, teamId, playerId, role', async () => {
    service.updateTeamPlayerRole.mockResolvedValue({
      id: 'tp1',
      teamId: 'team-1',
      playerId: 'p1',
      role: 'COACH',
      firstName: 'A',
      lastName: 'B',
      clubId: 'club-1',
      createdAt: 'x',
    });

    const result = await controller.updateTeamPlayerRole('club-1', 'team-1', 'p1', {
      role: 'COACH',
    });

    expect(service.updateTeamPlayerRole).toHaveBeenCalledWith('club-1', 'team-1', 'p1', 'COACH');
    expect(result.role).toBe('COACH');
  });

  it('listTeamAdmins delegates clubId and teamId', async () => {
    service.listTeamAdmins.mockResolvedValue([]);

    await controller.listTeamAdmins('club-1', 'team-1');

    expect(service.listTeamAdmins).toHaveBeenCalledWith('club-1', 'team-1');
  });

  it('listEligibleAdmins delegates clubId and teamId', async () => {
    service.listEligibleAdmins.mockResolvedValue([]);

    await controller.listEligibleAdmins('club-1', 'team-1');

    expect(service.listEligibleAdmins).toHaveBeenCalledWith('club-1', 'team-1');
  });

  it('addTeamAdmin delegates clubId, teamId, userId', async () => {
    service.addTeamAdmin.mockResolvedValue({
      userId: 'u2',
      email: 'a@b.com',
      teamId: 'team-1',
      createdAt: 'x',
    });

    const result = await controller.addTeamAdmin('club-1', 'team-1', { userId: 'u2' });

    expect(service.addTeamAdmin).toHaveBeenCalledWith('club-1', 'team-1', 'u2');
    expect(result.userId).toBe('u2');
  });

  it('removeTeamAdmin delegates clubId, teamId, userId, and the current user id', async () => {
    service.removeTeamAdmin.mockResolvedValue(undefined);

    await controller.removeTeamAdmin({ id: 'u1', email: 'a@b.com' }, 'club-1', 'team-1', 'u2');

    expect(service.removeTeamAdmin).toHaveBeenCalledWith('club-1', 'team-1', 'u2', 'u1');
  });

  it('listFfbbLinks delegates clubId and teamId', async () => {
    service.listFfbbLinks.mockResolvedValue([
      { id: 'link-1', ffbbEngagementLabel: 'Seniors M D3' },
    ]);

    const result = await controller.listFfbbLinks('club-1', 'team-1');

    expect(service.listFfbbLinks).toHaveBeenCalledWith('club-1', 'team-1');
    expect(result).toHaveLength(1);
  });

  it('addFfbbLink delegates clubId, teamId, and the pasted URL', async () => {
    service.addFfbbLink.mockResolvedValue({ id: 'link-1', ffbbEngagementLabel: null });

    const result = await controller.addFfbbLink('club-1', 'team-1', {
      ffbbTeamUrl:
        'https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/1',
    });

    expect(service.addFfbbLink).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/1',
    );
    expect(result.id).toBe('link-1');
  });

  it('removeFfbbLink delegates clubId, teamId, and linkId', async () => {
    service.removeFfbbLink.mockResolvedValue(undefined);

    await controller.removeFfbbLink('club-1', 'team-1', 'link-1');

    expect(service.removeFfbbLink).toHaveBeenCalledWith('club-1', 'team-1', 'link-1');
  });

  it('importFfbbSchedule delegates clubId and teamId to the import service', async () => {
    ffbbImportService.importSchedule.mockResolvedValue({ created: 8, updated: 2, unchanged: 1 });

    const result = await controller.importFfbbSchedule('club-1', 'team-1');

    expect(ffbbImportService.importSchedule).toHaveBeenCalledWith('club-1', 'team-1');
    expect(result.created).toBe(8);
  });
});
