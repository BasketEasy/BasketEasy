import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { RetentionModule } from './retention.module';
import { RETENTION_SWEEP_CRON, RETENTION_SWEEP_SCHEDULER_ID } from './retention.constants';
import type { RetentionSweepJobData } from './retention-sweep.processor';

describe('RetentionModule.onModuleInit', () => {
  let queue: { upsertJobScheduler: jest.Mock };
  let env: Record<string, string | undefined>;

  const build = () => {
    const config = { get: (key: string) => env[key] } as unknown as ConfigService;
    return new RetentionModule(queue as unknown as Queue<RetentionSweepJobData>, config);
  };

  beforeEach(() => {
    env = {};
    queue = { upsertJobScheduler: jest.fn().mockResolvedValue({}) };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers the nightly schedule by default', async () => {
    await build().onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      RETENTION_SWEEP_SCHEDULER_ID,
      { pattern: RETENTION_SWEEP_CRON },
      { data: { dryRun: false } },
    );
  });

  it('registers a dry run when RETENTION_SWEEP_DRY_RUN=true', async () => {
    env.RETENTION_SWEEP_DRY_RUN = 'true';

    await build().onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      RETENTION_SWEEP_SCHEDULER_ID,
      { pattern: RETENTION_SWEEP_CRON },
      { data: { dryRun: true } },
    );
  });

  it('schedules nothing when RETENTION_SWEEP_ENABLED=false', async () => {
    env.RETENTION_SWEEP_ENABLED = 'false';

    await build().onModuleInit();

    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  // The claim CLAUDE.md makes for upsertJobScheduler: a redeploy, or a second
  // instance booting, re-registers the same schedule under the same id rather
  // than stacking a duplicate. Nothing here can prove BullMQ's own
  // idempotency, but it does pin the half this module owns — the id and the
  // pattern are stable across initialisations, which is what makes the upsert
  // land on the same scheduler every time.
  it('re-registers under the same id on every initialisation', async () => {
    await build().onModuleInit();
    await build().onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    const [first, second] = queue.upsertJobScheduler.mock.calls;
    expect(first).toEqual(second);
    expect(first[0]).toBe(RETENTION_SWEEP_SCHEDULER_ID);
  });

  // REDIS_URL is deliberately not boot-validated, so an unreachable Redis has
  // to degrade the sweep and nothing else: boot must still complete and every
  // other route must still serve.
  it('logs and swallows a scheduling failure rather than crashing boot', async () => {
    queue.upsertJobScheduler.mockRejectedValue(new Error('Redis unreachable'));
    const error = jest.spyOn(Logger.prototype, 'error');

    await expect(build().onModuleInit()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to schedule the retention sweep: Redis unreachable'),
    );
  });

  it('swallows a non-Error rejection too', async () => {
    queue.upsertJobScheduler.mockRejectedValue('boom');

    await expect(build().onModuleInit()).resolves.toBeUndefined();
  });
});
