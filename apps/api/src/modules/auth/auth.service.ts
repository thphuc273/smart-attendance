import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtRefreshPayload } from './strategies/jwt-refresh.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: { include: { role: true } },
        managedBranches: { select: { branchId: true } },
      },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không đúng',
      });
    }

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không đúng',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const roles = user.userRoles.map((ur) => ur.role.code);
    const managedBranchIds = user.managedBranches.map((mb) => mb.branchId);
    // A login starts a fresh token family.
    const { access_token, refresh_token } = await this.signTokens(
      user.id,
      user.email,
      roles,
      managedBranchIds,
      randomUUID(),
    );

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        roles,
      },
    };
  }

  async refresh(payload: JwtRefreshPayload) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenId: payload.tokenId },
    });
    // The token must exist, belong to the caller and not be expired. (The
    // JWT signature + exp are already checked by the passport strategy; this
    // is the server-side revocation state the JWT cannot carry.)
    if (!stored || stored.userId !== payload.sub || stored.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token',
      });
    }

    // Reuse detection: an already-revoked token is being presented. It was
    // either rotated or logged out — replaying it means the token leaked.
    // Revoke the whole family so both the attacker's and the victim's
    // refresh chains die, forcing a fresh login.
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; family ${stored.familyId} revoked`,
      );
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      include: {
        userRoles: { include: { role: true } },
        managedBranches: { select: { branchId: true } },
      },
    });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token',
      });
    }

    const roles = user.userRoles.map((ur) => ur.role.code);
    const managedBranchIds = user.managedBranches.map((mb) => mb.branchId);
    // Rotate within the same family.
    const { access_token, refresh_token, tokenId } = await this.signTokens(
      user.id,
      user.email,
      roles,
      managedBranchIds,
      stored.familyId,
    );
    // Retire the presented token and link it to its successor (audit trail).
    await this.prisma.refreshToken.update({
      where: { tokenId: stored.tokenId },
      data: { revokedAt: new Date(), rotatedTo: tokenId },
    });
    return { access_token, refresh_token };
  }

  async logout(userId: string) {
    // Log-out-everywhere: revoke every active refresh token for this user.
    // Access tokens stay valid until they expire — they are short-lived by
    // design, which is the trade-off for not maintaining an access-token
    // denylist.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
        employee: {
          include: {
            primaryBranch: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        },
        managedBranches: {
          include: { branch: { select: { id: true, code: true, name: true } } },
        },
      },
    });
    return {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      roles: user.userRoles.map((ur) => ur.role.code),
      employee: user.employee
        ? {
            id: user.employee.id,
            employee_code: user.employee.employeeCode,
            primary_branch: user.employee.primaryBranch,
            department: user.employee.department,
          }
        : null,
      managed_branches: user.managedBranches.map((mb) => mb.branch),
    };
  }

  /**
   * Signs an access + refresh token pair and persists the refresh token so
   * it can later be rotated or revoked. `familyId` ties the token to a
   * rotation chain. Returns `tokenId` (the new jti) so the caller can record
   * a rotation link — callers must NOT leak it into the API response.
   */
  private async signTokens(
    sub: string,
    email: string,
    roles: string[],
    managedBranchIds: string[],
    familyId: string,
  ): Promise<{ access_token: string; refresh_token: string; tokenId: string }> {
    const tokenId = randomUUID();
    const accessPayload = { sub, email, roles, managed_branch_ids: managedBranchIds };
    const access_token = await this.jwt.signAsync(accessPayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_TTL'),
    });
    const refresh_token = await this.jwt.signAsync(
      { sub, tokenId },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.getOrThrow<string>('JWT_REFRESH_TTL'),
      },
    );
    // exp is read back from the signed JWT so the DB row and the token can
    // never disagree about expiry.
    const { exp } = this.jwt.decode(refresh_token) as { exp: number };
    await this.prisma.refreshToken.create({
      data: { userId: sub, tokenId, familyId, expiresAt: new Date(exp * 1000) },
    });
    return { access_token, refresh_token, tokenId };
  }
}
