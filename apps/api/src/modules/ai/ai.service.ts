import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AiChatRole, AiInsightScope, AttendanceSessionStatus, RoleCode } from '@prisma/client';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { GeminiClient, GeminiMessage } from './gemini.client';
import { InsightPromptBuilder, InsightStats } from './insight-prompt.builder';
import {
  AdminContext,
  ChatContext,
  ChatContextBuilder,
  EmployeeContext,
  ManagerContext,
} from './chat-context.builder';

const INSIGHT_TTL_MS = 60 * 60 * 1000;

function mondayUtc(date: Date): Date {
  const vnMs = date.getTime() + 7 * 3600 * 1000;
  const vn = new Date(vnMs);
  const dow = vn.getUTCDay();
  const deltaDays = (dow + 6) % 7;
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() - deltaDays));
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiClient,
    private readonly insightBuilder: InsightPromptBuilder,
    private readonly chatContext: ChatContextBuilder,
  ) {}

  // ---------- Insights ----------

  async getWeeklyInsights(
    user: AuthenticatedUser,
    branchId?: string,
    weekStartInput?: string,
  ) {
    const isAdmin = user.roles.includes(RoleCode.admin);
    const isManager = user.roles.includes(RoleCode.manager);
    if (!isAdmin && !isManager) throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSION' });

    let scope: AiInsightScope;
    let scopeId: string | null = null;
    let scopeLabel: string;

    if (branchId) {
      if (!isAdmin && !user.managedBranchIds.includes(branchId)) {
        throw new ForbiddenException({ code: 'BRANCH_OUT_OF_SCOPE' });
      }
      const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch) throw new NotFoundException({ code: 'BRANCH_NOT_FOUND' });
      scope = AiInsightScope.branch;
      scopeId = branchId;
      scopeLabel = `Chi nhánh ${branch.name}`;
    } else {
      if (!isAdmin) throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSION' });
      scope = AiInsightScope.admin;
      scopeLabel = 'Toàn hệ thống';
    }

    const weekStart = weekStartInput ? new Date(weekStartInput + 'T00:00:00Z') : mondayUtc(new Date());
    const weekEnd = addDays(weekStart, 6);

    const cached = await this.prisma.aiInsightCache.findUnique({
      where: { scope_scopeId_weekStart: { scope, scopeId, weekStart } as never },
    });
    if (cached && cached.expiresAt > new Date()) {
      return {
        cached: true,
        generated_at: cached.generatedAt,
        week_start: weekStart.toISOString().slice(0, 10),
        week_end: weekEnd.toISOString().slice(0, 10),
        scope,
        scope_id: scopeId,
        payload: cached.payload,
      };
    }

    const stats = await this.buildStats(scope, scopeId, weekStart, weekEnd, scopeLabel);
    const prompt = this.insightBuilder.build(stats);
    const messages: GeminiMessage[] = [{ role: 'user', content: prompt }];
    const result = await this.gemini.generate(messages);

    let payload: unknown;
    try {
      payload = JSON.parse(result.text);
    } catch {
      payload = { summary: result.text, highlights: [], recommendations: [], anomalies: [] };
    }

    const expiresAt = new Date(Date.now() + INSIGHT_TTL_MS);
    await this.prisma.aiInsightCache.upsert({
      where: { scope_scopeId_weekStart: { scope, scopeId, weekStart } as never },
      create: { scope, scopeId, weekStart, payload: payload as never, expiresAt },
      update: { payload: payload as never, generatedAt: new Date(), expiresAt },
    });

    return {
      cached: false,
      stub: result.stub,
      generated_at: new Date(),
      week_start: weekStart.toISOString().slice(0, 10),
      week_end: weekEnd.toISOString().slice(0, 10),
      scope,
      scope_id: scopeId,
      payload,
    };
  }

  private async buildStats(
    scope: AiInsightScope,
    scopeId: string | null,
    weekStart: Date,
    weekEnd: Date,
    scopeLabel: string,
  ): Promise<InsightStats> {
    const branchFilter = scope === AiInsightScope.branch && scopeId ? { branchId: scopeId } : {};
    const weekRange = { gte: weekStart, lte: addDays(weekEnd, 1) };

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { ...branchFilter, checkInAt: weekRange },
      select: { status: true, checkOutAt: true },
    });

    const totalSessions = sessions.length;
    const onTime = sessions.filter((s) => s.status === AttendanceSessionStatus.on_time).length;
    const late = sessions.filter((s) => s.status === AttendanceSessionStatus.late).length;
    const missingCheckout = sessions.filter((s) => s.checkOutAt === null).length;

    const employees = await this.prisma.employee.count({
      where: scope === AiInsightScope.branch && scopeId ? { primaryBranchId: scopeId } : {},
    });

    const prevWeekStart = addDays(weekStart, -7);
    const prevWeekEnd = addDays(weekStart, -1);
    const prevSessions = await this.prisma.attendanceSession.count({
      where: { ...branchFilter, checkInAt: { gte: prevWeekStart, lte: addDays(prevWeekEnd, 1) }, status: AttendanceSessionStatus.late },
    });
    const lateTrendPct = prevSessions === 0 ? null : Math.round(((late - prevSessions) / prevSessions) * 100);

    const topLateRaw = await this.prisma.attendanceSession.groupBy({
      by: ['employeeId'],
      where: { ...branchFilter, checkInAt: weekRange, status: AttendanceSessionStatus.late },
      _count: { _all: true },
      orderBy: { _count: { employeeId: 'desc' } },
      take: 3,
    });
    const topEmployees = await this.prisma.employee.findMany({
      where: { id: { in: topLateRaw.map((r) => r.employeeId) } },
      select: { id: true, user: { select: { fullName: true } } },
    });
    const topLateEmployees = topLateRaw.map((r) => ({
      name: topEmployees.find((e) => e.id === r.employeeId)?.user.fullName ?? '—',
      lateCount: r._count._all,
    }));

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      scopeLabel,
      totalEmployees: employees,
      totalSessions,
      onTime,
      late,
      missingCheckout,
      absentWithLeave: 0,
      absentNoLeave: 0,
      lateTrendPct,
      topLateEmployees,
    };
  }

  // ---------- Chat ----------

  async getChatHistory(user: AuthenticatedUser, limit = 50) {
    const rows = await this.prisma.aiChatMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
    return rows.reverse().map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      created_at: r.createdAt,
    }));
  }

  chatStream(user: AuthenticatedUser, message: string): Observable<MessageEvent<unknown>> {
    return new Observable<MessageEvent<unknown>>((subscriber) => {
      let closed = false;
      const run = async () => {
        try {
          const ctx = await this.buildContextForUser(user);
          const history = await this.prisma.aiChatMessage.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
          });
          const messages: GeminiMessage[] = [
            { role: 'system', content: this.chatContext.buildSystemPrompt(ctx) },
            ...history
              .reverse()
              .map((m) => ({ role: m.role === AiChatRole.assistant ? 'model' : 'user', content: m.content }) as GeminiMessage),
            { role: 'user', content: message },
          ];

          await this.prisma.aiChatMessage.create({
            data: { userId: user.id, role: AiChatRole.user, content: message },
          });

          let full = '';
          for await (const chunk of this.gemini.stream(messages)) {
            if (closed) return;
            full += chunk;
            subscriber.next({ data: { delta: chunk } } as MessageEvent);
          }

          await this.prisma.aiChatMessage.create({
            data: { userId: user.id, role: AiChatRole.assistant, content: full },
          });

          subscriber.next({ data: { done: true }, type: 'done' } as MessageEvent);
          subscriber.complete();
        } catch (err) {
          subscriber.next({
            data: { error: (err as Error).message ?? 'AI_UPSTREAM_ERROR' },
            type: 'error',
          } as MessageEvent);
          subscriber.complete();
        }
      };
      run();
      return () => {
        closed = true;
      };
    });
  }

  private async buildContextForUser(user: AuthenticatedUser): Promise<ChatContext> {
    const isAdmin = user.roles.includes(RoleCode.admin);
    const isManager = user.roles.includes(RoleCode.manager);
    if (isAdmin) return this.buildAdminContext(user);
    if (isManager) return this.buildManagerContext(user);
    return this.buildEmployeeContext(user);
  }

  private async buildEmployeeContext(user: AuthenticatedUser): Promise<EmployeeContext> {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: user.id },
      include: { primaryBranch: { select: { name: true } }, user: { select: { fullName: true } } },
    });
    if (!employee) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND' });

    const since = new Date(Date.now() - 7 * 86_400_000);
    const sessions = await this.prisma.attendanceSession.findMany({
      where: { employeeId: employee.id, checkInAt: { gte: since } },
      select: { status: true, checkOutAt: true },
    });

    return {
      scope: 'employee',
      userFullName: employee.user.fullName,
      employeeId: employee.id,
      primaryBranchName: employee.primaryBranch?.name ?? null,
      recent7Days: {
        sessions: sessions.length,
        onTime: sessions.filter((s) => s.status === AttendanceSessionStatus.on_time).length,
        late: sessions.filter((s) => s.status === AttendanceSessionStatus.late).length,
        missingCheckout: sessions.filter((s) => s.checkOutAt === null).length,
      },
      upcomingShifts: [],
      remainingLeaveDays: null,
    };
  }

  private async buildManagerContext(user: AuthenticatedUser): Promise<ManagerContext> {
    const branchIds = user.managedBranchIds;
    const branches = branchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, name: true },
        })
      : [];

    const todayStart = startOfVNToday();
    const todayEnd = addDays(todayStart, 1);
    const weekAgo = addDays(todayStart, -6);

    const filter = { branchId: { in: branchIds.length ? branchIds : ['00000000-0000-0000-0000-000000000000'] } };

    const [todaySessions, weekSessions] = await Promise.all([
      this.prisma.attendanceSession.findMany({
        where: { ...filter, checkInAt: { gte: todayStart, lt: todayEnd } },
        select: { status: true, checkOutAt: true },
      }),
      this.prisma.attendanceSession.findMany({
        where: { ...filter, checkInAt: { gte: weekAgo, lt: todayEnd } },
        select: { status: true },
      }),
    ]);

    const topLateRaw = await this.prisma.attendanceSession.groupBy({
      by: ['employeeId'],
      where: { ...filter, checkInAt: { gte: weekAgo, lt: todayEnd }, status: AttendanceSessionStatus.late },
      _count: { _all: true },
      orderBy: { _count: { employeeId: 'desc' } },
      take: 5,
    });
    const topEmps = await this.prisma.employee.findMany({
      where: { id: { in: topLateRaw.map((r) => r.employeeId) } },
      include: { user: { select: { fullName: true } }, primaryBranch: { select: { name: true } } },
    });

    const userRecord = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true },
    });

    return {
      scope: 'manager',
      userFullName: userRecord?.fullName ?? user.email,
      managedBranches: branches,
      today: countToday(todaySessions),
      last7Days: countWeek(weekSessions),
      topLate: topLateRaw.map((r) => {
        const emp = topEmps.find((e) => e.id === r.employeeId);
        return {
          name: emp?.user.fullName ?? '—',
          branchName: emp?.primaryBranch?.name ?? '—',
          lateCount: r._count._all,
        };
      }),
    };
  }

  private async buildAdminContext(user: AuthenticatedUser): Promise<AdminContext> {
    const todayStart = startOfVNToday();
    const todayEnd = addDays(todayStart, 1);
    const weekAgo = addDays(todayStart, -6);

    const [employees, branches, todaySessions, weekSessions, topLateBranches] = await Promise.all([
      this.prisma.employee.count(),
      this.prisma.branch.count(),
      this.prisma.attendanceSession.findMany({
        where: { checkInAt: { gte: todayStart, lt: todayEnd } },
        select: { status: true, checkOutAt: true },
      }),
      this.prisma.attendanceSession.findMany({
        where: { checkInAt: { gte: weekAgo, lt: todayEnd } },
        select: { status: true },
      }),
      this.prisma.attendanceSession.groupBy({
        by: ['branchId'],
        where: { checkInAt: { gte: weekAgo, lt: todayEnd }, status: AttendanceSessionStatus.late },
        _count: { _all: true },
        orderBy: { _count: { branchId: 'desc' } },
        take: 5,
      }),
    ]);

    const branchRecords = await this.prisma.branch.findMany({
      where: { id: { in: topLateBranches.map((r) => r.branchId) } },
      select: { id: true, name: true },
    });
    const userRecord = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true },
    });

    return {
      scope: 'admin',
      userFullName: userRecord?.fullName ?? user.email,
      totals: { employees, branches },
      today: countToday(todaySessions),
      last7Days: countWeek(weekSessions),
      topLateBranches: topLateBranches.map((r) => ({
        name: branchRecords.find((b) => b.id === r.branchId)?.name ?? '—',
        lateCount: r._count._all,
      })),
    };
  }
}

function startOfVNToday(): Date {
  const nowMs = Date.now() + 7 * 3600 * 1000;
  const vn = new Date(nowMs);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600 * 1000);
}

function countToday(sessions: Array<{ status: AttendanceSessionStatus; checkOutAt: Date | null }>) {
  return {
    sessions: sessions.length,
    onTime: sessions.filter((s) => s.status === AttendanceSessionStatus.on_time).length,
    late: sessions.filter((s) => s.status === AttendanceSessionStatus.late).length,
    missingCheckout: sessions.filter((s) => s.checkOutAt === null).length,
    absent: sessions.filter((s) => s.status === AttendanceSessionStatus.absent).length,
  };
}

function countWeek(sessions: Array<{ status: AttendanceSessionStatus }>) {
  const total = sessions.length;
  const onTime = sessions.filter((s) => s.status === AttendanceSessionStatus.on_time).length;
  const late = sessions.filter((s) => s.status === AttendanceSessionStatus.late).length;
  return {
    sessions: total,
    onTime,
    late,
    onTimeRatePct: total ? Math.round((onTime / total) * 100) : 0,
  };
}
