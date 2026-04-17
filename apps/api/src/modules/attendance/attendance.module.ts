import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { ScheduleService } from './schedule.service';
import { BranchesModule } from '../branches/branches.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [BranchesModule, NotificationsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, ScheduleService],
  exports: [AttendanceService, ScheduleService],
})
export class AttendanceModule {}
