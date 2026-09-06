import { Test, TestingModule } from '@nestjs/testing';
import { RetentionService } from './retention.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RetentionService', () => {
  let service: RetentionService;
  let prisma: {
    user: { count: jest.Mock };
    auditLog: { count: jest.Mock };
    retentionRun: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: { count: jest.fn().mockResolvedValue(3) },
      auditLog: { count: jest.fn().mockResolvedValue(120) },
      retentionRun: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'run-1', ranAt: new Date('2026-09-06T02:00:00Z'), ...data }),
          ),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RetentionService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(RetentionService);
  });

  describe('dryRun', () => {
    it('counts each policy without deleting anything, and persists the run', async () => {
      const result = await service.dryRun('officer-1');

      expect(result.dryRun).toBe(true);
      expect(result.triggeredByUserId).toBe('officer-1');
      expect(result.steps).toEqual([
        { step: 'inactive-accounts', count: 3, error: null },
        { step: 'audit-logs', count: 120, error: null },
      ]);
      // A dry run's "what would have happened" is itself the evidence the
      // policy was evaluated, so the row is written either way.
      expect(prisma.retentionRun.create).toHaveBeenCalledTimes(1);
    });

    it('reads inactive accounts against a 12-month cutoff', async () => {
      await service.dryRun(null);

      const where = prisma.user.count.mock.calls[0][0].where as {
        lastActiveAt: { lt: Date };
      };
      const monthsAgo =
        (Date.now() - where.lastActiveAt.lt.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      expect(monthsAgo).toBeGreaterThan(11.5);
      expect(monthsAgo).toBeLessThan(12.5);
    });

    it('records a failing step instead of failing the whole run', async () => {
      prisma.auditLog.count.mockRejectedValue(new Error('connection lost'));

      const result = await service.dryRun(null);

      expect(result.steps).toEqual([
        { step: 'inactive-accounts', count: 3, error: null },
        { step: 'audit-logs', count: 0, error: 'connection lost' },
      ]);
    });
  });

  describe('listRuns', () => {
    it('treats a summary that is not the expected shape as no steps', async () => {
      // `summary` is a Json column, so a row written by another version of
      // the sweep is not guaranteed to carry `steps`.
      prisma.retentionRun.findMany.mockResolvedValue([
        { id: 'a', dryRun: false, ranAt: new Date(), triggeredByUserId: null, summary: {} },
        { id: 'b', dryRun: false, ranAt: new Date(), triggeredByUserId: null, summary: null },
        {
          id: 'c',
          dryRun: false,
          ranAt: new Date(),
          triggeredByUserId: null,
          summary: { steps: [{ step: 'x', count: 1 }, { step: 'bad' }, 'nope'] },
        },
      ]);

      const runs = await service.listRuns(30);

      expect(runs[0].steps).toEqual([]);
      expect(runs[1].steps).toEqual([]);
      expect(runs[2].steps).toEqual([{ step: 'x', count: 1, error: null }]);
    });
  });

  describe('eraseUserAccount', () => {
    it('unlinks roster entries and removes the RESTRICT-ing rows before the account', async () => {
      const calls: string[] = [];
      const tx = {
        player: {
          updateMany: jest.fn().mockImplementation(() => {
            calls.push('player.updateMany');
            return Promise.resolve({ count: 2 });
          }),
        },
        clubMembership: {
          deleteMany: jest.fn().mockImplementation(() => {
            calls.push('clubMembership.deleteMany');
            return Promise.resolve({ count: 1 });
          }),
        },
        refreshToken: {
          deleteMany: jest.fn().mockImplementation(() => {
            calls.push('refreshToken.deleteMany');
            return Promise.resolve({ count: 4 });
          }),
        },
        user: {
          delete: jest.fn().mockImplementation(() => {
            calls.push('user.delete');
            return Promise.resolve({});
          }),
        },
      };

      const result = await service.eraseUserAccount(
        tx as unknown as Parameters<RetentionService['eraseUserAccount']>[0],
        'user-1',
      );

      // Rule 2 (erase inactive accounts) and rule 3 (keep stats forever) only
      // coexist because the roster entry survives with userId cleared.
      expect(tx.player.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { userId: null },
      });
      expect(result.unlinkedPlayerCount).toBe(2);
      // ClubMembership/RefreshToken FKs are ON DELETE RESTRICT, so the
      // account delete fails outright unless these go first.
      expect(calls).toEqual([
        'player.updateMany',
        'clubMembership.deleteMany',
        'refreshToken.deleteMany',
        'user.delete',
      ]);
    });
  });
});
