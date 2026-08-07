import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ClubRolesGuard } from './club-roles.guard';
import { PrismaService } from '../../prisma/prisma.service';

function buildContext(user: { id: string } | undefined, clubId: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, params: { clubId } }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('ClubRolesGuard', () => {
  let guard: ClubRolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: { clubMembership: { findUnique: jest.Mock } };

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = { clubMembership: { findUnique: jest.fn() } };

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
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'));

    expect(result).toBe(true);
    expect(prisma.clubMembership.findUnique).not.toHaveBeenCalled();
  });

  it('allows a member whose role matches', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    prisma.clubMembership.findUnique.mockResolvedValue({ role: 'ADMIN' });

    const result = await guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'));

    expect(result).toBe(true);
    expect(prisma.clubMembership.findUnique).toHaveBeenCalledWith({
      where: { userId_clubId: { userId: 'user-1', clubId: 'club-1' } },
    });
  });

  it('denies a member whose role does not match', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });

    await expect(guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('denies a user with no membership in the club', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    prisma.clubMembership.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
