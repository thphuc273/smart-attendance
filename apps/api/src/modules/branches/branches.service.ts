import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Prisma, Branch, BranchGeofence, BranchWifiConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Paginated } from '../../common/interceptors/response-transform.interceptor';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ListBranchesDto } from './dto/list-branches.dto';
import { CreateWifiConfigDto } from './dto/wifi-config.dto';
import { CreateGeofenceDto } from './dto/geofence.dto';

export type BranchConfig = Branch & {
  wifiConfigs: BranchWifiConfig[];
  geofences: BranchGeofence[];
};

const BRANCH_CONFIG_TTL_MS = 5 * 60 * 1000;
const branchConfigKey = (id: string) => `branch:${id}:config`;

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Load active branch config (wifi + geofences) with Redis cache (TTL 5').
   * Invalidated on any mutation to the branch / its wifi / its geofences.
   * Returns null if branch is inactive or missing.
   */
  async getConfigCached(branchId: string): Promise<BranchConfig | null> {
    const key = branchConfigKey(branchId);
    const hit = await this.cache.get<BranchConfig>(key);
    if (hit) return hit;

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, status: 'active' },
      include: {
        wifiConfigs: { where: { isActive: true } },
        geofences: { where: { isActive: true } },
      },
    });
    if (!branch) return null;

    await this.cache.set(key, branch, BRANCH_CONFIG_TTL_MS);
    return branch;
  }

  async loadConfigsCached(branchIds: string[]): Promise<BranchConfig[]> {
    const unique = [...new Set(branchIds)];
    const results = await Promise.all(unique.map((id) => this.getConfigCached(id)));
    return results.filter((b): b is BranchConfig => b !== null);
  }

  private async invalidateConfig(branchId: string): Promise<void> {
    await this.cache.del(branchConfigKey(branchId));
  }

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
    const updated = await this.prisma.branch.update({
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
    await this.invalidateConfig(id);
    return updated;
  }

  async softDelete(id: string) {
    await this.ensureExists(id);
    const updated = await this.prisma.branch.update({
      where: { id },
      data: { status: 'inactive' },
    });
    await this.invalidateConfig(id);
    return updated;
  }

  // ── WiFi configs ──

  async listWifi(branchId: string) {
    await this.ensureExists(branchId);
    return this.prisma.branchWifiConfig.findMany({
      where: { branchId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createWifi(branchId: string, dto: CreateWifiConfigDto) {
    await this.ensureExists(branchId);
    const wifi = await this.prisma.branchWifiConfig.create({
      data: {
        branchId,
        ssid: dto.ssid,
        bssid: dto.bssid?.toLowerCase(),
        priority: dto.priority ?? 0,
        isActive: dto.is_active ?? true,
        notes: dto.notes,
      },
    });
    await this.invalidateConfig(branchId);
    return wifi;
  }

  async deleteWifi(branchId: string, configId: string) {
    const cfg = await this.prisma.branchWifiConfig.findFirst({ where: { id: configId, branchId } });
    if (!cfg) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Wifi config not found' });
    await this.prisma.branchWifiConfig.delete({ where: { id: configId } });
    await this.invalidateConfig(branchId);
    return null;
  }

  // ── Geofences ──

  async listGeofences(branchId: string) {
    await this.ensureExists(branchId);
    return this.prisma.branchGeofence.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createGeofence(branchId: string, dto: CreateGeofenceDto) {
    await this.ensureExists(branchId);
    const geo = await this.prisma.branchGeofence.create({
      data: {
        branchId,
        name: dto.name,
        centerLat: dto.center_lat,
        centerLng: dto.center_lng,
        radiusMeters: dto.radius_meters,
        isActive: dto.is_active ?? true,
      },
    });
    await this.invalidateConfig(branchId);
    return geo;
  }

  async deleteGeofence(branchId: string, geofenceId: string) {
    const geo = await this.prisma.branchGeofence.findFirst({ where: { id: geofenceId, branchId } });
    if (!geo) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Geofence not found' });
    await this.prisma.branchGeofence.delete({ where: { id: geofenceId } });
    await this.invalidateConfig(branchId);
    return null;
  }

  private async ensureExists(id: string): Promise<void> {
    const branch = await this.prisma.branch.findUnique({ where: { id }, select: { id: true } });
    if (!branch) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Branch not found' });
  }
}
