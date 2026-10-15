import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { JERSEY_DUTY_FREEZE_QUEUE } from '../queue/queue.module';
import { JerseyDutyService } from './jersey-duty.service';

/** Stable id so a redeploy (or a second instance) upserts the same schedule. */
export const JERSEY_DUTY_FREEZE_SCHEDULER_ID = 'jersey-duty-freeze';
/** A match is frozen at most this long after kickoff. */
export const JERSEY_DUTY_FREEZE_EVERY_MS = 10 * 60_000;

/**
 * Thin by design: the policy lives in `JerseyDutyService.freezeDue`, which
 * re-reads state on every run, so a stale or duplicate job is harmless.
 */
@Processor(JERSEY_DUTY_FREEZE_QUEUE)
export class JerseyDutyFreezeProcessor extends WorkerHost {
  private readonly logger = new Logger(JerseyDutyFreezeProcessor.name);

  constructor(private readonly jerseyDuty: JerseyDutyService) {
    super();
  }

  async process(job: Job): Promise<{ considered: number; frozen: number }> {
    const summary = await this.jerseyDuty.freezeDue(new Date());
    if (summary.frozen > 0) {
      this.logger.log(
        `Jersey duty freeze (job ${job.id ?? 'unknown'}): ${summary.frozen} of ${summary.considered} matches frozen`,
      );
    }
    return summary;
  }
}
