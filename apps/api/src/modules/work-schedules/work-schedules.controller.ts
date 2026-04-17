import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { WorkSchedulesService } from './work-schedules.service';
import { AssignScheduleDto, CreateWorkScheduleDto } from './dto/work-schedule.dto';

@ApiTags('work-schedules')
@ApiBearerAuth()
@Controller('work-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkSchedulesController {
  constructor(private readonly schedules: WorkSchedulesService) {}

  @Get()
  @Roles(RoleCode.admin, RoleCode.manager)
  list() {
    return this.schedules.list();
  }

  @Post()
  @HttpCode(201)
  @Roles(RoleCode.admin)
  create(@Body() dto: CreateWorkScheduleDto) {
    return this.schedules.create(dto);
  }

  @Post(':id/assign')
  @HttpCode(201)
  @Roles(RoleCode.admin)
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignScheduleDto,
  ) {
    return this.schedules.assign(id, dto);
  }

  @Get(':id/assignments')
  @Roles(RoleCode.admin, RoleCode.manager)
  listAssignments(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.schedules.listAssignments(id);
  }

  @Delete(':id/assignments/:assignmentId')
  @HttpCode(204)
  @Roles(RoleCode.admin)
  async unassign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
  ): Promise<void> {
    await this.schedules.unassign(id, assignmentId);
  }
}
