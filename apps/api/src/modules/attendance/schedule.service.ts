import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  classifyCheckIn,
  classifyCheckOut,
  isWorkday,
  type CheckInClassification,
  type CheckOutClassification,
  type ScheduleConfig,
} from '../../common/utils/schedule';

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveSchedule(employeeId: string, onDate: Date): Promise<ScheduleConfig | null> {
    const assignment = await this.prisma.workScheduleAssignment.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: onDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
      },
      include: { schedule: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!assignment) return null;

    const raw = assignment.schedule.workdays;
    const workdays = Array.isArray(raw) ? (raw as number[]) : [1, 2, 3, 4, 5];

    return {
      startTime: assignment.schedule.startTime,
      endTime: assignment.schedule.endTime,
      graceMinutes: assignment.schedule.graceMinutes,
      overtimeAfterMinutes: assignment.schedule.overtimeAfterMinutes,
      workdays,
    };
  }

  classifyCheckIn(checkInAt: Date, schedule: ScheduleConfig): CheckInClassification {
    return classifyCheckIn(checkInAt, schedule);
  }

  classifyCheckOut(
    checkOutAt: Date,
    checkInAt: Date,
    schedule: ScheduleConfig,
    checkInStatus: 'on_time' | 'late',
    lateMinutes: number,
  ): CheckOutClassification {
    return classifyCheckOut(checkOutAt, checkInAt, schedule, checkInStatus, lateMinutes);
  }

  isWorkday(date: Date, schedule: ScheduleConfig): boolean {
    return isWorkday(date, schedule);
  }
}
