import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { WorkSchedulesService } from './work-schedules.service';
import { PrismaService } from '../prisma/prisma.service';

describe('WorkSchedulesService', () => {
  let service: WorkSchedulesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      workSchedule: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      workScheduleAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      employee: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkSchedulesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(WorkSchedulesService);
  });

  describe('create', () => {
    const validDto = {
      name: 'Standard 8-5',
      start_time: '08:00',
      end_time: '17:00',
      workdays: [1, 2, 3, 4, 5],
    };

    it('creates schedule with defaults', async () => {
      prisma.workSchedule.create.mockResolvedValueOnce({ id: 's1' });
      await service.create(validDto);
      expect(prisma.workSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            graceMinutes: 10,
            overtimeAfterMinutes: 60,
          }),
        }),
      );
    });

    it('rejects when end_time <= start_time', async () => {
      await expect(
        service.create({ ...validDto, start_time: '17:00', end_time: '08:00' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.create({ ...validDto, start_time: '08:00', end_time: '08:00' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('assign', () => {
    it('404s for missing schedule', async () => {
      prisma.workSchedule.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.assign('s1', { employee_id: 'e1', effective_from: '2026-04-15' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('404s for missing employee', async () => {
      prisma.workSchedule.findUnique.mockResolvedValueOnce({ id: 's1' });
      prisma.employee.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.assign('s1', { employee_id: 'e1', effective_from: '2026-04-15' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects effective_to before effective_from', async () => {
      prisma.workSchedule.findUnique.mockResolvedValueOnce({ id: 's1' });
      prisma.employee.findUnique.mockResolvedValueOnce({ id: 'e1' });
      await expect(
        service.assign('s1', {
          employee_id: 'e1',
          effective_from: '2026-04-15',
          effective_to: '2026-04-10',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates valid assignment', async () => {
      prisma.workSchedule.findUnique.mockResolvedValueOnce({ id: 's1' });
      prisma.employee.findUnique.mockResolvedValueOnce({ id: 'e1' });
      prisma.workScheduleAssignment.create.mockResolvedValueOnce({ id: 'a1' });
      await service.assign('s1', {
        employee_id: 'e1',
        effective_from: '2026-04-15',
        effective_to: '2026-05-15',
      });
      expect(prisma.workScheduleAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scheduleId: 's1',
            employeeId: 'e1',
          }),
        }),
      );
    });
  });

  describe('unassign', () => {
    it('404s when assignment does not belong to schedule', async () => {
      prisma.workScheduleAssignment.findUnique.mockResolvedValueOnce({
        id: 'a1',
        scheduleId: 'other-schedule',
      });
      await expect(service.unassign('s1', 'a1')).rejects.toThrow(NotFoundException);
    });

    it('deletes when scheduleId matches', async () => {
      prisma.workScheduleAssignment.findUnique.mockResolvedValueOnce({
        id: 'a1',
        scheduleId: 's1',
      });
      await service.unassign('s1', 'a1');
      expect(prisma.workScheduleAssignment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    });
  });
});
