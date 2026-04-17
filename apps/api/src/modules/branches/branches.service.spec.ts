import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BranchesService } from './branches.service';
import { PrismaService } from '../prisma/prisma.service';

type MockedPrisma = {
  branch: { count: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  branchWifiConfig: { findMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
  branchGeofence: { findMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
};

function makePrismaMock(): MockedPrisma {
  return {
    branch: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    branchWifiConfig: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    branchGeofence: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('BranchesService', () => {
  let service: BranchesService;
  let prisma: MockedPrisma;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CACHE_MANAGER,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(BranchesService);
  });

  // ─── list ───────────────────────────────────────────────────

  describe('list', () => {
    it('should paginate and return total_pages', async () => {
      prisma.branch.count.mockResolvedValueOnce(42);
      prisma.branch.findMany.mockResolvedValueOnce([{ id: 'b1' }]);

      const result = await service.list({ page: 2, limit: 20 } as never);

      expect(result.meta).toEqual({ page: 2, limit: 20, total: 42, total_pages: 3 });
      expect(prisma.branch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20, orderBy: { code: 'asc' } }),
      );
    });

    it('should apply search on code + name (case-insensitive)', async () => {
      prisma.branch.count.mockResolvedValueOnce(0);
      prisma.branch.findMany.mockResolvedValueOnce([]);

      await service.list({ page: 1, limit: 20, search: 'hcm' } as never);

      expect(prisma.branch.findMany.mock.calls[0][0].where).toEqual({
        OR: [
          { code: { contains: 'hcm', mode: 'insensitive' } },
          { name: { contains: 'hcm', mode: 'insensitive' } },
        ],
      });
    });

    it('should restrict to scoped branches when manager-scoped ids are passed', async () => {
      prisma.branch.count.mockResolvedValueOnce(0);
      prisma.branch.findMany.mockResolvedValueOnce([]);

      await service.list({ page: 1, limit: 20 } as never, ['b1', 'b2']);

      expect(prisma.branch.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['b1', 'b2'] } });
    });

    it('should return total_pages=1 for an empty result set (never 0)', async () => {
      prisma.branch.count.mockResolvedValueOnce(0);
      prisma.branch.findMany.mockResolvedValueOnce([]);

      const result = await service.list({ page: 1, limit: 20 } as never);

      expect(result.meta.total_pages).toBe(1);
    });
  });

  // ─── getById ────────────────────────────────────────────────

  describe('getById', () => {
    it('should include active wifiConfigs and geofences', async () => {
      prisma.branch.findUnique.mockResolvedValueOnce({ id: 'b1', wifiConfigs: [], geofences: [] });
      await service.getById('b1');
      expect(prisma.branch.findUnique).toHaveBeenCalledWith({
        where: { id: 'b1' },
        include: expect.objectContaining({
          wifiConfigs: { where: { isActive: true }, orderBy: { priority: 'desc' } },
          geofences: { where: { isActive: true } },
        }),
      });
    });

    it('should throw 404 RESOURCE_NOT_FOUND when branch missing', async () => {
      prisma.branch.findUnique.mockResolvedValueOnce(null);
      await expect(service.getById('missing')).rejects.toMatchObject({
        status: 404,
        response: { code: 'RESOURCE_NOT_FOUND' },
      });
    });
  });

  // ─── wifi configs ──────────────────────────────────────────

  describe('listWifi', () => {
    it('should return empty array when branch has no wifi configs', async () => {
      prisma.branch.findUnique.mockResolvedValueOnce({ id: 'b1' });
      prisma.branchWifiConfig.findMany.mockResolvedValueOnce([]);

      const result = await service.listWifi('b1');

      expect(result).toEqual([]);
    });

    it('should return 404 when branch does not exist (not empty array)', async () => {
      prisma.branch.findUnique.mockResolvedValueOnce(null);
      await expect(service.listWifi('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.branchWifiConfig.findMany).not.toHaveBeenCalled();
    });
  });

  describe('createWifi', () => {
    it('should lowercase BSSID and default is_active=true', async () => {
      prisma.branch.findUnique.mockResolvedValueOnce({ id: 'b1' });
      prisma.branchWifiConfig.create.mockResolvedValueOnce({ id: 'w1' });

      await service.createWifi('b1', { ssid: 'Office-5G', bssid: 'AA:BB:CC:DD:EE:FF' } as never);

      expect(prisma.branchWifiConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          branchId: 'b1',
          ssid: 'Office-5G',
          bssid: 'aa:bb:cc:dd:ee:ff',
          isActive: true,
          priority: 0,
        }),
      });
    });
  });

  describe('deleteWifi', () => {
    it('should 404 when wifi config is not a child of the given branch', async () => {
      prisma.branchWifiConfig.findFirst.mockResolvedValueOnce(null);
      await expect(service.deleteWifi('b1', 'orphan-wifi')).rejects.toThrow(NotFoundException);
      expect(prisma.branchWifiConfig.delete).not.toHaveBeenCalled();
    });
  });

  // ─── geofences ─────────────────────────────────────────────

  describe('listGeofences', () => {
    it('should return 404 when branch does not exist', async () => {
      prisma.branch.findUnique.mockResolvedValueOnce(null);
      await expect(service.listGeofences('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── soft delete ───────────────────────────────────────────

  describe('softDelete', () => {
    it('should set status to inactive (not DB delete) to preserve history', async () => {
      prisma.branch.findUnique.mockResolvedValueOnce({ id: 'b1' });
      prisma.branch.update.mockResolvedValueOnce({ id: 'b1', status: 'inactive' });

      const result = await service.softDelete('b1');

      expect(prisma.branch.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { status: 'inactive' },
      });
      expect(result.status).toBe('inactive');
    });

    it('should 404 when branch does not exist', async () => {
      prisma.branch.findUnique.mockResolvedValueOnce(null);
      await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.branch.update).not.toHaveBeenCalled();
    });
  });

  // ─── create ────────────────────────────────────────────────

  describe('create', () => {
    it('should apply defaults radius_meters=150 and timezone=Asia/Ho_Chi_Minh', async () => {
      prisma.branch.create.mockResolvedValueOnce({ id: 'b1' });

      await service.create({ code: 'HCM-Q1', name: 'HCM Q1', latitude: 10.7, longitude: 106.7 } as never);

      expect(prisma.branch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          radiusMeters: 150,
          timezone: 'Asia/Ho_Chi_Minh',
        }),
      });
    });
  });
});
