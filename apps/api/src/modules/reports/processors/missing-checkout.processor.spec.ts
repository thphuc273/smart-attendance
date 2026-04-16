import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { MissingCheckoutProcessor } from './missing-checkout.processor';
import { PrismaService } from '../../prisma/prisma.service';

describe('MissingCheckoutProcessor', () => {
  let processor: MissingCheckoutProcessor;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      attendanceSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MissingCheckoutProcessor, { provide: PrismaService, useValue: prisma }],
    }).compile();

    processor = module.get(MissingCheckoutProcessor);
  });

  const fakeJob = (data: any = {}) => ({ id: '1', data } as unknown as Job);

  it('closes sessions with check-in but no check-out on the target date', async () => {
    const result = await processor.process(fakeJob({ workDate: '2026-04-15' }));
    expect(result.closed).toBe(3);
    expect(prisma.attendanceSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        checkInAt: { not: null },
        checkOutAt: null,
        status: { notIn: ['absent', 'missing_checkout'] },
      }),
      data: { status: 'missing_checkout' },
    });
  });

  it('is idempotent — excludes already-closed missing_checkout sessions', async () => {
    prisma.attendanceSession.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await processor.process(fakeJob({ workDate: '2026-04-15' }));
    expect(result.closed).toBe(0);
  });
});
