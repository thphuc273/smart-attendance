import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceSessionStatus, Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { ALL_TOOL_NAMES, ToolScope } from './tool-definitions';

/** Dispatcher for Gemini function calls. Every handler re-checks scope — the model
 *  can emit out-of-scope calls even when we only advertise allowed tools. */
@Injectable()
export class ToolExecutor {
  constructor(private readonly prisma: PrismaService) {}

  resolveScope(user: AuthenticatedUser): ToolScope {
    if (user.roles.includes(RoleCode.admin)) return 'admin';
    if (user.roles.includes(RoleCode.manager)) return 'manager';
    return 'employee';
  }

  async run(user: AuthenticatedUser, name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!ALL_TOOL_NAMES.has(name)) {
      return { error: 'UNKNOWN_TOOL', tool: name };
    }
    try {
      switch (name) {
        case 'get_my_attendance_stats':
          return await this.getMyStats(user, str(args.date_from), str(args.date_to));
        case 'get_my_recent_sessions':
          return await this.getMyRecentSessions(user, numOrDefault(args.limit, 10, 1, 30));
        case 'get_my_streak':
          return await this.getMyStreak(user);
        case 'get_branch_today_overview':
          return await this.getBranchTodayOverview(user, str(args.branch_id));
        case 'get_branch_attendance_stats':
          return await this.getBranchStats(user, str(args.branch_id), str(args.date_from), str(args.date_to));
        case 'list_late_employees':
          return await this.listLateEmployees(
            user,
            optStr(args.branch_id),
            str(args.date_from),
            str(args.date_to),
            numOrDefault(args.limit, 5, 1, 20),
          );
        case 'list_absent_today':
          return await this.listAbsentToday(user, str(args.branch_id));
        case 'get_system_overview':
          return await this.getSystemOverview(user);
        case 'compare_branches':
          return await this.compareBranches(user, str(args.date_from), str(args.date_to), numOrDefault(args.limit, 10, 1, 20));
        default:
          return { error: 'UNKNOWN_TOOL', tool: name };
      }
    } catch (err) {
      if (err instanceof ForbiddenException || err instanceof NotFoundException || err instanceof BadRequestException) {
        const res = (err as unknown as { response?: { code?: string; message?: string } }).response ?? {};
        return { error: res.code ?? 'TOOL_ERROR', message: res.message ?? (err as Error).message };
      }
      return { error: 'TOOL_INTERNAL_ERROR', message: (err as Error).message };
    }
  }

  // ---------- Self tools ----------

  private async getEmployee(user: AuthenticatedUser) {
    const emp = await this.prisma.employee.findFirst({
      where: { userId: user.id },
      include: { primaryBranch: { select: { id: true, name: true } } },
    });
    if (!emp) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Bạn chưa được gán hồ sơ nhân viên.' });
    return emp;
  }

  private async getMyStats(user: AuthenticatedUser, dateFrom: string, dateTo: string) {
    const emp = await this.getEmployee(user);
    const { gte, lt } = vnRange(dateFrom, dateTo);
    const sessions = await this.prisma.attendanceSession.findMany({
      where: { employeeId: emp.id, checkInAt: { gte, lt } },
      select: { status: true, checkOutAt: true, workedMinutes: true },
    });
    const onTime = sessions.filter((s) => s.status === AttendanceSessionStatus.on_time).length;
    const late = sessions.filter((s) => s.status === AttendanceSessionStatus.late).length;
    const absent = sessions.filter((s) => s.status === AttendanceSessionStatus.absent).length;
    const overtime = sessions.filter((s) => s.status === AttendanceSessionStatus.overtime).length;
    const missingCheckout = sessions.filter((s) => s.checkOutAt === null).length;
    const totalWorkedMinutes = sessions.reduce((acc, s) => acc + (s.workedMinutes ?? 0), 0);
    const total = sessions.length;
    return {
      scope: 'self',
      employee: { code: emp.employeeCode, branch: emp.primaryBranch?.name },
      range: { date_from: dateFrom, date_to: dateTo },
      totals: {
        sessions: total,
        on_time: onTime,
        late,
        absent,
        overtime,
        missing_checkout: missingCheckout,
        on_time_rate_pct: total ? Math.round((onTime / total) * 100) : 0,
        total_worked_hours: Math.round((totalWorkedMinutes / 60) * 10) / 10,
      },
    };
  }

  private async getMyRecentSessions(user: AuthenticatedUser, limit: number) {
    const emp = await this.getEmployee(user);
    const rows = await this.prisma.attendanceSession.findMany({
      where: { employeeId: emp.id },
      orderBy: { checkInAt: 'desc' },
      take: limit,
      include: { branch: { select: { name: true } } },
    });
    return {
      scope: 'self',
      sessions: rows.map((r) => ({
        id: r.id,
        date: r.checkInAt ? r.checkInAt.toISOString().slice(0, 10) : null,
        branch: r.branch?.name ?? null,
        status: r.status,
        check_in_at: r.checkInAt?.toISOString() ?? null,
        check_out_at: r.checkOutAt?.toISOString() ?? null,
        worked_minutes: r.workedMinutes,
        trust_score: r.trustScore,
      })),
    };
  }

  private async getMyStreak(user: AuthenticatedUser) {
    const emp = await this.getEmployee(user);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const rows = await this.prisma.attendanceSession.findMany({
      where: { employeeId: emp.id, checkInAt: { gte: since } },
      select: { status: true, checkInAt: true },
      orderBy: { checkInAt: 'desc' },
    });
    let current = 0;
    for (const r of rows) {
      if (r.status === AttendanceSessionStatus.on_time) current++;
      else break;
    }
    const onTimeCount = rows.filter((r) => r.status === AttendanceSessionStatus.on_time).length;
    return {
      scope: 'self',
      current_streak: current,
      on_time_rate_30d_pct: rows.length ? Math.round((onTimeCount / rows.length) * 100) : 0,
      sessions_30d: rows.length,
    };
  }

  // ---------- Branch tools ----------

  private assertBranchAccess(user: AuthenticatedUser, branchId: string) {
    if (user.roles.includes(RoleCode.admin)) return;
    if (user.roles.includes(RoleCode.manager) && user.managedBranchIds.includes(branchId)) return;
    throw new ForbiddenException({ code: 'BRANCH_OUT_OF_SCOPE', message: 'Bạn không có quyền xem chi nhánh này.' });
  }

  private async getBranchTodayOverview(user: AuthenticatedUser, branchId: string) {
    this.assertBranchAccess(user, branchId);
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } });
    if (!branch) throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Chi nhánh không tồn tại.' });
    const { gte, lt } = vnRange(todayVnDateStr(), todayVnDateStr());
    const sessions = await this.prisma.attendanceSession.findMany({
      where: { branchId, checkInAt: { gte, lt } },
      select: { status: true, checkOutAt: true },
    });
    return {
      branch: { id: branch.id, name: branch.name },
      today: summarize(sessions),
    };
  }

  private async getBranchStats(user: AuthenticatedUser, branchId: string, dateFrom: string, dateTo: string) {
    this.assertBranchAccess(user, branchId);
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } });
    if (!branch) throw new NotFoundException({ code: 'BRANCH_NOT_FOUND' });
    const { gte, lt } = vnRange(dateFrom, dateTo);
    const sessions = await this.prisma.attendanceSession.findMany({
      where: { branchId, checkInAt: { gte, lt } },
      select: { status: true, checkOutAt: true },
    });
    return {
      branch: { id: branch.id, name: branch.name },
      range: { date_from: dateFrom, date_to: dateTo },
      totals: summarize(sessions),
    };
  }

  private async listLateEmployees(
    user: AuthenticatedUser,
    branchId: string | undefined,
    dateFrom: string,
    dateTo: string,
    limit: number,
  ) {
    let branchFilter: Prisma.AttendanceSessionWhereInput = {};
    if (branchId) {
      this.assertBranchAccess(user, branchId);
      branchFilter = { branchId };
    } else if (user.roles.includes(RoleCode.admin)) {
      branchFilter = {};
    } else if (user.roles.includes(RoleCode.manager)) {
      if (!user.managedBranchIds.length)
        return { range: { date_from: dateFrom, date_to: dateTo }, late: [] };
      branchFilter = { branchId: { in: user.managedBranchIds } };
    } else {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSION' });
    }
    const { gte, lt } = vnRange(dateFrom, dateTo);
    const rows = await this.prisma.attendanceSession.groupBy({
      by: ['employeeId'],
      where: { ...branchFilter, checkInAt: { gte, lt }, status: AttendanceSessionStatus.late },
      _count: { _all: true },
      orderBy: { _count: { employeeId: 'desc' } },
      take: limit,
    });
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: rows.map((r) => r.employeeId) } },
      include: { user: { select: { fullName: true } }, primaryBranch: { select: { name: true } } },
    });
    return {
      range: { date_from: dateFrom, date_to: dateTo },
      late: rows.map((r) => {
        const emp = employees.find((e) => e.id === r.employeeId);
        return {
          employee_code: emp?.employeeCode ?? null,
          name: emp?.user.fullName ?? '—',
          branch: emp?.primaryBranch?.name ?? '—',
          late_count: r._count._all,
        };
      }),
    };
  }

  private async listAbsentToday(user: AuthenticatedUser, branchId: string) {
    this.assertBranchAccess(user, branchId);
    const { gte, lt } = vnRange(todayVnDateStr(), todayVnDateStr());
    const employees = await this.prisma.employee.findMany({
      where: { primaryBranchId: branchId, employmentStatus: 'active' },
      include: { user: { select: { fullName: true } } },
    });
    const checkedIn = new Set(
      (
        await this.prisma.attendanceSession.findMany({
          where: { branchId, checkInAt: { gte, lt } },
          select: { employeeId: true },
        })
      ).map((r) => r.employeeId),
    );
    const absent = employees.filter((e) => !checkedIn.has(e.id));
    return {
      branch_id: branchId,
      total_employees: employees.length,
      absent_count: absent.length,
      absent: absent.slice(0, 20).map((e) => ({
        employee_code: e.employeeCode,
        name: e.user.fullName,
      })),
    };
  }

  // ---------- Admin tools ----------

  private assertAdmin(user: AuthenticatedUser) {
    if (!user.roles.includes(RoleCode.admin))
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSION', message: 'Chỉ admin được dùng tool này.' });
  }

  private async getSystemOverview(user: AuthenticatedUser) {
    this.assertAdmin(user);
    const { gte: todayFrom, lt: todayTo } = vnRange(todayVnDateStr(), todayVnDateStr());
    const weekFromStr = shiftVnDateStr(todayVnDateStr(), -6);
    const { gte: weekFrom } = vnRange(weekFromStr, weekFromStr);
    const [employees, branches, today, week] = await Promise.all([
      this.prisma.employee.count({ where: { employmentStatus: 'active' } }),
      this.prisma.branch.count(),
      this.prisma.attendanceSession.findMany({
        where: { checkInAt: { gte: todayFrom, lt: todayTo } },
        select: { status: true, checkOutAt: true },
      }),
      this.prisma.attendanceSession.findMany({
        where: { checkInAt: { gte: weekFrom, lt: todayTo } },
        select: { status: true, checkOutAt: true },
      }),
    ]);
    return {
      totals: { employees, branches },
      today: summarize(today),
      last_7_days: summarize(week),
    };
  }

  private async compareBranches(user: AuthenticatedUser, dateFrom: string, dateTo: string, limit: number) {
    this.assertAdmin(user);
    const { gte, lt } = vnRange(dateFrom, dateTo);
    const rows = await this.prisma.attendanceSession.groupBy({
      by: ['branchId', 'status'],
      where: { checkInAt: { gte, lt } },
      _count: { _all: true },
    });
    const perBranch: Record<string, { total: number; onTime: number; late: number }> = {};
    for (const r of rows) {
      const b = (perBranch[r.branchId] ??= { total: 0, onTime: 0, late: 0 });
      b.total += r._count._all;
      if (r.status === AttendanceSessionStatus.on_time) b.onTime += r._count._all;
      if (r.status === AttendanceSessionStatus.late) b.late += r._count._all;
    }
    const branchIds = Object.keys(perBranch);
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    });
    const ranked = branches
      .map((b) => {
        const x = perBranch[b.id];
        return {
          branch_id: b.id,
          name: b.name,
          sessions: x.total,
          late: x.late,
          on_time_rate_pct: x.total ? Math.round((x.onTime / x.total) * 100) : 0,
        };
      })
      .filter((r) => r.sessions > 0);
    ranked.sort((a, b) => b.on_time_rate_pct - a.on_time_rate_pct);
    const best = ranked.slice(0, limit);
    const worst = [...ranked].reverse().slice(0, limit);
    return { range: { date_from: dateFrom, date_to: dateTo }, best, worst };
  }
}

