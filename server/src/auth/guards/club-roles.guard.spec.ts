import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ClubRolesGuard } from './club-roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { CLUB_ROLES_KEY } from '../decorators/club-roles.decorator';
import { ALLOW_GUARDIANS_KEY } from '../decorators/allow-guardians.decorator';

function buildContext(
  user: { id: string } | undefined,
  clubId: string | undefined,
  teamId?: string,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, params: { clubId, teamId } }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('ClubRolesGuard', () => {
  let guard: ClubRolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: {
    clubMembership: { findUnique: jest.Mock };
    playerGuardian: { findFirst: jest.Mock };
  };

  // Answers each metadata key the guard reads separately, so a route's roles
  // and its @AllowGuardians() flag can't be confused with one another.
  const setMetadata = (roles: string[] | undefined, allowGuardians = false) =>
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === CLUB_ROLES_KEY ? roles : key === ALLOW_GUARDIANS_KEY ? allowGuardians : undefined,
    );

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = {
      clubMembership: { findUnique: jest.fn() },
      playerGuardian: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClubRolesGuard,
        { provide: Reflector, useValue: reflector },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    guard = module.get<ClubRolesGuard>(ClubRolesGuard);
  });

  it('allows the request when no @ClubRoles metadata is set', async () => {
    setMetadata(undefined);

    const result = await guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'));

    expect(result).toBe(true);
    expect(prisma.clubMembership.findUnique).not.toHaveBeenCalled();
  });

  it('allows a member whose role matches', async () => {
    setMetadata(['ADMIN']);
    prisma.clubMembership.findUnique.mockResolvedValue({ role: 'ADMIN' });

    const result = await guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'));

    expect(result).toBe(true);
    expect(prisma.clubMembership.findUnique).toHaveBeenCalledWith({
      where: { userId_clubId: { userId: 'user-1', clubId: 'club-1' } },
    });
  });

  it('denies a member whose role does not match', async () => {
    setMetadata(['ADMIN']);
    prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });

    await expect(guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('denies a user with no membership in the club', async () => {
    setMetadata(['ADMIN']);
    prisma.clubMembership.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('denies with ForbiddenException when there is no authenticated user on the request', async () => {
    setMetadata(['ADMIN']);

    await expect(guard.canActivate(buildContext(undefined, 'club-1'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.clubMembership.findUnique).not.toHaveBeenCalled();
  });

  it('denies with ForbiddenException when the route has no clubId param', async () => {
    setMetadata(['ADMIN']);

    await expect(guard.canActivate(buildContext({ id: 'user-1' }, undefined))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.clubMembership.findUnique).not.toHaveBeenCalled();
  });

  describe('@AllowGuardians()', () => {
    it('never looks up guardian links on a route without the decorator', async () => {
      setMetadata(['ADMIN', 'MEMBER']);
      prisma.clubMembership.findUnique.mockResolvedValue(null);

      await expect(
        guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', 'team-1')),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.playerGuardian.findFirst).not.toHaveBeenCalled();
    });

    it('never looks up guardian links for a member who passes', async () => {
      setMetadata(['ADMIN', 'MEMBER'], true);
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });

      await expect(guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'))).resolves.toBe(true);
      expect(prisma.playerGuardian.findFirst).not.toHaveBeenCalled();
    });

    it('admits a guardian of a player rostered on the route team', async () => {
      setMetadata(['ADMIN', 'MEMBER'], true);
      prisma.clubMembership.findUnique.mockResolvedValue(null);
      prisma.playerGuardian.findFirst.mockResolvedValue({ playerId: 'player-1' });

      await expect(
        guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', 'team-1')),
      ).resolves.toBe(true);
      expect(prisma.playerGuardian.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          player: { clubId: 'club-1', teamPlayers: { some: { teamId: 'team-1' } } },
        },
        select: { playerId: true },
      });
    });

    it('matches any guarded player of the club on a club-level route', async () => {
      setMetadata(['ADMIN', 'MEMBER'], true);
      prisma.clubMembership.findUnique.mockResolvedValue(null);
      prisma.playerGuardian.findFirst.mockResolvedValue({ playerId: 'player-1' });

      await expect(guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'))).resolves.toBe(true);
      expect(prisma.playerGuardian.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', player: { clubId: 'club-1' } },
        select: { playerId: true },
      });
    });

    it('denies a user who guards nobody on that team', async () => {
      setMetadata(['ADMIN', 'MEMBER'], true);
      prisma.clubMembership.findUnique.mockResolvedValue(null);
      prisma.playerGuardian.findFirst.mockResolvedValue(null);

      await expect(
        guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', 'team-1')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('admits a guardian who is also a member with an insufficient role', async () => {
      setMetadata(['ADMIN'], true);
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      prisma.playerGuardian.findFirst.mockResolvedValue({ playerId: 'player-1' });

      await expect(
        guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', 'team-1')),
      ).resolves.toBe(true);
    });
  });
});
