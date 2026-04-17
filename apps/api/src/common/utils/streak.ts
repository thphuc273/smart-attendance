/**
 * Streak computation — pure, deterministic.
 *
 * Input: a list of daily attendance outcomes sorted ASC by work_date.
 * Output: current streak, best streak, on-time rate over last 30 days,
 * and a 30-day heatmap.
 *
 * Rules:
 *  - on_time OR overtime  = streak continues
 *  - late                 = streak continues (still showed up) but marked late in heatmap
 *  - early_leave          = streak continues
 *  - missing_checkout     = streak continues (showed up)
 *  - absent OR no-record  = streak BREAKS
 */

export type DailyStatus =
  | 'on_time'
  | 'late'
  | 'early_leave'
  | 'overtime'
  | 'missing_checkout'
  | 'absent';

export interface DailyEntry {
  /** YYYY-MM-DD in branch timezone */
  date: string;
  status: DailyStatus;
}

export interface StreakResult {
  current: number;
  best: number;
  onTimeRate30d: number; // 0..1
  heatmap: { date: string; status: DailyStatus | 'no_record' }[];
}

function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Returns true if this status counts as "showed up" (keeps streak alive).
 */
function keepsStreak(status: DailyStatus): boolean {
  return status !== 'absent';
}

export function computeStreak(
  entries: DailyEntry[],
  options: { today?: Date; heatmapDays?: number } = {},
): StreakResult {
  const today = options.today ?? new Date();
  const heatmapDays = options.heatmapDays ?? 30;
  const map = new Map<string, DailyStatus>();
  for (const e of entries) map.set(e.date, e.status);

  // Build heatmap: last N days up to today (inclusive).
  const heatmap: { date: string; status: DailyStatus | 'no_record' }[] = [];
  for (let i = heatmapDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = iso(d);
    heatmap.push({ date: key, status: map.get(key) ?? 'no_record' });
  }

  // Current streak — walk back from today; skip today if no record (grace).
  let current = 0;
  for (let i = 0; i < heatmapDays; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = iso(d);
    const status = map.get(key);
    if (status === undefined) {
      if (i === 0) continue; // today not yet recorded — don't break
      break;
    }
    if (keepsStreak(status)) {
      current += 1;
    } else {
      break;
    }
  }

  // Best streak — scan full sorted entries.
  let best = 0;
  let run = 0;
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let prev: string | null = null;
  for (const e of sorted) {
    if (prev) {
      const prevD = new Date(prev + 'T00:00:00Z');
      prevD.setUTCDate(prevD.getUTCDate() + 1);
      if (iso(prevD) !== e.date) run = 0; // gap → reset
    }
    if (keepsStreak(e.status)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
    prev = e.date;
  }
  if (current > best) best = current;

  // On-time rate over 30 days: (on_time) / (recorded days).
  let onTime = 0;
  let recorded = 0;
  for (const h of heatmap) {
    if (h.status === 'no_record') continue;
    recorded += 1;
    if (h.status === 'on_time' || h.status === 'overtime') onTime += 1;
  }
  const onTimeRate30d = recorded === 0 ? 0 : onTime / recorded;

  return { current, best, onTimeRate30d, heatmap };
}
