import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';
import { CheckInDto, CheckOutDto } from './dto/check-in.dto';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('check-in')
  @HttpCode(201)
  @Roles(RoleCode.employee)
  checkIn(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckInDto) {
    return this.attendance.checkIn(user.id, dto);
  }

  @Post('check-out')
  @HttpCode(200)
  @Roles(RoleCode.employee)
  checkOut(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckOutDto) {
    return this.attendance.checkOut(user.id, dto);
  }
}
