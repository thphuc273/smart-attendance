import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { ZeroTapController } from './zero-tap.controller';
import { ZeroTapService } from './zero-tap.service';
import { ZeroTapRevokeCleanupProcessor } from './zero-tap-revoke-cleanup.processor';

@Module({
  imports: [AttendanceModule],
  controllers: [ZeroTapController],
  providers: [ZeroTapService, ZeroTapRevokeCleanupProcessor],
  exports: [ZeroTapService],
})
export class ZeroTapModule {}
