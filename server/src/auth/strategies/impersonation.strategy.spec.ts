import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IMPERSONATION_TOKEN_SCOPE } from '@basketeasy/types/platform-admin-impersonation';
import type { PrismaService } from '../../prisma/prisma.service';
import { ImpersonationStrategy } from './impersonation.strategy';

describe('ImpersonationStrategy.validate', () => {
  const now = new Date('2026-09-28T20:00:00.000Z');
  const payload = {
    sub: 'user-1',
    act: 'admin-1',
    sid: 'session-1',
    scope: IMPERSONATION_TOKEN_SCOPE,
  };
  const grant = {
    role: 'DATA_OFFICER',
    lockedUntil: null as Date | null,
    allowedCidrs: [] as string[],
  };
  const baseSession = {
    actorUserId: 'admin-1',
    subjectUserId: 'user-1',
    expiresAt: new Date(now.getTime() + 60_000),
    endedAt: null as Date | null,
    subject: { email: 'subject@example.com' },
    actor: { platformAdmin: grant as typeof grant | null },
  };
  let prisma: { impersonationSession: { findUnique: jest.Mock } };
  let strategy: ImpersonationStrategy;

  const req = (method = 'GET', remoteAddress = '203.0.113.7') =>
    ({ method, headers: {}, socket: { remoteAddress } }) as unknown as Request;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    prisma = { impersonationSession: { findUnique: jest.fn().mockResolvedValue(baseSession) } };
    const config = { get: () => 'platform-secret-that-is-long-enough-for-hs256' };
    strategy = new ImpersonationStrategy(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the subject, marked as impersonated', async () => {
    await expect(strategy.validate(req(), payload)).resolves.toEqual({
      id: 'user-1',
      email: 'subject@example.com',
      impersonation: { sessionId: 'session-1', actorUserId: 'admin-1' },
    });
  });

  it('allows HEAD', async () => {
    await expect(strategy.validate(req('HEAD'), payload)).resolves.toBeDefined();
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    'refuses %s before reading the session',
    async (method) => {
      await expect(strategy.validate(req(method), payload)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.impersonationSession.findUnique).not.toHaveBeenCalled();
    },
  );

  it('refuses a token with another scope', async () => {
    await expect(
      strategy.validate(req(), { ...payload, scope: 'platform-admin' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['unknown session', null],
    ['ended session', { ...baseSession, endedAt: new Date(now.getTime() - 1) }],
    ['expired session', { ...baseSession, expiresAt: now }],
    ['another actor', { ...baseSession, actorUserId: 'admin-2' }],
    ['another subject', { ...baseSession, subjectUserId: 'user-2' }],
    ['revoked grant', { ...baseSession, actor: { platformAdmin: null } }],
    ['SUPPORT grant', { ...baseSession, actor: { platformAdmin: { ...grant, role: 'SUPPORT' } } }],
    [
      'locked grant',
      {
        ...baseSession,
        actor: { platformAdmin: { ...grant, lockedUntil: new Date(now.getTime() + 1) } },
      },
    ],
    [
      'IP outside the allowlist',
      { ...baseSession, actor: { platformAdmin: { ...grant, allowedCidrs: ['10.0.0.0/8'] } } },
    ],
  ])('refuses on %s', async (_label, session) => {
    prisma.impersonationSession.findUnique.mockResolvedValue(session);

    await expect(strategy.validate(req(), payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
