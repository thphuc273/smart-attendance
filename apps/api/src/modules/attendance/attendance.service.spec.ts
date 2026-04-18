import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { ScheduleService } from './schedule.service';
import { BranchesService } from '../branches/branches.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LiveBusService } from '../live/live-bus.service';

describe('AttendanceService - overrideSession', () => {
  let service: AttendanceService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      attendanceSession: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      managerBranch: {
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => {
        return cb(prisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ScheduleService,
          useValue: {
            resolveSchedule: jest.fn().mockResolvedValue(null),
            classifyCheckIn: jest.fn(),
            classifyCheckOut: jest.fn(),
            isWorkday: jest.fn(),
          },
        },
        {
          provide: BranchesService,
          useValue: {
            getConfigCached: jest.fn(),
            loadConfigsCached: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn().mockResolvedValue(undefined),
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        },
        {
          provide: LiveBusService,
          useValue: { publish: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AttendanceService);
  });

  describe('overrideSession', () => {
    const managerId = 'manager-123';
    const sessionId = 'session-999';
    const branchId = 'branch-hcm';
    const dto = { status: 'late' as any, note: 'Approved manually' };

    it('should update session and create audit log when admin overrides', async () => {
      prisma.attendanceSession.findUnique.mockResolvedValueOnce({
        id: sessionId,
        branchId,
        status: 'absent',
        note: null,
        workDate: new Date('2026-04-15'),
        employee: { user: { id: 'user-emp-1' } },
        branch: { name: 'HCM-Q1' },
      });

      prisma.attendanceSession.update.mockResolvedValueOnce({ id: sessionId, status: 'late' });
      
      await service.overrideSession(managerId, true, sessionId, dto);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.attendanceSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: expect.objectContaining({ 
          status: 'late', 
          note: expect.stringContaining('Approved manually') 
        }),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: managerId,
          action: 'update',
          entityType: 'AttendanceSession',
          entityId: sessionId,
          before: { status: 'absent', note: null },
          after: { status: 'late', note: expect.stringContaining('Approved manually') },
        }),
      });
    });

    it('should block manager if session branch is outside their scope', async () => {
      prisma.attendanceSession.findUnique.mockResolvedValueOnce({
        id: sessionId,
        branchId,
      });
      // Manager has no access
      prisma.managerBranch.findUnique.mockResolvedValueOnce(null);

      await expect(service.overrideSession(managerId, false, sessionId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw Not Found if session does not exist', async () => {
      prisma.attendanceSession.findUnique.mockResolvedValueOnce(null);

      await expect(service.overrideSession(managerId, true, sessionId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
