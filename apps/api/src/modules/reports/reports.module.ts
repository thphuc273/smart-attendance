import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { DailySummaryProcessor } from './processors/daily-summary.processor';
import { MissingCheckoutProcessor } from './processors/missing-checkout.processor';
import { ReportExportProcessor } from './processors/report-export.processor';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    DailySummaryProcessor,
    MissingCheckoutProcessor,
    ReportExportProcessor,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
