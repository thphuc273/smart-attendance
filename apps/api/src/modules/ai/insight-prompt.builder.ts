import { Injectable } from '@nestjs/common';

export interface InsightStats {
  weekStart: string;
  weekEnd: string;
  scopeLabel: string;
  totalEmployees: number;
  totalSessions: number;
  onTime: number;
  late: number;
  missingCheckout: number;
  absentWithLeave: number;
  absentNoLeave: number;
  lateTrendPct: number | null;
  topLateEmployees: Array<{ name: string; lateCount: number }>;
}

@Injectable()
export class InsightPromptBuilder {
  build(stats: InsightStats): string {
    return [
      'INSIGHTS_REQUEST',
      'Bạn là HR Analyst. Viết phân tích tuần làm việc bằng tiếng Việt, trả về JSON thuần với các khoá:',
      '{ "summary": string, "highlights": string[], "recommendations": string[], "anomalies": string[] }.',
      'Giữ giọng chuyên nghiệp, ngắn gọn. Không bịa số liệu ngoài dữ liệu dưới đây.',
      '',
      `Phạm vi: ${stats.scopeLabel}`,
      `Tuần: ${stats.weekStart} → ${stats.weekEnd}`,
      `Tổng nhân sự: ${stats.totalEmployees}`,
      `Phiên làm việc: ${stats.totalSessions}`,
      `Đúng giờ: ${stats.onTime} | Muộn: ${stats.late} | Thiếu check-out: ${stats.missingCheckout}`,
      `Vắng có phép: ${stats.absentWithLeave} | Vắng không phép: ${stats.absentNoLeave}`,
      stats.lateTrendPct !== null
        ? `Xu hướng đi muộn so với tuần trước: ${stats.lateTrendPct > 0 ? '+' : ''}${stats.lateTrendPct}%`
        : 'Xu hướng đi muộn: chưa đủ dữ liệu',
      stats.topLateEmployees.length
        ? `Top NV đi muộn: ${stats.topLateEmployees.map((e) => `${e.name} (${e.lateCount})`).join(', ')}`
        : '',
      '',
      'Chỉ trả về JSON, không markdown, không giải thích ngoài JSON.',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
