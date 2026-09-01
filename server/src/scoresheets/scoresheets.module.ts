import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { QueueModule } from '../queue/queue.module';
import { ScoresheetsController } from './scoresheets.controller';
import { ScoresheetsService } from './scoresheets.service';
import { ScoresheetOcrProcessor } from './scoresheet-ocr.processor';
import { GeminiClient } from './gemini-client';

@Module({
  imports: [AuthModule, StorageModule, QueueModule],
  controllers: [ScoresheetsController],
  providers: [ScoresheetsService, ScoresheetOcrProcessor, GeminiClient],
  exports: [ScoresheetsService],
})
export class ScoresheetsModule {}
