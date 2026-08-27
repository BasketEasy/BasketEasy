import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TeamManagerGuard } from './team-manager.guard';
import { PrismaService } from '../../prisma/prisma.service';

function buildContext(
  user: { id: string } | undefined,
  clubId: string | undefined,
  teamId: string | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, params: { clubId, teamId } }),
    }),
  } as unknown as ExecutionContext;
}

describe('TeamManagerGuard', () => {
  let guard: TeamManagerGuard;
  let prisma: {
    clubMembership: { findUnique: jest.Mock };
    teamAdmin: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      clubMembership: { findUnique: jest.fn() },
      teamAdmin: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TeamManagerGuard, { provide: PrismaService, useValue: prisma }],
    }).compile();

    guard = module.get<TeamManagerGuard>(TeamManagerGuard);
  });

  it('allows a club ADMIN of :clubId', async () => {
    prisma.clubMembership.findUnique.mockResolvedValue({ role: 'ADMIN' });

    const result = await guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', 'team-1'));

    expect(result).toBe(true);
    expect(prisma.teamAdmin.findUnique).not.toHaveBeenCalled();
  });

  it('allows a TeamAdmin of :teamId who is not a club ADMIN', async () => {
    prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prisma.teamAdmin.findUnique.mockResolvedValue({ id: 'ta-1' });

    const result = await guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', 'team-1'));

    expect(result).toBe(true);
    expect(prisma.teamAdmin.findUnique).toHaveBeenCalledWith({
      where: { teamId_userId: { teamId: 'team-1', userId: 'user-1' } },
    });
  });

  it('denies a club MEMBER who is not a TeamAdmin', async () => {
    prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prisma.teamAdmin.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', 'team-1')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('denies a user with no membership in the club and no TeamAdmin grant', async () => {
    prisma.clubMembership.findUnique.mockResolvedValue(null);
    prisma.teamAdmin.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', 'team-1')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('denies with ForbiddenException when there is no authenticated user', async () => {
    await expect(guard.canActivate(buildContext(undefined, 'club-1', 'team-1'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.clubMembership.findUnique).not.toHaveBeenCalled();
  });

  it('denies with ForbiddenException when the route has no clubId param', async () => {
    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, undefined, 'team-1')),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.clubMembership.findUnique).not.toHaveBeenCalled();
  });

  it('denies with ForbiddenException when the route has no teamId param', async () => {
    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', undefined)),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.clubMembership.findUnique).not.toHaveBeenCalled();
  });

  // isTeamManager is the extracted check EventsService also calls directly
  // (e.g. for jersey/ball logistics reassignment) — exercised here as a
  // plain boolean-returning method, distinct from canActivate's
  // throw-on-denial route-guard behavior.
  describe('isTeamManager', () => {
    it('returns true for a club ADMIN of clubId', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'ADMIN' });

      await expect(guard.isTeamManager('club-1', 'team-1', 'user-1')).resolves.toBe(true);
      expect(prisma.teamAdmin.findUnique).not.toHaveBeenCalled();
    });

    it('returns true for a TeamAdmin of teamId who is not a club ADMIN', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      prisma.teamAdmin.findUnique.mockResolvedValue({ id: 'ta-1' });

      await expect(guard.isTeamManager('club-1', 'team-1', 'user-1')).resolves.toBe(true);
    });

    it('returns false for a club MEMBER who is not a TeamAdmin', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      prisma.teamAdmin.findUnique.mockResolvedValue(null);

      await expect(guard.isTeamManager('club-1', 'team-1', 'user-1')).resolves.toBe(false);
    });

    it('returns false without throwing for a user with no membership at all', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue(null);
      prisma.teamAdmin.findUnique.mockResolvedValue(null);

      await expect(guard.isTeamManager('club-1', 'team-1', 'user-1')).resolves.toBe(false);
    });
  });
});
