import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

export interface JwtAccessPayload {
  sub: string;
  email: string;
  roles: string[];
  managed_branch_ids: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      // Authorization header only. SSE clients use a header-capable fetch
      // stream, so the access token is never accepted from the query string
      // (where it would leak to access logs, history and the Referer header).
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtAccessPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles,
      managedBranchIds: payload.managed_branch_ids ?? [],
    };
  }
}
