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

function parseTimeOnDate(time: string, date: Date): Date {
  const [h, m] = time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(h, m, 0, 0);
  return result;
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
  const js = date.getDay();
  const iso = js === 0 ? 7 : js;
  return schedule.workdays.includes(iso);
}
