import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DeviceThrottlerGuard } from '../../common/guards/device-throttler.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ZeroTapService } from './zero-tap.service';
import {
  PatchZeroTapSettingDto,
  UpsertZeroTapPolicyDto,
  ZeroTapCheckInDto,
  ZeroTapCheckOutDto,
} from './dto/zero-tap.dto';

@ApiTags('zero-tap')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ZeroTapController {
  constructor(private readonly service: ZeroTapService) {}

  @Get('attendance/zero-tap/settings/me')
  @Roles(RoleCode.employee)
  getMySettings(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMySettings(user.id);
  }

  @Patch('attendance/zero-tap/settings/me')
  @Roles(RoleCode.employee)
  patchMySetting(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PatchZeroTapSettingDto,
  ) {
    return this.service.patchMySetting(user.id, dto);
  }

  @Post('attendance/zero-tap/check-in')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard, DeviceThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Roles(RoleCode.employee)
  zeroTapCheckIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ZeroTapCheckInDto,
    @Headers('x-device-attestation') attestation?: string,
  ) {
    return this.service.zeroTapCheckIn(user.id, dto, Boolean(attestation));
  }

  @Post('attendance/zero-tap/check-out')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard, DeviceThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Roles(RoleCode.employee)
  zeroTapCheckOut(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ZeroTapCheckOutDto,
    @Headers('x-device-attestation') attestation?: string,
  ) {
    return this.service.zeroTapCheckOut(user.id, dto, Boolean(attestation));
  }

  @Get('branches/:id/zero-tap-policy')
  @Roles(RoleCode.manager, RoleCode.admin)
  getPolicy(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.getPolicy(actor, id);
  }

  @Put('branches/:id/zero-tap-policy')
  @Roles(RoleCode.admin)
  upsertPolicy(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertZeroTapPolicyDto,
  ) {
    return this.service.upsertPolicy(actor, id, dto);
  }

  @Post('employees/:employeeId/devices/:deviceId/revoke-zero-tap')
  @HttpCode(200)
  @Roles(RoleCode.manager, RoleCode.admin)
  revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.service.revokeForDevice(employeeId, deviceId, 'admin_disabled', actor.id);
  }
}
