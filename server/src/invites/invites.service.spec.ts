import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

describe('InvitesService', () => {
  let service: InvitesService;
  let prisma: {
    playerInvite: { findUnique: jest.Mock; update: jest.Mock };
    player: { updateMany: jest.Mock };
    clubMembership: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let authService: { register: jest.Mock };

  const validInvite = {
    id: 'invite-1',
    playerId: 'player-1',
    acceptedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    player: {
      firstName: 'Théo',
      lastName: 'Dupont',
      clubId: 'club-1',
      club: { name: 'ASVEL' },
    },
  };

  beforeEach(async () => {
    prisma = {
      playerInvite: { findUnique: jest.fn(), update: jest.fn() },
      player: { updateMany: jest.fn() },
      clubMembership: { upsert: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };
    authService = { register: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    service = module.get<InvitesService>(InvitesService);
  });

  describe('getPreview', () => {
    it('throws when the token matches no invite', async () => {
      prisma.playerInvite.findUnique.mockResolvedValue(null);

      await expect(service.getPreview('bad-token')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws for an already-accepted invite', async () => {
      prisma.playerInvite.findUnique.mockResolvedValue({ ...validInvite, acceptedAt: new Date() });

      await expect(service.getPreview('token')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws for an expired invite', async () => {
      prisma.playerInvite.findUnique.mockResolvedValue({
        ...validInvite,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.getPreview('token')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the player/club preview for a live invite', async () => {
      prisma.playerInvite.findUnique.mockResolvedValue(validInvite);

      await expect(service.getPreview('token')).resolves.toEqual({
        playerFirstName: 'Théo',
        playerLastName: 'Dupont',
        clubName: 'ASVEL',
      });
    });
  });

  describe('accept', () => {
    it('registers the account then links the invited player', async () => {
      prisma.playerInvite.findUnique.mockResolvedValue(validInvite);
      authService.register.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'user-1' },
      });
      prisma.player.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.accept('token', 'theo@example.com', 'password1234');

      expect(authService.register).toHaveBeenCalledWith('theo@example.com', 'password1234');
      expect(prisma.player.updateMany).toHaveBeenCalledWith({
        where: { id: 'player-1', userId: null },
        data: { userId: 'user-1' },
      });
      expect(prisma.clubMembership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_clubId: { userId: 'user-1', clubId: 'club-1' } },
        }),
      );
      expect(prisma.playerInvite.update).toHaveBeenCalledWith({
        where: { id: 'invite-1' },
        data: { acceptedAt: expect.any(Date) },
      });
      expect(result).toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'user-1' },
      });
    });

    it('rejects when the invite is no longer valid', async () => {
      prisma.playerInvite.findUnique.mockResolvedValue(null);

      await expect(
        service.accept('token', 'theo@example.com', 'password1234'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('surfaces a conflict if the player got claimed concurrently', async () => {
      prisma.playerInvite.findUnique.mockResolvedValue(validInvite);
      authService.register.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'user-1' },
      });
      prisma.player.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.accept('token', 'theo@example.com', 'password1234'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
