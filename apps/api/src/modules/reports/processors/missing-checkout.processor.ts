import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_MISSING_CHECKOUT } from '../../queue/queue.constants';

@Processor(QUEUE_MISSING_CHECKOUT)
export class MissingCheckoutProcessor extends WorkerHost {
  private readonly logger = new Logger(MissingCheckoutProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ workDate?: string }>) {
    const workDate = job.data.workDate ? new Date(job.data.workDate) : this.today();
    workDate.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.attendanceSession.updateMany({
      where: {
        workDate,
        checkInAt: { not: null },
        checkOutAt: null,
        status: { notIn: ['absent', 'missing_checkout'] },
      },
      data: { status: 'missing_checkout' },
    });

    return { workDate: workDate.toISOString(), closed: result.count };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: { workDate: string; closed: number }) {
    this.logger.log(`missing-checkout ${result.workDate} closed=${result.closed} job=${job.id}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`missing-checkout failed job=${job.id}: ${err.message}`);
  }

  private today(): Date {
    return new Date();
  }
}
