import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { BranchReportQueryDto, DailySummaryQueryDto } from './dto/daily-summary.dto';
import { CreateExportDto } from './dto/export.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily-summary')
  @Roles(RoleCode.admin, RoleCode.manager)
  getDailySummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: DailySummaryQueryDto,
  ) {
    const isSuperAdmin = user.roles.includes(RoleCode.admin);
    return this.reports.getDailySummary(user.id, isSuperAdmin, dto);
  }

  @Get('branch/:id')
  @Roles(RoleCode.admin, RoleCode.manager)
  getBranchReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) branchId: string,
    @Query() dto: BranchReportQueryDto,
  ) {
    const isSuperAdmin = user.roles.includes(RoleCode.admin);
    return this.reports.getBranchReport(user.id, isSuperAdmin, branchId, dto);
  }

  @Post('export')
  @Roles(RoleCode.admin, RoleCode.manager)
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  createExport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExportDto,
  ) {
    const isSuperAdmin = user.roles.includes(RoleCode.admin);
    return this.reports.createExport(user.id, isSuperAdmin, dto);
  }

  @Get('export/:jobId')
  @Roles(RoleCode.admin, RoleCode.manager)
  getExportStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    const isSuperAdmin = user.roles.includes(RoleCode.admin);
    return this.reports.getExportStatus(user.id, isSuperAdmin, jobId);
  }

  @Get('export/:jobId/download')
  @Roles(RoleCode.admin, RoleCode.manager)
  async downloadExport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Res() res: Response,
  ) {
    const isSuperAdmin = user.roles.includes(RoleCode.admin);
    const { fileName, content } = await this.reports.getExportFile(user.id, isSuperAdmin, jobId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(content);
  }
}
