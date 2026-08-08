import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TeamsService', () => {
  let service: TeamsService;
  let prisma: {
    team: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    clubMembership: { findUnique: jest.Mock };
    teamMembership: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      team: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
      clubMembership: { findUnique: jest.fn() },
      teamMembership: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TeamsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
  });

  describe('createTeam', () => {
    it('creates a team linked to the acting club', async () => {
      prisma.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'U15 Filles',
        createdAt: new Date('2026-01-01'),
        clubs: [{ clubId: 'club-1' }],
      });

      const result = await service.createTeam('club-1', 'U15 Filles');

      expect(prisma.team.create).toHaveBeenCalledWith({
        data: { name: 'U15 Filles', clubs: { create: { clubId: 'club-1' } } },
        include: { clubs: true },
      });
      expect(result).toEqual({
        id: 'team-1',
        name: 'U15 Filles',
        clubIds: ['club-1'],
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('getTeam', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        name: 'U15 Filles',
        createdAt: new Date('2026-01-01'),
        clubs: [{ clubId: 'other-club' }],
      });

      await expect(service.getTeam('club-1', 'team-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the team does not exist', async () => {
      prisma.team.findUnique.mockResolvedValue(null);

      await expect(service.getTeam('club-1', 'team-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addMember', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        clubs: [{ clubId: 'other-club' }],
      });

      await expect(service.addMember('club-1', 'team-1', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.teamMembership.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user is not a member of the club', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubs: [{ clubId: 'club-1' }] });
      prisma.clubMembership.findUnique.mockResolvedValue(null);

      await expect(service.addMember('club-1', 'team-1', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.teamMembership.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when already a team member', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubs: [{ clubId: 'club-1' }] });
      prisma.clubMembership.findUnique.mockResolvedValue({
        userId: 'user-2',
        user: { email: 'a@b.com' },
      });
      prisma.teamMembership.findUnique.mockResolvedValue({ id: 'membership-1' });

      await expect(service.addMember('club-1', 'team-1', 'user-2')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.teamMembership.create).not.toHaveBeenCalled();
    });

    it('adds the club member to the team', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubs: [{ clubId: 'club-1' }] });
      prisma.clubMembership.findUnique.mockResolvedValue({
        userId: 'user-2',
        user: { email: 'a@b.com' },
      });
      prisma.teamMembership.findUnique.mockResolvedValue(null);
      prisma.teamMembership.create.mockResolvedValue({ createdAt: new Date('2026-01-02') });

      const result = await service.addMember('club-1', 'team-1', 'user-2');

      expect(prisma.teamMembership.create).toHaveBeenCalledWith({
        data: { teamId: 'team-1', userId: 'user-2' },
      });
      expect(result).toEqual({
        userId: 'user-2',
        email: 'a@b.com',
        addedAt: '2026-01-02T00:00:00.000Z',
      });
    });
  });

  describe('removeMember', () => {
    it('throws NotFoundException when there is no such membership', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubs: [{ clubId: 'club-1' }] });
      prisma.teamMembership.findUnique.mockResolvedValue(null);

      await expect(service.removeMember('club-1', 'team-1', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('removes the membership', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubs: [{ clubId: 'club-1' }] });
      prisma.teamMembership.findUnique.mockResolvedValue({ id: 'membership-1' });
      prisma.teamMembership.delete.mockResolvedValue({});

      await service.removeMember('club-1', 'team-1', 'user-2');

      expect(prisma.teamMembership.delete).toHaveBeenCalledWith({
        where: { teamId_userId: { teamId: 'team-1', userId: 'user-2' } },
      });
    });
  });
});
