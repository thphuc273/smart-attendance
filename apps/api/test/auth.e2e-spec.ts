import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { buildTestApp, PrismaMock } from './app-factory';

jest.mock('argon2', () => ({ verify: jest.fn(), hash: jest.fn() }));
const argon2Verify = argon2.verify as jest.MockedFunction<typeof argon2.verify>;

describe('Auth (e2e)', () => {
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
    } as unknown as PrismaMock;
    app = await buildTestApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── login ─────────────────────────────────────────────────

  it('POST /auth/login — valid credentials returns {data:{access_token,refresh_token,user}} + Cache-Control:no-store', async () => {
    argon2Verify.mockResolvedValueOnce(true);
    (prisma.user!.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user-1',
      email: 'admin@demo.com',
      passwordHash: 'hashed',
      fullName: 'Admin',
      status: 'active',
      userRoles: [{ role: { code: 'admin' } }],
      managedBranches: [],
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@demo.com', password: 'Admin@123' })
      .expect(200);

    expect(res.body).toMatchObject({
      data: {
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        user: { email: 'admin@demo.com', roles: ['admin'] },
      },
    });
    expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate, private');
    expect(res.headers['pragma']).toBe('no-cache');
  });

  it('POST /auth/login — wrong password returns 401 INVALID_CREDENTIALS', async () => {
    argon2Verify.mockResolvedValueOnce(false);
    (prisma.user!.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user-1',
      email: 'admin@demo.com',
      passwordHash: 'hashed',
      fullName: 'Admin',
      status: 'active',
      userRoles: [{ role: { code: 'admin' } }],
      managedBranches: [],
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@demo.com', password: 'wrongpass' })
      .expect(401);

    expect(res.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('POST /auth/login — unknown email returns 401 INVALID_CREDENTIALS (does not reveal account existence)', async () => {
    (prisma.user!.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@demo.com', password: 'anything123' })
      .expect(401);

    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /auth/login — malformed body returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: '123' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ─── /auth/me ──────────────────────────────────────────────

  it('GET /auth/me — without Bearer returns 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('GET /auth/me — with valid Bearer returns user profile', async () => {
    // First login to obtain a real signed JWT from the app's JwtService.
    argon2Verify.mockResolvedValueOnce(true);
    (prisma.user!.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user-1',
      email: 'admin@demo.com',
      passwordHash: 'hashed',
      fullName: 'Admin',
      status: 'active',
      userRoles: [{ role: { code: 'admin' } }],
      managedBranches: [],
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@demo.com', password: 'Admin@123' });
    const token = loginRes.body.data.access_token;

    (prisma.user!.findUniqueOrThrow as jest.Mock).mockResolvedValueOnce({
      id: 'user-1',
      email: 'admin@demo.com',
      fullName: 'Admin',
      userRoles: [{ role: { code: 'admin' } }],
      managedBranches: [{ branch: { id: 'b1', code: 'HCM-Q1', name: 'HCM-Q1' } }],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toMatchObject({
      email: 'admin@demo.com',
      roles: ['admin'],
      employee: null,
      managed_branches: [{ id: 'b1', code: 'HCM-Q1', name: 'HCM-Q1' }],
    });
  });
});
