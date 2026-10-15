import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuestLinksModule } from '../guest-links/guest-links.module';
import { MeetingPointsModule } from '../meeting-points/meeting-points.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QueueModule } from '../queue/queue.module';
import { WhatsAppReminderController } from './whatsapp-reminder.controller';
import { WhatsAppReminderProcessor } from './whatsapp-reminder.processor';
import { WhatsAppReminderScheduler } from './whatsapp-reminder.scheduler';
import { WhatsAppReminderService } from './whatsapp-reminder.service';

// Events and the FFBB import depend on this module (for the scheduler), never
// the reverse: the same direction meeting-points already set.
@Module({
  imports: [AuthModule, GuestLinksModule, MeetingPointsModule, NotificationsModule, QueueModule],
  controllers: [WhatsAppReminderController],
  providers: [WhatsAppReminderService, WhatsAppReminderScheduler, WhatsAppReminderProcessor],
  exports: [WhatsAppReminderScheduler, WhatsAppReminderService],
})
export class WhatsAppRemindersModule {}
