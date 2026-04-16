import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  QUEUE_DAILY_SUMMARY,
  QUEUE_MISSING_CHECKOUT,
  QUEUE_REPORT_EXPORT,
} from '../queue/queue.constants';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;
  let exportQueue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      managerBranch: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      reportExport: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      branch: { findUnique: jest.fn() },
      dailyAttendanceSummary: {
        groupBy: jest.fn(),
        aggregate: jest.fn(),
      },
    };
    exportQueue = { add: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(QUEUE_DAILY_SUMMARY), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_MISSING_CHECKOUT), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_REPORT_EXPORT), useValue: exportQueue },
      ],
    }).compile();

    service = module.get(ReportsService);
  });

  describe('createExport', () => {
    const dto = {
      type: 'attendance_csv' as const,
      branch_id: 'branch-1',
      date_from: '2026-04-01',
      date_to: '2026-04-30',
    };

    it('creates report_export row and enqueues a job for admin', async () => {
      prisma.reportExport.create.mockResolvedValueOnce({ id: 'job-uuid', status: 'queued' });

      const result = await service.createExport('admin-1', true, dto);

      expect(result).toEqual({ data: { job_id: 'job-uuid', status: 'queued' } });
      expect(exportQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ reportExportId: 'job-uuid', branch_id: 'branch-1' }),
        expect.objectContaining({ jobId: 'job-uuid' }),
      );
    });

    it('rejects manager requesting branch outside scope', async () => {
      prisma.managerBranch.findUnique.mockResolvedValueOnce(null);
      await expect(service.createExport('manager-1', false, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows manager requesting branch within scope', async () => {
      prisma.managerBranch.findUnique.mockResolvedValueOnce({ branchId: 'branch-1' });
      prisma.reportExport.create.mockResolvedValueOnce({ id: 'job-uuid', status: 'queued' });
      const result = await service.createExport('manager-1', false, dto);
      expect(result.data.job_id).toBe('job-uuid');
    });
  });

  describe('getExportStatus', () => {
    it('returns download_url when completed', async () => {
      prisma.reportExport.findUnique.mockResolvedValueOnce({
        id: 're-1',
        userId: 'admin-1',
        status: 'completed',
        rowCount: 42,
        expiresAt: new Date(Date.now() + 3600_000),
      });
      const result = await service.getExportStatus('admin-1', true, 're-1');
      expect(result.data.status).toBe('completed');
      expect(result.data.download_url).toContain('/re-1/download');
      expect(result.data.row_count).toBe(42);
    });

    it('forbids cross-user access for non-admins', async () => {
      prisma.reportExport.findUnique.mockResolvedValueOnce({
        id: 're-1',
        userId: 'other-user',
        status: 'completed',
      });
      await expect(service.getExportStatus('manager-1', false, 're-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('404s for unknown job', async () => {
      prisma.reportExport.findUnique.mockResolvedValueOnce(null);
      await expect(service.getExportStatus('admin-1', true, 're-missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getExportFile', () => {
    it('returns fileName + content when completed and not expired', async () => {
      prisma.reportExport.findUnique.mockResolvedValueOnce({
        id: 're-1',
        userId: 'admin-1',
        status: 'completed',
        fileName: 'x.csv',
        fileContent: '\uFEFFa,b\n',
        expiresAt: new Date(Date.now() + 3600_000),
      });
      const { fileName, content } = await service.getExportFile('admin-1', true, 're-1');
      expect(fileName).toBe('x.csv');
      expect(content.charCodeAt(0)).toBe(0xfeff);
    });

    it('404s when expired', async () => {
      prisma.reportExport.findUnique.mockResolvedValueOnce({
        id: 're-1',
        userId: 'admin-1',
        status: 'completed',
        fileName: 'x.csv',
        fileContent: 'a',
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.getExportFile('admin-1', true, 're-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
