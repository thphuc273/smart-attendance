import { computeStreak, type DailyEntry } from './streak';

const TODAY = new Date('2026-04-17T00:00:00Z');

function day(offset: number): string {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

describe('computeStreak', () => {
  it('returns zeros for empty input', () => {
    const r = computeStreak([], { today: TODAY });
    expect(r.current).toBe(0);
    expect(r.best).toBe(0);
    expect(r.onTimeRate30d).toBe(0);
    expect(r.heatmap).toHaveLength(30);
    expect(r.heatmap.every((h) => h.status === 'no_record')).toBe(true);
  });

  it('counts 5 consecutive on_time days as current=5', () => {
    const entries: DailyEntry[] = [
      { date: day(4), status: 'on_time' },
      { date: day(3), status: 'on_time' },
      { date: day(2), status: 'on_time' },
      { date: day(1), status: 'on_time' },
      { date: day(0), status: 'on_time' },
    ];
    const r = computeStreak(entries, { today: TODAY });
    expect(r.current).toBe(5);
    expect(r.best).toBe(5);
  });

  it('late still keeps streak alive', () => {
    const entries: DailyEntry[] = [
      { date: day(2), status: 'on_time' },
      { date: day(1), status: 'late' },
      { date: day(0), status: 'on_time' },
    ];
    expect(computeStreak(entries, { today: TODAY }).current).toBe(3);
  });

  it('absent breaks streak', () => {
    const entries: DailyEntry[] = [
      { date: day(3), status: 'on_time' },
      { date: day(2), status: 'absent' },
      { date: day(1), status: 'on_time' },
      { date: day(0), status: 'on_time' },
    ];
    const r = computeStreak(entries, { today: TODAY });
    expect(r.current).toBe(2);
    expect(r.best).toBe(2);
  });

  it('gap (no record) in the middle breaks streak', () => {
    const entries: DailyEntry[] = [
      { date: day(5), status: 'on_time' },
      { date: day(4), status: 'on_time' },
      // gap day(3)
      { date: day(2), status: 'on_time' },
      { date: day(1), status: 'on_time' },
      { date: day(0), status: 'on_time' },
    ];
    const r = computeStreak(entries, { today: TODAY });
    expect(r.current).toBe(3);
    expect(r.best).toBe(3);
  });

  it('today with no record does not break streak', () => {
    const entries: DailyEntry[] = [
      { date: day(3), status: 'on_time' },
      { date: day(2), status: 'on_time' },
      { date: day(1), status: 'on_time' },
      // no day(0)
    ];
    const r = computeStreak(entries, { today: TODAY });
    expect(r.current).toBe(3);
  });

  it('best > current when older streak is longer', () => {
    const entries: DailyEntry[] = [
      { date: day(10), status: 'on_time' },
      { date: day(9), status: 'on_time' },
      { date: day(8), status: 'on_time' },
      { date: day(7), status: 'on_time' },
      { date: day(6), status: 'absent' },
      { date: day(5), status: 'on_time' },
      { date: day(4), status: 'on_time' },
    ];
    const r = computeStreak(entries, { today: TODAY });
    expect(r.best).toBe(4);
  });

  it('on-time rate 30d = on_time / recorded', () => {
    const entries: DailyEntry[] = [
      { date: day(0), status: 'on_time' },
      { date: day(1), status: 'late' },
      { date: day(2), status: 'on_time' },
      { date: day(3), status: 'absent' },
    ];
    const r = computeStreak(entries, { today: TODAY });
    // 2 on_time / 4 recorded = 0.5
    expect(r.onTimeRate30d).toBeCloseTo(0.5, 2);
  });

  it('heatmap has 30 entries ending today', () => {
    const r = computeStreak([], { today: TODAY });
    expect(r.heatmap).toHaveLength(30);
    expect(r.heatmap[r.heatmap.length - 1].date).toBe(day(0));
    expect(r.heatmap[0].date).toBe(day(29));
  });
});
