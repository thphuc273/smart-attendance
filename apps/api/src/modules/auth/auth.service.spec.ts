import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn(),
}));

const argon2Verify = argon2.verify as jest.MockedFunction<typeof argon2.verify>;

type MockedPrisma = {
  user: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
  };
};

function makePrismaMock(): MockedPrisma {
  return {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function buildUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-uuid',
    email: 'admin@demo.com',
    passwordHash: 'hashed',
    fullName: 'System Admin',
    status: 'active',
    userRoles: [{ role: { code: 'admin' } }],
    managedBranches: [],
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: MockedPrisma;
  let jwt: { signAsync: jest.Mock };
  let config: { getOrThrow: jest.Mock };

  beforeEach(async () => {
    argon2Verify.mockReset();
    prisma = makePrismaMock();
    jwt = { signAsync: jest.fn().mockImplementation((_p, opts) => Promise.resolve(`token-${opts.secret}`)) };
    config = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        const map: Record<string, string> = {
          JWT_ACCESS_SECRET: 'access-secret',
          JWT_ACCESS_TTL: '15m',
          JWT_REFRESH_SECRET: 'refresh-secret',
          JWT_REFRESH_TTL: '7d',
        };
        return map[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // ─── login ──────────────────────────────────────────────────

  describe('login', () => {
    it('should issue access+refresh tokens and update last_login_at when credentials are valid', async () => {
      argon2Verify.mockResolvedValueOnce(true);
      prisma.user.findUnique.mockResolvedValueOnce(buildUser());

      const result = await service.login('admin@demo.com', 'Admin@123');

      expect(result).toMatchObject({
        access_token: 'token-access-secret',
        refresh_token: 'token-refresh-secret',
        user: { id: 'user-uuid', email: 'admin@demo.com', full_name: 'System Admin', roles: ['admin'] },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid' },
        data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      });
    });

    it('should include managed_branch_ids in JWT payload for manager role', async () => {
      argon2Verify.mockResolvedValueOnce(true);
      prisma.user.findUnique.mockResolvedValueOnce(
        buildUser({
          userRoles: [{ role: { code: 'manager' } }],
          managedBranches: [{ branchId: 'branch-1' }, { branchId: 'branch-2' }],
        }),
      );

      await service.login('manager@demo.com', 'Pass@123');

      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          managed_branch_ids: ['branch-1', 'branch-2'],
          roles: ['manager'],
        }),
        expect.any(Object),
      );
    });

    it('should throw INVALID_CREDENTIALS when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.login('unknown@demo.com', 'whatever')).rejects.toMatchObject({
        status: 401,
        response: { code: 'INVALID_CREDENTIALS' },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should throw INVALID_CREDENTIALS (not revealing "suspended") when user is suspended', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(buildUser({ status: 'suspended' }));
      await expect(service.login('admin@demo.com', 'Admin@123')).rejects.toThrow(UnauthorizedException);

      prisma.user.findUnique.mockResolvedValueOnce(buildUser({ status: 'suspended' }));
      await expect(service.login('admin@demo.com', 'Admin@123').catch((e) => e.response.code)).resolves.toBe(
        'INVALID_CREDENTIALS',
      );
    });

    it('should throw INVALID_CREDENTIALS when password does not match', async () => {
      argon2Verify.mockResolvedValueOnce(false);
      prisma.user.findUnique.mockResolvedValueOnce(buildUser());

      await expect(service.login('admin@demo.com', 'wrong')).rejects.toMatchObject({
        status: 401,
        response: { code: 'INVALID_CREDENTIALS' },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ─── refresh ────────────────────────────────────────────────

  describe('refresh', () => {
    it('should reissue both tokens with fresh role + branch claims', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(buildUser());

      const result = await service.refresh('user-uuid');

      expect(result).toEqual({ access_token: 'token-access-secret', refresh_token: 'token-refresh-secret' });
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
    });

    it('should reject when user has been deactivated after token was issued', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(buildUser({ status: 'inactive' }));

      await expect(service.refresh('user-uuid')).rejects.toMatchObject({
        status: 401,
        response: { code: 'INVALID_REFRESH_TOKEN' },
      });
    });
  });

  // ─── getMe ──────────────────────────────────────────────────

  describe('getMe', () => {
    it('should return profile with employee=null and managed_branches list', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'user-uuid',
        email: 'admin@demo.com',
        fullName: 'System Admin',
        userRoles: [{ role: { code: 'admin' } }],
        managedBranches: [{ branch: { id: 'b1', code: 'HCM-Q1', name: 'HCM-Q1' } }],
      });

      const me = await service.getMe('user-uuid');

      expect(me).toEqual({
        id: 'user-uuid',
        email: 'admin@demo.com',
        full_name: 'System Admin',
        roles: ['admin'],
        employee: null,
        managed_branches: [{ id: 'b1', code: 'HCM-Q1', name: 'HCM-Q1' }],
      });
    });
  });
});
