import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_ACCOUNTS_PER_SWEEP, subMonths } from './retention.constants';

describe('RetentionService', () => {
  let service: RetentionService;
  let prisma: {
    user: { findMany: jest.Mock; deleteMany: jest.Mock };
    player: { findMany: jest.Mock; updateMany: jest.Mock };
    parentalConsent: { updateMany: jest.Mock; deleteMany: jest.Mock; count: jest.Mock };
    auditLog: { create: jest.Mock; createMany: jest.Mock; deleteMany: jest.Mock; count: jest.Mock };
    geocodedAddress: { deleteMany: jest.Mock; count: jest.Mock };
    impersonationSession: { deleteMany: jest.Mock; findMany: jest.Mock };
    retentionRun: { create: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const now = new Date('2026-09-06T03:15:00.000Z');

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(now);
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      player: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      parentalConsent: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      auditLog: {
        create: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      geocodedAddress: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      impersonationSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      retentionRun: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn() },
      $transaction: jest.fn((run: (tx: unknown) => Promise<unknown>) => run(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RetentionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(RetentionService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('inactive accounts', () => {
    it('erases an account inactive for more than 12 months', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'gone@b.com' }]);

      const summary = await service.run();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { lastActiveAt: { lt: subMonths(now, 12) } } }),
      );
      expect(prisma.user.deleteMany).toHaveBeenCalledWith({
        where: { id: 'user-1', lastActiveAt: { lt: subMonths(now, 12) } },
      });
      expect(summary.inactiveAccounts).toEqual({ status: 'ok', count: 1 });
    });

    it('unlinks the players rather than deleting them, so club history survives', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'gone@b.com' }]);
      prisma.player.findMany.mockResolvedValue([{ id: 'player-1' }]);

      await service.run();

      expect(prisma.player.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { userId: null },
      });
    });

    it('starts the parental-consent clock for the erased account’s players', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'gone@b.com' }]);
      prisma.player.findMany.mockResolvedValue([{ id: 'player-1' }]);

      await service.run();

      expect(prisma.parentalConsent.updateMany).toHaveBeenCalledWith({
        where: { playerId: { in: ['player-1'] }, retentionExpiresAt: null },
        data: { retentionExpiresAt: new Date('2031-09-06T03:15:00.000Z') },
      });
    });

    it('records the erasure in the security log', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'gone@b.com' }]);

      await service.run();

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          type: 'LOGOUT',
          actorEmail: 'gone@b.com',
          metadata: { reason: 'inactivity_12mo_erasure' },
        },
      });
    });

    it('caps how many accounts one run erases', async () => {
      await service.run();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: MAX_ACCOUNTS_PER_SWEEP }),
      );
    });

    it('carries on past one account whose erasure throws, and reports it', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1', email: 'a@b.com' },
        { id: 'user-2', email: 'boom@b.com' },
        { id: 'user-3', email: 'c@b.com' },
      ]);
      prisma.user.deleteMany.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 'user-2') {
          throw new Error('constraint violation');
        }
        return Promise.resolve({ count: 1 });
      });

      const summary = await service.run();

      expect(prisma.user.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'user-3' }) }),
      );
      expect(summary.inactiveAccounts).toEqual({
        status: 'ok',
        count: 2,
        failedCount: 1,
        failedIds: ['user-2'],
      });
    });

    it('reports the step as ok — it finished — even with a failed account in it', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'boom@b.com' }]);
      prisma.user.deleteMany.mockRejectedValue(new Error('constraint violation'));

      const summary = await service.run();

      expect(summary.inactiveAccounts.status).toBe('ok');
      expect(summary.inactiveAccounts.count).toBe(0);
      expect(prisma.retentionRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary: expect.objectContaining({
              inactiveAccounts: expect.objectContaining({ failedIds: ['user-1'] }),
            }),
          }),
        }),
      );
    });

    it('spares an account that became active again between selection and erasure', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1', email: 'back@b.com' },
        { id: 'user-2', email: 'gone@b.com' },
      ]);
      // The guarded delete matches nothing for user-1: they logged back in
      // after the candidate query read them as inactive.
      prisma.user.deleteMany.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({ count: where.id === 'user-1' ? 0 : 1 }),
      );

      const summary = await service.run();

      expect(summary.inactiveAccounts).toEqual({ status: 'ok', count: 1, skippedCount: 1 });
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ actorEmail: 'gone@b.com' }) }),
      );
    });

    it('counts a reactivated account as skipped, never as a failure', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'back@b.com' }]);
      prisma.user.deleteMany.mockResolvedValue({ count: 0 });

      const summary = await service.run();

      expect(summary.inactiveAccounts.failedIds).toBeUndefined();
      expect(summary.inactiveAccounts.status).toBe('ok');
    });

    it('counts candidates but deletes nothing in a dry run', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'gone@b.com' }]);

      const summary = await service.run(true);

      expect(summary.inactiveAccounts).toEqual({ status: 'ok', count: 1 });
      expect(prisma.user.deleteMany).not.toHaveBeenCalled();
      expect(prisma.player.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('audit logs', () => {
    it('deletes entries older than 12 months', async () => {
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 7 });

      const summary = await service.run();

      expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: subMonths(now, 12) } },
      });
      expect(summary.auditLogs).toEqual({ status: 'ok', count: 7 });
    });

    it('only counts in a dry run', async () => {
      prisma.auditLog.count.mockResolvedValue(7);

      const summary = await service.run(true);

      expect(summary.auditLogs).toEqual({ status: 'ok', count: 7 });
      expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
    });

    it('drops impersonation sessions a day after they expired, and only outside a dry run', async () => {
      await service.run();

      expect(prisma.impersonationSession.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      });

      prisma.impersonationSession.deleteMany.mockClear();
      await service.run(true);
      expect(prisma.impersonationSession.deleteMany).not.toHaveBeenCalled();
    });

    it('records the end of a session nobody ended before dropping it', async () => {
      const expiresAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      prisma.impersonationSession.findMany.mockResolvedValue([
        {
          id: 'imp-1',
          actorUserId: 'admin-1',
          subjectUserId: 'user-9',
          expiresAt,
          actor: { email: 'dpo@kluvo.net' },
        },
      ]);

      await service.run();

      expect(prisma.impersonationSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { expiresAt: { lt: expect.any(Date) }, endedAt: null },
        }),
      );
      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: [
          {
            type: 'ADMIN_IMPERSONATION_ENDED',
            userId: 'admin-1',
            actorEmail: 'dpo@kluvo.net',
            metadata: {
              sessionId: 'imp-1',
              subjectUserId: 'user-9',
              endReason: 'EXPIRED',
              expiredAt: expiresAt.toISOString(),
            },
          },
        ],
      });
      expect(prisma.auditLog.createMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.impersonationSession.deleteMany.mock.invocationCallOrder[0],
      );
    });
  });

  describe('parental consents', () => {
    it('deletes only the records whose five years are up', async () => {
      prisma.parentalConsent.deleteMany.mockResolvedValue({ count: 2 });

      const summary = await service.run();

      expect(prisma.parentalConsent.deleteMany).toHaveBeenCalledWith({
        where: { retentionExpiresAt: { lt: now } },
      });
      expect(summary.parentalConsents).toEqual({ status: 'ok', count: 2 });
    });

    it('only counts in a dry run', async () => {
      prisma.parentalConsent.count.mockResolvedValue(2);

      const summary = await service.run(true);

      expect(summary.parentalConsents).toEqual({ status: 'ok', count: 2 });
      expect(prisma.parentalConsent.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('geocode cache', () => {
    it('drops addresses nobody has looked up for 12 months', async () => {
      prisma.geocodedAddress.deleteMany.mockResolvedValue({ count: 4 });

      const summary = await service.run();

      expect(prisma.geocodedAddress.deleteMany).toHaveBeenCalledWith({
        where: { lastUsedAt: { lt: subMonths(now, 12) } },
      });
      expect(summary.geocodeCache).toEqual({ status: 'ok', count: 4 });
    });

    it('only counts in a dry run', async () => {
      prisma.geocodedAddress.count.mockResolvedValue(4);

      const summary = await service.run(true);

      expect(summary.geocodeCache).toEqual({ status: 'ok', count: 4 });
      expect(prisma.geocodedAddress.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('the run record', () => {
    it('persists the summary of a real run', async () => {
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 3 });

      await service.run();

      expect(prisma.retentionRun.create).toHaveBeenCalledWith({
        data: {
          dryRun: false,
          ranAt: now,
          summary: expect.objectContaining({ auditLogs: { status: 'ok', count: 3 } }),
        },
      });
    });

    it('persists a dry run too — evaluating the policy is itself the evidence', async () => {
      await service.run(true);

      expect(prisma.retentionRun.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ dryRun: true }) }),
      );
    });

    it('records a failed step without cancelling the others', async () => {
      prisma.auditLog.deleteMany.mockRejectedValue(new Error('deadlock'));
      prisma.parentalConsent.deleteMany.mockResolvedValue({ count: 1 });

      const summary = await service.run();

      expect(summary.auditLogs).toEqual({ status: 'error', count: 0, error: 'deadlock' });
      expect(summary.parentalConsents).toEqual({ status: 'ok', count: 1 });
      expect(prisma.retentionRun.create).toHaveBeenCalled();
    });
  });

  it('is idempotent: a second run with nothing left expired deletes nothing', async () => {
    const first = await service.run();
    prisma.user.findMany.mockResolvedValue([]);
    const second = await service.run();

    expect(first.inactiveAccounts.count).toBe(0);
    expect(second).toEqual(first);
  });

  // Both added for the back-office (companion spec): a data officer handling a
  // named RGPD request needs the same erasure the nightly sweep performs, and
  // needs to see that the sweep is actually running.
  describe('eraseUserAccount (shared with the back-office)', () => {
    it('is the primitive the nightly sweep itself uses', async () => {
      // The point of extracting it: two implementations of "erase an account"
      // is how a manual RGPD erasure quietly drifts out of compliance with
      // the automated one.
      const spy = jest.spyOn(service, 'eraseUserAccount');
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'a@b.fr' }]);

      await service.run();

      expect(spy).toHaveBeenCalledWith(expect.anything(), 'user-1', now, {
        inactiveBefore: expect.any(Date),
      });
    });

    it('unlinks roster entries instead of deleting them, and reports how many', async () => {
      prisma.player.findMany.mockResolvedValue([{ id: 'p-1' }, { id: 'p-2' }]);

      const result = await service.eraseUserAccount(
        prisma as unknown as Parameters<RetentionService['eraseUserAccount']>[0],
        'user-1',
        now,
      );

      // Rule 2 (erase inactive accounts) and rule 3 (keep stats forever) only
      // coexist because the roster entry survives with userId cleared.
      expect(prisma.player.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { userId: null },
      });
      expect(result.unlinkedPlayerCount).toBe(2);
    });

    it('does not re-check inactivity for a manual erasure', async () => {
      // A named RGPD request is honoured however recently the person logged
      // in; only the sweep guards on the 12-month cutoff.
      await service.eraseUserAccount(
        prisma as unknown as Parameters<RetentionService['eraseUserAccount']>[0],
        'user-1',
        now,
      );

      expect(prisma.user.deleteMany).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('refuses with 404 when the account vanished before the delete', async () => {
      prisma.user.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.eraseUserAccount(
          prisma as unknown as Parameters<RetentionService['eraseUserAccount']>[0],
          'user-1',
          now,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('starts the five-year consent clock for the players it unlinked', async () => {
      prisma.player.findMany.mockResolvedValue([{ id: 'p-1' }]);

      await service.eraseUserAccount(
        prisma as unknown as Parameters<RetentionService['eraseUserAccount']>[0],
        'user-1',
        now,
      );

      expect(prisma.parentalConsent.updateMany).toHaveBeenCalled();
    });
  });

  describe('listRuns', () => {
    it('returns the most recent runs first', async () => {
      prisma.retentionRun.findMany.mockResolvedValue([]);

      await service.listRuns(30);

      expect(prisma.retentionRun.findMany).toHaveBeenCalledWith({
        orderBy: { ranAt: 'desc' },
        take: 30,
      });
    });
  });
});
