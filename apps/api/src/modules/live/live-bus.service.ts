import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';

export const LIVE_CHANNEL = 'attendance:live';

export interface LiveCheckInEvent {
  type: 'check_in' | 'check_out';
  employee_id: string;
  employee_name: string;
  branch_id: string;
  branch_name: string;
  session_id: string;
  at: string;
  status: string;
  method: string;
}

@Injectable()
export class LiveBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveBusService.name);
  private publisher!: Redis;
  private subscriber!: Redis;
  private readonly subject = new Subject<LiveCheckInEvent>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const host = this.config.get<string>('REDIS_HOST') ?? 'localhost';
    const port = Number(this.config.get<string>('REDIS_PORT') ?? 6379);
    this.publisher = new Redis({ host, port, lazyConnect: false, maxRetriesPerRequest: null });
    this.subscriber = new Redis({ host, port, lazyConnect: false, maxRetriesPerRequest: null });
    await this.subscriber.subscribe(LIVE_CHANNEL);
    this.subscriber.on('message', (_ch, payload) => {
      try {
        this.subject.next(JSON.parse(payload) as LiveCheckInEvent);
      } catch (err) {
        this.logger.warn(`invalid payload: ${(err as Error).message}`);
      }
    });
    this.logger.log(`Live bus subscribed to ${LIVE_CHANNEL}`);
  }

  async onModuleDestroy() {
    await this.subscriber?.quit().catch(() => {});
    await this.publisher?.quit().catch(() => {});
    this.subject.complete();
  }

  async publish(event: LiveCheckInEvent): Promise<void> {
    try {
      await this.publisher.publish(LIVE_CHANNEL, JSON.stringify(event));
    } catch (err) {
      this.logger.warn(`publish failed: ${(err as Error).message}`);
    }
  }

  stream(): Observable<LiveCheckInEvent> {
    return this.subject.asObservable();
  }
}
