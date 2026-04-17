import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { ScheduleService } from './schedule.service';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, ScheduleService],
  exports: [AttendanceService, ScheduleService],
})
export class AttendanceModule {}
