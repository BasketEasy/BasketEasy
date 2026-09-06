import { Test, TestingModule } from '@nestjs/testing';
import { RetentionService } from './retention.service';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_ACCOUNTS_PER_SWEEP, subMonths } from './retention.constants';

describe('RetentionService', () => {
  let service: RetentionService;
  let prisma: {
    user: { findMany: jest.Mock; delete: jest.Mock };
    player: { findMany: jest.Mock; updateMany: jest.Mock };
    parentalConsent: { updateMany: jest.Mock; deleteMany: jest.Mock; count: jest.Mock };
    auditLog: { create: jest.Mock; deleteMany: jest.Mock; count: jest.Mock };
    retentionRun: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  const now = new Date('2026-09-06T03:15:00.000Z');

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(now);
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
      player: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      parentalConsent: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      auditLog: {
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      retentionRun: { create: jest.fn().mockResolvedValue({}) },
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
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
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

    it('counts candidates but deletes nothing in a dry run', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'gone@b.com' }]);

      const summary = await service.run(true);

      expect(summary.inactiveAccounts).toEqual({ status: 'ok', count: 1 });
      expect(prisma.user.delete).not.toHaveBeenCalled();
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
});
