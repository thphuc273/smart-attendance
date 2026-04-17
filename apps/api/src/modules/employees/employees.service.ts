import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, AssignmentType, EmploymentStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { Paginated } from '../../common/interceptors/response-transform.interceptor';
import { parseDateOnly } from '../../common/utils/date-only';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreateAssignmentDto,
  ToggleDeviceTrustDto,
} from './dto/employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListEmployeesDto, scopedBranchIds?: string[]): Promise<Paginated<unknown>> {
    const where: Prisma.EmployeeWhereInput = {};

    if (query.status) {
      where.employmentStatus = query.status as EmploymentStatus;
    }
    if (query.branch_id) {
      where.primaryBranchId = query.branch_id;
    }
    if (query.department_id) {
      where.departmentId = query.department_id;
    }
    if (query.search) {
      where.OR = [
        { employeeCode: { contains: query.search, mode: 'insensitive' } },
        { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (scopedBranchIds) {
      where.primaryBranchId = { in: scopedBranchIds };
    }

    const { page, limit } = query;
    const [total, items] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        include: {
          user: { select: { fullName: true, email: true } },
          primaryBranch: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
        orderBy: { employeeCode: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const mapped = items.map((e) => ({
      id: e.id,
      employee_code: e.employeeCode,
      user: { full_name: e.user.fullName, email: e.user.email },
      primary_branch: e.primaryBranch,
      department: e.department,
      employment_status: e.employmentStatus,
    }));

    return {
      items: mapped,
      meta: { page, limit, total, total_pages: Math.ceil(total / limit) || 1 },
    };
  }

  /**
   * Non-admins can only touch employees whose primary branch is in their managed scope.
   * Managers cannot create/promote admins or managers (role escalation guard).
   */
  private assertBranchScope(branchId: string, scopedBranchIds?: string[]) {
    if (scopedBranchIds && !scopedBranchIds.includes(branchId)) {
      throw new ForbiddenException({
        code: 'BRANCH_OUT_OF_SCOPE',
        message: 'Employee must belong to a branch you manage',
      });
    }
  }

  async create(dto: CreateEmployeeDto, scopedBranchIds?: string[]) {
    this.assertBranchScope(dto.primary_branch_id, scopedBranchIds);
    const requestedRole = dto.role ?? 'employee';
    if (scopedBranchIds && requestedRole !== 'employee') {
      throw new ForbiddenException({
        code: 'ROLE_ESCALATION_BLOCKED',
        message: 'Only admins can create manager/admin accounts',
      });
    }

    // Check unique email
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException({ code: 'DUPLICATE_EMAIL', message: 'Email already exists' });
    }

    // Check unique employee_code
    const existingCode = await this.prisma.employee.findUnique({
      where: { employeeCode: dto.employee_code },
    });
    if (existingCode) {
      throw new ConflictException({
        code: 'DUPLICATE_EMPLOYEE_CODE',
        message: 'Employee code already exists',
      });
    }

    // Check branch exists
    const branch = await this.prisma.branch.findUnique({ where: { id: dto.primary_branch_id } });
    if (!branch) {
      throw new BadRequestException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Branch not found',
      });
    }

    // Find role
    const roleCode = dto.role ?? 'employee';
    const role = await this.prisma.role.findUnique({ where: { code: roleCode as 'admin' | 'manager' | 'employee' } });
    if (!role) {
      throw new BadRequestException({ code: 'INVALID_ROLE', message: 'Role not found' });
    }

    const passwordHash = await argon2.hash(dto.password);

    // Atomic create user + employee
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.full_name,
          phone: dto.phone,
          status: 'active',
          userRoles: { create: [{ roleId: role.id }] },
        },
      });

      const employee = await tx.employee.create({
        data: {
          userId: user.id,
          employeeCode: dto.employee_code,
          primaryBranchId: dto.primary_branch_id,
          departmentId: dto.department_id,
        },
        include: {
          user: { select: { fullName: true, email: true } },
          primaryBranch: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
      });

      if (roleCode === 'manager') {
        await tx.managerBranch.create({
          data: {
            userId: user.id,
            branchId: dto.primary_branch_id,
          },
        });
      }

      return employee;
    });

    return {
      id: result.id,
      employee_code: result.employeeCode,
      user: { full_name: result.user.fullName, email: result.user.email },
      primary_branch: result.primaryBranch,
      department: result.department,
      employment_status: result.employmentStatus,
    };
  }

  async update(employeeId: string, dto: UpdateEmployeeDto, scopedBranchIds?: string[]) {
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });
    if (!emp) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Employee not found' });
    }
    this.assertBranchScope(emp.primaryBranchId, scopedBranchIds);
    // Manager cannot move employee OUT of their scope
    if (dto.primary_branch_id) {
      this.assertBranchScope(dto.primary_branch_id, scopedBranchIds);
    }

    await this.prisma.$transaction(async (tx) => {
      // Update user fields
      if (dto.full_name || dto.phone) {
        await tx.user.update({
          where: { id: emp.userId },
          data: {
            ...(dto.full_name && { fullName: dto.full_name }),
            ...(dto.phone && { phone: dto.phone }),
          },
        });
      }

      // Update employee fields
      const empUpdate: Prisma.EmployeeUpdateInput = {};
      if (dto.department_id) empUpdate.department = { connect: { id: dto.department_id } };
      if (dto.primary_branch_id) empUpdate.primaryBranch = { connect: { id: dto.primary_branch_id } };
      if (dto.employment_status) empUpdate.employmentStatus = dto.employment_status as EmploymentStatus;

      if (Object.keys(empUpdate).length > 0) {
        await tx.employee.update({ where: { id: employeeId }, data: empUpdate });
      }

      // If user is a manager and primary branch changes, also grant them manager access to the new branch
      if (dto.primary_branch_id) {
        const userRoles = await tx.userRole.findMany({
          where: { userId: emp.userId },
          include: { role: true },
        });
        if (userRoles.some((ur) => ur.role.code === 'manager')) {
          await tx.managerBranch.upsert({
            where: { userId_branchId: { userId: emp.userId, branchId: dto.primary_branch_id } },
            update: {},
            create: { userId: emp.userId, branchId: dto.primary_branch_id },
          });
        }
      }
    });

    return this.getById(employeeId);
  }

  async createAssignment(employeeId: string, dto: CreateAssignmentDto) {
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Employee not found' });
    }

    return this.prisma.employeeBranchAssignment.create({
      data: {
        employeeId,
        branchId: dto.branch_id,
        assignmentType: (dto.assignment_type ?? 'secondary') as AssignmentType,
        effectiveFrom: parseDateOnly(dto.effective_from, 'effective_from'),
        effectiveTo: dto.effective_to ? parseDateOnly(dto.effective_to, 'effective_to') : null,
      },
    });
  }

  async listDevices(employeeId: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Employee not found' });
    }

    const devices = await this.prisma.employeeDevice.findMany({
      where: { employeeId },
      orderBy: { lastSeenAt: 'desc' },
    });

    return devices.map((d) => ({
      id: d.id,
      device_name: d.deviceName,
      platform: d.platform,
      is_trusted: d.isTrusted,
      last_seen_at: d.lastSeenAt,
    }));
  }

  async toggleDeviceTrust(employeeId: string, deviceId: string, dto: ToggleDeviceTrustDto) {
    const device = await this.prisma.employeeDevice.findFirst({
      where: { id: deviceId, employeeId },
    });
    if (!device) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Device not found' });
    }

    return this.prisma.employeeDevice.update({
      where: { id: deviceId },
      data: { isTrusted: dto.is_trusted },
    });
  }

  /**
   * Soft-delete: flip employment_status to 'terminated' + disable user login.
   * Preserves historical attendance sessions. Manager can only terminate
   * employees in their scope.
   */
  async softDelete(employeeId: string, scopedBranchIds?: string[]) {
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Employee not found' });
    }
    this.assertBranchScope(emp.primaryBranchId, scopedBranchIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employeeId },
        data: { employmentStatus: 'terminated' },
      });
      await tx.user.update({
        where: { id: emp.userId },
        data: { status: 'inactive' },
      });
    });
  }

  private async getById(employeeId: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: { select: { fullName: true, email: true } },
        primaryBranch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });
    if (!emp) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Employee not found' });
    return {
      id: emp.id,
      employee_code: emp.employeeCode,
      user: { full_name: emp.user.fullName, email: emp.user.email },
      primary_branch: emp.primaryBranch,
      department: emp.department,
      employment_status: emp.employmentStatus,
    };
  }
}
