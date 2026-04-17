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
): Promise<string> {
  argon2Verify.mockResolvedValueOnce(true);
  (prisma.user!.findUnique as jest.Mock).mockResolvedValueOnce({
    id: `${role}-user-1`,
    email: `${role}@demo.com`,
    passwordHash: 'hashed',
    fullName: role,
    status: 'active',
    userRoles: [{ role: { code: role } }],
    managedBranches: [],
  });
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: `${role}@demo.com`, password: 'Any@123' });
  return res.body.data.access_token;
}

describe('Zero-tap (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaMock;

  beforeEach(async () => {
    argon2Verify.mockReset();
    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      employee: {
        findUniqueOrThrow: jest.fn(),
        findUnique: jest.fn(),
      },
      employeeDevice: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      attendanceEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      attendanceSession: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      workScheduleAssignment: {
        findFirst: jest.fn(),
      },
      branch: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaMock;
    app = await buildTestApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /attendance/zero-tap/check-in — 409 Conflict REPLAY when nonce is reused', async () => {
    const token = await loginAs(app, prisma, 'employee');

    // Mock employee with a valid zero-tap policy
    (prisma.employee!.findUniqueOrThrow as jest.Mock).mockResolvedValueOnce({
      id: 'emp-1',
      primaryBranch: {
        id: 'branch-1',
        timezone: 'Asia/Ho_Chi_Minh',
        latitude: 10.0,
        longitude: 106.0,
        radiusMeters: 100,
        zeroTapPolicy: {
          enabled: true,
          windowStart: '00:00', // allow all for test
          windowEnd: '23:59',
          cooldownSeconds: 0,
          minManualCheckinsToEnable: 1,
        },
      },
    });

    // Mock an active and trusted device
    (prisma.employeeDevice!.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'dev-1',
      employeeId: 'emp-1',
      isTrusted: true,
      zeroTapEnabled: true,
      zeroTapConsentAt: new Date(),
      zeroTapRevokedAt: null,
      zeroTapLastTriggerAt: null,
      successfulCheckinCount: 5,
    });

    // Mock the replay check: The first time when looking up attendanceEvent, it finds the event implies it's ALREADY USED!
    (prisma.attendanceEvent!.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'event-1',
      nonce: 'used-nonce',
    });

    const body = {
      latitude: 10.0,
      longitude: 106.0,
      device_fingerprint: 'fp-123',
      nonce: 'used-nonce',
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/attendance/zero-tap/check-in')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(409);

    expect(res.body.error.code).toBe('REPLAY');
  });
});
