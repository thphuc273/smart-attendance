import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminOverview() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalActiveEmployees, totalActiveBranches, todaySummaries, heatmaps] = await Promise.all([
      // Total active employees
      this.prisma.employee.count({
        where: { employmentStatus: 'active' },
      }),
      // Total active branches
      this.prisma.branch.count({
        where: { status: 'active' },
      }),
      // Today stats
      this.prisma.dailyAttendanceSummary.findMany({
        where: { workDate: today },
        include: { branch: { select: { id: true, name: true } } },
      }),
      // Heatmap (check-in events today)
      this.prisma.attendanceEvent.findMany({
        where: {
          eventType: 'check_in',
          status: 'success',
          createdAt: { gte: today },
        },
        select: { createdAt: true },
      }),
    ]);

    // Aggregate today
    let checkedIn = 0;
    let onTime = 0;
    let late = 0;
    let absent = 0;

    // Branches stats
    const branchStats: Record<string, { id: string; name: string; total: number; onTime: number; late: number }> = {};

    todaySummaries.forEach((s) => {
      checkedIn++;
      if (s.status === 'on_time') onTime++;
      else if (s.status === 'late') late++;
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

    // Prepare heatmap
    const heatmapData: Record<number, number> = {};
    for (let i = 0; i < 24; i++) heatmapData[i] = 0;

    heatmaps.forEach((event) => {
      // Vietnam timezone is UTC+7, simple approach:
      const hour = (event.createdAt.getUTCHours() + 7) % 24;
      heatmapData[hour]++;
    });

    const checkinHeatmap = Object.entries(heatmapData).map(([hour, count]) => ({
      hour: parseInt(hour, 10),
      count,
    })).filter(h => h.count > 0);

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 7 days ago
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

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
}
