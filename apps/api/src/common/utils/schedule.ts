/**
 * Work schedule classification — pure functions.
 * Based on spec §5.3 status rules.
 */

export interface ScheduleConfig {
  /** 'HH:MM' 24-hour, e.g. '08:00' */
  startTime: string;
  /** 'HH:MM' 24-hour, e.g. '17:00' */
  endTime: string;
  /** Tolerance before a check-in is considered `late` */
  graceMinutes: number;
  /** Minutes past endTime before overtime accrues */
  overtimeAfterMinutes: number;
  /** ISO weekday numbers (Monday=1..Sunday=7) */
  workdays: number[];
}

export type SessionStatus = 'on_time' | 'late' | 'early_leave' | 'overtime' | 'absent' | 'missing_checkout';

export interface CheckInClassification {
  status: 'on_time' | 'late';
  lateMinutes: number;
}

export interface CheckOutClassification {
  status: SessionStatus;
  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
}

/** Vietnam is UTC+7 (no DST). The API container runs UTC, so schedule
 *  times must never be resolved via the server-local `Date` methods. */
const VN_OFFSET_MS = 7 * 60 * 60_000;

/**
 * Resolve a 'HH:MM' schedule time to a UTC instant, anchored to the
 * Vietnam (UTC+7) calendar date of `date`. Using `setHours` here would
 * interpret HH:MM in the server timezone (UTC in containers), shifting
 * every schedule boundary by 7 hours.
 */
function parseTimeOnDate(time: string, date: Date): Date {
  const [h, m] = time.split(':').map(Number);
  // Vietnam calendar date of the given instant, as YYYY-MM-DD.
  const vnDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [y, mo, d] = vnDate.split('-').map(Number);
  // VN local HH:MM → UTC instant (subtract the +7h offset).
  return new Date(Date.UTC(y, mo - 1, d, h, m) - VN_OFFSET_MS);
}

export function classifyCheckIn(checkInAt: Date, schedule: ScheduleConfig): CheckInClassification {
  const scheduledStart = parseTimeOnDate(schedule.startTime, checkInAt);
  const graceCutoff = new Date(scheduledStart.getTime() + schedule.graceMinutes * 60_000);

  if (checkInAt <= graceCutoff) {
    return { status: 'on_time', lateMinutes: 0 };
  }

  const lateMinutes = Math.max(
    0,
    Math.round((checkInAt.getTime() - scheduledStart.getTime()) / 60_000),
  );
  return { status: 'late', lateMinutes };
}

export function classifyCheckOut(
  checkOutAt: Date,
  checkInAt: Date,
  schedule: ScheduleConfig,
  checkInStatus: 'on_time' | 'late',
  lateMinutes: number,
): CheckOutClassification {
  const scheduledEnd = parseTimeOnDate(schedule.endTime, checkOutAt);
  const overtimeThresholdMs = scheduledEnd.getTime() + schedule.overtimeAfterMinutes * 60_000;
  const workedMinutes = Math.max(
    0,
    Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60_000),
  );

  let status: SessionStatus = checkInStatus;
  let overtimeMinutes = 0;

  if (checkOutAt.getTime() > overtimeThresholdMs) {
    overtimeMinutes = Math.round((checkOutAt.getTime() - scheduledEnd.getTime()) / 60_000);
    if (checkInStatus === 'on_time') {
      status = 'overtime';
    }
  } else if (checkOutAt < scheduledEnd) {
    status = 'early_leave';
  }

  return { status, workedMinutes, overtimeMinutes, lateMinutes };
}

export function isWorkday(date: Date, schedule: ScheduleConfig): boolean {
  // ISO weekday (Mon=1..Sun=7) in Vietnam time, not server-local time.
  const vnWeekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
  }).format(date);
  const iso: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  return schedule.workdays.includes(iso[vnWeekday]);
}
