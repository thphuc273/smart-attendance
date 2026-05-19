import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Kiểm tra manager chỉ thao tác được branch trong scope quản lý.
 * Admin bỏ qua check này.
 * Extract branchId từ params/body/query — controller phải đảm bảo có.
 */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException({ code: 'UNAUTHORIZED', message: 'No user' });

    if (user.roles.includes('admin')) return true;

    const branchId: string | undefined =
      req.params?.id ?? req.params?.branchId ?? req.body?.branch_id ?? req.query?.branch_id;

    // Fail-closed: a non-admin reaching a branch-scoped route with no
    // resolvable branch context must be rejected, not waved through.
    if (!branchId) {
      throw new ForbiddenException({
        code: 'BRANCH_CONTEXT_REQUIRED',
        message: 'Branch context is required for this operation',
      });
    }

    if (!user.managedBranchIds.includes(branchId)) {
      throw new ForbiddenException({
        code: 'BRANCH_OUT_OF_SCOPE',
        message: 'Manager does not have access to this branch',
      });
    }
    return true;
  }
}
