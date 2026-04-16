import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleCode } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function makeContext(user?: { roles: string[] }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow when no @Roles() decorator present', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(undefined);
    expect(guard.canActivate(makeContext({ roles: ['employee'] }))).toBe(true);
  });

  it('should allow when @Roles() is empty array', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce([]);
    expect(guard.canActivate(makeContext({ roles: ['employee'] }))).toBe(true);
  });

  it('should allow when user has one of the required roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce([RoleCode.admin, RoleCode.manager]);
    expect(guard.canActivate(makeContext({ roles: ['manager'] }))).toBe(true);
  });

  it('should throw 403 INSUFFICIENT_PERMISSION when user lacks required roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([RoleCode.admin]);

    let thrown: ForbiddenException | undefined;
    try {
      guard.canActivate(makeContext({ roles: ['employee'] }));
    } catch (e) {
      thrown = e as ForbiddenException;
    }
    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(thrown?.getResponse()).toMatchObject({ code: 'INSUFFICIENT_PERMISSION' });
  });

  it('should throw 403 UNAUTHORIZED when request has no user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce([RoleCode.admin]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
