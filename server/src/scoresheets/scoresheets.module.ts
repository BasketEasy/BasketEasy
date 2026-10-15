import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { QueueModule } from '../queue/queue.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ScoresheetsController } from './scoresheets.controller';
import { ScoresheetsService } from './scoresheets.service';
import { ScoresheetOcrProcessor } from './scoresheet-ocr.processor';
import { GeminiClient } from './gemini-client';
import { SheetReaderClient } from './sheet-reader-client';
import { RoutingVisionClient } from './routing-vision-client';
import { SCORESHEET_VISION_CLIENT } from './scoresheet-vision-client';

@Module({
  imports: [AuthModule, StorageModule, QueueModule, NotificationsModule],
  controllers: [ScoresheetsController],
  providers: [
    ScoresheetsService,
    ScoresheetOcrProcessor,
    GeminiClient,
    SheetReaderClient,
    RoutingVisionClient,
    // The vision provider swap point — see scoresheet-vision-client.ts.
    // Changing providers means pointing this useExisting/useClass at a new
    // implementation, not touching ScoresheetOcrProcessor. Routing tries the
    // deterministic e-Marque reader on PDFs before the vision model.
    { provide: SCORESHEET_VISION_CLIENT, useExisting: RoutingVisionClient },
  ],
  exports: [ScoresheetsService],
})
export class ScoresheetsModule {}
