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

describe('Branches (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaMock;

  beforeEach(async () => {
    argon2Verify.mockReset();
    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      branch: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      branchWifiConfig: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
      branchGeofence: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    } as unknown as PrismaMock;
    app = await buildTestApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /branches — unauthenticated returns 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/branches').expect(401);
  });

  it('GET /branches — admin returns {data, meta} envelope', async () => {
    const token = await loginAs(app, prisma, 'admin');
    (prisma.branch!.count as jest.Mock).mockResolvedValueOnce(0);
    (prisma.branch!.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({ data: [], meta: { page: 1, limit: 20, total: 0, total_pages: 1 } });
  });

  it('GET /branches — manager sees only branches from their managedBranchIds scope', async () => {
    const token = await loginAs(app, prisma, 'manager', ['b1', 'b2']);
    (prisma.branch!.count as jest.Mock).mockResolvedValueOnce(0);
    (prisma.branch!.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((prisma.branch!.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ id: { in: ['b1', 'b2'] } });
  });

  it('POST /branches — employee returns 403 INSUFFICIENT_PERMISSION', async () => {
    const token = await loginAs(app, prisma, 'employee');

    const res = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'HCM-Q1', name: 'HCM Q1', latitude: 10.7, longitude: 106.7 })
      .expect(403);

    expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('POST /branches — admin with valid body returns 201 + created branch', async () => {
    const token = await loginAs(app, prisma, 'admin');
    (prisma.branch!.create as jest.Mock).mockResolvedValueOnce({
      id: 'b-new',
      code: 'HCM-Q1',
      name: 'HCM Q1',
      latitude: 10.7,
      longitude: 106.7,
      radiusMeters: 150,
      timezone: 'Asia/Ho_Chi_Minh',
      status: 'active',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'HCM-Q1', name: 'HCM Q1', latitude: 10.7, longitude: 106.7 })
      .expect(201);

    expect(res.body.data.id).toBe('b-new');
  });

  it('POST /branches — invalid latitude returns 400 VALIDATION_ERROR', async () => {
    const token = await loginAs(app, prisma, 'admin');

    const res = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'HCM-Q1', name: 'HCM Q1', latitude: 999, longitude: 106.7 })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /branches/:id/wifi-configs — invalid BSSID regex returns 400', async () => {
    const token = await loginAs(app, prisma, 'admin');
    const branchId = '00000000-0000-0000-0000-00000000000a';

    const res = await request(app.getHttpServer())
      .post(`/api/v1/branches/${branchId}/wifi-configs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ssid: 'Office-5G', bssid: 'NOT-A-BSSID' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /branches/:id/wifi-configs — missing branch returns 404 RESOURCE_NOT_FOUND (not empty array)', async () => {
    const token = await loginAs(app, prisma, 'admin');
    const branchId = '00000000-0000-0000-0000-00000000000b';
    (prisma.branch!.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/branches/${branchId}/wifi-configs`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('DELETE /branches/:id — admin returns 204 and soft-deletes', async () => {
    const token = await loginAs(app, prisma, 'admin');
    const branchId = '00000000-0000-0000-0000-00000000000c';
    (prisma.branch!.findUnique as jest.Mock).mockResolvedValueOnce({ id: branchId });
    (prisma.branch!.update as jest.Mock).mockResolvedValueOnce({ id: branchId, status: 'inactive' });

    await request(app.getHttpServer())
      .delete(`/api/v1/branches/${branchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    expect(prisma.branch!.update).toHaveBeenCalledWith({ where: { id: branchId }, data: { status: 'inactive' } });
  });
});
