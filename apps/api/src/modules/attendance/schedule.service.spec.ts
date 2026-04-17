import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleService } from './schedule.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ScheduleService', () => {
  let service: ScheduleService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      workScheduleAssignment: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ScheduleService);
  });

  describe('resolveSchedule', () => {
    it('returns null when no assignment exists', async () => {
      prisma.workScheduleAssignment.findFirst.mockResolvedValueOnce(null);
      const result = await service.resolveSchedule('emp-1', new Date('2026-04-16'));
      expect(result).toBeNull();
    });

    it('maps active schedule assignment into ScheduleConfig', async () => {
      prisma.workScheduleAssignment.findFirst.mockResolvedValueOnce({
        schedule: {
          startTime: '08:00',
          endTime: '17:00',
          graceMinutes: 10,
          overtimeAfterMinutes: 60,
          workdays: [1, 2, 3, 4, 5],
        },
      });
      const result = await service.resolveSchedule('emp-1', new Date('2026-04-16'));
      expect(result).toEqual({
        startTime: '08:00',
        endTime: '17:00',
        graceMinutes: 10,
        overtimeAfterMinutes: 60,
        workdays: [1, 2, 3, 4, 5],
      });
    });

    it('falls back to [1..5] when workdays JSON is malformed', async () => {
      prisma.workScheduleAssignment.findFirst.mockResolvedValueOnce({
        schedule: {
          startTime: '09:00',
          endTime: '18:00',
          graceMinutes: 5,
          overtimeAfterMinutes: 30,
          workdays: null,
        },
      });
      const result = await service.resolveSchedule('emp-1', new Date('2026-04-16'));
      expect(result?.workdays).toEqual([1, 2, 3, 4, 5]);
    });

    it('queries with effective window covering the target date', async () => {
      prisma.workScheduleAssignment.findFirst.mockResolvedValueOnce(null);
      const date = new Date('2026-04-16T12:00:00Z');
      await service.resolveSchedule('emp-42', date);
      expect(prisma.workScheduleAssignment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: 'emp-42',
            effectiveFrom: { lte: date },
          }),
        }),
      );
    });
  });
});
