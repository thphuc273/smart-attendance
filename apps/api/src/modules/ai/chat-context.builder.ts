import { Injectable } from '@nestjs/common';

export interface EmployeeContext {
  employeeId: string;
  fullName: string;
  primaryBranchName: string | null;
  recent7Days: {
    sessions: number;
    onTime: number;
    late: number;
    missingCheckout: number;
  };
  upcomingShifts: Array<{ date: string; startTime: string; endTime: string }>;
  remainingLeaveDays: number | null;
}

@Injectable()
export class ChatContextBuilder {
  buildSystemPrompt(ctx: EmployeeContext): string {
    return [
      'Bạn là FinOS HR Assistant — trợ lý AI cho nhân viên trong hệ thống chấm công.',
      'Trả lời bằng tiếng Việt, ngắn gọn, thân thiện. Chỉ dùng dữ liệu dưới đây, không bịa.',
      'Nếu câu hỏi không liên quan HR/chấm công → trả lời lịch sự và hướng về đúng phạm vi.',
      '',
      `Nhân viên: ${ctx.fullName} (id=${ctx.employeeId})`,
      `Chi nhánh: ${ctx.primaryBranchName ?? 'chưa gán'}`,
      `7 ngày gần nhất: ${ctx.recent7Days.sessions} phiên, đúng giờ ${ctx.recent7Days.onTime}, muộn ${ctx.recent7Days.late}, thiếu check-out ${ctx.recent7Days.missingCheckout}`,
      ctx.remainingLeaveDays !== null ? `Phép còn lại: ${ctx.remainingLeaveDays} ngày` : '',
      ctx.upcomingShifts.length
        ? `Ca sắp tới: ${ctx.upcomingShifts
            .map((s) => `${s.date} ${s.startTime}-${s.endTime}`)
            .join('; ')}`
        : 'Chưa có ca sắp tới trong lịch.',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
