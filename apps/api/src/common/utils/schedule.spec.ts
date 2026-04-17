import {
  classifyCheckIn,
  classifyCheckOut,
  isWorkday,
  type ScheduleConfig,
} from './schedule';

const standard: ScheduleConfig = {
  startTime: '08:00',
  endTime: '17:00',
  graceMinutes: 10,
  overtimeAfterMinutes: 60, // overtime accrues after 18:00
  workdays: [1, 2, 3, 4, 5],
};

function at(iso: string): Date {
  return new Date(iso);
}

describe('classifyCheckIn', () => {
  it('is on_time at 07:59', () => {
    const result = classifyCheckIn(at('2026-04-16T07:59:00'), standard);
    expect(result.status).toBe('on_time');
    expect(result.lateMinutes).toBe(0);
  });

  it('is on_time at 08:00 sharp', () => {
    const result = classifyCheckIn(at('2026-04-16T08:00:00'), standard);
    expect(result.status).toBe('on_time');
  });

  it('is on_time at 08:10 grace boundary', () => {
    const result = classifyCheckIn(at('2026-04-16T08:10:00'), standard);
    expect(result.status).toBe('on_time');
    expect(result.lateMinutes).toBe(0);
  });

  it('is late at 08:11', () => {
    const result = classifyCheckIn(at('2026-04-16T08:11:00'), standard);
    expect(result.status).toBe('late');
    expect(result.lateMinutes).toBe(11);
  });

  it('lateMinutes measured from scheduled start, not grace cutoff', () => {
    const result = classifyCheckIn(at('2026-04-16T09:30:00'), standard);
    expect(result.status).toBe('late');
    expect(result.lateMinutes).toBe(90);
  });
});

describe('classifyCheckOut', () => {
  const checkIn = at('2026-04-16T08:00:00');

  it('stays on_time when leaving exactly at 17:00', () => {
    const result = classifyCheckOut(at('2026-04-16T17:00:00'), checkIn, standard, 'on_time', 0);
    expect(result.status).toBe('on_time');
    expect(result.workedMinutes).toBe(540);
    expect(result.overtimeMinutes).toBe(0);
  });

  it('is early_leave when leaving before 17:00', () => {
    const result = classifyCheckOut(at('2026-04-16T16:30:00'), checkIn, standard, 'on_time', 0);
    expect(result.status).toBe('early_leave');
    expect(result.workedMinutes).toBe(510);
  });

  it('is on_time at 17:30 (between end and overtime threshold)', () => {
    const result = classifyCheckOut(at('2026-04-16T17:30:00'), checkIn, standard, 'on_time', 0);
    expect(result.status).toBe('on_time');
    expect(result.overtimeMinutes).toBe(0);
  });

  it('is overtime when leaving after 18:00', () => {
    const result = classifyCheckOut(at('2026-04-16T19:00:00'), checkIn, standard, 'on_time', 0);
    expect(result.status).toBe('overtime');
    expect(result.overtimeMinutes).toBe(120); // 19:00 - 17:00
  });

  it('preserves late status when leaving on time', () => {
    const result = classifyCheckOut(at('2026-04-16T17:00:00'), checkIn, standard, 'late', 15);
    expect(result.status).toBe('late');
    expect(result.lateMinutes).toBe(15);
  });

  it('late worker going overtime keeps late status but reports overtimeMinutes', () => {
    const result = classifyCheckOut(at('2026-04-16T19:00:00'), checkIn, standard, 'late', 30);
    expect(result.status).toBe('late');
    expect(result.overtimeMinutes).toBe(120);
    expect(result.lateMinutes).toBe(30);
  });
});

describe('isWorkday', () => {
  it('matches Monday through Friday for standard schedule', () => {
    // 2026-04-13 is a Monday
    expect(isWorkday(new Date('2026-04-13T08:00:00'), standard)).toBe(true);
    expect(isWorkday(new Date('2026-04-17T08:00:00'), standard)).toBe(true); // Friday
  });

  it('rejects weekend days', () => {
    expect(isWorkday(new Date('2026-04-18T08:00:00'), standard)).toBe(false); // Saturday
    expect(isWorkday(new Date('2026-04-19T08:00:00'), standard)).toBe(false); // Sunday
  });
});
