import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AiChatRole, AiInsightScope, AttendanceSessionStatus, RoleCode } from '@prisma/client';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { GeminiClient, GeminiContent, GeminiMessage, GeminiPart } from './gemini.client';
import { InsightPromptBuilder, InsightStats } from './insight-prompt.builder';
import { ChatContextBuilder, ChatIdentity } from './chat-context.builder';
import { ToolExecutor } from './tools/tool-executor';
import { toolsForScope, ToolScope } from './tools/tool-definitions';

const INSIGHT_TTL_MS = 60 * 60 * 1000;
const MAX_TOOL_ITERATIONS = 6;

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

function vnTodayString(): string {
  const vn = new Date(Date.now() + 7 * 3600 * 1000);
  return vn.toISOString().slice(0, 10);
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiClient,
    private readonly insightBuilder: InsightPromptBuilder,
    private readonly chatContext: ChatContextBuilder,
    private readonly toolExecutor: ToolExecutor,
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

    const cached = await this.prisma.aiInsightCache.findFirst({
      where: { scope, scopeId, weekStart },
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
    if (cached) {
      await this.prisma.aiInsightCache.update({
        where: { id: cached.id },
        data: { payload: payload as never, generatedAt: new Date(), expiresAt },
      });
    } else {
      await this.prisma.aiInsightCache.create({
        data: { scope, scopeId, weekStart, payload: payload as never, expiresAt },
      });
    }

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

  async clearChatHistory(user: AuthenticatedUser) {
    await this.prisma.aiChatMessage.deleteMany({ where: { userId: user.id } });
  }

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
          const identity = await this.buildIdentity(user);
          const systemPrompt = this.chatContext.buildSystemPrompt(identity);
          const tools = toolsForScope(identity.scope);

          const history = await this.prisma.aiChatMessage.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
          });
          const historyContents: GeminiContent[] = history
            .reverse()
            .map((m) => ({
              role: m.role === AiChatRole.assistant ? 'model' : 'user',
              parts: [{ text: m.content }],
            }));
          const contents: GeminiContent[] = [
            ...historyContents,
            { role: 'user', parts: [{ text: message }] },
          ];

          await this.prisma.aiChatMessage.create({
            data: { userId: user.id, role: AiChatRole.user, content: message },
          });

          // --- Tool-call loop ---
          let finalText = '';
          for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
            if (closed) return;
            const { parts, stub } = await this.gemini.generateWithTools({
              system: systemPrompt,
              contents,
              tools,
            });
            const fnCalls = parts.filter(
              (p): p is Extract<GeminiPart, { functionCall: unknown }> => 'functionCall' in p,
            );
            const texts = parts
              .filter((p): p is Extract<GeminiPart, { text: string }> => 'text' in p && typeof p.text === 'string')
              .map((p) => p.text);

            if (fnCalls.length === 0 || stub) {
              finalText = texts.join('');
              break;
            }

            // 1) Persist the model turn (with function calls) into contents.
            contents.push({ role: 'model', parts });

            // 2) Execute each tool; append a user turn with functionResponse parts.
            const responseParts: GeminiPart[] = [];
            for (const fc of fnCalls) {
              if (closed) return;
              subscriber.next({
                data: { tool: fc.functionCall.name },
                type: 'tool',
              } as MessageEvent);
              const result = await this.toolExecutor.run(user, fc.functionCall.name, fc.functionCall.args ?? {});
              responseParts.push({
                functionResponse: { name: fc.functionCall.name, response: { result } },
              });
            }
            contents.push({ role: 'user', parts: responseParts });
          }

          if (!finalText) {
            finalText = '⚠️ Không lấy được câu trả lời sau nhiều lần gọi công cụ. Vui lòng hỏi lại.';
          }

          for await (const chunk of this.gemini.fakeStream(finalText)) {
            if (closed) return;
            subscriber.next({ data: { delta: chunk } } as MessageEvent);
          }

          await this.prisma.aiChatMessage.create({
            data: { userId: user.id, role: AiChatRole.assistant, content: finalText },
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

  private async buildIdentity(user: AuthenticatedUser): Promise<ChatIdentity> {
    const scope: ToolScope = user.roles.includes(RoleCode.admin)
      ? 'admin'
      : user.roles.includes(RoleCode.manager)
        ? 'manager'
        : 'employee';

    const [userRow, employee, branches] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: { fullName: true },
      }),
      this.prisma.employee.findFirst({
        where: { userId: user.id },
        select: { employeeCode: true, primaryBranch: { select: { name: true } } },
      }),
      scope === 'manager' && user.managedBranchIds.length
        ? this.prisma.branch.findMany({
            where: { id: { in: user.managedBranchIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      scope,
      userFullName: userRow?.fullName ?? user.email,
      employeeCode: employee?.employeeCode,
      primaryBranchName: employee?.primaryBranch?.name ?? null,
      managedBranches: scope === 'manager' ? branches : undefined,
      vnToday: vnTodayString(),
    };
  }
}
