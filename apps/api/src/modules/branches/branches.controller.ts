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
import { BranchScopeGuard } from '../../common/guards/branch-scope.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ListBranchesDto } from './dto/list-branches.dto';
import { CreateWifiConfigDto } from './dto/wifi-config.dto';
import { CreateGeofenceDto } from './dto/geofence.dto';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @Roles(RoleCode.admin, RoleCode.manager)
  list(@Query() query: ListBranchesDto, @CurrentUser() user: AuthenticatedUser) {
    const scope = user.roles.includes(RoleCode.admin) ? undefined : user.managedBranchIds;
    return this.branches.list(query, scope);
  }

  @Get(':id')
  @Roles(RoleCode.admin, RoleCode.manager)
  @UseGuards(BranchScopeGuard)
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.branches.getById(id);
  }

  @Post()
  @HttpCode(201)
  @Roles(RoleCode.admin)
  create(@Body() dto: CreateBranchDto) {
    return this.branches.create(dto);
  }

  @Patch(':id')
  @Roles(RoleCode.admin)
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateBranchDto) {
    return this.branches.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(RoleCode.admin)
  async delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.branches.softDelete(id);
  }

  // ── WiFi configs ──

  @Get(':id/wifi-configs')
  @Roles(RoleCode.admin, RoleCode.manager)
  @UseGuards(BranchScopeGuard)
  listWifi(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.branches.listWifi(id);
  }

  @Post(':id/wifi-configs')
  @HttpCode(201)
  @Roles(RoleCode.admin)
  createWifi(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CreateWifiConfigDto) {
    return this.branches.createWifi(id, dto);
  }

  @Delete(':id/wifi-configs/:configId')
  @HttpCode(204)
  @Roles(RoleCode.admin)
  async deleteWifi(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('configId', new ParseUUIDPipe()) configId: string,
  ): Promise<void> {
    await this.branches.deleteWifi(id, configId);
  }

  // ── Geofences ──

  @Get(':id/geofences')
  @Roles(RoleCode.admin, RoleCode.manager)
  @UseGuards(BranchScopeGuard)
  listGeofences(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.branches.listGeofences(id);
  }

  @Post(':id/geofences')
  @HttpCode(201)
  @Roles(RoleCode.admin)
  createGeofence(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateGeofenceDto,
  ) {
    return this.branches.createGeofence(id, dto);
  }

  @Delete(':id/geofences/:geofenceId')
  @HttpCode(204)
  @Roles(RoleCode.admin)
  async deleteGeofence(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('geofenceId', new ParseUUIDPipe()) geofenceId: string,
  ): Promise<void> {
    await this.branches.deleteGeofence(id, geofenceId);
  }
}
