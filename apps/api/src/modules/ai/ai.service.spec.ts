import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { AiService } from './ai.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

type PrismaMock = {
  branch: { findUnique: jest.Mock };
  aiInsightCache: { findFirst: jest.Mock };
  aiChatMessage: { deleteMany: jest.Mock };
};

function makePrisma(): PrismaMock {
  return {
    branch: { findUnique: jest.fn() },
    aiInsightCache: { findFirst: jest.fn() },
    aiChatMessage: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
  };
}

function buildUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u-1',
    email: 'user@demo.com',
    roles: [],
    managedBranchIds: [],
    ...overrides,
  } as AuthenticatedUser;
}

function buildService(prisma: PrismaMock): AiService {
  return new AiService(
    prisma as unknown as never,
    { generate: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('AiService — scope enforcement on weekly insights', () => {
  let service: AiService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = makePrisma();
    service = buildService(prisma);
  });

  it('rejects non-manager/non-admin callers with INSUFFICIENT_PERMISSION', async () => {
    const user = buildUser({ roles: [RoleCode.employee] });
    await expect(service.getWeeklyInsights(user)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSION' }),
    });
    expect(prisma.branch.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a manager requesting a branch outside their managedBranchIds', async () => {
    const user = buildUser({
      roles: [RoleCode.manager],
      managedBranchIds: ['b-own'],
    });
    await expect(service.getWeeklyInsights(user, 'b-other')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'BRANCH_OUT_OF_SCOPE' }),
    });
    expect(prisma.branch.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a manager who omits branch_id (only admin can go system-wide)', async () => {
    const user = buildUser({
      roles: [RoleCode.manager],
      managedBranchIds: ['b-own'],
    });
    await expect(service.getWeeklyInsights(user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets admin bypass managedBranchIds for any branchId', async () => {
    const user = buildUser({ roles: [RoleCode.admin], managedBranchIds: [] });
    prisma.branch.findUnique.mockResolvedValue(null);
    await expect(service.getWeeklyInsights(user, 'b-anything')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.branch.findUnique).toHaveBeenCalledWith({ where: { id: 'b-anything' } });
  });
});

describe('AiService.clearChatHistory', () => {
  it('scopes deleteMany to the current user only', async () => {
    const prisma = makePrisma();
    const service = buildService(prisma);
    await service.clearChatHistory(buildUser({ id: 'u-42' }));
    expect(prisma.aiChatMessage.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-42' },
    });
  });
});
