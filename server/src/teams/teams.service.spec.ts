import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TeamsService } from './teams.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TeamsService', () => {
  let service: TeamsService;
  let prisma: {
    team: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    club: { findUnique: jest.Mock };
    clubTeam: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    player: { findUnique: jest.Mock };
    teamPlayer: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      team: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      club: { findUnique: jest.fn() },
      clubTeam: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      player: { findUnique: jest.fn() },
      teamPlayer: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TeamsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
  });

  describe('createTeam', () => {
    it('creates a team with the creating club as owner', async () => {
      prisma.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'U15',
        category: 'U15',
        gender: 'MEN',
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createTeam('club-1', {
        name: 'U15',
        category: 'U15',
        gender: 'MEN',
      });

      expect(prisma.team.create).toHaveBeenCalledWith({
        data: {
          name: 'U15',
          category: 'U15',
          gender: 'MEN',
          clubTeams: { create: { clubId: 'club-1', isOwner: true } },
        },
      });
      expect(result).toEqual({
        id: 'team-1',
        name: 'U15',
        category: 'U15',
        gender: 'MEN',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('listTeams', () => {
    it('lists teams linked to the club, ordered by name by default', async () => {
      prisma.team.findMany.mockResolvedValue([
        {
          id: 'team-1',
          name: 'U15',
          category: 'U15',
          gender: 'MEN',
          createdAt: new Date('2026-01-01'),
        },
      ]);
      prisma.team.count.mockResolvedValue(1);

      const result = await service.listTeams('club-1', {});

      expect(prisma.team.findMany).toHaveBeenCalledWith({
        where: { clubTeams: { some: { clubId: 'club-1' } } },
        orderBy: [{ name: 'asc' }],
        skip: 0,
        take: 25,
      });
      expect(prisma.team.count).toHaveBeenCalledWith({
        where: { clubTeams: { some: { clubId: 'club-1' } } },
      });
      expect(result.items).toHaveLength(1);
      expect(result).toEqual(expect.objectContaining({ total: 1, page: 1, pageSize: 25 }));
    });

    it('filters by category and gender', async () => {
      prisma.team.findMany.mockResolvedValue([]);
      prisma.team.count.mockResolvedValue(0);

      await service.listTeams('club-1', { category: 'U15', gender: 'MEN' });

      const expectedWhere = {
        clubTeams: { some: { clubId: 'club-1' } },
        category: 'U15',
        gender: 'MEN',
      };
      expect(prisma.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(prisma.team.count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('filters by search on team name', async () => {
      prisma.team.findMany.mockResolvedValue([]);
      prisma.team.count.mockResolvedValue(0);

      await service.listTeams('club-1', { search: 'U15' });

      expect(prisma.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clubTeams: { some: { clubId: 'club-1' } },
            name: { contains: 'U15', mode: 'insensitive' },
          },
        }),
      );
    });

    it('sorts by category', async () => {
      prisma.team.findMany.mockResolvedValue([]);
      prisma.team.count.mockResolvedValue(0);

      await service.listTeams('club-1', { sortBy: 'category', sortOrder: 'desc' });

      expect(prisma.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ category: 'desc' }] }),
      );
    });

    it('computes skip/take for page 2', async () => {
      prisma.team.findMany.mockResolvedValue([]);
      prisma.team.count.mockResolvedValue(0);

      await service.listTeams('club-1', { page: 2, pageSize: 5 });

      expect(prisma.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  describe('listTeamClubs', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.listTeamClubs('club-1', 'team-1', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.clubTeam.findMany).not.toHaveBeenCalled();
    });

    it('always sorts the owner club first, regardless of sortBy', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.clubTeam.findMany.mockResolvedValue([]);
      prisma.clubTeam.count.mockResolvedValue(0);

      await service.listTeamClubs('club-1', 'team-1', { sortBy: 'linkedAt', sortOrder: 'desc' });

      expect(prisma.clubTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ isOwner: 'desc' }, { createdAt: 'desc' }] }),
      );
    });

    it('filters by partner club name search', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.clubTeam.findMany.mockResolvedValue([]);
      prisma.clubTeam.count.mockResolvedValue(0);

      await service.listTeamClubs('club-1', 'team-1', { search: 'coc' });

      expect(prisma.clubTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            teamId: 'team-1',
            club: { name: { contains: 'coc', mode: 'insensitive' } },
          },
        }),
      );
    });
  });

  describe('listTeamPlayers', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.listTeamPlayers('club-1', 'team-1', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.teamPlayer.findMany).not.toHaveBeenCalled();
    });

    it('filters by player name search', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamPlayer.findMany.mockResolvedValue([]);
      prisma.teamPlayer.count.mockResolvedValue(0);

      await service.listTeamPlayers('club-1', 'team-1', { search: 'al' });

      expect(prisma.teamPlayer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            teamId: 'team-1',
            player: {
              OR: [
                { firstName: { contains: 'al', mode: 'insensitive' } },
                { lastName: { contains: 'al', mode: 'insensitive' } },
              ],
            },
          },
        }),
      );
    });

    it('sorts by createdAt', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamPlayer.findMany.mockResolvedValue([]);
      prisma.teamPlayer.count.mockResolvedValue(0);

      await service.listTeamPlayers('club-1', 'team-1', { sortBy: 'createdAt' });

      expect(prisma.teamPlayer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: 'asc' }] }),
      );
    });
  });

  describe('getTeam', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.getTeam('club-1', 'team-1')).rejects.toThrow(NotFoundException);
      expect(prisma.team.findUnique).not.toHaveBeenCalled();
    });

    it('returns the team when linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        name: 'U15',
        category: 'U15',
        gender: 'MEN',
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.getTeam('club-1', 'team-1');

      expect(result.id).toBe('team-1');
    });
  });

  describe('updateTeam', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.updateTeam('club-1', 'team-1', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.team.update).not.toHaveBeenCalled();
    });

    it('updates a team linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.team.update.mockResolvedValue({
        id: 'team-1',
        name: 'U15 elite',
        category: 'U15',
        gender: 'MEN',
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.updateTeam('club-1', 'team-1', { name: 'U15 elite' });

      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: 'team-1' },
        data: { name: 'U15 elite' },
      });
      expect(result.name).toBe('U15 elite');
    });
  });

  describe('deleteTeam', () => {
    it('throws ForbiddenException when the club is not the owner', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: false });

      await expect(service.deleteTeam('club-2', 'team-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.team.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.deleteTeam('club-1', 'team-1')).rejects.toThrow(NotFoundException);
      expect(prisma.team.delete).not.toHaveBeenCalled();
    });

    it('deletes the team when the club is the owner', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.team.delete.mockResolvedValue({});

      await service.deleteTeam('club-1', 'team-1');

      expect(prisma.team.delete).toHaveBeenCalledWith({ where: { id: 'team-1' } });
    });
  });

  describe('addTeamClub (CTC partner clubs)', () => {
    it('throws ForbiddenException when the requesting club is not the owner', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: false });

      await expect(service.addTeamClub('club-2', 'team-1', 'club-3')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.clubTeam.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the partner club does not exist', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.club.findUnique.mockResolvedValue(null);

      await expect(service.addTeamClub('club-1', 'team-1', 'club-9')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.clubTeam.create).not.toHaveBeenCalled();
    });

    it('links a partner club as non-owner', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.club.findUnique.mockResolvedValue({ id: 'club-3', name: 'Club B' });
      prisma.clubTeam.create.mockResolvedValue({
        clubId: 'club-3',
        isOwner: false,
        createdAt: new Date('2026-01-02'),
        club: { name: 'Club B' },
      });

      const result = await service.addTeamClub('club-1', 'team-1', 'club-3');

      expect(prisma.clubTeam.create).toHaveBeenCalledWith({
        data: { clubId: 'club-3', teamId: 'team-1', isOwner: false },
        include: { club: true },
      });
      expect(result).toEqual({
        clubId: 'club-3',
        clubName: 'Club B',
        isOwner: false,
        linkedAt: '2026-01-02T00:00:00.000Z',
      });
    });

    it('throws ConflictException when the club is already linked', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.club.findUnique.mockResolvedValue({ id: 'club-3', name: 'Club B' });
      prisma.clubTeam.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.addTeamClub('club-1', 'team-1', 'club-3')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('removeTeamClub', () => {
    it('throws BadRequestException when trying to remove the owning club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });

      await expect(service.removeTeamClub('club-1', 'team-1', 'club-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.clubTeam.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the partner club is not linked', async () => {
      prisma.clubTeam.findUnique
        .mockResolvedValueOnce({ isOwner: true }) // assertTeamOwner
        .mockResolvedValueOnce(null); // partner lookup

      await expect(service.removeTeamClub('club-1', 'team-1', 'club-9')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('removes the partner club and its players from the roster in a transaction', async () => {
      prisma.clubTeam.findUnique
        .mockResolvedValueOnce({ isOwner: true })
        .mockResolvedValueOnce({ clubId: 'club-3', teamId: 'team-1', isOwner: false });
      prisma.teamPlayer.deleteMany.mockResolvedValue({ count: 2 });
      prisma.clubTeam.delete.mockResolvedValue({});

      await service.removeTeamClub('club-1', 'team-1', 'club-3');

      expect(prisma.teamPlayer.deleteMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1', player: { clubId: 'club-3' } },
      });
      expect(prisma.clubTeam.delete).toHaveBeenCalledWith({
        where: { clubId_teamId: { clubId: 'club-3', teamId: 'team-1' } },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('addTeamPlayer', () => {
    it('throws NotFoundException when the player does not exist', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.player.findUnique.mockResolvedValue(null);

      await expect(service.addTeamPlayer('club-1', 'team-1', 'player-9')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.teamPlayer.create).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when the player's club is not linked to the team", async () => {
      prisma.clubTeam.findUnique
        .mockResolvedValueOnce({ isOwner: true }) // assertTeamInClub
        .mockResolvedValueOnce(null); // player's club link check
      prisma.player.findUnique.mockResolvedValue({ id: 'player-1', clubId: 'club-9' });

      await expect(service.addTeamPlayer('club-1', 'team-1', 'player-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.teamPlayer.create).not.toHaveBeenCalled();
    });

    it('adds a player from a linked club to the roster', async () => {
      prisma.clubTeam.findUnique
        .mockResolvedValueOnce({ isOwner: true })
        .mockResolvedValueOnce({ clubId: 'club-1', teamId: 'team-1' });
      prisma.player.findUnique.mockResolvedValue({
        id: 'player-1',
        clubId: 'club-1',
        firstName: 'A',
        lastName: 'B',
      });
      prisma.teamPlayer.create.mockResolvedValue({
        id: 'tp-1',
        teamId: 'team-1',
        playerId: 'player-1',
        createdAt: new Date('2026-01-01'),
        player: { firstName: 'A', lastName: 'B', clubId: 'club-1' },
      });

      const result = await service.addTeamPlayer('club-1', 'team-1', 'player-1');

      expect(prisma.teamPlayer.create).toHaveBeenCalledWith({
        data: { teamId: 'team-1', playerId: 'player-1' },
        include: { player: true },
      });
      expect(result).toEqual({
        id: 'tp-1',
        teamId: 'team-1',
        playerId: 'player-1',
        firstName: 'A',
        lastName: 'B',
        clubId: 'club-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('throws ConflictException when the player is already on the roster', async () => {
      prisma.clubTeam.findUnique
        .mockResolvedValueOnce({ isOwner: true })
        .mockResolvedValueOnce({ clubId: 'club-1', teamId: 'team-1' });
      prisma.player.findUnique.mockResolvedValue({ id: 'player-1', clubId: 'club-1' });
      prisma.teamPlayer.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.addTeamPlayer('club-1', 'team-1', 'player-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('removeTeamPlayer', () => {
    it('throws NotFoundException when the player is not on the roster', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamPlayer.findUnique.mockResolvedValue(null);

      await expect(service.removeTeamPlayer('club-1', 'team-1', 'player-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.teamPlayer.delete).not.toHaveBeenCalled();
    });

    it('removes a player from the roster', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamPlayer.findUnique.mockResolvedValue({ id: 'tp-1' });
      prisma.teamPlayer.delete.mockResolvedValue({});

      await service.removeTeamPlayer('club-1', 'team-1', 'player-1');

      expect(prisma.teamPlayer.delete).toHaveBeenCalledWith({ where: { id: 'tp-1' } });
    });
  });
});
