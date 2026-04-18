import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';
import { CheckInDto, CheckOutDto } from './dto/check-in.dto';
import { ListMyAttendanceDto, ListSessionsDto, OverrideSessionDto } from './dto/attendance-history.dto';

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

  @Get('me')
  @Roles(RoleCode.employee)
  getMyAttendance(@CurrentUser() user: AuthenticatedUser, @Query() dto: ListMyAttendanceDto) {
    return this.attendance.getMyAttendance(user.id, dto);
  }

  @Get('me/streak')
  @Roles(RoleCode.employee)
  getMyStreak(@CurrentUser() user: AuthenticatedUser) {
    return this.attendance.getMyStreak(user.id);
  }

  @Get('me/geofences')
  @Roles(RoleCode.employee)
  getMyGeofences(@CurrentUser() user: AuthenticatedUser) {
    return this.attendance.getMyGeofences(user.id);
  }

  @Get('sessions')
  @Roles(RoleCode.manager, RoleCode.admin)
  listSessions(@CurrentUser() user: AuthenticatedUser, @Query() dto: ListSessionsDto) {
    const isSuperAdmin = user.roles.includes(RoleCode.admin);
    return this.attendance.listSessions(user.id, isSuperAdmin, dto);
  }

  @Get('sessions/:id')
  @Roles(RoleCode.manager, RoleCode.admin)
  getSessionDetail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const isSuperAdmin = user.roles.includes(RoleCode.admin);
    return this.attendance.getSessionDetail(user.id, isSuperAdmin, id);
  }

  @Patch('sessions/:id')
  @Roles(RoleCode.manager, RoleCode.admin)
  overrideSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: OverrideSessionDto,
  ) {
    const isSuperAdmin = user.roles.includes(RoleCode.admin);
    return this.attendance.overrideSession(user.id, isSuperAdmin, id, dto);
  }
}
