import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';

export const SCORESHEET_OCR_QUEUE = 'scoresheet-ocr';

// First queue infra in the repo. Unlike JWT_ACCESS_SECRET, REDIS_URL isn't
// validated at boot (AppModule's ConfigModule.forRoot({ validate })) — same
// "not boot-validated" pattern as StorageService's R2 vars, so the server
// still starts and serves every other route if Redis is misconfigured; only
// an actual enqueue/worker attempt fails. BullMQ's `connection` option takes
// an ioredis instance (not a bare `{ url }` object, which ioredis doesn't
// accept), and `maxRetriesPerRequest: null` is required by BullMQ's blocking
// worker connections.
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: new Redis(config.get<string>('REDIS_URL')!, { maxRetriesPerRequest: null }),
      }),
    }),
    BullModule.registerQueue({ name: SCORESHEET_OCR_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
