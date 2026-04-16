import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BranchScopeGuard } from './branch-scope.guard';

interface Req {
  user?: { roles: string[]; managedBranchIds: string[] };
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

function makeContext(req: Req): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('BranchScopeGuard', () => {
  const guard = new BranchScopeGuard();

  it('should always allow admin regardless of scope', () => {
    const ctx = makeContext({
      user: { roles: ['admin'], managedBranchIds: [] },
      params: { id: 'any-branch' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow manager when branch id is inside managedBranchIds', () => {
    const ctx = makeContext({
      user: { roles: ['manager'], managedBranchIds: ['b1', 'b2'] },
      params: { id: 'b1' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject manager with BRANCH_OUT_OF_SCOPE when branch id outside scope', () => {
    const ctx = makeContext({
      user: { roles: ['manager'], managedBranchIds: ['b1'] },
      params: { id: 'b9' },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    try {
      guard.canActivate(ctx);
    } catch (e) {
      expect((e as ForbiddenException).getResponse()).toMatchObject({ code: 'BRANCH_OUT_OF_SCOPE' });
    }
  });

  it('should accept branch_id via body for POST/PATCH payloads', () => {
    const ctx = makeContext({
      user: { roles: ['manager'], managedBranchIds: ['b1'] },
      body: { branch_id: 'b1' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject manager when body branch_id outside scope', () => {
    const ctx = makeContext({
      user: { roles: ['manager'], managedBranchIds: ['b1'] },
      body: { branch_id: 'b9' },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should pass through when no branch id found on request — service layer enforces further', () => {
    const ctx = makeContext({
      user: { roles: ['manager'], managedBranchIds: [] },
      params: {},
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw UNAUTHORIZED when no user on request', () => {
    const ctx = makeContext({ params: { id: 'b1' } });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
