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

    const candidates = await this.prisma.attendanceSession.findMany({
      where: {
        workDate,
        checkInAt: { not: null },
        checkOutAt: null,
        status: { notIn: ['absent', 'missing_checkout'] },
      },
      select: {
        id: true,
        branchId: true,
        employee: { select: { user: { select: { id: true, fullName: true } } } },
        branch: { select: { name: true } },
      },
    });

    if (candidates.length === 0) {
      return { workDate: workDate.toISOString(), closed: 0, notified: 0 };
    }

    const ids = candidates.map((c) => c.id);
    const dateLabel = workDate.toISOString().slice(0, 10);
    const employeeNotis = candidates.map((c) => ({
      userId: c.employee.user.id,
      type: 'missing_checkout' as const,
      title: 'Bạn quên check-out',
      body: `Phiên làm việc ngày ${dateLabel} tại ${c.branch.name} chưa được check-out và đã được hệ thống đóng tự động.`,
      data: { sessionId: c.id, workDate: dateLabel, branchId: c.branchId },
    }));

    // Notify managers of each branch (deduped by user+branch).
    const branchIds = Array.from(new Set(candidates.map((c) => c.branchId)));
    const managers = await this.prisma.managerBranch.findMany({
      where: { branchId: { in: branchIds } },
      select: { userId: true, branchId: true, branch: { select: { name: true } } },
    });
    const countByBranch = candidates.reduce<Record<string, number>>((acc, c) => {
      acc[c.branchId] = (acc[c.branchId] ?? 0) + 1;
      return acc;
    }, {});
    const managerNotis = managers.map((m) => ({
      userId: m.userId,
      type: 'missing_checkout' as const,
      title: 'Có nhân viên quên check-out',
      body: `${countByBranch[m.branchId]} phiên tại ${m.branch.name} ngày ${dateLabel} đã bị đánh dấu missing_checkout.`,
      data: { branchId: m.branchId, workDate: dateLabel, count: countByBranch[m.branchId] },
    }));

    // Close the sessions and emit notifications in a single transaction so
    // a crash between the two cannot leave sessions closed with no notice.
    // The candidate query excludes already-closed sessions, so a retried
    // job is idempotent.
    const { closed, notified } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.attendanceSession.updateMany({
        where: { id: { in: ids } },
        data: { status: 'missing_checkout' },
      });
      const created = await tx.notification.createMany({
        data: [...employeeNotis, ...managerNotis],
      });
      return { closed: result.count, notified: created.count };
    });

    return {
      workDate: workDate.toISOString(),
      closed,
      notified,
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: { workDate: string; closed: number; notified: number }) {
    this.logger.log(
      `missing-checkout ${result.workDate} closed=${result.closed} notified=${result.notified} job=${job.id}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`missing-checkout failed job=${job.id}: ${err.message}`);
  }

  private today(): Date {
    return new Date();
  }
}
