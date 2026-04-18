import { InsightPromptBuilder, InsightStats } from './insight-prompt.builder';

const baseStats: InsightStats = {
  weekStart: '2026-04-13',
  weekEnd: '2026-04-19',
  scopeLabel: 'Chi nhánh HCM-Q1',
  totalEmployees: 30,
  totalSessions: 140,
  onTime: 120,
  late: 18,
  missingCheckout: 2,
  absentWithLeave: 0,
  absentNoLeave: 0,
  lateTrendPct: null,
  topLateEmployees: [],
};

describe('InsightPromptBuilder', () => {
  const builder = new InsightPromptBuilder();

  it('includes the scope label and week range in the prompt', () => {
    const out = builder.build(baseStats);
    expect(out).toContain('Chi nhánh HCM-Q1');
    expect(out).toContain('2026-04-13 → 2026-04-19');
    expect(out).toContain('INSIGHTS_REQUEST');
  });

  it('emits session counts on the numeric line', () => {
    const out = builder.build(baseStats);
    expect(out).toContain('Đúng giờ: 120');
    expect(out).toContain('Muộn: 18');
    expect(out).toContain('Thiếu check-out: 2');
  });

  it('formats a positive late trend with explicit "+" sign', () => {
    const out = builder.build({ ...baseStats, lateTrendPct: 25 });
    expect(out).toMatch(/Xu hướng đi muộn so với tuần trước: \+25%/);
  });

  it('formats a negative late trend without adding a sign', () => {
    const out = builder.build({ ...baseStats, lateTrendPct: -10 });
    expect(out).toContain('Xu hướng đi muộn so với tuần trước: -10%');
  });

  it('falls back to "chưa đủ dữ liệu" when late trend is null', () => {
    const out = builder.build({ ...baseStats, lateTrendPct: null });
    expect(out).toContain('Xu hướng đi muộn: chưa đủ dữ liệu');
  });

  it('renders top-late employees inline, joined by comma', () => {
    const out = builder.build({
      ...baseStats,
      topLateEmployees: [
        { name: 'Nguyễn A', lateCount: 4 },
        { name: 'Trần B', lateCount: 3 },
      ],
    });
    expect(out).toContain('Top NV đi muộn: Nguyễn A (4), Trần B (3)');
  });

  it('omits the top-late line entirely when the list is empty', () => {
    const out = builder.build({ ...baseStats, topLateEmployees: [] });
    expect(out).not.toContain('Top NV đi muộn');
  });

  it('enforces JSON-only output in the trailer', () => {
    const out = builder.build(baseStats);
    expect(out).toContain('Chỉ trả về JSON, không markdown');
  });
});
