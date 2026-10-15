import { Module } from '@nestjs/common';
import { MeetingPointsModule } from '../meeting-points/meeting-points.module';
import { WhatsAppRemindersModule } from '../whatsapp-reminders/whatsapp-reminders.module';
import { FfbbImportService } from './ffbb-import.service';
import { FfbbPageScrapeProvider } from './ffbb-page-scrape.provider';
import { FfbbPouleService } from './ffbb-poule.service';
import { FFBB_PROVIDER } from './ffbb-provider';

@Module({
  imports: [MeetingPointsModule, WhatsAppRemindersModule],
  providers: [
    { provide: FFBB_PROVIDER, useClass: FfbbPageScrapeProvider },
    FfbbImportService,
    FfbbPouleService,
  ],
  exports: [FFBB_PROVIDER, FfbbImportService, FfbbPouleService],
})
export class FfbbModule {}
