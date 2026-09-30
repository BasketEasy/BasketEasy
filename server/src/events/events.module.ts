import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { ScoresheetsModule } from '../scoresheets/scoresheets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MeetingPointsModule } from '../meeting-points/meeting-points.module';
import { WhatsAppRemindersModule } from '../whatsapp-reminders/whatsapp-reminders.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [
    AuthModule,
    StorageModule,
    ScoresheetsModule,
    NotificationsModule,
    MeetingPointsModule,
    WhatsAppRemindersModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
