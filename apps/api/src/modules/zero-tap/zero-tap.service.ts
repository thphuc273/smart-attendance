import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { checkZeroTapEligibility } from '../../common/utils/zero-tap-guard';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  JOB_ZERO_TAP_REVOKE_CLEANUP_CRON,
  QUEUE_ZERO_TAP_REVOKE_CLEANUP,
} from '../queue/queue.constants';
import {
  PatchZeroTapSettingDto,
  UpsertZeroTapPolicyDto,
  ZeroTapCheckInDto,
  ZeroTapCheckOutDto,
} from './dto/zero-tap.dto';

function localHHMM(d: Date): string {
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${String(vn.getUTCHours()).padStart(2, '0')}:${String(vn.getUTCMinutes()).padStart(2, '0')}`;
}

@Injectable()
export class ZeroTapService implements OnModuleInit {
  private readonly logger = new Logger(ZeroTapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    @InjectQueue(QUEUE_ZERO_TAP_REVOKE_CLEANUP)
    private readonly revokeCleanupQueue: Queue,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    // Daily 08:00 VN (01:00 UTC) — restore auto-revoked devices past 7d cooldown
    await this.revokeCleanupQueue.add(
      JOB_ZERO_TAP_REVOKE_CLEANUP_CRON,
      {},
      {
        repeat: { pattern: '0 1 * * *' },
        jobId: JOB_ZERO_TAP_REVOKE_CLEANUP_CRON,
      },
    );
    this.logger.log('Scheduled zero-tap revoke cleanup 08:00 VN');
  }

  async getMySettings(userId: string) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { userId },
      select: { id: true },
    });
    const devices = await this.prisma.employeeDevice.findMany({
      where: { employeeId: employee.id },
      select: {
        id: true,
        deviceFingerprint: true,
        deviceName: true,
        platform: true,
        isTrusted: true,
        zeroTapEnabled: true,
        zeroTapConsentAt: true,
        zeroTapRevokedAt: true,
        zeroTapLastTriggerAt: true,
        successfulCheckinCount: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    return { items: devices };
  }

  async patchMySetting(userId: string, dto: PatchZeroTapSettingDto) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { userId },
      select: { id: true },
    });
    const device = await this.prisma.employeeDevice.findUnique({
      where: { id: dto.device_id },
    });
    if (!device || device.employeeId !== employee.id) {
      throw new NotFoundException('Device not found');
    }

    const now = new Date();
    const data: any = { zeroTapEnabled: dto.enabled };
    if (dto.enabled && !device.zeroTapConsentAt) data.zeroTapConsentAt = now;
    if (dto.enabled) data.zeroTapRevokedAt = null;
    if (dto.revoke) {
      data.zeroTapEnabled = false;
      data.zeroTapRevokedAt = now;
      data.zeroTapRevokeReason = 'user_opt_out';
    }

    return this.prisma.employeeDevice.update({
      where: { id: device.id },
      data,
      select: {
        id: true,
        zeroTapEnabled: true,
        zeroTapConsentAt: true,
        zeroTapRevokedAt: true,
      },
    });
  }

  private async assertManagerScope(actor: AuthenticatedUser, branchId: string) {
    if (actor.roles.includes(RoleCode.admin)) return;
    const managed = await this.prisma.managerBranch.findUnique({
      where: { userId_branchId: { userId: actor.id, branchId } },
    });
    if (!managed) {
      throw new ForbiddenException({
        code: 'BRANCH_OUT_OF_SCOPE',
        message: 'Branch outside your scope',
      });
    }
  }

  async getPolicy(actor: AuthenticatedUser, branchId: string) {
    await this.assertManagerScope(actor, branchId);
    const policy = await this.prisma.branchZeroTapPolicy.findUnique({
      where: { branchId },
    });
    return (
      policy ?? {
        branchId,
        enabled: false,
        windowStart: '07:30',
        windowEnd: '09:30',
        cooldownSeconds: 600,
        minManualCheckinsToEnable: 2,
      }
    );
  }

  async upsertPolicy(actor: AuthenticatedUser, branchId: string, dto: UpsertZeroTapPolicyDto) {
    // Controller already enforces admin-only, but double-check here as defence in depth.
    if (!actor.roles.includes(RoleCode.admin)) {
      throw new ForbiddenException({ code: 'ADMIN_ONLY', message: 'Admin only' });
    }
    const before = await this.prisma.branchZeroTapPolicy.findUnique({ where: { branchId } });

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.branchZeroTapPolicy.upsert({
        where: { branchId },
        create: {
          branchId,
          enabled: dto.enabled,
          windowStart: dto.window_start,
          windowEnd: dto.window_end,
          cooldownSeconds: dto.cooldown_seconds,
          minManualCheckinsToEnable: dto.min_manual_checkins_to_enable,
        },
        update: {
          enabled: dto.enabled,
          windowStart: dto.window_start,
          windowEnd: dto.window_end,
          cooldownSeconds: dto.cooldown_seconds,
          minManualCheckinsToEnable: dto.min_manual_checkins_to_enable,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: before ? 'update' : 'create',
          entityType: 'BranchZeroTapPolicy',
          entityId: branchId,
          before: before ? (before as any) : null,
          after: updated as any,
        },
      });

      // branch_disabled revocation cascade: when admin flips enabled → false,
      // auto-revoke all active zero-tap devices on that branch (spec §6 layer 4).
      if (before?.enabled && !dto.enabled) {
        await tx.employeeDevice.updateMany({
          where: {
            employee: { primaryBranchId: branchId },
            zeroTapEnabled: true,
            zeroTapRevokedAt: null,
          },
          data: {
            zeroTapEnabled: false,
            zeroTapRevokedAt: new Date(),
            zeroTapRevokeReason: 'branch_disabled',
          },
        });
      }
      return updated;
    });
    return result;
  }

  async revokeForDevice(
    employeeId: string,
    deviceId: string,
    reason:
      | 'admin_disabled'
      | 'attestation_failed'
      | 'mock_location_detected'
      | 'branch_disabled' = 'admin_disabled',
    actorId?: string,
  ) {
    const device = await this.prisma.employeeDevice.findUnique({ where: { id: deviceId } });
    if (!device || device.employeeId !== employeeId) {
      throw new NotFoundException('Device not found for employee');
    }
    const updated = await this.prisma.employeeDevice.update({
      where: { id: deviceId },
      data: {
        zeroTapEnabled: false,
        zeroTapRevokedAt: new Date(),
        zeroTapRevokeReason: reason,
      },
    });
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          userId: actorId,
          action: 'update',
          entityType: 'EmployeeDevice.zeroTap',
          entityId: deviceId,
          before: {
            zeroTapEnabled: device.zeroTapEnabled,
            zeroTapRevokedAt: device.zeroTapRevokedAt,
          },
          after: { zeroTapEnabled: false, reason },
        },
      });
    }
    return updated;
  }

  /**
   * Zero-tap check-in: run eligibility guard, then delegate to manual
   * attendance path with trigger='zero_tap' and nonce dedupe.
   */
  async zeroTapCheckIn(
    userId: string,
    dto: ZeroTapCheckInDto,
    attestationOk: boolean,
  ) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { userId },
      include: { primaryBranch: { include: { zeroTapPolicy: true } } },
    });
    const device = await this.prisma.employeeDevice.findUnique({
      where: {
        employeeId_deviceFingerprint: {
          employeeId: employee.id,
          deviceFingerprint: dto.device_fingerprint,
        },
      },
    });
    if (!device) {
      throw new UnprocessableEntityException({
        code: 'DEVICE_NOT_REGISTERED',
        message: 'Device must check in manually at least once before zero-tap',
      });
    }

    // Nonce replay check
    if (dto.nonce) {
      const existing = await this.prisma.attendanceEvent.findUnique({
        where: { device_nonce_unique: { deviceId: device.id, nonce: dto.nonce } },
      });
      if (existing) {
        throw new ConflictException({ code: 'REPLAY', message: 'Nonce already used' });
      }
    }

    const triggerAt = new Date();
    const eligibility = checkZeroTapEligibility({
      triggerAt,
      branchPolicy: employee.primaryBranch?.zeroTapPolicy
        ? {
            enabled: employee.primaryBranch.zeroTapPolicy.enabled,
            windowStart: employee.primaryBranch.zeroTapPolicy.windowStart,
            windowEnd: employee.primaryBranch.zeroTapPolicy.windowEnd,
            cooldownSeconds: employee.primaryBranch.zeroTapPolicy.cooldownSeconds,
            minManualCheckinsToEnable:
              employee.primaryBranch.zeroTapPolicy.minManualCheckinsToEnable,
          }
        : null,
      device: {
        isTrusted: device.isTrusted,
        zeroTapEnabled: device.zeroTapEnabled,
        zeroTapConsentAt: device.zeroTapConsentAt,
        zeroTapRevokedAt: device.zeroTapRevokedAt,
        zeroTapLastTriggerAt: device.zeroTapLastTriggerAt,
        successfulCheckinCount: device.successfulCheckinCount,
      },
      localHHMM: localHHMM(triggerAt),
    });

    if (!eligibility.ok) {
      throw new ForbiddenException({
        code: `ZERO_TAP_${eligibility.reason}`,
        message: `Zero-tap blocked: ${eligibility.reason}`,
      });
    }

    const result = await this.attendance.checkIn(userId, dto);

    // Stamp trigger-specific metadata on the latest event + device state.
    await this.prisma.$transaction([
      this.prisma.attendanceEvent.update({
        where: { id: result.event_id },
        data: {
          trigger: 'zero_tap',
          nonce: dto.nonce,
          triggerAt,
          attestationOk,
        },
      }),
      this.prisma.employeeDevice.update({
        where: { id: device.id },
        data: { zeroTapLastTriggerAt: triggerAt },
      }),
    ]);

    // Security: if mock location detected during zero-tap, auto-revoke consent.
    // BullMQ cron will re-enable after 7 days (spec §6 layer 4).
    const flags = (result.risk_flags ?? []) as string[];
    if (dto.is_mock_location || flags.includes('mock_location')) {
      await this.revokeForDevice(employee.id, device.id, 'mock_location_detected');
    }
    if (!attestationOk) {
      await this.revokeForDevice(employee.id, device.id, 'attestation_failed');
    }

    return { ...result, trigger: 'zero_tap' };
  }

  async zeroTapCheckOut(userId: string, dto: ZeroTapCheckOutDto, attestationOk: boolean) {
    // Check-out has no window/cooldown constraints — still require consent + trust.
    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { userId } });
    const device = await this.prisma.employeeDevice.findUnique({
      where: {
        employeeId_deviceFingerprint: {
          employeeId: employee.id,
          deviceFingerprint: dto.device_fingerprint,
        },
      },
    });
    if (!device || !device.zeroTapEnabled || device.zeroTapRevokedAt || !device.isTrusted) {
      throw new ForbiddenException({
        code: 'ZERO_TAP_NOT_ALLOWED',
        message: 'Zero-tap not available for this device',
      });
    }

    if (dto.nonce) {
      const existing = await this.prisma.attendanceEvent.findUnique({
        where: { device_nonce_unique: { deviceId: device.id, nonce: dto.nonce } },
      });
      if (existing) throw new ConflictException({ code: 'REPLAY', message: 'Nonce already used' });
    }

    const result = await this.attendance.checkOut(userId, dto);
    await this.prisma.attendanceEvent.update({
      where: { id: result.event_id },
      data: { trigger: 'zero_tap', nonce: dto.nonce, triggerAt: new Date(), attestationOk },
    });
    return { ...result, trigger: 'zero_tap' };
  }
}
