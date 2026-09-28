import { ForbiddenException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { canActForPlayer, resolveActingTeamPlayer } from './acting-as';

describe('resolveActingTeamPlayer', () => {
  let prisma: { teamPlayer: { findFirst: jest.Mock }; player: { findFirst: jest.Mock } };

  beforeEach(() => {
    prisma = { teamPlayer: { findFirst: jest.fn() }, player: { findFirst: jest.fn() } };
  });

  function run(forPlayerId?: string) {
    return resolveActingTeamPlayer(prisma as unknown as PrismaClient, {
      userId: 'user-1',
      teamId: 'team-1',
      forPlayerId,
    });
  }

  it('resolves the caller’s own slot without a forPlayerId', async () => {
    prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-me' });

    await expect(run()).resolves.toEqual({ id: 'tp-me' });
    expect(prisma.teamPlayer.findFirst).toHaveBeenCalledWith({
      where: { teamId: 'team-1', player: { userId: 'user-1' } },
    });
  });

  it('resolves a slot the caller may act for, self or guarded child', async () => {
    prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-child' });

    await expect(run('player-child')).resolves.toEqual({ id: 'tp-child' });
    expect(prisma.teamPlayer.findFirst).toHaveBeenCalledWith({
      where: {
        teamId: 'team-1',
        playerId: 'player-child',
        player: { OR: [{ userId: 'user-1' }, { guardians: { some: { userId: 'user-1' } } }] },
      },
    });
    expect(prisma.player.findFirst).not.toHaveBeenCalled();
  });

  it('is null for a guarded child who is not on this team', async () => {
    prisma.teamPlayer.findFirst.mockResolvedValue(null);
    prisma.player.findFirst.mockResolvedValue({ id: 'player-child' });

    await expect(run('player-child')).resolves.toBeNull();
  });

  it('refuses a player the caller may not act for', async () => {
    prisma.teamPlayer.findFirst.mockResolvedValue(null);
    prisma.player.findFirst.mockResolvedValue(null);

    await expect(run('player-stranger')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('canActForPlayer', () => {
  it('checks self or guardian in one query', async () => {
    const prisma = { player: { findFirst: jest.fn().mockResolvedValue({ id: 'p' }) } };

    await expect(canActForPlayer(prisma as unknown as PrismaClient, 'user-1', 'p')).resolves.toBe(
      true,
    );
    expect(prisma.player.findFirst).toHaveBeenCalledWith({
      where: { id: 'p', OR: [{ userId: 'user-1' }, { guardians: { some: { userId: 'user-1' } } }] },
      select: { id: true },
    });
  });
});
