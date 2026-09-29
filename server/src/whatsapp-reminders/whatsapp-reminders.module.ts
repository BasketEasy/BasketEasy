import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuestLinksModule } from '../guest-links/guest-links.module';
import { MeetingPointsModule } from '../meeting-points/meeting-points.module';
import { WhatsAppReminderController } from './whatsapp-reminder.controller';
import { WhatsAppReminderService } from './whatsapp-reminder.service';

@Module({
  imports: [AuthModule, GuestLinksModule, MeetingPointsModule],
  controllers: [WhatsAppReminderController],
  providers: [WhatsAppReminderService],
  exports: [WhatsAppReminderService],
})
export class WhatsAppRemindersModule {}
