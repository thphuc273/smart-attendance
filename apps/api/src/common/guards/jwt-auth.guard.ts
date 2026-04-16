import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(err: unknown, user: TUser | false, info: unknown): TUser {
    if (err || !user) {
      const message =
        info && typeof info === 'object' && 'message' in info
          ? String((info as { message: unknown }).message)
          : 'Invalid or expired token';
      throw new UnauthorizedException({ code: 'TOKEN_EXPIRED', message });
    }
    return user;
  }
}
