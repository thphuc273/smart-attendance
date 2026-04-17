import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('admin/overview')
  @Roles(RoleCode.admin)
  getAdminOverview() {
    return this.dashboard.getAdminOverview();
  }

  @Get('manager/:branchId')
  @Roles(RoleCode.admin, RoleCode.manager)
  getManagerDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId') branchId: string,
  ) {
    const isSuperAdmin = user.roles.includes(RoleCode.admin);
    return this.dashboard.getManagerBranchDashboard(branchId, user.id, isSuperAdmin);
  }

  @Get('anomalies')
  @Roles(RoleCode.admin, RoleCode.manager)
  getAnomalies(@CurrentUser() user: AuthenticatedUser) {
    const isSuperAdmin = user.roles.includes(RoleCode.admin);
    return this.dashboard.getAnomalies(user.id, isSuperAdmin);
  }
}
