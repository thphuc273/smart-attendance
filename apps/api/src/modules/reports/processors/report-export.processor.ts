import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { stringify } from 'csv-stringify/sync';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_REPORT_EXPORT } from '../../queue/queue.constants';

export interface ReportExportJobData {
  reportExportId: string;
  type: 'attendance_csv';
  branch_id: string;
  date_from: string;
  date_to: string;
}

const CSV_COLUMNS = [
  'work_date',
  'employee_code',
  'full_name',
  'branch',
  'status',
  'check_in_at',
  'check_out_at',
  'worked_minutes',
  'overtime_minutes',
  'late_minutes',
  'trust_score',
];

@Processor(QUEUE_REPORT_EXPORT)
export class ReportExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportExportProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ReportExportJobData>) {
    const { reportExportId, branch_id, date_from, date_to } = job.data;

    await this.prisma.reportExport.update({
      where: { id: reportExportId },
      data: { status: 'processing' },
    });

    try {
      const from = new Date(date_from);
      const to = new Date(date_to);
      to.setUTCHours(23, 59, 59, 999);

      const sessions = await this.prisma.attendanceSession.findMany({
        where: {
          branchId: branch_id,
          workDate: { gte: from, lte: to },
        },
        include: {
          branch: { select: { name: true } },
          employee: {
            select: {
              employeeCode: true,
              user: { select: { fullName: true } },
            },
          },
        },
        orderBy: [{ workDate: 'asc' }, { employeeId: 'asc' }],
      });

      const rows = sessions.map((s) => [
        s.workDate.toISOString().slice(0, 10),
        s.employee.employeeCode,
        s.employee.user.fullName,
        s.branch.name,
        s.status,
        s.checkInAt?.toISOString() ?? '',
        s.checkOutAt?.toISOString() ?? '',
        s.workedMinutes ?? 0,
        s.overtimeMinutes ?? 0,
        s.lateMinutes ?? 0,
        s.trustScore ?? '',
      ]);

      const csv = stringify([CSV_COLUMNS, ...rows], { bom: true });
      const fileName = `attendance_${branch_id}_${date_from}_${date_to}.csv`;

      await this.prisma.reportExport.update({
        where: { id: reportExportId },
        data: {
          status: 'completed',
          fileName,
          fileContent: csv,
          rowCount: rows.length,
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return { reportExportId, rows: rows.length };
    } catch (err) {
      await this.prisma.reportExport.update({
        where: { id: reportExportId },
        data: {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: { reportExportId: string; rows: number }) {
    this.logger.log(`export ${result.reportExportId} rows=${result.rows} job=${job.id}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`export failed job=${job.id}: ${err.message}`);
  }
}
