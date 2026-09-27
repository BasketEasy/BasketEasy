import { RetentionSweepProcessor, type RetentionSweepJobData } from './retention-sweep.processor';
import type { RetentionService, RetentionSweepSummary } from './retention.service';
import type { Job } from 'bullmq';

describe('RetentionSweepProcessor', () => {
  let retention: { run: jest.Mock };
  let processor: RetentionSweepProcessor;

  const summary: RetentionSweepSummary = {
    inactiveAccounts: { status: 'ok', count: 0 },
    auditLogs: { status: 'ok', count: 0 },
    parentalConsents: { status: 'ok', count: 0 },
    geocodeCache: { status: 'ok', count: 0 },
  };

  const job = (data?: RetentionSweepJobData) =>
    ({ id: 'job-1', data }) as unknown as Job<RetentionSweepJobData>;

  beforeEach(() => {
    retention = { run: jest.fn().mockResolvedValue(summary) };
    processor = new RetentionSweepProcessor(retention as unknown as RetentionService);
  });

  it('delegates to the service and returns its summary', async () => {
    await expect(processor.process(job({ dryRun: false }))).resolves.toBe(summary);
    expect(retention.run).toHaveBeenCalledWith(false);
  });

  it('passes the dry-run flag through', async () => {
    await processor.process(job({ dryRun: true }));

    expect(retention.run).toHaveBeenCalledWith(true);
  });

  it('defaults to a real run when the job carries no data', async () => {
    await processor.process(job(undefined));

    expect(retention.run).toHaveBeenCalledWith(false);
  });

  // The service already swallows a single step's failure into the summary, so
  // the only errors that can reach here are ones a retry genuinely might fix
  // (an unreachable database, say). Rethrowing is therefore correct — but it
  // is worth pinning down, because silently resolving would hide a sweep that
  // never ran, and BullMQ would record a success.
  it('lets a genuine service failure reach BullMQ rather than reporting success', async () => {
    retention.run.mockRejectedValue(new Error('database unreachable'));

    await expect(processor.process(job({ dryRun: false }))).rejects.toThrow('database unreachable');
  });
});
