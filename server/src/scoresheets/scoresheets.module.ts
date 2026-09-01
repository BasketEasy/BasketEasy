import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { QueueModule } from '../queue/queue.module';
import { ScoresheetsController } from './scoresheets.controller';
import { ScoresheetsService } from './scoresheets.service';
import { ScoresheetOcrProcessor } from './scoresheet-ocr.processor';
import { GeminiClient } from './gemini-client';
import { SCORESHEET_VISION_CLIENT } from './scoresheet-vision-client';

@Module({
  imports: [AuthModule, StorageModule, QueueModule],
  controllers: [ScoresheetsController],
  providers: [
    ScoresheetsService,
    ScoresheetOcrProcessor,
    GeminiClient,
    // The vision provider swap point — see scoresheet-vision-client.ts.
    // Changing providers means pointing this useExisting/useClass at a new
    // implementation, not touching ScoresheetOcrProcessor.
    { provide: SCORESHEET_VISION_CLIENT, useExisting: GeminiClient },
  ],
  exports: [ScoresheetsService],
})
export class ScoresheetsModule {}
