import { RoleCode } from '@prisma/client';
import { ToolExecutor } from './tool-executor';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

function buildUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u-1',
    email: 'u@demo.com',
    roles: [],
    managedBranchIds: [],
    ...overrides,
  } as AuthenticatedUser;
}

function mockPrisma() {
  return {
    employee: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    attendanceSession: { findMany: jest.fn(), groupBy: jest.fn() },
    branch: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  };
}

describe('ToolExecutor — scope guards', () => {
  it('manager calling get_branch_today_overview for OUT-OF-SCOPE branch → returns BRANCH_OUT_OF_SCOPE, never hits DB', async () => {
    const prisma = mockPrisma();
    const exec = new ToolExecutor(prisma as never);
    const user = buildUser({ roles: [RoleCode.manager], managedBranchIds: ['b-own'] });
    const result = await exec.run(user, 'get_branch_today_overview', { branch_id: 'b-other' });
    expect(result).toMatchObject({ error: 'BRANCH_OUT_OF_SCOPE' });
    expect(prisma.branch.findUnique).not.toHaveBeenCalled();
  });

  it('employee calling admin-only get_system_overview → INSUFFICIENT_PERMISSION', async () => {
    const prisma = mockPrisma();
    const exec = new ToolExecutor(prisma as never);
    const user = buildUser({ roles: [RoleCode.employee] });
    const result = await exec.run(user, 'get_system_overview', {});
    expect(result).toMatchObject({ error: 'INSUFFICIENT_PERMISSION' });
    expect(prisma.employee.count).not.toHaveBeenCalled();
  });

  it('manager calling admin-only compare_branches → INSUFFICIENT_PERMISSION', async () => {
    const prisma = mockPrisma();
    const exec = new ToolExecutor(prisma as never);
    const user = buildUser({ roles: [RoleCode.manager], managedBranchIds: ['b-own'] });
    const result = await exec.run(user, 'compare_branches', {
      date_from: '2026-04-01',
      date_to: '2026-04-07',
    });
    expect(result).toMatchObject({ error: 'INSUFFICIENT_PERMISSION' });
    expect(prisma.attendanceSession.groupBy).not.toHaveBeenCalled();
  });

  it('admin bypasses BRANCH scope check for any branch_id', async () => {
    const prisma = mockPrisma();
    prisma.branch.findUnique.mockResolvedValue({ id: 'b-x', name: 'Test' });
    prisma.attendanceSession.findMany.mockResolvedValue([]);
    const exec = new ToolExecutor(prisma as never);
    const user = buildUser({ roles: [RoleCode.admin] });
    const result = await exec.run(user, 'get_branch_today_overview', { branch_id: 'b-x' });
    expect(result).toMatchObject({ branch: { id: 'b-x', name: 'Test' } });
    expect(prisma.branch.findUnique).toHaveBeenCalledWith({
      where: { id: 'b-x' },
      select: { id: true, name: true },
    });
  });

  it('unknown tool name returns UNKNOWN_TOOL without dispatch', async () => {
    const prisma = mockPrisma();
    const exec = new ToolExecutor(prisma as never);
    const result = await exec.run(buildUser({ roles: [RoleCode.admin] }), 'not_a_tool', {});
    expect(result).toEqual({ error: 'UNKNOWN_TOOL', tool: 'not_a_tool' });
  });

  it('manager list_late_employees without branch_id → restricts to managed branches', async () => {
    const prisma = mockPrisma();
    prisma.attendanceSession.groupBy.mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([]);
    const exec = new ToolExecutor(prisma as never);
    const user = buildUser({ roles: [RoleCode.manager], managedBranchIds: ['b1', 'b2'] });
    await exec.run(user, 'list_late_employees', {
      date_from: '2026-04-01',
      date_to: '2026-04-07',
    });
    const call = prisma.attendanceSession.groupBy.mock.calls[0][0];
    expect(call.where.branchId).toEqual({ in: ['b1', 'b2'] });
  });
});
