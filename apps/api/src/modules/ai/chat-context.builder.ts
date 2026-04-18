import { Injectable } from '@nestjs/common';

export type ChatScope = 'admin' | 'manager' | 'employee';

export interface EmployeeContext {
  scope: 'employee';
  userFullName: string;
  employeeId: string;
  primaryBranchName: string | null;
  recent7Days: { sessions: number; onTime: number; late: number; missingCheckout: number };
  upcomingShifts: Array<{ date: string; startTime: string; endTime: string }>;
  remainingLeaveDays: number | null;
}

export interface ManagerContext {
  scope: 'manager';
  userFullName: string;
  managedBranches: Array<{ id: string; name: string }>;
  today: { sessions: number; onTime: number; late: number; missingCheckout: number; absent: number };
  last7Days: { sessions: number; onTime: number; late: number; onTimeRatePct: number };
  topLate: Array<{ name: string; lateCount: number; branchName: string }>;
}

export interface AdminContext {
  scope: 'admin';
  userFullName: string;
  totals: { employees: number; branches: number };
  today: { sessions: number; onTime: number; late: number; missingCheckout: number; absent: number };
  last7Days: { sessions: number; onTime: number; late: number; onTimeRatePct: number };
  topLateBranches: Array<{ name: string; lateCount: number }>;
}

export type ChatContext = EmployeeContext | ManagerContext | AdminContext;

@Injectable()
export class ChatContextBuilder {
  buildSystemPrompt(ctx: ChatContext): string {
    const guardrails = [
      'Bạn là FinOS HR Assistant — trợ lý AI trong hệ thống chấm công FinOS.',
      'Trả lời bằng tiếng Việt, ngắn gọn, chuyên nghiệp. CHỈ dùng dữ liệu dưới đây, KHÔNG bịa số liệu, KHÔNG tiết lộ dữ liệu ngoài phạm vi cho phép.',
      'Nếu người dùng hỏi thông tin ngoài scope (VD: employee hỏi dữ liệu chi nhánh khác; manager hỏi toàn hệ thống) → từ chối lịch sự.',
      'Nếu câu hỏi không liên quan chấm công/nhân sự → trả lời ngắn rồi hướng về đúng phạm vi.',
      '',
    ].join('\n');

    if (ctx.scope === 'employee') {
      return (
        guardrails +
        [
          `Role: EMPLOYEE (chỉ được xem dữ liệu của chính mình)`,
          `Nhân viên: ${ctx.userFullName} (id=${ctx.employeeId})`,
          `Chi nhánh: ${ctx.primaryBranchName ?? 'chưa gán'}`,
          `7 ngày gần nhất: ${ctx.recent7Days.sessions} phiên, đúng giờ ${ctx.recent7Days.onTime}, muộn ${ctx.recent7Days.late}, thiếu check-out ${ctx.recent7Days.missingCheckout}`,
          ctx.remainingLeaveDays !== null ? `Phép còn lại: ${ctx.remainingLeaveDays} ngày` : '',
          ctx.upcomingShifts.length
            ? `Ca sắp tới: ${ctx.upcomingShifts.map((s) => `${s.date} ${s.startTime}-${s.endTime}`).join('; ')}`
            : 'Chưa có ca sắp tới trong lịch.',
        ]
          .filter(Boolean)
          .join('\n')
      );
    }

    if (ctx.scope === 'manager') {
      return (
        guardrails +
        [
          `Role: MANAGER (chỉ được xem dữ liệu các chi nhánh mình quản lý)`,
          `Người dùng: ${ctx.userFullName}`,
          `Chi nhánh quản lý: ${ctx.managedBranches.map((b) => b.name).join(', ') || '(chưa gán)'}`,
          `Hôm nay: ${ctx.today.sessions} phiên — đúng giờ ${ctx.today.onTime}, muộn ${ctx.today.late}, chưa check-out ${ctx.today.missingCheckout}, vắng ${ctx.today.absent}`,
          `7 ngày: ${ctx.last7Days.sessions} phiên, đúng giờ ${ctx.last7Days.onTime} (${ctx.last7Days.onTimeRatePct}%), muộn ${ctx.last7Days.late}`,
          ctx.topLate.length
            ? `Top NV đi muộn 7 ngày: ${ctx.topLate.map((t) => `${t.name} @ ${t.branchName} (${t.lateCount})`).join('; ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      );
    }

    return (
      guardrails +
      [
        `Role: ADMIN (được xem toàn hệ thống)`,
        `Người dùng: ${ctx.userFullName}`,
        `Tổng: ${ctx.totals.employees} nhân viên, ${ctx.totals.branches} chi nhánh`,
        `Hôm nay: ${ctx.today.sessions} phiên — đúng giờ ${ctx.today.onTime}, muộn ${ctx.today.late}, chưa check-out ${ctx.today.missingCheckout}, vắng ${ctx.today.absent}`,
        `7 ngày: ${ctx.last7Days.sessions} phiên, đúng giờ ${ctx.last7Days.onTime} (${ctx.last7Days.onTimeRatePct}%), muộn ${ctx.last7Days.late}`,
        ctx.topLateBranches.length
          ? `Top chi nhánh đi muộn 7 ngày: ${ctx.topLateBranches.map((b) => `${b.name} (${b.lateCount})`).join('; ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
}
