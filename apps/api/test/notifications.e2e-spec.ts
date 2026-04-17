import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { buildTestApp, PrismaMock } from './app-factory';

jest.mock('argon2', () => ({ verify: jest.fn(), hash: jest.fn() }));
const argon2Verify = argon2.verify as jest.MockedFunction<typeof argon2.verify>;

async function loginAs(app: INestApplication, prisma: PrismaMock): Promise<string> {
  argon2Verify.mockResolvedValueOnce(true);
  (prisma.user!.findUnique as jest.Mock).mockResolvedValueOnce({
    id: 'user-emp-1',
    email: 'emp@demo.com',
    passwordHash: 'hashed',
    fullName: 'Emp',
    status: 'active',
    userRoles: [{ role: { code: 'employee' } }],
    managedBranches: [],
  });
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'emp@demo.com', password: 'Any@123' });
  return res.body.data.access_token;
}

describe('Notifications (e2e)', () => {
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
      notification: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    } as unknown as PrismaMock;
    app = await buildTestApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /notifications — unauthenticated → 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications').expect(401);
  });

  it('GET /notifications — returns scoped envelope with unread meta', async () => {
    const token = await loginAs(app, prisma);
    (prisma.notification!.count as jest.Mock)
      .mockResolvedValueOnce(2) // total
      .mockResolvedValueOnce(1); // unread
    (prisma.notification!.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'n1',
        type: 'missing_checkout',
        title: 't1',
        body: 'b1',
        data: null,
        readAt: null,
        createdAt: new Date('2026-04-15'),
      },
      {
        id: 'n2',
        type: 'override',
        title: 't2',
        body: 'b2',
        data: null,
        readAt: new Date('2026-04-15'),
        createdAt: new Date('2026-04-14'),
      },
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.meta).toMatchObject({ total: 2, unread: 1 });
    expect(res.body.data.items).toHaveLength(2);
    expect((prisma.notification!.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
      userId: 'user-emp-1',
    });
  });

  it('PATCH /notifications/:id/read — sets readAt for own notification', async () => {
    const token = await loginAs(app, prisma);
    (prisma.notification!.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'n1',
      userId: 'user-emp-1',
      readAt: null,
    });
    (prisma.notification!.update as jest.Mock).mockResolvedValueOnce({ id: 'n1' });

    await request(app.getHttpServer())
      .patch('/api/v1/notifications/n1/read')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(prisma.notification!.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: expect.objectContaining({ readAt: expect.any(Date) }),
    });
  });

  it('PATCH /notifications/:id/read — 404 when notification belongs to other user', async () => {
    const token = await loginAs(app, prisma);
    (prisma.notification!.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'n1',
      userId: 'someone-else',
      readAt: null,
    });

    await request(app.getHttpServer())
      .patch('/api/v1/notifications/n1/read')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(prisma.notification!.update).not.toHaveBeenCalled();
  });

  it('POST /notifications/read-all — marks own unread notifications as read', async () => {
    const token = await loginAs(app, prisma);
    (prisma.notification!.updateMany as jest.Mock).mockResolvedValueOnce({ count: 5 });

    await request(app.getHttpServer())
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(prisma.notification!.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-emp-1', readAt: null },
      data: expect.objectContaining({ readAt: expect.any(Date) }),
    });
  });
});
