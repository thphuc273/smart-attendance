import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { MissingCheckoutProcessor } from './missing-checkout.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';

describe('MissingCheckoutProcessor', () => {
  let processor: MissingCheckoutProcessor;
  let prisma: any;
  let notifications: { createMany: jest.Mock };

  beforeEach(async () => {
    prisma = {
      attendanceSession: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      managerBranch: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    notifications = { createMany: jest.fn().mockResolvedValue({ count: 0 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MissingCheckoutProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    processor = module.get(MissingCheckoutProcessor);
  });

  const fakeJob = (data: any = {}) => ({ id: '1', data } as unknown as Job);

  it('returns zero counts when no candidates', async () => {
    const result = await processor.process(fakeJob({ workDate: '2026-04-15' }));
    expect(result).toMatchObject({ closed: 0, notified: 0 });
    expect(prisma.attendanceSession.updateMany).not.toHaveBeenCalled();
    expect(notifications.createMany).not.toHaveBeenCalled();
  });

  it('closes candidates, notifies employees + managers', async () => {
    prisma.attendanceSession.findMany.mockResolvedValueOnce([
      {
        id: 'sess-1',
        branchId: 'br-1',
        employee: { user: { id: 'u-emp-1', fullName: 'A' } },
        branch: { name: 'HCM-Q1' },
      },
      {
        id: 'sess-2',
        branchId: 'br-1',
        employee: { user: { id: 'u-emp-2', fullName: 'B' } },
        branch: { name: 'HCM-Q1' },
      },
    ]);
    prisma.attendanceSession.updateMany.mockResolvedValueOnce({ count: 2 });
    prisma.managerBranch.findMany.mockResolvedValueOnce([
      { userId: 'u-mgr-1', branchId: 'br-1', branch: { name: 'HCM-Q1' } },
    ]);
    notifications.createMany.mockResolvedValueOnce({ count: 3 });

    const result = await processor.process(fakeJob({ workDate: '2026-04-15' }));

    expect(prisma.attendanceSession.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sess-1', 'sess-2'] } },
      data: { status: 'missing_checkout' },
    });
    const [batch] = notifications.createMany.mock.calls[0];
    expect(batch).toHaveLength(3); // 2 employees + 1 manager
    expect(batch.filter((n: any) => n.userId === 'u-emp-1')).toHaveLength(1);
    expect(batch.filter((n: any) => n.userId === 'u-mgr-1')).toHaveLength(1);
    expect(batch.find((n: any) => n.userId === 'u-mgr-1').data.count).toBe(2);
    expect(result).toMatchObject({ closed: 2, notified: 3 });
  });
});
