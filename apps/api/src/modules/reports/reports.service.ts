import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  JOB_DAILY_SUMMARY_CRON,
  JOB_MISSING_CHECKOUT_CRON,
  JOB_REPORT_EXPORT_RUN,
  QUEUE_DAILY_SUMMARY,
  QUEUE_MISSING_CHECKOUT,
  QUEUE_REPORT_EXPORT,
} from '../queue/queue.constants';
import type { ReportExportJobData } from './processors/report-export.processor';
import type { BranchReportQueryDto, DailySummaryQueryDto } from './dto/daily-summary.dto';
import type { CreateExportDto } from './dto/export.dto';

@Injectable()
export class ReportsService implements OnModuleInit {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_DAILY_SUMMARY) private readonly dailySummaryQueue: Queue,
    @InjectQueue(QUEUE_MISSING_CHECKOUT) private readonly missingCheckoutQueue: Queue,
    @InjectQueue(QUEUE_REPORT_EXPORT) private readonly exportQueue: Queue,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    await this.registerCrons();
  }

  private async registerCrons() {
    // Daily summary — 00:30 every day
    await this.dailySummaryQueue.add(
      JOB_DAILY_SUMMARY_CRON,
      {},
      { repeat: { pattern: '30 0 * * *' }, jobId: JOB_DAILY_SUMMARY_CRON },
    );
    // Missing checkout close — 23:59 every day
    await this.missingCheckoutQueue.add(
      JOB_MISSING_CHECKOUT_CRON,
      {},
      { repeat: { pattern: '59 23 * * *' }, jobId: JOB_MISSING_CHECKOUT_CRON },
    );
    this.logger.log('Scheduled daily-summary 00:30 & missing-checkout 23:59');
  }

  async getDailySummary(
    userId: string,
    isSuperAdmin: boolean,
    dto: DailySummaryQueryDto,
  ) {
    const scopedBranchIds = await this.resolveBranchScope(userId, isSuperAdmin, dto.branch_id);
    const where: any = {};
    if (scopedBranchIds !== null) where.branchId = { in: scopedBranchIds };
    if (dto.branch_id) where.branchId = dto.branch_id;
    if (dto.date_from || dto.date_to) {
      where.workDate = {};
      if (dto.date_from) where.workDate.gte = new Date(dto.date_from);
      if (dto.date_to) where.workDate.lte = new Date(dto.date_to);
    }
    if (dto.department_id) {
      where.employee = { departmentId: dto.department_id };
    }

    const rows = await this.prisma.dailyAttendanceSummary.groupBy({
      by: ['workDate', 'branchId'],
      where,
      _count: { _all: true },
      _sum: { overtimeMinutes: true, workedMinutes: true, lateMinutes: true },
    });

    // Count by status in a second pass
    const statusRows = await this.prisma.dailyAttendanceSummary.groupBy({
      by: ['workDate', 'branchId', 'status'],
      where,
      _count: { _all: true },
    });

    const statusByKey = new Map<string, Record<string, number>>();
    for (const r of statusRows) {
      const key = `${r.workDate.toISOString()}|${r.branchId}`;
      const bucket = statusByKey.get(key) ?? {};
      bucket[r.status] = r._count._all;
      statusByKey.set(key, bucket);
    }

    return {
      data: rows.map((r) => {
        const statuses = statusByKey.get(`${r.workDate.toISOString()}|${r.branchId}`) ?? {};
        const totalWorked = r._sum.workedMinutes ?? 0;
        return {
          work_date: r.workDate.toISOString().slice(0, 10),
          branch_id: r.branchId,
          total_employees: r._count._all,
          on_time: statuses.on_time ?? 0,
          late: statuses.late ?? 0,
          absent: statuses.absent ?? 0,
          avg_worked_minutes: r._count._all ? Math.round(totalWorked / r._count._all) : 0,
          total_overtime_minutes: r._sum.overtimeMinutes ?? 0,
        };
      }),
    };
  }

  async getBranchReport(
    userId: string,
    isSuperAdmin: boolean,
    branchId: string,
    dto: BranchReportQueryDto,
  ) {
    await this.assertBranchAccess(userId, isSuperAdmin, branchId);

    const where: any = { branchId };
    if (dto.date_from || dto.date_to) {
      where.workDate = {};
      if (dto.date_from) where.workDate.gte = new Date(dto.date_from);
      if (dto.date_to) where.workDate.lte = new Date(dto.date_to);
    }

    const [summary, byStatus, branch] = await Promise.all([
      this.prisma.dailyAttendanceSummary.aggregate({
        where,
        _count: { _all: true },
        _sum: { workedMinutes: true, overtimeMinutes: true, lateMinutes: true },
        _avg: { trustScoreAvg: true },
      }),
      this.prisma.dailyAttendanceSummary.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const s of byStatus) statusMap[s.status] = s._count._all;

    return {
      data: {
        branch,
        total_sessions: summary._count._all,
        status_breakdown: statusMap,
        total_worked_minutes: summary._sum.workedMinutes ?? 0,
        total_overtime_minutes: summary._sum.overtimeMinutes ?? 0,
        total_late_minutes: summary._sum.lateMinutes ?? 0,
        avg_trust_score: summary._avg.trustScoreAvg
          ? Math.round(summary._avg.trustScoreAvg)
          : null,
      },
    };
  }

  async createExport(userId: string, isSuperAdmin: boolean, dto: CreateExportDto) {
    await this.assertBranchAccess(userId, isSuperAdmin, dto.branch_id);

    const record = await this.prisma.reportExport.create({
      data: {
        userId,
        type: dto.type,
        params: {
          branch_id: dto.branch_id,
          date_from: dto.date_from,
          date_to: dto.date_to,
        },
        status: 'queued',
      },
    });

    const jobData: ReportExportJobData = {
      reportExportId: record.id,
      type: dto.type,
      branch_id: dto.branch_id,
      date_from: dto.date_from,
      date_to: dto.date_to,
    };
    await this.exportQueue.add(JOB_REPORT_EXPORT_RUN, jobData, { jobId: record.id });

    return { data: { job_id: record.id, status: record.status } };
  }

  async getExportStatus(userId: string, isSuperAdmin: boolean, jobId: string) {
    const record = await this.prisma.reportExport.findUnique({ where: { id: jobId } });
    if (!record) throw new NotFoundException('Export job not found');
    if (!isSuperAdmin && record.userId !== userId) {
      throw new ForbiddenException('Not your export job');
    }
    return {
      data: {
        job_id: record.id,
        status: record.status,
        download_url:
          record.status === 'completed' ? `/api/v1/reports/export/${record.id}/download` : null,
        row_count: record.rowCount,
        error_message: record.errorMessage,
        expires_at: record.expiresAt,
      },
    };
  }

  async getExportFile(userId: string, isSuperAdmin: boolean, jobId: string) {
    const record = await this.prisma.reportExport.findUnique({ where: { id: jobId } });
    if (!record) throw new NotFoundException('Export job not found');
    if (!isSuperAdmin && record.userId !== userId) {
      throw new ForbiddenException('Not your export job');
    }
    if (record.status !== 'completed' || !record.fileContent) {
      throw new NotFoundException('Export not ready');
    }
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('Export expired');
    }
    return {
      fileName: record.fileName ?? `export-${jobId}.csv`,
      content: record.fileContent,
    };
  }

  // ─── Scope helpers ─────────────────────────────────────

  private async resolveBranchScope(
    userId: string,
    isSuperAdmin: boolean,
    requestedBranchId?: string,
  ): Promise<string[] | null> {
    if (isSuperAdmin) return null;
    const managed = await this.prisma.managerBranch.findMany({
      where: { userId },
      select: { branchId: true },
    });
    const ids = managed.map((m) => m.branchId);
    if (requestedBranchId && !ids.includes(requestedBranchId)) {
      throw new ForbiddenException('Branch outside manager scope');
    }
    return ids;
  }

  private async assertBranchAccess(
    userId: string,
    isSuperAdmin: boolean,
    branchId: string,
  ): Promise<void> {
    if (isSuperAdmin) return;
    const mb = await this.prisma.managerBranch.findUnique({
      where: { userId_branchId: { userId, branchId } },
    });
    if (!mb) throw new ForbiddenException('Branch outside manager scope');
  }
}
