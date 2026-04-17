import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_DAILY_SUMMARY } from '../../queue/queue.constants';

export interface DailySummaryJobData {
  workDate?: string; // YYYY-MM-DD; defaults to yesterday
}

@Processor(QUEUE_DAILY_SUMMARY)
export class DailySummaryProcessor extends WorkerHost {
  private readonly logger = new Logger(DailySummaryProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<DailySummaryJobData>) {
    const target = job.data.workDate ? new Date(job.data.workDate) : this.yesterday();
    target.setUTCHours(0, 0, 0, 0);

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { workDate: target },
    });

    let upserted = 0;
    for (const s of sessions) {
      await this.prisma.dailyAttendanceSummary.upsert({
        where: {
          employeeId_workDate: { employeeId: s.employeeId, workDate: target },
        },
        create: {
          employeeId: s.employeeId,
          branchId: s.branchId,
          workDate: target,
          status: s.status,
          workedMinutes: s.workedMinutes ?? 0,
          overtimeMinutes: s.overtimeMinutes ?? 0,
          lateMinutes: s.lateMinutes ?? 0,
          trustScoreAvg: s.trustScore ?? null,
        },
        update: {
          branchId: s.branchId,
          status: s.status,
          workedMinutes: s.workedMinutes ?? 0,
          overtimeMinutes: s.overtimeMinutes ?? 0,
          lateMinutes: s.lateMinutes ?? 0,
          trustScoreAvg: s.trustScore ?? null,
        },
      });
      upserted++;
    }

    return { workDate: target.toISOString(), upserted };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: { workDate: string; upserted: number }) {
    this.logger.log(`daily-summary ${result.workDate} upserted=${result.upserted} job=${job.id}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`daily-summary failed job=${job.id}: ${err.message}`);
  }

  private yesterday(): Date {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d;
  }
}
