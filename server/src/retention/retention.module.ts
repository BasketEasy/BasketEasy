import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QueueModule, RETENTION_SWEEP_QUEUE } from '../queue/queue.module';
import { RETENTION_SWEEP_CRON, RETENTION_SWEEP_SCHEDULER_ID } from './retention.constants';
import { RetentionService } from './retention.service';
import { RetentionSweepProcessor, type RetentionSweepJobData } from './retention-sweep.processor';

@Module({
  imports: [QueueModule],
  providers: [RetentionService, RetentionSweepProcessor],
  exports: [RetentionService],
})
export class RetentionModule implements OnModuleInit {
  private readonly logger = new Logger(RetentionModule.name);

  constructor(
    @InjectQueue(RETENTION_SWEEP_QUEUE) private readonly queue: Queue<RetentionSweepJobData>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registers the nightly schedule at boot. `upsertJobScheduler` is keyed by
   * its id, so every instance and every redeploy re-registers the same
   * schedule rather than stacking duplicates.
   *
   * A failure here is logged and swallowed: REDIS_URL is deliberately not
   * boot-validated (same policy as the R2 and Gemini credentials), so an
   * unreachable Redis must degrade the sweep, never stop the API serving
   * every other route.
   */
  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.warn('RETENTION_SWEEP_ENABLED=false — nightly retention sweep not scheduled');
      return;
    }

    const dryRun = this.isDryRun();
    try {
      await this.queue.upsertJobScheduler(
        RETENTION_SWEEP_SCHEDULER_ID,
        { pattern: RETENTION_SWEEP_CRON },
        { data: { dryRun } },
      );
      this.logger.log(
        `Retention sweep scheduled (${RETENTION_SWEEP_CRON}${dryRun ? ', dry run' : ''})`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to schedule the retention sweep: ${message}`);
    }
  }

  private isEnabled(): boolean {
    return this.config.get<string>('RETENTION_SWEEP_ENABLED') !== 'false';
  }

  /**
   * Observation mode: every step reports what it *would* delete and persists
   * a RetentionRun, but deletes nothing. Intended for a deployment's first
   * cycle, before the policy is allowed to erase live accounts.
   */
  private isDryRun(): boolean {
    return this.config.get<string>('RETENTION_SWEEP_DRY_RUN') === 'true';
  }
}
