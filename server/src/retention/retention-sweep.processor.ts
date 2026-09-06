import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { RETENTION_SWEEP_QUEUE } from '../queue/queue.module';
import { RetentionService, type RetentionSweepSummary } from './retention.service';

export interface RetentionSweepJobData {
  dryRun: boolean;
}

/**
 * Thin by design — the policy itself lives in RetentionService, so it can be
 * unit-tested (and, later, triggered from the back-office) without a queue.
 */
@Processor(RETENTION_SWEEP_QUEUE)
export class RetentionSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(RetentionSweepProcessor.name);

  constructor(private readonly retention: RetentionService) {
    super();
  }

  async process(job: Job<RetentionSweepJobData>): Promise<RetentionSweepSummary> {
    this.logger.log(`Running retention sweep (job ${job.id ?? 'unknown'})`);
    return this.retention.run(job.data?.dryRun ?? false);
  }
}
