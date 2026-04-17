import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLogsService } from './audit-logs.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  @Roles(RoleCode.admin)
  list(@Query() dto: ListAuditLogsDto) {
    return this.auditLogs.list(dto);
  }
}
