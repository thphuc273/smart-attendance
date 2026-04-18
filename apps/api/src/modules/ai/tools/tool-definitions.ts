/**
 * Gemini function declarations for the HR Assistant.
 * Each tool is bucketed by scope so we only expose tools the caller can actually run.
 * Scope enforcement is ALSO re-checked inside ToolExecutor — the model can still be
 * coaxed into emitting an out-of-scope call, and the executor is the hard boundary.
 */

export type ToolScope = 'employee' | 'manager' | 'admin';

export interface ToolDecl {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const selfTools: ToolDecl[] = [
  {
    name: 'get_my_attendance_stats',
    description:
      'Thống kê chấm công CỦA CHÍNH NGƯỜI HỎI trong một khoảng ngày (phiên, đúng giờ, muộn, về sớm/early_leave, vắng, thiếu check-out, overtime, tỉ lệ đúng giờ, tổng giờ làm). Dùng khi người dùng hỏi "tuần này / tháng này / từ ngày X tới ngày Y tôi đi trễ / về sớm bao nhiêu lần, đi làm mấy ngày".',
    parameters: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD (inclusive)' },
        date_to: { type: 'string', description: 'YYYY-MM-DD (inclusive)' },
      },
      required: ['date_from', 'date_to'],
    },
  },
  {
    name: 'get_my_recent_sessions',
    description:
      'Danh sách phiên chấm công gần nhất CỦA CHÍNH NGƯỜI HỎI — mỗi phiên gồm ngày, chi nhánh, check-in/check-out, status, trust_score. Dùng khi người dùng hỏi "mấy lần gần đây tôi đi làm thế nào, hôm qua tôi check-in lúc mấy giờ".',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Số phiên trả về (1-30, mặc định 10)' },
      },
    },
  },
  {
    name: 'get_my_streak',
    description:
      'Streak đi làm đúng giờ hiện tại + best + tỉ lệ đúng giờ 30 ngày CỦA CHÍNH NGƯỜI HỎI.',
    parameters: { type: 'object', properties: {} },
  },
];

const branchTools: ToolDecl[] = [
  {
    name: 'get_branch_today_overview',
    description:
      'Tổng quan chấm công HÔM NAY của 1 chi nhánh: số phiên, đúng giờ, muộn, vắng, thiếu check-out. Manager chỉ dùng được với branch mình quản lý, admin dùng cho mọi branch.',
    parameters: {
      type: 'object',
      properties: {
        branch_id: { type: 'string', description: 'UUID chi nhánh' },
      },
      required: ['branch_id'],
    },
  },
  {
    name: 'get_branch_attendance_stats',
    description:
      'Thống kê aggregate của 1 chi nhánh trong khoảng ngày: tổng phiên, đúng giờ, muộn, vắng, tỉ lệ đúng giờ. Manager: branch mình quản lý; admin: mọi branch.',
    parameters: {
      type: 'object',
      properties: {
        branch_id: { type: 'string' },
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['branch_id', 'date_from', 'date_to'],
    },
  },
  {
    name: 'list_late_employees',
    description:
      'Top nhân viên đi muộn trong khoảng ngày (tên, chi nhánh, số lần muộn). Manager: chỉ branch quản lý (nếu bỏ branch_id sẽ gộp tất cả branch quản lý); admin: có thể bỏ branch_id để lấy toàn hệ thống.',
    parameters: {
      type: 'object',
      properties: {
        branch_id: { type: 'string', description: 'UUID, optional cho admin' },
        date_from: { type: 'string' },
        date_to: { type: 'string' },
        limit: { type: 'integer', description: '1-20, mặc định 5' },
      },
      required: ['date_from', 'date_to'],
    },
  },
  {
    name: 'list_absent_today',
    description:
      'Danh sách nhân viên chưa check-in / vắng của 1 chi nhánh TÍNH ĐẾN HIỆN TẠI. Manager branch mình / admin mọi branch.',
    parameters: {
      type: 'object',
      properties: { branch_id: { type: 'string' } },
      required: ['branch_id'],
    },
  },
];

const adminTools: ToolDecl[] = [
  {
    name: 'get_system_overview',
    description:
      'Tổng quan TOÀN HỆ THỐNG (admin only): tổng employee, tổng branch, hôm nay, 7 ngày. Không cần tham số.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'compare_branches',
    description:
      'So sánh các chi nhánh theo tỉ lệ đúng giờ / số lần muộn trong khoảng ngày (admin only). Trả top tốt nhất + top kém nhất.',
    parameters: {
      type: 'object',
      properties: {
        date_from: { type: 'string' },
        date_to: { type: 'string' },
        limit: { type: 'integer', description: '1-20, mặc định 10' },
      },
      required: ['date_from', 'date_to'],
    },
  },
];

export function toolsForScope(scope: ToolScope): ToolDecl[] {
  if (scope === 'admin') return [...selfTools, ...branchTools, ...adminTools];
  if (scope === 'manager') return [...selfTools, ...branchTools];
  return selfTools;
}

export const ALL_TOOL_NAMES = new Set<string>([
  ...selfTools.map((t) => t.name),
  ...branchTools.map((t) => t.name),
  ...adminTools.map((t) => t.name),
]);
