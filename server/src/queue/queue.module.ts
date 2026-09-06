import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';

export const SCORESHEET_OCR_QUEUE = 'scoresheet-ocr';
// The nightly data-retention sweep. Unlike the OCR queue nothing enqueues
// onto it by hand: RetentionModule registers a repeatable scheduler at boot.
export const RETENTION_SWEEP_QUEUE = 'retention-sweep';

const logger = new Logger('Redis');

// First queue infra in the repo. Unlike JWT_ACCESS_SECRET, REDIS_URL isn't
// validated at boot (AppModule's ConfigModule.forRoot({ validate })) — same
// "not boot-validated" pattern as StorageService's R2 vars, so the server
// still starts and serves every other route if Redis is misconfigured; only
// an actual enqueue/worker attempt fails. BullMQ's `connection` option takes
// an ioredis instance (not a bare `{ url }` object, which ioredis doesn't
// accept), and `maxRetriesPerRequest: null` is required by BullMQ's blocking
// worker connections.
//
// ioredis's default retryStrategy retries reconnecting forever, and with
// enableOfflineQueue on (the default) that means a misconfigured/unreachable
// REDIS_URL doesn't produce an error — every command (queue.add, the
// worker's polling) just queues silently and never resolves or rejects, so
// an upload looks "stuck" with nothing in the logs to explain why. The
// retryStrategy here caps reconnect attempts so a bad connection fails loud
// (logged, and commands start rejecting) within ~15s instead of hanging
// indefinitely.
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = new Redis(config.get<string>('REDIS_URL')!, {
          maxRetriesPerRequest: null,
          retryStrategy: (times) => (times > 20 ? null : Math.min(times * 200, 3000)),
        });
        redis.on('connect', () => logger.log('Connected to Redis'));
        redis.on('error', (err) => logger.error(`Redis connection error: ${err.message}`));
        redis.on('end', () =>
          logger.error('Redis connection closed permanently — giving up reconnecting'),
        );
        return { connection: redis };
      },
    }),
    BullModule.registerQueue({ name: SCORESHEET_OCR_QUEUE }),
    BullModule.registerQueue({ name: RETENTION_SWEEP_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
