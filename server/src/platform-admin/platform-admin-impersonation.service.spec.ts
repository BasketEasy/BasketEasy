import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IMPERSONATION_TOKEN_SCOPE } from '@basketeasy/types/platform-admin-impersonation';
import type { PrismaService } from '../prisma/prisma.service';
import { PlatformAdminImpersonationService } from './platform-admin-impersonation.service';

const SECRET = 'platform-secret-that-is-long-enough-for-hs256';

describe('PlatformAdminImpersonationService', () => {
  const now = new Date('2026-09-28T20:00:00.000Z');
  const actor = { userId: 'admin-1', email: 'dpo@kluvo.net' };
  const request = {
    headers: { 'user-agent': 'jest' },
    socket: { remoteAddress: '203.0.113.7' },
  } as unknown as Request;
  const subject = {
    id: 'user-1',
    email: 'jean@example.com',
    firstName: 'Jean',
    lastName: 'Dupont',
    platformAdmin: null as { id: string } | null,
  };

  let prisma: {
    user: { findUnique: jest.Mock };
    impersonationSession: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    auditLog: { create: jest.Mock; createMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let secret: string | undefined;
  let service: PlatformAdminImpersonationService;
  const jwt = new JwtService({});

  beforeEach(() => {
    // jsonwebtoken's async sign/verify schedule through setImmediate.
    jest.useFakeTimers({ now, doNotFake: ['setImmediate', 'nextTick'] });
    secret = SECRET;
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(subject) },
      impersonationSession: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'session-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn(), createMany: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((run: (tx: unknown) => Promise<unknown>) => run(prisma)),
    };
    const config = { get: () => secret };
    service = new PlatformAdminImpersonationService(
      prisma as unknown as PrismaService,
      jwt,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start', () => {
    it('creates a 15-minute session, audits it, and mints a matching token', async () => {
      const result = await service.start(actor, 'user-1', 'Bug convocations U13', request);

      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      expect(prisma.impersonationSession.create).toHaveBeenCalledWith({
        data: {
          actorUserId: 'admin-1',
          subjectUserId: 'user-1',
          reason: 'Bug convocations U13',
          expiresAt,
        },
        select: { id: true },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'ADMIN_IMPERSONATION_STARTED',
          userId: 'admin-1',
          actorEmail: 'dpo@kluvo.net',
          metadata: {
            sessionId: 'session-1',
            subjectUserId: 'user-1',
            reason: 'Bug convocations U13',
            expiresAt: expiresAt.toISOString(),
          },
        }),
      });
      expect(result).toMatchObject({
        sessionId: 'session-1',
        expiresAt: expiresAt.toISOString(),
        subject: { id: 'user-1', displayName: 'Jean Dupont' },
      });

      const claims = await jwt.verifyAsync(result.token, { secret: SECRET });
      expect(claims).toMatchObject({
        sub: 'user-1',
        act: 'admin-1',
        sid: 'session-1',
        scope: IMPERSONATION_TOKEN_SCOPE,
        exp: expiresAt.getTime() / 1000,
      });
    });

    it("replaces the admin's live session, with an ENDED row for it", async () => {
      prisma.impersonationSession.findMany.mockResolvedValue([
        { id: 'old-session', subjectUserId: 'user-7' },
      ]);

      await service.start(actor, 'user-1', 'Bug convocations U13', request);

      expect(prisma.impersonationSession.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-session'] } },
        data: { endedAt: now, endReason: 'REPLACED' },
      });
      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            type: 'ADMIN_IMPERSONATION_ENDED',
            metadata: { sessionId: 'old-session', subjectUserId: 'user-7', endReason: 'REPLACED' },
          }),
        ],
      });
    });

    it('locks the admin’s grant before reading live sessions, so two starts can’t both stay live', async () => {
      await service.start(
        { userId: 'admin-1', email: 'dpo@kluvo.net' },
        'user-9',
        'Ticket #42, the parent sees no convocation',
        request,
      );

      const [sql, actorId] = prisma.$queryRaw.mock.calls[0] as [TemplateStringsArray, string];
      expect(sql.join('?')).toContain('"PlatformAdmin"');
      expect(sql.join('?')).toContain('FOR UPDATE');
      expect(actorId).toBe('admin-1');
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.impersonationSession.findMany.mock.invocationCallOrder[0],
      );
    });

    it('refuses to impersonate yourself', async () => {
      await expect(
        service.start(actor, 'admin-1', 'raison valable', request),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s an unknown account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.start(actor, 'user-1', 'raison valable', request),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a subject who holds a back-office grant', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...subject, platformAdmin: { id: 'grant-2' } });

      await expect(
        service.start(actor, 'user-1', 'raison valable', request),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.impersonationSession.create).not.toHaveBeenCalled();
    });

    it('is off without a usable platform secret', async () => {
      secret = 'short';

      await expect(
        service.start(actor, 'user-1', 'raison valable', request),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('writes no audit row when the session insert fails', async () => {
      prisma.impersonationSession.create.mockRejectedValue(new Error('db down'));

      await expect(service.start(actor, 'user-1', 'raison valable', request)).rejects.toThrow(
        'db down',
      );
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('end', () => {
    const live = {
      actorUserId: 'admin-1',
      subjectUserId: 'user-1',
      endedAt: null as Date | null,
      expiresAt: new Date(now.getTime() + 60_000),
    };

    it('ends a live session and audits it once', async () => {
      prisma.impersonationSession.findUnique.mockResolvedValue(live);

      await service.end(actor, 'session-1', request);

      expect(prisma.impersonationSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', endedAt: null },
        data: { endedAt: now, endReason: 'EXITED' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'ADMIN_IMPERSONATION_ENDED',
          metadata: { sessionId: 'session-1', subjectUserId: 'user-1', endReason: 'EXITED' },
        }),
      });
    });

    it('writes nothing when a concurrent « Quitter » got there first', async () => {
      prisma.impersonationSession.findUnique.mockResolvedValue(live);
      prisma.impersonationSession.updateMany.mockResolvedValue({ count: 0 });

      await service.end(actor, 'session-1', request);

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it.each([
      ['ended', { ...live, endedAt: now }],
      ['expired', { ...live, expiresAt: now }],
    ])('is a no-op on an %s session', async (_label, session) => {
      prisma.impersonationSession.findUnique.mockResolvedValue(session);

      await service.end(actor, 'session-1', request);

      expect(prisma.impersonationSession.updateMany).not.toHaveBeenCalled();
    });

    it("404s someone else's session", async () => {
      prisma.impersonationSession.findUnique.mockResolvedValue({ ...live, actorUserId: 'admin-2' });

      await expect(service.end(actor, 'session-1', request)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
