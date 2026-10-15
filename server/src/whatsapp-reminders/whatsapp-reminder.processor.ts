import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { WHATSAPP_REMINDER_QUEUE } from '../queue/queue.module';
import {
  EXPIRE_JOB,
  NUDGE_JOB,
  SEND_JOB,
  SWEEP_JOB,
  WhatsAppReminderScheduler,
  type ShareJobData,
} from './whatsapp-reminder.scheduler';

/** Thin by design, like MeetingTravelProcessor: the logic is in the scheduler so tests need no queue. */
@Processor(WHATSAPP_REMINDER_QUEUE)
export class WhatsAppReminderProcessor extends WorkerHost {
  constructor(private readonly scheduler: WhatsAppReminderScheduler) {
    super();
  }

  async process(job: Job<ShareJobData>): Promise<void> {
    switch (job.name) {
      case SEND_JOB:
        return this.scheduler.send(job.data.shareId);
      case NUDGE_JOB:
        return this.scheduler.nudge(job.data.shareId, job.data.shareIds);
      case SWEEP_JOB:
        return this.scheduler.sweep();
      case EXPIRE_JOB:
        return this.scheduler.expire(job.data.shareId);
    }
  }
}
