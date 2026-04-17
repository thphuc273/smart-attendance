import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { redisStore } from 'cache-manager-ioredis-yet';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { BranchesModule } from './modules/branches/branches.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { QueueModule } from './modules/queue/queue.module';
import { ReportsModule } from './modules/reports/reports.module';
import { WorkSchedulesModule } from './modules/work-schedules/work-schedules.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { ZeroTapModule } from './modules/zero-tap/zero-tap.module';
import { KioskModule } from './modules/kiosk/kiosk.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: [
        join(process.cwd(), '.env'),
        join(process.cwd(), '../../.env'),
      ],
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const host = config.get<string>('REDIS_HOST') ?? 'localhost';
        const port = Number(config.get<string>('REDIS_PORT') ?? 6379);
        return {
          store: await redisStore({ host, port }),
          ttl: 60_000,
        };
      },
    }),
    PrismaModule,
    AuthModule,
    BranchesModule,
    EmployeesModule,
    AttendanceModule,
    DashboardModule,
    QueueModule,
    ReportsModule,
    WorkSchedulesModule,
    AuditLogsModule,
    ZeroTapModule,
    KioskModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
