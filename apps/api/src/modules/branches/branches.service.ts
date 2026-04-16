import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Branch } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Paginated } from '../../common/interceptors/response-transform.interceptor';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ListBranchesDto } from './dto/list-branches.dto';
import { CreateWifiConfigDto } from './dto/wifi-config.dto';
import { CreateGeofenceDto } from './dto/geofence.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListBranchesDto, scopedBranchIds?: string[]): Promise<Paginated<Branch>> {
    const where: Prisma.BranchWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (scopedBranchIds) where.id = { in: scopedBranchIds };

    const { page, limit } = query;
    const [total, items] = await Promise.all([
      this.prisma.branch.count({ where }),
      this.prisma.branch.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items,
      meta: { page, limit, total, total_pages: Math.ceil(total / limit) || 1 },
    };
  }

  async getById(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        wifiConfigs: { where: { isActive: true }, orderBy: { priority: 'desc' } },
        geofences: { where: { isActive: true } },
      },
    });
    if (!branch) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Branch not found' });
    return branch;
  }

  create(dto: CreateBranchDto) {
    return this.prisma.branch.create({
      data: {
        code: dto.code,
        name: dto.name,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusMeters: dto.radius_meters ?? 150,
        timezone: dto.timezone ?? 'Asia/Ho_Chi_Minh',
      },
    });
  }

  async update(id: string, dto: UpdateBranchDto) {
    await this.ensureExists(id);
    return this.prisma.branch.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusMeters: dto.radius_meters,
        timezone: dto.timezone,
        status: dto.status,
      },
    });
  }

  async softDelete(id: string) {
    await this.ensureExists(id);
    return this.prisma.branch.update({
      where: { id },
      data: { status: 'inactive' },
    });
  }

  // ── WiFi configs ──

  listWifi(branchId: string) {
    return this.prisma.branchWifiConfig.findMany({
      where: { branchId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createWifi(branchId: string, dto: CreateWifiConfigDto) {
    await this.ensureExists(branchId);
    return this.prisma.branchWifiConfig.create({
      data: {
        branchId,
        ssid: dto.ssid,
        bssid: dto.bssid?.toLowerCase(),
        priority: dto.priority ?? 0,
        isActive: dto.is_active ?? true,
        notes: dto.notes,
      },
    });
  }

  async deleteWifi(branchId: string, configId: string) {
    const cfg = await this.prisma.branchWifiConfig.findFirst({ where: { id: configId, branchId } });
    if (!cfg) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Wifi config not found' });
    await this.prisma.branchWifiConfig.delete({ where: { id: configId } });
    return null;
  }

  // ── Geofences ──

  listGeofences(branchId: string) {
    return this.prisma.branchGeofence.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createGeofence(branchId: string, dto: CreateGeofenceDto) {
    await this.ensureExists(branchId);
    return this.prisma.branchGeofence.create({
      data: {
        branchId,
        name: dto.name,
        centerLat: dto.center_lat,
        centerLng: dto.center_lng,
        radiusMeters: dto.radius_meters,
        isActive: dto.is_active ?? true,
      },
    });
  }

  async deleteGeofence(branchId: string, geofenceId: string) {
    const geo = await this.prisma.branchGeofence.findFirst({ where: { id: geofenceId, branchId } });
    if (!geo) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Geofence not found' });
    await this.prisma.branchGeofence.delete({ where: { id: geofenceId } });
    return null;
  }

  private async ensureExists(id: string): Promise<void> {
    const branch = await this.prisma.branch.findUnique({ where: { id }, select: { id: true } });
    if (!branch) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Branch not found' });
  }
}
