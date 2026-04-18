import { Injectable } from '@nestjs/common';
import { ToolScope } from './tools/tool-definitions';

/**
 * Identity-only chat context. Stats/branch-rollups are fetched on demand via tool
 * calling — we don't pre-stuff them here. The prompt tells the model what its
 * boundaries are and what data it's allowed to fetch through tools.
 */
export interface ChatIdentity {
  scope: ToolScope;
  userFullName: string;
  /** Present for employee/manager/admin when the user has an employee record — */
  /** the self tools (get_my_*) can always resolve via userId. */
  employeeCode?: string;
  primaryBranchName?: string | null;
  /** Manager scope only: list of branches this user can query through tools. */
  managedBranches?: Array<{ id: string; name: string }>;
  /** YYYY-MM-DD in Asia/Ho_Chi_Minh — helps model resolve "tuần này / hôm nay" */
  vnToday: string;
}

@Injectable()
export class ChatContextBuilder {
  buildSystemPrompt(ctx: ChatIdentity): string {
    const rules = [
      'Bạn là FinOS HR Assistant — trợ lý chấm công trong hệ thống FinOS Smart Attendance.',
      'Trả lời bằng tiếng Việt, ngắn gọn, chuyên nghiệp.',
      'BẮT BUỘC gọi tool (function call) để lấy số liệu thực — KHÔNG bịa số, KHÔNG đoán. Nếu người dùng hỏi tới dữ liệu mà chưa có tool phù hợp → nói rõ "chưa hỗ trợ" thay vì đoán.',
      'Nếu câu hỏi ngoài phạm vi quyền (employee hỏi chi nhánh khác, manager hỏi chi nhánh ngoài scope) → từ chối lịch sự.',
      `Hôm nay là ${ctx.vnToday} (Asia/Ho_Chi_Minh). Với các mốc thời gian tương đối ("tuần này", "tháng này"), tự tính date_from/date_to từ mốc đó.`,
    ];

    const identity: string[] = [`Vai trò: ${ctx.scope.toUpperCase()}`, `Người dùng: ${ctx.userFullName}`];
    if (ctx.employeeCode) identity.push(`Mã NV: ${ctx.employeeCode}`);
    if (ctx.primaryBranchName) identity.push(`Chi nhánh chính: ${ctx.primaryBranchName}`);

    if (ctx.scope === 'employee') {
      identity.push('Phạm vi dữ liệu: CHÍNH BẠN. Dùng các tool `get_my_*`.');
    } else if (ctx.scope === 'manager') {
      const list = ctx.managedBranches?.length
        ? ctx.managedBranches.map((b) => `${b.name} (${b.id})`).join('; ')
        : '(chưa gán)';
      identity.push(`Phạm vi dữ liệu: các chi nhánh bạn quản lý — ${list}.`);
      identity.push('Dùng `get_my_*` cho dữ liệu cá nhân, `get_branch_*` / `list_*` với branch_id trong danh sách trên.');
    } else {
      identity.push('Phạm vi dữ liệu: TOÀN HỆ THỐNG.');
      identity.push('Dùng `get_system_overview` / `compare_branches` cho số liệu toàn hệ thống; `get_branch_*` cho từng chi nhánh.');
    }

    return [...rules, '', ...identity].join('\n');
  }
}
