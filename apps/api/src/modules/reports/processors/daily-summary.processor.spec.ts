import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { DailySummaryProcessor } from './daily-summary.processor';
import { PrismaService } from '../../prisma/prisma.service';

describe('DailySummaryProcessor', () => {
  let processor: DailySummaryProcessor;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      attendanceSession: {
        findMany: jest.fn(),
      },
      dailyAttendanceSummary: {
        upsert: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DailySummaryProcessor, { provide: PrismaService, useValue: prisma }],
    }).compile();

    processor = module.get(DailySummaryProcessor);
  });

  const fakeJob = (data: any = {}) => ({ id: '1', data } as unknown as Job);

  it('aggregates sessions and upserts one summary per session', async () => {
    prisma.attendanceSession.findMany.mockResolvedValue([
      {
        employeeId: 'e1',
        branchId: 'b1',
        status: 'on_time',
        workedMinutes: 480,
        overtimeMinutes: 0,
        lateMinutes: 0,
        trustScore: 85,
      },
      {
        employeeId: 'e2',
        branchId: 'b1',
        status: 'late',
        workedMinutes: 460,
        overtimeMinutes: 0,
        lateMinutes: 20,
        trustScore: 70,
      },
    ]);

    const result = await processor.process(fakeJob({ workDate: '2026-04-15' }));

    expect(result.upserted).toBe(2);
    expect(prisma.dailyAttendanceSummary.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.dailyAttendanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId_workDate: expect.objectContaining({ employeeId: 'e1' }),
        }),
      }),
    );
  });

  it('running twice yields same upserts (idempotent via upsert semantics)', async () => {
    prisma.attendanceSession.findMany.mockResolvedValue([
      {
        employeeId: 'e1',
        branchId: 'b1',
        status: 'on_time',
        workedMinutes: 480,
        overtimeMinutes: 30,
        lateMinutes: 0,
        trustScore: 90,
      },
    ]);

    await processor.process(fakeJob({ workDate: '2026-04-15' }));
    await processor.process(fakeJob({ workDate: '2026-04-15' }));

    expect(prisma.dailyAttendanceSummary.upsert).toHaveBeenCalledTimes(2);
    // Each call uses upsert which is idempotent at DB level
    const calls = prisma.dailyAttendanceSummary.upsert.mock.calls;
    expect(calls[0][0].create.employeeId).toBe('e1');
    expect(calls[1][0].create.employeeId).toBe('e1');
  });

  it('defaults to yesterday when workDate is not supplied', async () => {
    prisma.attendanceSession.findMany.mockResolvedValue([]);
    await processor.process(fakeJob({}));
    const arg = prisma.attendanceSession.findMany.mock.calls[0][0];
    const queried: Date = arg.where.workDate;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(queried.getTime()).toBeLessThan(today.getTime());
  });
});
