import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { buildTestApp, PrismaMock } from './app-factory';

jest.mock('argon2', () => ({ verify: jest.fn(), hash: jest.fn() }));
const argon2Verify = argon2.verify as jest.MockedFunction<typeof argon2.verify>;

async function loginAs(
  app: INestApplication,
  prisma: PrismaMock,
  role: 'admin' | 'manager' | 'employee',
  managedBranchIds: string[] = [],
): Promise<string> {
  argon2Verify.mockResolvedValueOnce(true);
  (prisma.user!.findUnique as jest.Mock).mockResolvedValueOnce({
    id: `${role}-user-1`,
    email: `${role}@demo.com`,
    passwordHash: 'hashed',
    fullName: role,
    status: 'active',
    userRoles: [{ role: { code: role } }],
    managedBranches: managedBranchIds.map((branchId) => ({ branchId })),
  });
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: `${role}@demo.com`, password: 'Any@123' });
  return res.body.data.access_token;
}

describe('Override session (e2e) — golden path: manager overrides → AuditLog + Notification', () => {
  let app: INestApplication;
  let prisma: PrismaMock;

  const sessionId = '00000000-0000-0000-0000-0000000000aa';
  const branchId = '00000000-0000-0000-0000-0000000000bb';

  beforeEach(async () => {
    argon2Verify.mockReset();
    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      attendanceSession: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      managerBranch: { findUnique: jest.fn() },
      auditLog: { create: jest.fn() },
      notification: { create: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    } as unknown as PrismaMock;
    app = await buildTestApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('PATCH /attendance/sessions/:id — manager in scope → 200, AuditLog + Notification created', async () => {
    const token = await loginAs(app, prisma, 'manager', [branchId]);

    (prisma.attendanceSession!.findUnique as jest.Mock).mockResolvedValueOnce({
      id: sessionId,
      branchId,
      status: 'absent',
      note: null,
      workDate: new Date('2026-04-15'),
      employee: { user: { id: 'emp-user-1' } },
      branch: { name: 'HCM-Q1' },
    });
    (prisma.managerBranch!.findUnique as jest.Mock).mockResolvedValueOnce({
      userId: 'manager-user-1',
      branchId,
    });
    (prisma.attendanceSession!.update as jest.Mock).mockResolvedValueOnce({
      id: sessionId,
      status: 'late',
    });
    (prisma.auditLog!.create as jest.Mock).mockResolvedValueOnce({});
    (prisma.notification!.create as jest.Mock).mockResolvedValueOnce({});

    await request(app.getHttpServer())
      .patch(`/api/v1/attendance/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'late', note: 'Approved late check-in' })
      .expect(200);

    // AuditLog mandatory
    expect(prisma.auditLog!.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'update',
        entityType: 'AttendanceSession',
        entityId: sessionId,
        before: { status: 'absent', note: null },
        after: expect.objectContaining({ status: 'late' }),
      }),
    });

    // Notification to the affected employee
    expect(prisma.notification!.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'emp-user-1',
        type: 'override',
        data: expect.objectContaining({ sessionId, newStatus: 'late' }),
      }),
    });
  });

  it('PATCH /attendance/sessions/:id — manager out of scope → 404 (no audit, no notify)', async () => {
    const token = await loginAs(app, prisma, 'manager', ['other-branch']);

    (prisma.attendanceSession!.findUnique as jest.Mock).mockResolvedValueOnce({
      id: sessionId,
      branchId,
      status: 'absent',
      note: null,
      workDate: new Date('2026-04-15'),
      employee: { user: { id: 'emp-user-1' } },
      branch: { name: 'HCM-Q1' },
    });
    (prisma.managerBranch!.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .patch(`/api/v1/attendance/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'late', note: 'try' })
      .expect(404);

    expect(prisma.auditLog!.create).not.toHaveBeenCalled();
    expect(prisma.notification!.create).not.toHaveBeenCalled();
  });

  it('PATCH /attendance/sessions/:id — employee role → 403 INSUFFICIENT_PERMISSION', async () => {
    const token = await loginAs(app, prisma, 'employee');

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/attendance/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'late', note: 'try' })
      .expect(403);

    expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSION');
  });
});
