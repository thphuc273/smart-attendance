import { createHash, timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import {
  generateHmacSecret,
  generateKioskToken,
  signQrToken,
  verifyQrToken,
} from '../../common/utils/qr-token';
import { QrCheckInDto } from './dto/kiosk.dto';

function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

function compareHash(plaintext: string, hashed: string): boolean {
  const a = Buffer.from(hashToken(plaintext));
  const b = Buffer.from(hashed);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function workDateVN(at: Date = new Date()): Date {
  const nowMs = at.getTime() + 7 * 3600 * 1000;
  const vn = new Date(nowMs);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
}

@Injectable()
export class KioskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
  ) {}

  /**
   * Rotate (or create on first call) branch QR secret + kiosk token.
   * Returns plaintext kiosk token ONCE — caller must store it on the kiosk device.
   * DB only keeps the sha256 hash.
   */
  async rotate(branchId: string, actorId?: string) {
    const plainKiosk = generateKioskToken();
    const plainHmac = generateHmacSecret();
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.branchQrSecret.upsert({
        where: { branchId },
        create: {
          branchId,
          hmacSecret: plainHmac,
          kioskToken: hashToken(plainKiosk),
        },
        update: {
          hmacSecret: plainHmac,
          kioskToken: hashToken(plainKiosk),
          rotatedAt: new Date(),
        },
      });
      if (actorId) {
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: 'update',
            entityType: 'BranchQrSecret',
            entityId: branchId,
            before: {},
            after: { rotatedAt: updated.rotatedAt, event: 'rotate' },
          },
        });
      }
      return updated;
    });
    return {
      branch_id: branchId,
      kiosk_token: plainKiosk,
      rotated_at: result.rotatedAt,
      note: 'Store kiosk_token on the kiosk device now — it will not be shown again.',
    };
  }

  async issueToken(branchId: string, kioskTokenHeader: string | undefined) {
    if (!kioskTokenHeader) {
      throw new UnauthorizedException('Missing X-Kiosk-Token');
    }
    const secret = await this.prisma.branchQrSecret.findUnique({ where: { branchId } });
    if (!secret || !compareHash(kioskTokenHeader, secret.kioskToken)) {
      throw new UnauthorizedException('Invalid kiosk token');
    }
    const signed = signQrToken({ branchId, secret: secret.hmacSecret });
    return {
      token: signed.token,
      expires_at: signed.expiresAt,
      bucket_seconds: 30,
      refresh_every_seconds: 25,
    };
  }

  async qrCheckIn(userId: string, dto: QrCheckInDto) {
    const secret = await this.prisma.branchQrSecret.findUnique({
      where: { branchId: dto.branch_id },
    });
    if (!secret) throw new NotFoundException('Kiosk not configured for this branch');

    const verify = verifyQrToken({
      token: dto.qr_token,
      secret: secret.hmacSecret,
      expectedBranchId: dto.branch_id,
    });
    if (!verify.ok) {
      throw new ForbiddenException({
        code: `QR_${verify.reason}`,
        message: 'Invalid QR token',
      });
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { userId },
      select: {
        id: true,
        primaryBranchId: true,
        assignments: {
          where: {
            effectiveFrom: { lte: new Date() },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
          },
          select: { branchId: true },
        },
      },
    });

    const assignedBranchIds = new Set<string>([
      employee.primaryBranchId,
      ...employee.assignments.map((a) => a.branchId),
    ]);
    if (!assignedBranchIds.has(dto.branch_id)) {
      throw new ForbiddenException({
        code: 'BRANCH_NOT_ASSIGNED',
        message: 'Employee not assigned to this branch',
      });
    }

    // Require device previously trusted (manual check-in history) for kiosk.
    const device = await this.prisma.employeeDevice.findUnique({
      where: {
        employeeId_deviceFingerprint: {
          employeeId: employee.id,
          deviceFingerprint: dto.device_fingerprint,
        },
      },
    });
    if (!device || !device.isTrusted) {
      throw new UnprocessableEntityException({
        code: 'DEVICE_NOT_TRUSTED',
        message: 'Device must have prior trusted manual check-in',
      });
    }

    // One QR check-in per day per employee.
    const workDate = workDateVN();
    const session = await this.prisma.attendanceSession.findUnique({
      where: { employeeId_workDate: { employeeId: employee.id, workDate } },
    });
    if (session?.qrTokenUsedAt) {
      throw new ConflictException({
        code: 'QR_ALREADY_USED_TODAY',
        message: 'QR check-in already used today',
      });
    }

    const result = await this.attendance.checkIn(userId, dto);

    await this.prisma.$transaction([
      this.prisma.attendanceSession.update({
        where: { id: result.session_id },
        data: { qrTokenUsedAt: new Date() },
      }),
      this.prisma.attendanceEvent.update({
        where: { id: result.event_id },
        data: {
          trigger: 'qr_kiosk',
          nonce: verify.nonce,
          triggerAt: new Date(),
          validationMethod: 'qr',
        },
      }),
    ]);

    return { ...result, trigger: 'qr_kiosk' };
  }
}
