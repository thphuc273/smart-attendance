import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token' });
    }
    return user;
  }
}
