import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      employee: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn() },
      branch: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn(), findUnique: jest.fn() },
      dailyAttendanceSummary: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      attendanceSession: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      managerBranch: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      employeeDevice: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(DashboardService);
  });

  describe('getAdminOverview', () => {
    it('returns empty shape when no data', async () => {
      const result = await service.getAdminOverview();
      expect(result.total_employees).toBe(0);
      expect(result.total_branches).toBe(0);
      expect(result.today.checked_in).toBe(0);
      expect(result.checkin_heatmap).toEqual([]);
    });

    it('uses $queryRaw for heatmap (read from index, not scan)', async () => {
      await service.getAdminOverview();
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('converts $queryRaw bigint counts to numbers', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { hour: 8, count: BigInt(234) },
        { hour: 9, count: BigInt(45) },
      ]);
      const result = await service.getAdminOverview();
      expect(result.checkin_heatmap).toEqual([
        { hour: 8, count: 234 },
        { hour: 9, count: 45 },
      ]);
    });
  });

  describe('getAnomalies', () => {
    const userId = 'user-1';

    it('returns empty sections when manager has no branches', async () => {
      prisma.managerBranch.findMany.mockResolvedValueOnce([]);
      const result = await service.getAnomalies(userId, false);
      expect(result.data.branches_late_spike).toEqual([]);
      expect(result.data.employees_low_trust).toEqual([]);
      expect(result.data.untrusted_devices_new_today).toBe(0);
    });

    it('flags branches with late_rate spike > 2x vs week avg', async () => {
      prisma.dailyAttendanceSummary.groupBy
        // today
        .mockResolvedValueOnce([
          { branchId: 'branch-1', status: 'on_time', _count: { _all: 4 } },
          { branchId: 'branch-1', status: 'late', _count: { _all: 6 } },
        ])
        // week
        .mockResolvedValueOnce([
          { branchId: 'branch-1', status: 'on_time', _count: { _all: 90 } },
          { branchId: 'branch-1', status: 'late', _count: { _all: 10 } },
        ]);
      prisma.branch.findMany.mockResolvedValueOnce([{ id: 'branch-1', name: 'HCM-Q1' }]);
      prisma.attendanceSession.groupBy.mockResolvedValueOnce([]);

      const result = await service.getAnomalies(userId, true);
      expect(result.data.branches_late_spike).toHaveLength(1);
      expect(result.data.branches_late_spike[0].branch_id).toBe('branch-1');
      expect(result.data.branches_late_spike[0].late_rate_today).toBeCloseTo(0.6, 3);
      expect(result.data.branches_late_spike[0].late_rate_avg_7d).toBeCloseTo(0.1, 3);
      expect(result.data.branches_late_spike[0].spike_ratio).toBe(6);
    });

    it('does not flag branches without a spike', async () => {
      prisma.dailyAttendanceSummary.groupBy
        .mockResolvedValueOnce([
          { branchId: 'branch-1', status: 'on_time', _count: { _all: 9 } },
          { branchId: 'branch-1', status: 'late', _count: { _all: 1 } },
        ])
        .mockResolvedValueOnce([
          { branchId: 'branch-1', status: 'on_time', _count: { _all: 80 } },
          { branchId: 'branch-1', status: 'late', _count: { _all: 20 } },
        ]);
      prisma.branch.findMany.mockResolvedValueOnce([{ id: 'branch-1', name: 'HCM-Q1' }]);
      prisma.attendanceSession.groupBy.mockResolvedValueOnce([]);

      const result = await service.getAnomalies(userId, true);
      expect(result.data.branches_late_spike).toHaveLength(0);
    });

    it('lists employees with ≥3 low-trust sessions in 7 days', async () => {
      prisma.dailyAttendanceSummary.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.branch.findMany.mockResolvedValueOnce([]);
      prisma.attendanceSession.groupBy.mockResolvedValueOnce([
        { employeeId: 'emp-1', _count: { _all: 4 } },
        { employeeId: 'emp-2', _count: { _all: 3 } },
      ]);
      prisma.employee.findMany.mockResolvedValueOnce([
        { id: 'emp-1', employeeCode: 'E001' },
        { id: 'emp-2', employeeCode: 'E002' },
      ]);

      const result = await service.getAnomalies(userId, true);
      expect(result.data.employees_low_trust).toHaveLength(2);
      expect(result.data.employees_low_trust[0]).toEqual({
        employee_id: 'emp-1',
        code: 'E001',
        low_trust_count_7d: 4,
      });
    });
  });
});
