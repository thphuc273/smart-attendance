import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Default 5s is tight on laptop Docker Postgres for multi-write
      // transactions (e.g. user + employee + role). Bump to 15s.
      transactionOptions: {
        maxWait: 10_000, // wait up to 10s to acquire a connection
        timeout: 15_000, // each tx can run up to 15s
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
