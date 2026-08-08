import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
      delete: jest.Mock;
    };
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
        delete: jest.fn(),
      },
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
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'a@b.com' });
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
        role: 'MEMBER',
        joinedAt: '2026-01-02T00:00:00.000Z',
      });
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

      await expect(service.removeMember('club-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.clubMembership.delete).not.toHaveBeenCalled();
    });

    it('removes a non-last-admin membership', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      prisma.clubMembership.delete.mockResolvedValue({});

      await service.removeMember('club-1', 'user-2');

      expect(prisma.clubMembership.delete).toHaveBeenCalledWith({
        where: { userId_clubId: { userId: 'user-2', clubId: 'club-1' } },
      });
    });
  });
});
