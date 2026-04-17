import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { KioskController } from './kiosk.controller';
import { KioskService } from './kiosk.service';

@Module({
  imports: [AttendanceModule],
  controllers: [KioskController],
  providers: [KioskService],
  exports: [KioskService],
})
export class KioskModule {}
