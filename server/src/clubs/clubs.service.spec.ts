import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClubsService } from './clubs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClubsService', () => {
  let service: ClubsService;
  let prisma: {
    club: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    clubMembership: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    player: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      club: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
      clubMembership: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      player: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClubsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ClubsService>(ClubsService);
  });

  describe('createClub', () => {
    it('creates a club with the creator as ADMIN', async () => {
      prisma.club.create.mockResolvedValue({
        id: 'club-1',
        name: 'COC Basket',
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createClub('user-1', 'COC Basket');

      expect(prisma.club.create).toHaveBeenCalledWith({
        data: {
          name: 'COC Basket',
          memberships: { create: { userId: 'user-1', role: 'ADMIN' } },
        },
      });
      expect(result).toEqual({
        id: 'club-1',
        name: 'COC Basket',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('addMember', () => {
    it('throws NotFoundException when no user has that email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.addMember('club-1', 'nobody@example.com')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.clubMembership.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the user is already a member', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'a@b.com' });
      prisma.clubMembership.findUnique.mockResolvedValue({ id: 'membership-1' });

      await expect(service.addMember('club-1', 'a@b.com')).rejects.toThrow(ConflictException);
      expect(prisma.clubMembership.create).not.toHaveBeenCalled();
    });

    it('adds the user as MEMBER', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        email: 'a@b.com',
        firstName: 'Alex',
        lastName: 'Dupont',
      });
      prisma.clubMembership.findUnique.mockResolvedValue(null);
      prisma.clubMembership.create.mockResolvedValue({
        role: 'MEMBER',
        createdAt: new Date('2026-01-02'),
      });

      const result = await service.addMember('club-1', 'a@b.com');

      expect(prisma.clubMembership.create).toHaveBeenCalledWith({
        data: { userId: 'user-2', clubId: 'club-1', role: 'MEMBER' },
      });
      expect(result).toEqual({
        userId: 'user-2',
        email: 'a@b.com',
        firstName: 'Alex',
        lastName: 'Dupont',
        role: 'MEMBER',
        joinedAt: '2026-01-02T00:00:00.000Z',
      });
    });
  });

  describe('listMembers', () => {
    it('returns members with names sourced from the related user record, ordered by name by default', async () => {
      prisma.clubMembership.findMany.mockResolvedValue([
        {
          userId: 'user-2',
          role: 'MEMBER',
          createdAt: new Date('2026-01-02'),
          user: { email: 'a@b.com', firstName: 'Alex', lastName: 'Dupont' },
        },
      ]);
      prisma.clubMembership.count.mockResolvedValue(1);

      const result = await service.listMembers('club-1', {});

      expect(prisma.clubMembership.findMany).toHaveBeenCalledWith({
        where: { clubId: 'club-1' },
        include: { user: true },
        orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
        skip: 0,
        take: 25,
      });
      expect(prisma.clubMembership.count).toHaveBeenCalledWith({ where: { clubId: 'club-1' } });
      expect(result).toEqual({
        items: [
          {
            userId: 'user-2',
            email: 'a@b.com',
            firstName: 'Alex',
            lastName: 'Dupont',
            role: 'MEMBER',
            joinedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      });
    });

    it('filters by role', async () => {
      prisma.clubMembership.findMany.mockResolvedValue([]);
      prisma.clubMembership.count.mockResolvedValue(0);

      await service.listMembers('club-1', { role: 'ADMIN' });

      const expectedWhere = { clubId: 'club-1', role: 'ADMIN' };
      expect(prisma.clubMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(prisma.clubMembership.count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('filters by search across email, first name, and last name', async () => {
      prisma.clubMembership.findMany.mockResolvedValue([]);
      prisma.clubMembership.count.mockResolvedValue(0);

      await service.listMembers('club-1', { search: 'dup' });

      expect(prisma.clubMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clubId: 'club-1',
            user: {
              OR: [
                { email: { contains: 'dup', mode: 'insensitive' } },
                { firstName: { contains: 'dup', mode: 'insensitive' } },
                { lastName: { contains: 'dup', mode: 'insensitive' } },
              ],
            },
          },
        }),
      );
    });

    it('sorts by joinedAt descending', async () => {
      prisma.clubMembership.findMany.mockResolvedValue([]);
      prisma.clubMembership.count.mockResolvedValue(0);

      await service.listMembers('club-1', { sortBy: 'joinedAt', sortOrder: 'desc' });

      expect(prisma.clubMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: 'desc' }] }),
      );
    });

    it('sorts by email', async () => {
      prisma.clubMembership.findMany.mockResolvedValue([]);
      prisma.clubMembership.count.mockResolvedValue(0);

      await service.listMembers('club-1', { sortBy: 'email' });

      expect(prisma.clubMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ user: { email: 'asc' } }] }),
      );
    });

    it('computes skip/take for page 2', async () => {
      prisma.clubMembership.findMany.mockResolvedValue([]);
      prisma.clubMembership.count.mockResolvedValue(30);

      const result = await service.listMembers('club-1', { page: 2, pageSize: 10 });

      expect(prisma.clubMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result).toEqual(expect.objectContaining({ page: 2, pageSize: 10, total: 30 }));
    });
  });

  describe('removeMember', () => {
    it('throws NotFoundException when there is no such membership', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue(null);

      await expect(service.removeMember('club-1', 'user-2')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when removing the last admin', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.clubMembership.count.mockResolvedValue(1);

      await expect(service.removeMember('club-1', 'user-1')).rejects.toThrow(BadRequestException);
      expect(prisma.clubMembership.delete).not.toHaveBeenCalled();
    });

    it('removes a non-last-admin membership', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      prisma.clubMembership.delete.mockResolvedValue({});
      prisma.player.updateMany.mockResolvedValue({ count: 0 });

      await service.removeMember('club-1', 'user-2');

      expect(prisma.clubMembership.delete).toHaveBeenCalledWith({
        where: { userId_clubId: { userId: 'user-2', clubId: 'club-1' } },
      });
    });

    it('unlinks any player tied to the removed member, in the same transaction', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      prisma.clubMembership.delete.mockResolvedValue({});
      prisma.player.updateMany.mockResolvedValue({ count: 1 });

      await service.removeMember('club-1', 'user-2');

      expect(prisma.player.updateMany).toHaveBeenCalledWith({
        where: { clubId: 'club-1', userId: 'user-2' },
        data: { userId: null },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('players', () => {
    it('lists players for a club, ordered by name by default', async () => {
      prisma.player.findMany.mockResolvedValue([
        {
          id: 'p1',
          clubId: 'club-1',
          firstName: 'A',
          lastName: 'B',
          userId: null,
          createdAt: new Date('2026-01-01'),
        },
      ]);
      prisma.player.count.mockResolvedValue(1);

      const result = await service.listPlayers('club-1', {});

      expect(prisma.player.findMany).toHaveBeenCalledWith({
        where: { clubId: 'club-1' },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: 0,
        take: 25,
      });
      expect(prisma.player.count).toHaveBeenCalledWith({ where: { clubId: 'club-1' } });
      expect(result).toEqual({
        items: [
          {
            id: 'p1',
            clubId: 'club-1',
            firstName: 'A',
            lastName: 'B',
            userId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      });
    });

    it('filters players by search on first/last name', async () => {
      prisma.player.findMany.mockResolvedValue([]);
      prisma.player.count.mockResolvedValue(0);

      await service.listPlayers('club-1', { search: 'al' });

      const expectedWhere = {
        clubId: 'club-1',
        OR: [
          { firstName: { contains: 'al', mode: 'insensitive' } },
          { lastName: { contains: 'al', mode: 'insensitive' } },
        ],
      };
      expect(prisma.player.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(prisma.player.count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('sorts players by createdAt', async () => {
      prisma.player.findMany.mockResolvedValue([]);
      prisma.player.count.mockResolvedValue(0);

      await service.listPlayers('club-1', { sortBy: 'createdAt', sortOrder: 'desc' });

      expect(prisma.player.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: 'desc' }] }),
      );
    });

    it('creates a player scoped to the club', async () => {
      prisma.player.create.mockResolvedValue({
        id: 'p1',
        clubId: 'club-1',
        firstName: 'A',
        lastName: 'B',
        userId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createPlayer('club-1', { firstName: 'A', lastName: 'B' });

      expect(prisma.player.create).toHaveBeenCalledWith({
        data: { clubId: 'club-1', firstName: 'A', lastName: 'B', userId: undefined },
      });
      expect(result.id).toBe('p1');
    });

    it('throws BadRequestException creating a player linked to a non-member', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue(null);

      await expect(
        service.createPlayer('club-1', { firstName: 'A', lastName: 'B', userId: 'user-9' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.player.create).not.toHaveBeenCalled();
    });

    it('creates a player linked to a club member', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ id: 'membership-1' });
      prisma.player.create.mockResolvedValue({
        id: 'p1',
        clubId: 'club-1',
        firstName: 'A',
        lastName: 'B',
        userId: 'user-2',
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createPlayer('club-1', {
        firstName: 'A',
        lastName: 'B',
        userId: 'user-2',
      });

      expect(prisma.player.create).toHaveBeenCalledWith({
        data: { clubId: 'club-1', firstName: 'A', lastName: 'B', userId: 'user-2' },
      });
      expect(result.userId).toBe('user-2');
    });

    it('throws ConflictException when the linked member already has a player', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ id: 'membership-1' });
      prisma.player.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(
        service.createPlayer('club-1', { firstName: 'A', lastName: 'B', userId: 'user-2' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException updating a player from another club', async () => {
      prisma.player.findUnique.mockResolvedValue({ id: 'p1', clubId: 'other-club' });

      await expect(service.updatePlayer('club-1', 'p1', { firstName: 'C' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.player.update).not.toHaveBeenCalled();
    });

    it('updates a player belonging to the club', async () => {
      prisma.player.findUnique.mockResolvedValue({ id: 'p1', clubId: 'club-1' });
      prisma.player.update.mockResolvedValue({
        id: 'p1',
        clubId: 'club-1',
        firstName: 'C',
        lastName: 'B',
        userId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.updatePlayer('club-1', 'p1', { firstName: 'C' });

      expect(prisma.player.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { firstName: 'C' },
      });
      expect(result.firstName).toBe('C');
    });

    it('throws BadRequestException updating a player to link a non-member', async () => {
      prisma.player.findUnique.mockResolvedValue({ id: 'p1', clubId: 'club-1' });
      prisma.clubMembership.findUnique.mockResolvedValue(null);

      await expect(service.updatePlayer('club-1', 'p1', { userId: 'user-9' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.player.update).not.toHaveBeenCalled();
    });

    it('unlinks a player by passing userId: null', async () => {
      prisma.player.findUnique.mockResolvedValue({ id: 'p1', clubId: 'club-1' });
      prisma.player.update.mockResolvedValue({
        id: 'p1',
        clubId: 'club-1',
        firstName: 'A',
        lastName: 'B',
        userId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.updatePlayer('club-1', 'p1', { userId: null });

      expect(prisma.player.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { userId: null },
      });
      expect(result.userId).toBeNull();
    });

    it('throws NotFoundException deleting a player from another club', async () => {
      prisma.player.findUnique.mockResolvedValue({ id: 'p1', clubId: 'other-club' });

      await expect(service.deletePlayer('club-1', 'p1')).rejects.toThrow(NotFoundException);
      expect(prisma.player.delete).not.toHaveBeenCalled();
    });

    it('deletes a player belonging to the club', async () => {
      prisma.player.findUnique.mockResolvedValue({ id: 'p1', clubId: 'club-1' });
      prisma.player.delete.mockResolvedValue({});

      await service.deletePlayer('club-1', 'p1');

      expect(prisma.player.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });
  });
});
