import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const VIETNAM_TZ = 'Asia/Ho_Chi_Minh';

/** UTC-midnight Date that represents today in VN calendar (UTC+7). */
function todayInVN(): Date {
  const nowMs = Date.now() + 7 * 3600 * 1000;
  const vn = new Date(nowMs);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminOverview() {
    // VN calendar day — independent of server TZ. daily_attendance_summaries
    // is populated by cron 00:30 so it's empty on fresh DB / before cron runs.
    // Source of truth for TODAY = attendanceSession directly; summary is for
    // historical dashboards only.
    const today = todayInVN();
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const [totalActiveEmployees, totalActiveBranches, todaySessions, heatmapRows] = await Promise.all([
      this.prisma.employee.count({ where: { employmentStatus: 'active' } }),
      this.prisma.branch.count({ where: { status: 'active' } }),
      this.prisma.attendanceSession.findMany({
        where: { workDate: today },
        include: { branch: { select: { id: true, name: true } } },
      }),
      // Aggregate heatmap in DB — single scan via index (status, created_at)
      this.prisma.$queryRaw<{ hour: number; count: bigint }[]>`
        SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE ${VIETNAM_TZ}))::int AS hour,
               COUNT(*) AS count
        FROM attendance_events
        WHERE event_type = 'check_in'
          AND status = 'success'
          AND created_at >= ${today}
          AND created_at < ${tomorrow}
        GROUP BY hour
        ORDER BY hour
      `,
    ]);

    // Aggregate today — checkedIn = has non-null checkInAt
    let checkedIn = 0;
    let onTime = 0;
    let late = 0;
    let absent = 0;

    const branchStats: Record<string, { id: string; name: string; total: number; onTime: number; late: number }> = {};

    todaySessions.forEach((s) => {
      if (s.checkInAt) checkedIn++;
      if (s.status === 'on_time') onTime++;
      else if (s.status === 'late' || s.status === 'overtime' || s.status === 'early_leave' || s.status === 'missing_checkout') late++;
      else if (s.status === 'absent') absent++;

      if (!branchStats[s.branchId]) {
        branchStats[s.branchId] = { id: s.branch.id, name: s.branch.name, total: 0, onTime: 0, late: 0 };
      }
      branchStats[s.branchId].total++;
      if (s.status === 'on_time') branchStats[s.branchId].onTime++;
      if (s.status === 'late') branchStats[s.branchId].late++;
    });

    // Top branches on time
    const topBranchesOnTime = Object.values(branchStats)
      .filter((b) => b.total >= 5) // At least 5 employees to be considered
      .map((b) => ({ branch_id: b.id, name: b.name, rate: b.onTime / b.total }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);

    // Top branches late
    const topBranchesLate = Object.values(branchStats)
      .map((b) => ({ branch_id: b.id, name: b.name, late_count: b.late }))
      .sort((a, b) => b.late_count - a.late_count)
      .filter((b) => b.late_count > 0)
      .slice(0, 5);

    const checkinHeatmap = heatmapRows
      .map((r) => ({ hour: r.hour, count: Number(r.count) }))
      .filter((h) => h.count > 0);

    return {
      total_employees: totalActiveEmployees,
      total_branches: totalActiveBranches,
      today: {
        checked_in: checkedIn,
        on_time: onTime,
        late: late,
        absent: absent,
        on_time_rate: checkedIn > 0 ? onTime / checkedIn : 0,
      },
      top_branches_on_time: topBranchesOnTime,
      top_branches_late: topBranchesLate,
      checkin_heatmap: checkinHeatmap,
    };
  }

  async getManagerBranchDashboard(branchId: string, managerUserId: string, isSuperAdmin: boolean) {
    if (!isSuperAdmin) {
      const managed = await this.prisma.managerBranch.findUnique({
        where: { userId_branchId: { userId: managerUserId, branchId } },
      });
      if (!managed) throw new NotFoundException('Branch not found or outside your scope');
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const today = todayInVN();
    const weekAgo = new Date(today);
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

    const [branchEmployees, todaySessions, lowTrustToday, weekSummaries] = await Promise.all([
      this.prisma.employee.count({
        where: { primaryBranchId: branchId, employmentStatus: 'active' },
      }),
      this.prisma.attendanceSession.findMany({
        where: { branchId, workDate: today },
      }),
      this.prisma.attendanceSession.findMany({
        where: {
          branchId,
          workDate: today,
          trustScore: { lt: 50, not: null }, // Under 50 is low trust
        },
        include: {
          employee: { select: { employeeCode: true, user: { select: { fullName: true } } } },
          events: {
            where: { status: 'success' },
            select: { riskFlags: true },
          },
        },
      }),
      this.prisma.dailyAttendanceSummary.findMany({
        where: {
          branchId,
          workDate: { gte: weekAgo, lt: today },
        },
        select: { workDate: true, status: true },
      }),
    ]);

    // Aggregate today
    let checkedIn = 0;
    let onTime = 0;
    let late = 0;
    let absentCount = 0;
    let notYet = branchEmployees - todaySessions.length;

    todaySessions.forEach((s) => {
      checkedIn++;
      if (s.status === 'on_time') onTime++;
      else if (s.status === 'late') late++;
      else if (s.status === 'absent') absentCount++;
    });

    // Low trust mapping
    const lowTrustMap = lowTrustToday.map((s) => {
      // Flatten all risk flags from success events
      const allFlags = new Set<string>();
      s.events.forEach((ev) => {
        if (Array.isArray(ev.riskFlags)) {
          ev.riskFlags.forEach((flag: string) => allFlags.add(flag));
        }
      });

      return {
        session_id: s.id,
        employee: {
          code: s.employee.employeeCode,
          name: s.employee.user.fullName,
        },
        trust_score: s.trustScore,
        risk_flags: Array.from(allFlags),
      };
    });

    // Week trend
    const trendMap: Record<string, { total: number; onTime: number }> = {};
    for (let d = 1; d <= 7; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      trendMap[date.toISOString().split('T')[0]] = { total: 0, onTime: 0 };
    }

    weekSummaries.forEach((s) => {
      const dateStr = s.workDate.toISOString().split('T')[0];
      if (trendMap[dateStr]) {
        trendMap[dateStr].total++;
        if (s.status === 'on_time') trendMap[dateStr].onTime++;
      }
    });

    const weekTrend = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        on_time_rate: stats.total > 0 ? stats.onTime / stats.total : 0,
      }));

    return {
      branch: { id: branch.id, name: branch.name },
      today: {
        total: branchEmployees,
        checked_in: checkedIn,
        not_yet: notYet > 0 ? notYet : 0,
        absent: absentCount,
        on_time: onTime,
        late: late,
      },
      low_trust_today: lowTrustMap,
      week_trend: weekTrend,
    };
  }

  async getAnomalies(managerUserId: string, isSuperAdmin: boolean) {
    const today = todayInVN();
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const weekAgo = new Date(today);
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

    let scopedBranchIds: string[] | null = null;
    if (!isSuperAdmin) {
      const managed = await this.prisma.managerBranch.findMany({
        where: { userId: managerUserId },
        select: { branchId: true },
      });
      scopedBranchIds = managed.map((m) => m.branchId);
      if (scopedBranchIds.length === 0) {
        return {
          branches_late_spike: [],
          employees_low_trust: [],
          untrusted_devices_new_today: 0,
        };
      }
    }

    const branchFilter = scopedBranchIds ? { branchId: { in: scopedBranchIds } } : {};

    // 1. Branches: today's late_rate vs 7-day avg (spike when ratio > 2x)
    const [todayByBranch, weekByBranch, branches] = await Promise.all([
      this.prisma.dailyAttendanceSummary.groupBy({
        by: ['branchId', 'status'],
        where: { workDate: today, ...branchFilter },
        _count: { _all: true },
      }),
      this.prisma.dailyAttendanceSummary.groupBy({
        by: ['branchId', 'status'],
        where: {
          workDate: { gte: weekAgo, lt: today },
          ...branchFilter,
        },
        _count: { _all: true },
      }),
      this.prisma.branch.findMany({
        where: scopedBranchIds ? { id: { in: scopedBranchIds } } : {},
        select: { id: true, name: true },
      }),
    ]);

    type Agg = { total: number; late: number };
    const aggByBranch = (rows: typeof todayByBranch): Map<string, Agg> => {
      const map = new Map<string, Agg>();
      for (const r of rows) {
        const bucket = map.get(r.branchId) ?? { total: 0, late: 0 };
        bucket.total += r._count._all;
        if (r.status === 'late') bucket.late += r._count._all;
        map.set(r.branchId, bucket);
      }
      return map;
    };

    const todayAgg = aggByBranch(todayByBranch);
    const weekAgg = aggByBranch(weekByBranch);
    const branchById = new Map(branches.map((b) => [b.id, b]));

    const branchesLateSpike = Array.from(todayAgg.entries())
      .map(([branchId, td]) => {
        const wk = weekAgg.get(branchId);
        const lateRateToday = td.total > 0 ? td.late / td.total : 0;
        const lateRateAvg7d = wk && wk.total > 0 ? wk.late / wk.total : 0;
        const spikeRatio = lateRateAvg7d > 0 ? lateRateToday / lateRateAvg7d : lateRateToday > 0 ? Infinity : 0;
        return {
          branch_id: branchId,
          name: branchById.get(branchId)?.name ?? 'Unknown',
          late_rate_today: Number(lateRateToday.toFixed(3)),
          late_rate_avg_7d: Number(lateRateAvg7d.toFixed(3)),
          spike_ratio: Number.isFinite(spikeRatio) ? Number(spikeRatio.toFixed(2)) : null,
        };
      })
      .filter(
        (b) =>
          b.late_rate_today >= 0.05 &&
          (b.spike_ratio === null || (b.spike_ratio !== null && b.spike_ratio >= 2)),
      )
      .sort((a, b) => (b.spike_ratio ?? 99) - (a.spike_ratio ?? 99))
      .slice(0, 10);

    // 2. Employees with ≥3 low-trust sessions in last 7 days
    const lowTrustSessions = await this.prisma.attendanceSession.groupBy({
      by: ['employeeId'],
      where: {
        workDate: { gte: weekAgo, lt: tomorrow },
        trustScore: { lt: 40, not: null },
        ...(scopedBranchIds ? { branchId: { in: scopedBranchIds } } : {}),
      },
      _count: { _all: true },
      having: { employeeId: { _count: { gte: 3 } } },
    });

    const lowTrustEmployees = lowTrustSessions.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: lowTrustSessions.map((s) => s.employeeId) } },
          select: { id: true, employeeCode: true },
        })
      : [];
    const employeeById = new Map(lowTrustEmployees.map((e) => [e.id, e]));

    const employeesLowTrust = lowTrustSessions
      .map((s) => ({
        employee_id: s.employeeId,
        code: employeeById.get(s.employeeId)?.employeeCode ?? 'unknown',
        low_trust_count_7d: s._count._all,
      }))
      .sort((a, b) => b.low_trust_count_7d - a.low_trust_count_7d)
      .slice(0, 20);

    // 3. New untrusted devices today (within scope)
    const untrustedDevicesNewToday = await this.prisma.employeeDevice.count({
      where: {
        isTrusted: false,
        createdAt: { gte: today, lt: tomorrow },
        ...(scopedBranchIds
          ? { employee: { primaryBranchId: { in: scopedBranchIds } } }
          : {}),
      },
    });

    return {
      branches_late_spike: branchesLateSpike,
      employees_low_trust: employeesLowTrust,
      untrusted_devices_new_today: untrustedDevicesNewToday,
    };
  }
}