// ---------- helpers ----------

function str(v: unknown): string {
  if (typeof v !== 'string' || !v) throw new BadRequestException({ code: 'TOOL_ARG_MISSING' });
  return v;
}
function optStr(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function numOrDefault(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Convert a VN-local YYYY-MM-DD date range into a UTC half-open interval. */
function vnRange(dateFrom: string, dateTo: string): { gte: Date; lt: Date } {
  const [fy, fm, fd] = dateFrom.split('-').map(Number);
  const [ty, tm, td] = dateTo.split('-').map(Number);
  // VN is UTC+7 → VN 00:00 = UTC previous 17:00.
  const gte = new Date(Date.UTC(fy, fm - 1, fd, -7, 0, 0));
  const lt = new Date(Date.UTC(ty, tm - 1, td + 1, -7, 0, 0));
  return { gte, lt };
}

function todayVnDateStr(): string {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600 * 1000);
  return vn.toISOString().slice(0, 10);
}

function shiftVnDateStr(base: string, deltaDays: number): string {
  const [y, m, d] = base.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return shifted.toISOString().slice(0, 10);
}

function summarize(sessions: Array<{ status: AttendanceSessionStatus; checkOutAt: Date | null }>) {
  const total = sessions.length;
  const onTime = sessions.filter((s) => s.status === AttendanceSessionStatus.on_time).length;
  const late = sessions.filter((s) => s.status === AttendanceSessionStatus.late).length;
  const absent = sessions.filter((s) => s.status === AttendanceSessionStatus.absent).length;
  const overtime = sessions.filter((s) => s.status === AttendanceSessionStatus.overtime).length;
  const missing = sessions.filter((s) => s.checkOutAt === null).length;
  return {
    sessions: total,
    on_time: onTime,
    late,
    absent,
    overtime,
    missing_checkout: missing,
    on_time_rate_pct: total ? Math.round((onTime / total) * 100) : 0,
  };
}
