import { Test, TestingModule } from '@nestjs/testing';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';

describe('ClubsController', () => {
  let controller: ClubsController;
  let service: {
    createClub: jest.Mock;
    listClubsForUser: jest.Mock;
    getClub: jest.Mock;
    addMember: jest.Mock;
    listMembers: jest.Mock;
    removeMember: jest.Mock;
    createPlayer: jest.Mock;
    importPlayers: jest.Mock;
    listPlayers: jest.Mock;
    updatePlayer: jest.Mock;
    deletePlayer: jest.Mock;
    setFfbbLink: jest.Mock;
    removeFfbbLink: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createClub: jest.fn(),
      listClubsForUser: jest.fn(),
      getClub: jest.fn(),
      addMember: jest.fn(),
      listMembers: jest.fn(),
      removeMember: jest.fn(),
      createPlayer: jest.fn(),
      importPlayers: jest.fn(),
      listPlayers: jest.fn(),
      updatePlayer: jest.fn(),
      deletePlayer: jest.fn(),
      setFfbbLink: jest.fn(),
      removeFfbbLink: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClubsController],
      providers: [{ provide: ClubsService, useValue: service }],
    })
      // These tests only exercise controller-to-service delegation — the
      // guards' own behavior (JwtAuthGuard's passport strategy, ClubRolesGuard's
      // Reflector/PrismaService dependencies) is covered by their own spec
      // files, not re-verified here.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ClubRolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClubsController>(ClubsController);
  });

  it('createClub delegates to the service with the current user id and the DTO', async () => {
    service.createClub.mockResolvedValue({
      id: 'club-1',
      name: 'COC',
      ffbbClubCode: null,
      createdAt: 'x',
    });

    const dto = { name: 'COC' };
    const result = await controller.createClub({ id: 'user-1', email: 'a@b.com' }, dto);

    expect(service.createClub).toHaveBeenCalledWith('user-1', dto);
    expect(result.id).toBe('club-1');
  });

  it('setFfbbLink delegates clubId and the code', async () => {
    service.setFfbbLink.mockResolvedValue({
      id: 'club-1',
      name: 'COC',
      ffbbClubCode: 'pdl0044190',
      createdAt: 'x',
    });

    const result = await controller.setFfbbLink('club-1', { ffbbClubCode: 'pdl0044190' });

    expect(service.setFfbbLink).toHaveBeenCalledWith('club-1', 'pdl0044190');
    expect(result.ffbbClubCode).toBe('pdl0044190');
  });

  it('removeFfbbLink delegates clubId', async () => {
    service.removeFfbbLink.mockResolvedValue(undefined);

    await controller.removeFfbbLink('club-1');

    expect(service.removeFfbbLink).toHaveBeenCalledWith('club-1');
  });

  it('addMember delegates clubId and email', async () => {
    service.addMember.mockResolvedValue({
      userId: 'u2',
      email: 'a@b.com',
      role: 'MEMBER',
      joinedAt: 'x',
    });

    const result = await controller.addMember('club-1', { email: 'a@b.com' });

    expect(service.addMember).toHaveBeenCalledWith('club-1', 'a@b.com');
    expect(result.userId).toBe('u2');
  });

  it('listMembers delegates clubId and the query params', async () => {
    service.listMembers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });

    const query = { search: 'dup', role: 'ADMIN' as const };
    const result = await controller.listMembers('club-1', query);

    expect(service.listMembers).toHaveBeenCalledWith('club-1', query);
    expect(result.total).toBe(0);
  });

  it('listPlayers delegates clubId and the query params', async () => {
    service.listPlayers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });

    const query = { sortBy: 'createdAt' as const };
    const result = await controller.listPlayers('club-1', query);

    expect(service.listPlayers).toHaveBeenCalledWith('club-1', query);
    expect(result.total).toBe(0);
  });

  it('removeMember delegates clubId and userId', async () => {
    service.removeMember.mockResolvedValue(undefined);

    await controller.removeMember('club-1', 'user-2');

    expect(service.removeMember).toHaveBeenCalledWith('club-1', 'user-2');
  });

  it('createPlayer delegates clubId and the DTO', async () => {
    service.createPlayer.mockResolvedValue({
      id: 'p1',
      clubId: 'club-1',
      firstName: 'A',
      lastName: 'B',
      userId: null,
      createdAt: 'x',
    });

    const dto = { firstName: 'A', lastName: 'B' };
    const result = await controller.createPlayer('club-1', dto);

    expect(service.createPlayer).toHaveBeenCalledWith('club-1', dto);
    expect(result.id).toBe('p1');
  });

  it('importPlayers delegates clubId and the row list', async () => {
    service.importPlayers.mockResolvedValue({ created: 2, updated: 1, conflicts: 0 });

    const rows = [{ firstName: 'A', lastName: 'B' }];
    const result = await controller.importPlayers('club-1', { rows });

    expect(service.importPlayers).toHaveBeenCalledWith('club-1', rows);
    expect(result).toEqual({ created: 2, updated: 1, conflicts: 0 });
  });

  it('updatePlayer delegates clubId, playerId, and the DTO', async () => {
    service.updatePlayer.mockResolvedValue({
      id: 'p1',
      clubId: 'club-1',
      firstName: 'C',
      lastName: 'B',
      createdAt: 'x',
    });

    const result = await controller.updatePlayer('club-1', 'p1', { firstName: 'C' });

    expect(service.updatePlayer).toHaveBeenCalledWith('club-1', 'p1', { firstName: 'C' });
    expect(result.firstName).toBe('C');
  });
});
