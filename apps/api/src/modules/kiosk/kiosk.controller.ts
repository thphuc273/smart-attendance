import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BranchScopeGuard } from '../../common/guards/branch-scope.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { KioskService } from './kiosk.service';
import { QrCheckInDto } from './dto/kiosk.dto';

@ApiTags('kiosk')
@Controller()
export class KioskController {
  constructor(private readonly service: KioskService) {}

  /** Kiosk hardware polls this (every 25s) to display a rolling QR. */
  @Get('kiosk/branches/:id/qr-token')
  @Throttle({ default: { limit: 100, ttl: 3600_000 } })
  issueToken(
    @Param('id') id: string,
    @Headers('x-kiosk-token') kioskToken?: string,
  ) {
    return this.service.issueToken(id, kioskToken);
  }

  @ApiBearerAuth()
  @Post('attendance/qr-check-in')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.employee)
  qrCheckIn(@CurrentUser() user: AuthenticatedUser, @Body() dto: QrCheckInDto) {
    return this.service.qrCheckIn(user.id, dto);
  }

  @ApiBearerAuth()
  @Put('branches/:id/qr-secret')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard, BranchScopeGuard)
  @Roles(RoleCode.admin, RoleCode.manager)
  rotate(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.service.rotate(id, actor.id);
  }
}
