import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  QUEUE_DAILY_SUMMARY,
  QUEUE_MISSING_CHECKOUT,
  QUEUE_REPORT_EXPORT,
  QUEUE_ZERO_TAP_REVOKE_CLEANUP,
} from './queue.constants';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(config.get<string>('REDIS_PORT') ?? 6379),
        },
        defaultJobOptions: {
          removeOnComplete: { age: 24 * 3600, count: 500 },
          removeOnFail: { age: 7 * 24 * 3600 },
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_DAILY_SUMMARY },
      { name: QUEUE_MISSING_CHECKOUT },
      { name: QUEUE_REPORT_EXPORT },
      { name: QUEUE_ZERO_TAP_REVOKE_CLEANUP },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
