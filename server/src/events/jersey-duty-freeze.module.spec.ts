import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { EventsModule } from './events.module';
import {
  JERSEY_DUTY_FREEZE_EVERY_MS,
  JERSEY_DUTY_FREEZE_SCHEDULER_ID,
  JerseyDutyFreezeProcessor,
} from './jersey-duty-freeze.processor';
import type { JerseyDutyService } from './jersey-duty.service';

describe('EventsModule.onModuleInit (jersey duty freeze schedule)', () => {
  let queue: { upsertJobScheduler: jest.Mock };
  let env: Record<string, string | undefined>;

  const build = () =>
    new EventsModule(
      queue as unknown as Queue,
      { get: (key: string) => env[key] } as unknown as ConfigService,
    );

  beforeEach(() => {
    env = {};
    queue = { upsertJobScheduler: jest.fn().mockResolvedValue({}) };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('registers a ten-minute repeatable job by default', async () => {
    await build().onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      JERSEY_DUTY_FREEZE_SCHEDULER_ID,
      { every: 10 * 60_000 },
      { data: {} },
    );
    expect(JERSEY_DUTY_FREEZE_EVERY_MS).toBe(10 * 60_000);
  });

  it('schedules nothing when JERSEY_DUTY_FREEZE_ENABLED=false', async () => {
    env.JERSEY_DUTY_FREEZE_ENABLED = 'false';

    await build().onModuleInit();

    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it('re-registers under the same id on every boot rather than stacking duplicates', async () => {
    await build().onModuleInit();
    await build().onModuleInit();

    const [first, second] = queue.upsertJobScheduler.mock.calls;
    expect(first).toEqual(second);
  });

  // REDIS_URL is not boot-validated: an unreachable Redis degrades the freeze
  // and nothing else.
  it('logs and swallows a scheduling failure rather than crashing boot', async () => {
    queue.upsertJobScheduler.mockRejectedValue(new Error('Redis unreachable'));
    const error = jest.spyOn(Logger.prototype, 'error');

    await expect(build().onModuleInit()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Redis unreachable'));
  });
});

describe('JerseyDutyFreezeProcessor', () => {
  it('delegates to the service with the current time and returns its summary', async () => {
    const service = { freezeDue: jest.fn().mockResolvedValue({ considered: 3, frozen: 2 }) };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const processor = new JerseyDutyFreezeProcessor(service as unknown as JerseyDutyService);

    const result = await processor.process({ id: 'job-1' } as never);

    expect(service.freezeDue).toHaveBeenCalledWith(expect.any(Date));
    expect(result).toEqual({ considered: 3, frozen: 2 });
    jest.restoreAllMocks();
  });
});
