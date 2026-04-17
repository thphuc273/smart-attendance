import { Test, TestingModule } from '@nestjs/testing';
import { AuditAction } from '@prisma/client';
import { AuditLogsService } from './audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      auditLog: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditLogsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AuditLogsService);
  });

  it('applies action + entity_type filters', async () => {
    await service.list({
      action: AuditAction.update,
      entity_type: 'AttendanceSession',
      page: 1,
      limit: 20,
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: AuditAction.update, entityType: 'AttendanceSession' },
      }),
    );
  });

  it('inclusive date_to set to 23:59:59 UTC', async () => {
    await service.list({ date_from: '2026-04-01', date_to: '2026-04-15', page: 1, limit: 20 });
    const arg = prisma.auditLog.findMany.mock.calls[0][0];
    const to: Date = arg.where.createdAt.lte;
    expect(to.getUTCHours()).toBe(23);
    expect(to.getUTCMinutes()).toBe(59);
  });

  it('returns pagination meta with total_pages = ceil(total/limit)', async () => {
    prisma.auditLog.count.mockResolvedValueOnce(45);
    prisma.auditLog.findMany.mockResolvedValueOnce([]);
    const r = await service.list({ page: 2, limit: 20 });
    expect(r.meta).toEqual({ total: 45, page: 2, limit: 20, total_pages: 3 });
  });

  it('maps user relation to snake_case', async () => {
    prisma.auditLog.count.mockResolvedValueOnce(1);
    prisma.auditLog.findMany.mockResolvedValueOnce([
      {
        id: 'a1',
        action: AuditAction.update,
        entityType: 'AttendanceSession',
        entityId: 's1',
        before: {},
        after: {},
        ipAddress: null,
        userAgent: null,
        createdAt: new Date('2026-04-16T08:00:00Z'),
        user: { id: 'u1', email: 'admin@demo.com', fullName: 'Admin' },
      },
    ]);
    const r = await service.list({ page: 1, limit: 20 });
    expect(r.items[0].user).toEqual({ id: 'u1', email: 'admin@demo.com', full_name: 'Admin' });
  });
});
