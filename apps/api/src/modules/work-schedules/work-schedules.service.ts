import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignScheduleDto, CreateWorkScheduleDto } from './dto/work-schedule.dto';

@Injectable()
export class WorkSchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const schedules = await this.prisma.workSchedule.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { assignments: true } } },
    });
    return schedules.map((s) => ({
      id: s.id,
      name: s.name,
      start_time: s.startTime,
      end_time: s.endTime,
      grace_minutes: s.graceMinutes,
      overtime_after_minutes: s.overtimeAfterMinutes,
      workdays: s.workdays,
      assignment_count: s._count.assignments,
      created_at: s.createdAt,
    }));
  }

  async create(dto: CreateWorkScheduleDto) {
    if (this.timeToMinutes(dto.end_time) <= this.timeToMinutes(dto.start_time)) {
      throw new ConflictException({
        code: 'INVALID_SCHEDULE',
        message: 'end_time must be after start_time',
      });
    }
    return this.prisma.workSchedule.create({
      data: {
        name: dto.name,
        startTime: dto.start_time,
        endTime: dto.end_time,
        graceMinutes: dto.grace_minutes ?? 10,
        overtimeAfterMinutes: dto.overtime_after_minutes ?? 60,
        workdays: dto.workdays,
      },
    });
  }

  async assign(scheduleId: string, dto: AssignScheduleDto) {
    const schedule = await this.prisma.workSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException('Schedule not found');

    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employee_id } });
    if (!employee) throw new NotFoundException('Employee not found');

    const effectiveFrom = new Date(dto.effective_from);
    const effectiveTo = dto.effective_to ? new Date(dto.effective_to) : null;

    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new ConflictException({
        code: 'INVALID_RANGE',
        message: 'effective_to must be on or after effective_from',
      });
    }

    return this.prisma.workScheduleAssignment.create({
      data: {
        employeeId: dto.employee_id,
        scheduleId,
        effectiveFrom,
        effectiveTo,
      },
    });
  }

  async listAssignments(scheduleId: string) {
    const schedule = await this.prisma.workSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException('Schedule not found');

    const assignments = await this.prisma.workScheduleAssignment.findMany({
      where: { scheduleId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            user: { select: { fullName: true } },
          },
        },
      },
      orderBy: { effectiveFrom: 'desc' },
      take: 200,
    });

    return assignments.map((a) => ({
      id: a.id,
      effective_from: a.effectiveFrom,
      effective_to: a.effectiveTo,
      employee: {
        id: a.employee.id,
        employee_code: a.employee.employeeCode,
        full_name: a.employee.user.fullName,
      },
    }));
  }

  async unassign(scheduleId: string, assignmentId: string) {
    const assignment = await this.prisma.workScheduleAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.scheduleId !== scheduleId) {
      throw new NotFoundException('Assignment not found');
    }
    await this.prisma.workScheduleAssignment.delete({ where: { id: assignmentId } });
  }

  private timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
}
