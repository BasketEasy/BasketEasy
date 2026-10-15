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
import { FFBB_PROVIDER } from '../ffbb/ffbb-provider';

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
    player: { findUnique: jest.Mock; findFirst: jest.Mock; findUniqueOrThrow: jest.Mock };
    teamPlayer: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      count: jest.Mock;
    };
    eventJerseyDuty: { deleteMany: jest.Mock; updateMany: jest.Mock };
    user: { findUnique: jest.Mock };
    clubMembership: { findFirst: jest.Mock; findMany: jest.Mock };
    teamAdmin: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    teamFfbbLink: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let ffbbProvider: { parseEngagementRef: jest.Mock; getMatchesForEngagement: jest.Mock };

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
      player: { findUnique: jest.fn(), findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
      teamPlayer: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
      eventJerseyDuty: { deleteMany: jest.fn(), updateMany: jest.fn() },
      user: { findUnique: jest.fn() },
      clubMembership: { findFirst: jest.fn(), findMany: jest.fn() },
      teamAdmin: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      teamFfbbLink: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    ffbbProvider = { parseEngagementRef: jest.fn(), getMatchesForEngagement: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FFBB_PROVIDER, useValue: ffbbProvider },
      ],
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

    it('rejects an ffbbTeamUrl with a bad shape without calling the club-team create', async () => {
      ffbbProvider.parseEngagementRef.mockReturnValue(null);

      await expect(
        service.createTeam('club-1', {
          name: 'U15',
          category: 'U15',
          gender: 'MEN',
          ffbbTeamUrl: 'bad',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.team.create).not.toHaveBeenCalled();
    });

    it('rejects an ffbbTeamUrl whose live fetch fails', async () => {
      ffbbProvider.parseEngagementRef.mockReturnValue(
        'ligues/pdl/comites/0044/clubs/pdl0044190/equipes/1',
      );
      ffbbProvider.getMatchesForEngagement.mockRejectedValue(new Error('boom'));

      await expect(
        service.createTeam('club-1', {
          name: 'U15',
          category: 'U15',
          gender: 'MEN',
          ffbbTeamUrl:
            'https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.team.create).not.toHaveBeenCalled();
    });

    it('creates the first TeamFfbbLink when a valid ffbbTeamUrl is given', async () => {
      ffbbProvider.parseEngagementRef.mockReturnValue(
        'ligues/pdl/comites/0044/clubs/pdl0044190/equipes/1',
      );
      ffbbProvider.getMatchesForEngagement.mockResolvedValue({
        competitionLabel: 'Seniors M D3',
        matches: [],
      });
      prisma.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'U15',
        category: 'U15',
        gender: 'MEN',
        createdAt: new Date('2026-01-01'),
      });

      await service.createTeam('club-1', {
        name: 'U15',
        category: 'U15',
        gender: 'MEN',
        ffbbTeamUrl:
          'https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/1',
      });

      expect(prisma.team.create).toHaveBeenCalledWith({
        data: {
          name: 'U15',
          category: 'U15',
          gender: 'MEN',
          clubTeams: { create: { clubId: 'club-1', isOwner: true } },
          ffbbLinks: {
            create: {
              ffbbEngagementRef: 'ligues/pdl/comites/0044/clubs/pdl0044190/equipes/1',
              ffbbEngagementLabel: 'Seniors M D3',
            },
          },
        },
      });
    });

    it('surfaces a conflict when the engagement is already linked to another team', async () => {
      ffbbProvider.parseEngagementRef.mockReturnValue(
        'ligues/pdl/comites/0044/clubs/pdl0044190/equipes/1',
      );
      ffbbProvider.getMatchesForEngagement.mockResolvedValue({
        competitionLabel: null,
        matches: [],
      });
      prisma.team.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );

      await expect(
        service.createTeam('club-1', {
          name: 'U15',
          category: 'U15',
          gender: 'MEN',
          ffbbTeamUrl:
            'https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listFfbbLinks', () => {
    it('lists the links for a team in the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({
        clubId: 'club-1',
        teamId: 'team-1',
        isOwner: true,
      });
      prisma.teamFfbbLink.findMany.mockResolvedValue([
        { id: 'link-1', ffbbEngagementLabel: 'Seniors M D3' },
        { id: 'link-2', ffbbEngagementLabel: null },
      ]);

      const result = await service.listFfbbLinks('club-1', 'team-1');

      expect(result).toEqual([
        { id: 'link-1', ffbbEngagementLabel: 'Seniors M D3' },
        { id: 'link-2', ffbbEngagementLabel: null },
      ]);
    });

    it('404s when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.listFfbbLinks('club-1', 'team-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addFfbbLink', () => {
    beforeEach(() => {
      prisma.clubTeam.findUnique.mockResolvedValue({
        clubId: 'club-1',
        teamId: 'team-1',
        isOwner: false,
      });
    });

    it('adds a second link to a team that already has one (multiple competitions)', async () => {
      ffbbProvider.parseEngagementRef.mockReturnValue(
        'ligues/pdl/comites/0044/clubs/pdl0044190/equipes/2',
      );
      ffbbProvider.getMatchesForEngagement.mockResolvedValue({
        competitionLabel: 'Coupe',
        matches: [],
      });
      prisma.teamFfbbLink.create.mockResolvedValue({ id: 'link-2', ffbbEngagementLabel: 'Coupe' });

      const result = await service.addFfbbLink(
        'club-1',
        'team-1',
        'https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/2',
      );

      expect(prisma.teamFfbbLink.create).toHaveBeenCalledWith({
        data: {
          teamId: 'team-1',
          ffbbEngagementRef: 'ligues/pdl/comites/0044/clubs/pdl0044190/equipes/2',
          ffbbEngagementLabel: 'Coupe',
        },
      });
      expect(result).toEqual({ id: 'link-2', ffbbEngagementLabel: 'Coupe' });
    });

    it('rejects a bare id (no shape match)', async () => {
      ffbbProvider.parseEngagementRef.mockReturnValue(null);

      await expect(service.addFfbbLink('club-1', 'team-1', '200000005346381')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.teamFfbbLink.create).not.toHaveBeenCalled();
    });

    it('rejects a URL that does not resolve', async () => {
      ffbbProvider.parseEngagementRef.mockReturnValue(
        'ligues/pdl/comites/0044/clubs/pdl0044190/equipes/2',
      );
      ffbbProvider.getMatchesForEngagement.mockRejectedValue(new Error('404'));

      await expect(
        service.addFfbbLink(
          'club-1',
          'team-1',
          'https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/2',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeFfbbLink', () => {
    it('deletes only the targeted link, leaving other links on the team untouched', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({
        clubId: 'club-1',
        teamId: 'team-1',
        isOwner: true,
      });
      prisma.teamFfbbLink.findUnique.mockResolvedValue({ id: 'link-1', teamId: 'team-1' });

      await service.removeFfbbLink('club-1', 'team-1', 'link-1');

      expect(prisma.teamFfbbLink.delete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
    });

    it('404s when the link belongs to a different team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({
        clubId: 'club-1',
        teamId: 'team-1',
        isOwner: true,
      });
      prisma.teamFfbbLink.findUnique.mockResolvedValue({ id: 'link-1', teamId: 'other-team' });

      await expect(service.removeFfbbLink('club-1', 'team-1', 'link-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.teamFfbbLink.delete).not.toHaveBeenCalled();
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
        role: 'PLAYER',
        createdAt: new Date('2026-01-01'),
        player: { firstName: 'A', lastName: 'B', clubId: 'club-1' },
      });

      const result = await service.addTeamPlayer('club-1', 'team-1', 'player-1');

      expect(prisma.teamPlayer.create).toHaveBeenCalledWith({
        data: { teamId: 'team-1', playerId: 'player-1', role: 'PLAYER' },
        include: { player: true },
      });
      expect(result).toEqual({
        id: 'tp-1',
        teamId: 'team-1',
        playerId: 'player-1',
        firstName: 'A',
        lastName: 'B',
        clubId: 'club-1',
        role: 'PLAYER',
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

    it('drops the jersey wash turns of matches that have not started, in the same transaction', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamPlayer.findUnique.mockResolvedValue({ id: 'tp-1' });

      await service.removeTeamPlayer('club-1', 'team-1', 'player-1');

      expect(prisma.eventJerseyDuty.deleteMany).toHaveBeenCalledWith({
        where: { teamPlayerId: 'tp-1', event: { startsAt: { gt: expect.any(Date) } } },
      });
      expect(prisma.eventJerseyDuty.updateMany).toHaveBeenCalledWith({
        where: { swapToTeamPlayerId: 'tp-1' },
        data: { swapToTeamPlayerId: null, swapRequestedAt: null },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('addTeamPlayer role', () => {
    it('defaults role to PLAYER when not given', async () => {
      prisma.clubTeam.findUnique
        .mockResolvedValueOnce({ isOwner: true }) // assertTeamInClub
        .mockResolvedValueOnce({ clubId: 'club-1', teamId: 'team-1' }); // player's club link check
      prisma.player.findUnique.mockResolvedValue({
        id: 'p1',
        clubId: 'club-1',
        firstName: 'A',
        lastName: 'B',
      });
      prisma.teamPlayer.create.mockResolvedValue({
        id: 'tp1',
        teamId: 'team-1',
        playerId: 'p1',
        role: 'PLAYER',
        createdAt: new Date('2026-01-01'),
        player: { firstName: 'A', lastName: 'B', clubId: 'club-1' },
      });

      await service.addTeamPlayer('club-1', 'team-1', 'p1');

      expect(prisma.teamPlayer.create).toHaveBeenCalledWith({
        data: { teamId: 'team-1', playerId: 'p1', role: 'PLAYER' },
        include: { player: true },
      });
    });

    it('passes an explicit role through', async () => {
      prisma.clubTeam.findUnique
        .mockResolvedValueOnce({ isOwner: true })
        .mockResolvedValueOnce({ clubId: 'club-1', teamId: 'team-1' });
      prisma.player.findUnique.mockResolvedValue({
        id: 'p1',
        clubId: 'club-1',
        firstName: 'A',
        lastName: 'B',
      });
      prisma.teamPlayer.create.mockResolvedValue({
        id: 'tp1',
        teamId: 'team-1',
        playerId: 'p1',
        role: 'COACH',
        createdAt: new Date('2026-01-01'),
        player: { firstName: 'A', lastName: 'B', clubId: 'club-1' },
      });

      const result = await service.addTeamPlayer('club-1', 'team-1', 'p1', 'COACH');

      expect(prisma.teamPlayer.create).toHaveBeenCalledWith({
        data: { teamId: 'team-1', playerId: 'p1', role: 'COACH' },
        include: { player: true },
      });
      expect(result.role).toBe('COACH');
    });
  });

  describe('updateTeamPlayer', () => {
    it('throws NotFoundException when the player is not on the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamPlayer.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTeamPlayer('club-1', 'team-1', 'p1', { role: 'COACH' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.teamPlayer.update).not.toHaveBeenCalled();
    });

    it('refuses an empty body, writing nothing', async () => {
      await expect(service.updateTeamPlayer('club-1', 'team-1', 'p1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.teamPlayer.update).not.toHaveBeenCalled();
    });

    it('sets the jersey wash exemption alone, leaving the role untouched', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamPlayer.findUnique.mockResolvedValue({ id: 'tp1' });
      prisma.teamPlayer.update.mockResolvedValue({
        id: 'tp1',
        teamId: 'team-1',
        playerId: 'p1',
        role: 'PLAYER',
        jerseyDutyExempt: true,
        createdAt: new Date('2026-01-01'),
        player: { firstName: 'A', lastName: 'B', clubId: 'club-1' },
      });

      const result = await service.updateTeamPlayer('club-1', 'team-1', 'p1', {
        jerseyDutyExempt: true,
      });

      expect(prisma.teamPlayer.update).toHaveBeenCalledWith({
        where: { id: 'tp1' },
        data: { jerseyDutyExempt: true },
        include: { player: true },
      });
      expect(result.jerseyDutyExempt).toBe(true);
    });

    it('updates the role', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamPlayer.findUnique.mockResolvedValue({
        id: 'tp1',
        teamId: 'team-1',
        playerId: 'p1',
      });
      prisma.teamPlayer.update.mockResolvedValue({
        id: 'tp1',
        teamId: 'team-1',
        playerId: 'p1',
        role: 'COACH',
        createdAt: new Date('2026-01-01'),
        player: { firstName: 'A', lastName: 'B', clubId: 'club-1' },
      });

      const result = await service.updateTeamPlayer('club-1', 'team-1', 'p1', { role: 'COACH' });

      expect(prisma.teamPlayer.update).toHaveBeenCalledWith({
        where: { id: 'tp1' },
        data: { role: 'COACH' },
        include: { player: true },
      });
      expect(result.role).toBe('COACH');
    });
  });

  describe('team admins', () => {
    it('lists team admins', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamAdmin.findMany.mockResolvedValue([
        {
          userId: 'u1',
          teamId: 'team-1',
          createdAt: new Date('2026-01-01'),
          user: { email: 'a@b.com' },
        },
      ]);

      const result = await service.listTeamAdmins('club-1', 'team-1');

      expect(result).toEqual([
        { userId: 'u1', email: 'a@b.com', teamId: 'team-1', createdAt: '2026-01-01T00:00:00.000Z' },
      ]);
    });

    it('addTeamAdmin throws NotFoundException when no user has that id', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.addTeamAdmin('club-1', 'team-1', 'nobody')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.teamAdmin.create).not.toHaveBeenCalled();
    });

    it('addTeamAdmin throws BadRequestException when the user is not in a linked club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'a@b.com' });
      prisma.clubMembership.findFirst.mockResolvedValue(null);

      await expect(service.addTeamAdmin('club-1', 'team-1', 'u2')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.teamAdmin.create).not.toHaveBeenCalled();
    });

    it('addTeamAdmin throws ConflictException when already a TeamAdmin', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'a@b.com' });
      prisma.clubMembership.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.teamAdmin.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.addTeamAdmin('club-1', 'team-1', 'u2')).rejects.toThrow(
        ConflictException,
      );
    });

    it('addTeamAdmin creates the grant', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'a@b.com' });
      prisma.clubMembership.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.teamAdmin.create.mockResolvedValue({
        userId: 'u2',
        teamId: 'team-1',
        createdAt: new Date('2026-01-02'),
        user: { email: 'a@b.com' },
      });

      const result = await service.addTeamAdmin('club-1', 'team-1', 'u2');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u2' } });
      expect(prisma.teamAdmin.create).toHaveBeenCalledWith({
        data: { teamId: 'team-1', userId: 'u2' },
        include: { user: true },
      });
      expect(result.userId).toBe('u2');
    });

    it('listEligibleAdmins returns members of clubs linked to the team, deduped by user', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.clubMembership.findMany.mockResolvedValue([
        {
          userId: 'u1',
          user: { email: 'a@b.com', firstName: 'A', lastName: 'B' },
        },
        {
          userId: 'u2',
          user: { email: 'c@d.com', firstName: 'C', lastName: 'D' },
        },
        // Same user, member of a second linked club (CTC) — must be deduped.
        {
          userId: 'u1',
          user: { email: 'a@b.com', firstName: 'A', lastName: 'B' },
        },
      ]);

      const result = await service.listEligibleAdmins('club-1', 'team-1');

      expect(prisma.clubMembership.findMany).toHaveBeenCalledWith({
        where: { club: { clubTeams: { some: { teamId: 'team-1' } } } },
        include: { user: true },
        orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      });
      expect(result).toEqual([
        { userId: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B' },
        { userId: 'u2', email: 'c@d.com', firstName: 'C', lastName: 'D' },
      ]);
    });

    it('removeTeamAdmin throws NotFoundException when there is no such grant', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamAdmin.findUnique.mockResolvedValue(null);

      await expect(service.removeTeamAdmin('club-1', 'team-1', 'u2', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('removeTeamAdmin deletes the grant when removed by someone else (e.g. a club ADMIN)', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamAdmin.findUnique.mockResolvedValue({ id: 'ta1', userId: 'u2', teamId: 'team-1' });
      prisma.teamAdmin.delete.mockResolvedValue({});

      await service.removeTeamAdmin('club-1', 'team-1', 'u2', 'u1');

      expect(prisma.teamAdmin.delete).toHaveBeenCalledWith({ where: { id: 'ta1' } });
      expect(prisma.teamAdmin.count).not.toHaveBeenCalled();
    });

    it('removeTeamAdmin throws BadRequestException when the last team admin removes themselves', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamAdmin.findUnique.mockResolvedValue({ id: 'ta1', userId: 'u2', teamId: 'team-1' });
      prisma.teamAdmin.count.mockResolvedValue(1);

      await expect(service.removeTeamAdmin('club-1', 'team-1', 'u2', 'u2')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.teamAdmin.delete).not.toHaveBeenCalled();
    });

    it('removeTeamAdmin allows self-removal when there is more than one team admin', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamAdmin.findUnique.mockResolvedValue({ id: 'ta1', userId: 'u2', teamId: 'team-1' });
      prisma.teamAdmin.count.mockResolvedValue(2);
      prisma.teamAdmin.delete.mockResolvedValue({});

      await service.removeTeamAdmin('club-1', 'team-1', 'u2', 'u2');

      expect(prisma.teamAdmin.delete).toHaveBeenCalledWith({ where: { id: 'ta1' } });
    });
  });

  describe('listTeamsForUser', () => {
    it('403s a player the caller neither is nor guards', async () => {
      prisma.player.findFirst.mockResolvedValue(null);

      await expect(service.listTeamsForUser('user-1', 'stranger')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.player.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.teamAdmin.findMany).not.toHaveBeenCalled();
    });

    it('lists only the child’s roster teams, through the child’s club, with no manager grant', async () => {
      prisma.player.findFirst.mockResolvedValue({ id: 'leo' });
      prisma.player.findUniqueOrThrow.mockResolvedValue({
        clubId: 'club-2',
        teamPlayers: [
          {
            role: 'PLAYER',
            team: {
              id: 'team-2',
              name: 'U11',
              category: 'U11',
              gender: 'MEN',
              clubTeams: [
                { club: { id: 'club-1', name: 'COC Basket' } },
                { club: { id: 'club-2', name: 'ASBC' } },
              ],
            },
          },
        ],
      });

      const result = await service.listTeamsForUser('parent-1', 'leo');

      expect(result).toEqual([
        {
          teamId: 'team-2',
          teamName: 'U11',
          category: 'U11',
          gender: 'MEN',
          clubId: 'club-2',
          clubName: 'ASBC',
          isTeamAdmin: false,
          rosterRole: 'PLAYER',
        },
      ]);
      // The parent's own grants and rosters are never read for the child.
      expect(prisma.teamAdmin.findMany).not.toHaveBeenCalled();
      expect(prisma.teamPlayer.findMany).not.toHaveBeenCalled();
    });

    it('returns a team where the user is only a TeamAdmin', async () => {
      prisma.teamAdmin.findMany.mockResolvedValue([
        {
          teamId: 'team-1',
          team: {
            id: 'team-1',
            name: 'U15',
            category: 'U15',
            gender: 'MEN',
            clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }],
          },
        },
      ]);
      prisma.teamPlayer.findMany.mockResolvedValue([]);
      prisma.clubMembership.findMany.mockResolvedValue([{ clubId: 'club-1' }]);

      const result = await service.listTeamsForUser('user-1');

      expect(result).toEqual([
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
    });

    it('returns a team where the user is only rostered', async () => {
      prisma.teamAdmin.findMany.mockResolvedValue([]);
      prisma.teamPlayer.findMany.mockResolvedValue([
        {
          teamId: 'team-1',
          role: 'COACH',
          team: {
            id: 'team-1',
            name: 'U15',
            category: 'U15',
            gender: 'MEN',
            clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }],
          },
        },
      ]);
      prisma.clubMembership.findMany.mockResolvedValue([{ clubId: 'club-1' }]);

      const result = await service.listTeamsForUser('user-1');

      expect(result).toEqual([
        {
          teamId: 'team-1',
          teamName: 'U15',
          category: 'U15',
          gender: 'MEN',
          clubId: 'club-1',
          clubName: 'COC Basket',
          isTeamAdmin: false,
          rosterRole: 'COACH',
        },
      ]);
    });

    it('merges a team where the user is both a TeamAdmin and rostered', async () => {
      const team = {
        id: 'team-1',
        name: 'U15',
        category: 'U15',
        gender: 'MEN',
        clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }],
      };
      prisma.teamAdmin.findMany.mockResolvedValue([{ teamId: 'team-1', team }]);
      prisma.teamPlayer.findMany.mockResolvedValue([{ teamId: 'team-1', role: 'PLAYER', team }]);
      prisma.clubMembership.findMany.mockResolvedValue([{ clubId: 'club-1' }]);

      const result = await service.listTeamsForUser('user-1');

      expect(result).toEqual([
        {
          teamId: 'team-1',
          teamName: 'U15',
          category: 'U15',
          gender: 'MEN',
          clubId: 'club-1',
          clubName: 'COC Basket',
          isTeamAdmin: true,
          rosterRole: 'PLAYER',
        },
      ]);
    });

    it('sorts results by team name and queries by userId', async () => {
      prisma.teamAdmin.findMany.mockResolvedValue([
        {
          teamId: 'team-2',
          team: {
            id: 'team-2',
            name: 'U18',
            category: 'U18',
            gender: 'MEN',
            clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }],
          },
        },
        {
          teamId: 'team-1',
          team: {
            id: 'team-1',
            name: 'U11',
            category: 'U11',
            gender: 'MEN',
            clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }],
          },
        },
      ]);
      prisma.teamPlayer.findMany.mockResolvedValue([]);
      prisma.clubMembership.findMany.mockResolvedValue([{ clubId: 'club-1' }]);

      const result = await service.listTeamsForUser('user-1');

      expect(result.map((t) => t.teamName)).toEqual(['U11', 'U18']);
      expect(prisma.teamAdmin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(prisma.teamPlayer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { player: { userId: 'user-1' } } }),
      );
      expect(prisma.clubMembership.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('picks the linked club the user actually belongs to, not the owning club, for a CTC team', async () => {
      // team-1 is owned by club-1 but the user is only a member of the
      // partner club (club-2) — linking to club-1 would 403 them out.
      prisma.teamAdmin.findMany.mockResolvedValue([
        {
          teamId: 'team-1',
          team: {
            id: 'team-1',
            name: 'U15',
            category: 'U15',
            gender: 'MEN',
            clubTeams: [
              { club: { id: 'club-1', name: 'COC Basket' } },
              { club: { id: 'club-2', name: 'Club B' } },
            ],
          },
        },
      ]);
      prisma.teamPlayer.findMany.mockResolvedValue([]);
      prisma.clubMembership.findMany.mockResolvedValue([{ clubId: 'club-2' }]);

      const result = await service.listTeamsForUser('user-1');

      expect(result[0].clubId).toBe('club-2');
      expect(result[0].clubName).toBe('Club B');
    });
  });
});
