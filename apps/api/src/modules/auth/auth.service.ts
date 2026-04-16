import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

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
    const tokens = await this.signTokens(user.id, user.email, roles, managedBranchIds);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        roles,
      },
    };
  }

  async refresh(sub: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: sub },
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
    return this.signTokens(user.id, user.email, roles, managedBranchIds);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
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
      managed_branches: user.managedBranches.map((mb) => mb.branch),
    };
  }

  private async signTokens(
    sub: string,
    email: string,
    roles: string[],
    managedBranchIds: string[],
  ) {
    const accessPayload = { sub, email, roles, managed_branch_ids: managedBranchIds };
    const access_token = await this.jwt.signAsync(accessPayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_TTL'),
    });
    const refresh_token = await this.jwt.signAsync(
      { sub, tokenId: randomUUID() },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.getOrThrow<string>('JWT_REFRESH_TTL'),
      },
    );
    return { access_token, refresh_token };
  }
}
