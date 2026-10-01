import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { ScoresheetsModule } from '../scoresheets/scoresheets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MeetingPointsModule } from '../meeting-points/meeting-points.module';
import { WhatsAppRemindersModule } from '../whatsapp-reminders/whatsapp-reminders.module';
import { JERSEY_DUTY_FREEZE_QUEUE, QueueModule } from '../queue/queue.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { JerseyDutyController, JerseyRotationController } from './jersey-duty.controller';
import { JerseyDutyService } from './jersey-duty.service';
import {
  JERSEY_DUTY_FREEZE_EVERY_MS,
  JERSEY_DUTY_FREEZE_SCHEDULER_ID,
  JerseyDutyFreezeProcessor,
} from './jersey-duty-freeze.processor';

@Module({
  imports: [
    AuthModule,
    StorageModule,
    ScoresheetsModule,
    NotificationsModule,
    MeetingPointsModule,
    WhatsAppRemindersModule,
    QueueModule,
  ],
  controllers: [EventsController, JerseyDutyController, JerseyRotationController],
  providers: [EventsService, JerseyDutyService, JerseyDutyFreezeProcessor],
})
export class EventsModule implements OnModuleInit {
  private readonly logger = new Logger(EventsModule.name);

  constructor(
    @InjectQueue(JERSEY_DUTY_FREEZE_QUEUE) private readonly freezeQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registers the kickoff-freeze schedule at boot. `upsertJobScheduler` is
   * keyed by its id, so a redeploy re-registers rather than stacks. A failure
   * is logged and swallowed: REDIS_URL is deliberately not boot-validated, so
   * an unreachable Redis degrades the freeze, never the API.
   */
  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('JERSEY_DUTY_FREEZE_ENABLED') === 'false') {
      this.logger.warn('JERSEY_DUTY_FREEZE_ENABLED=false — jersey duty freeze not scheduled');
      return;
    }
    try {
      await this.freezeQueue.upsertJobScheduler(
        JERSEY_DUTY_FREEZE_SCHEDULER_ID,
        { every: JERSEY_DUTY_FREEZE_EVERY_MS },
        { data: {} },
      );
      this.logger.log('Jersey duty freeze scheduled (every 10 minutes)');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to schedule the jersey duty freeze: ${message}`);
    }
  }
}
