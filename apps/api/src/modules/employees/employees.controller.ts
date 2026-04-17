import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreateAssignmentDto,
  ToggleDeviceTrustDto,
} from './dto/employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  private scopeOf(user: AuthenticatedUser): string[] | undefined {
    return user.roles.includes(RoleCode.admin) ? undefined : user.managedBranchIds;
  }

  @Get()
  @Roles(RoleCode.admin, RoleCode.manager)
  list(@Query() query: ListEmployeesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.employees.list(query, this.scopeOf(user));
  }

  @Post()
  @HttpCode(201)
  @Roles(RoleCode.admin, RoleCode.manager)
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.employees.create(dto, this.scopeOf(user));
  }

  @Patch(':id')
  @Roles(RoleCode.admin, RoleCode.manager)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employees.update(id, dto, this.scopeOf(user));
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(RoleCode.admin, RoleCode.manager)
  async delete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.employees.softDelete(id, this.scopeOf(user));
  }

  @Post(':id/assignments')
  @HttpCode(201)
  @Roles(RoleCode.admin, RoleCode.manager)
  createAssignment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.employees.createAssignment(id, dto);
  }

  @Get(':id/devices')
  @Roles(RoleCode.admin, RoleCode.manager)
  listDevices(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.employees.listDevices(id);
  }

  @Patch(':id/devices/:deviceId')
  @Roles(RoleCode.admin, RoleCode.manager)
  toggleDeviceTrust(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Body() dto: ToggleDeviceTrustDto,
  ) {
    return this.employees.toggleDeviceTrust(id, deviceId, dto);
  }
}
