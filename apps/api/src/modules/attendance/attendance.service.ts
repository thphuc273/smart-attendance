import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AttendanceSessionStatus, DevicePlatform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CheckInDto, CheckOutDto } from './dto/check-in.dto';
import {
  ListMyAttendanceDto,
  ListSessionsDto,
  OverrideSessionDto,
} from './dto/attendance-history.dto';
import {
  isInsideGeofence,
  distanceToGeofence,
  haversineSpeedKmh,
  type Geofence,
} from '../../common/utils/geo';
import { isBssidWhitelisted, isSsidMatch, type WifiConfig } from '../../common/utils/wifi';
import { calculateTrustScore, type TrustScoreInput } from '../../common/utils/trust-score';
import { ScheduleService } from './schedule.service';

const IMPOSSIBLE_TRAVEL_KMH = 120;
const IMPOSSIBLE_TRAVEL_LOOKBACK_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleService: ScheduleService,
  ) {}

  private async detectImpossibleTravel(
    employeeId: string,
    at: Date,
    latitude: number,
    longitude: number,
  ): Promise<boolean> {
    const prev = await this.prisma.attendanceEvent.findFirst({
      where: {
        employeeId,
        status: 'success',
        latitude: { not: null },
        longitude: { not: null },
        createdAt: { gte: new Date(at.getTime() - IMPOSSIBLE_TRAVEL_LOOKBACK_MS), lt: at },
      },
      orderBy: { createdAt: 'desc' },
      select: { latitude: true, longitude: true, createdAt: true },
    });

    if (!prev || prev.latitude === null || prev.longitude === null) return false;

    const speed = haversineSpeedKmh(
      { latitude: Number(prev.latitude), longitude: Number(prev.longitude), at: prev.createdAt },
      { latitude, longitude, at },
    );
    return speed > IMPOSSIBLE_TRAVEL_KMH;
  }

  async checkIn(employeeUserId: string, dto: CheckInDto) {
    // 1. Find employee
    const employee = await this.prisma.employee.findUnique({
      where: { userId: employeeUserId },
      include: {
        primaryBranch: true,
        assignments: {
          where: {
            effectiveFrom: { lte: new Date() },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
          },
        },
      },
    });
    if (!employee) {
      throw new UnprocessableEntityException({
        code: 'NOT_ASSIGNED_TO_BRANCH',
        message: 'Employee not found',
      });
    }

    // 2. Get all branches this employee is assigned to (primary + active assignments)
    const branchIds = [
      employee.primaryBranchId,
      ...employee.assignments.map((a) => a.branchId),
    ];
    const uniqueBranchIds = [...new Set(branchIds)];

    // 3. Load branch configs (geofences + WiFi)
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: uniqueBranchIds }, status: 'active' },
      include: {
        geofences: { where: { isActive: true } },
        wifiConfigs: { where: { isActive: true } },
      },
    });

    // 4. Find which branch the check-in belongs to
    let matchedBranch: typeof branches[0] | null = null;
    let gpsValid = false;
    let bssidMatch = false;
    let ssidOnlyMatch = false;
    let closestDistance = Infinity;

    const point = { latitude: dto.latitude, longitude: dto.longitude };

    for (const branch of branches) {
      // Branch.lat/lng/radiusMeters acts as the default/implicit geofence.
      // BranchGeofence rows are ADDITIONAL (e.g. multi-entrance buildings).
      const branchGeofences: Geofence[] = [
        {
          centerLat: Number(branch.latitude),
          centerLng: Number(branch.longitude),
          radiusMeters: branch.radiusMeters,
        },
        ...branch.geofences.map((g) => ({
          centerLat: Number(g.centerLat),
          centerLng: Number(g.centerLng),
          radiusMeters: g.radiusMeters,
        })),
      ];

      for (const geofence of branchGeofences) {
        if (isInsideGeofence(point, geofence)) {
          gpsValid = true;
          matchedBranch = branch;
          break;
        }
        const dist = distanceToGeofence(point, geofence);
        if (dist < closestDistance) {
          closestDistance = dist;
          if (!matchedBranch) matchedBranch = branch;
        }
      }

      if (gpsValid) continue; // already matched this branch by GPS

      // Check WiFi
      const wifiConfigs: WifiConfig[] = branch.wifiConfigs.map((w) => ({
        ssid: w.ssid,
        bssid: w.bssid,
        isActive: w.isActive,
      }));

      if (isBssidWhitelisted(dto.bssid, wifiConfigs)) {
        bssidMatch = true;
        matchedBranch = branch;
      } else if (isSsidMatch(dto.ssid, wifiConfigs)) {
        ssidOnlyMatch = true;
        if (!matchedBranch) matchedBranch = branch;
      }
    }

    // Use primary branch as fallback for logging
    if (!matchedBranch) {
      matchedBranch = branches.find((b) => b.id === employee.primaryBranchId) ?? null;
    }

    const branchId = matchedBranch?.id ?? employee.primaryBranchId;

    // 5. Auto-register/update device
    const device = await this.upsertDevice(employee.id, dto);

    // 6. Impossible-travel detection vs previous successful GPS event
    const now = new Date();
    const impossibleTravel = await this.detectImpossibleTravel(
      employee.id,
      now,
      dto.latitude,
      dto.longitude,
    );

    // 7. Calculate trust score
    const trustInput: TrustScoreInput = {
      gpsValid,
      accuracyMeters: dto.accuracy_meters ?? null,
      bssidMatch,
      ssidOnlyMatch,
      deviceTrusted: device.isTrusted,
      isNewDevice: !device.isTrusted && device.createdAt.getTime() > Date.now() - 60_000,
      isMockLocation: dto.is_mock_location ?? false,
      impossibleTravel,
      vpnSuspected: false,
    };
    const trustResult = calculateTrustScore(trustInput);

    // 7. Validation: reject if both GPS and WiFi fail
    const validationPassed = gpsValid || bssidMatch || ssidOnlyMatch;

    // 8. Check for existing session today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const workDate = today;

    const existingSession = await this.prisma.attendanceSession.findUnique({
      where: {
        employeeId_workDate: { employeeId: employee.id, workDate },
      },
      include: { events: { where: { eventType: 'check_in', status: 'success' } } },
    });

    if (existingSession && existingSession.events.length > 0) {
      throw new ConflictException({
        code: 'ALREADY_CHECKED_IN',
        message: 'Already checked in today',
      });
    }

    // 9. Determine status (on_time / late) via schedule service
    const schedule = await this.scheduleService.resolveSchedule(employee.id, now);
    let sessionStatus: 'on_time' | 'late' = 'on_time';
    let lateMinutes = 0;
    if (schedule) {
      const classification = this.scheduleService.classifyCheckIn(now, schedule);
      sessionStatus = classification.status;
      lateMinutes = classification.lateMinutes;
    }

    // 10. Create/update session + event in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      let sessionId: string;
      let checkInAt: Date | null = null;

      if (!existingSession) {
        const created = await tx.attendanceSession.create({
          data: {
            employeeId: employee.id,
            branchId,
            workDate,
            checkInAt: validationPassed ? now : null,
            status: validationPassed ? sessionStatus : 'absent',
            trustScore: trustResult.score,
            lateMinutes: validationPassed ? lateMinutes : null,
          },
        });
        sessionId = created.id;
        checkInAt = created.checkInAt;
      } else if (validationPassed) {
        const updated = await tx.attendanceSession.update({
          where: { id: existingSession.id },
          data: {
            checkInAt: now,
            status: sessionStatus,
            trustScore: trustResult.score,
            lateMinutes,
          },
        });
        sessionId = updated.id;
        checkInAt = updated.checkInAt;
      } else {
        sessionId = existingSession.id;
        checkInAt = existingSession.checkInAt;
      }

      const event = await tx.attendanceEvent.create({
        data: {
          sessionId,
          employeeId: employee.id,
          branchId,
          deviceId: device.id,
          eventType: 'check_in',
          status: validationPassed ? 'success' : 'failed',
          validationMethod: trustResult.method,
          trustScore: trustResult.score,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracyMeters: dto.accuracy_meters,
          ssid: dto.ssid,
          bssid: dto.bssid?.toLowerCase(),
          riskFlags: trustResult.flags,
          rejectReason: validationPassed ? null : 'GPS and WiFi validation failed',
          deviceMeta: {
            platform: dto.platform,
            device_name: dto.device_name,
            app_version: dto.app_version,
          },
        },
      });

      return { sessionId, checkInAt, event };
    });

    // 11. If validation failed, throw (but event is already logged)
    if (!validationPassed) {
      const distanceValue = Number.isFinite(closestDistance) ? Math.round(closestDistance) : null;
      const scannedBranches = branches.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        latitude: Number(b.latitude),
        longitude: Number(b.longitude),
        radius_meters: b.radiusMeters,
      }));
      let hint: string;
      if (branches.length === 0) {
        hint =
          'Không tìm thấy branch active cho nhân viên này. Kiểm tra primary_branch và branch.status.';
      } else if (distanceValue === null) {
        hint = 'Không tính được khoảng cách — branch thiếu toạ độ hợp lệ.';
      } else if (distanceValue > 2000) {
        hint = `GPS của bạn cách branch gần nhất ${distanceValue}m. Branch có thể đã lưu sai toạ độ. Yêu cầu admin kiểm tra lat/lng của ${scannedBranches[0]?.name}.`;
      } else {
        hint = `Bạn đang cách branch ${distanceValue}m (radius ${scannedBranches[0]?.radius_meters}m). Di chuyển gần hơn hoặc tăng radius.`;
      }
      throw new UnprocessableEntityException({
        code: 'INVALID_LOCATION',
        message: 'Vị trí ngoài geofence và WiFi không khớp',
        details: {
          event_id: result.event.id,
          trust_score: trustResult.score,
          risk_flags: trustResult.flags,
          distance_meters: distanceValue,
          user_location: { latitude: dto.latitude, longitude: dto.longitude },
          scanned_branches: scannedBranches,
          hint,
        },
      });
    }

    return {
      session_id: result.sessionId,
      event_id: result.event.id,
      status: sessionStatus,
      validation_method: trustResult.method,
      trust_score: trustResult.score,
      trust_level: trustResult.trustLevel,
      risk_flags: trustResult.flags,
      check_in_at: result.checkInAt,
      branch: matchedBranch
        ? { id: matchedBranch.id, name: matchedBranch.name }
        : { id: branchId, name: 'Unknown' },
    };
  }

  async checkOut(employeeUserId: string, dto: CheckOutDto) {
    // 1. Find employee
    const employee = await this.prisma.employee.findUnique({
      where: { userId: employeeUserId },
    });
    if (!employee) {
      throw new UnprocessableEntityException({
        code: 'NOT_ASSIGNED_TO_BRANCH',
        message: 'Employee not found',
      });
    }

    // 2. Find today's session
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const session = await this.prisma.attendanceSession.findUnique({
      where: {
        employeeId_workDate: { employeeId: employee.id, workDate: today },
      },
    });

    if (!session || !session.checkInAt) {
      throw new ConflictException({
        code: 'NOT_CHECKED_IN_YET',
        message: 'Must check-in before checking out',
      });
    }

    if (session.checkOutAt) {
      throw new ConflictException({
        code: 'ALREADY_CHECKED_OUT',
        message: 'Already checked out today',
      });
    }

    // 3. Load branch configs for validation
    const branch = await this.prisma.branch.findUnique({
      where: { id: session.branchId },
      include: {
        geofences: { where: { isActive: true } },
        wifiConfigs: { where: { isActive: true } },
      },
    });

    // 4. Validate location (same logic as check-in)
    let gpsValid = false;
    let bssidMatch = false;
    let ssidOnlyMatch = false;
    const point = { latitude: dto.latitude, longitude: dto.longitude };

    if (branch) {
      // Branch.lat/lng acts as default geofence + any BranchGeofence rows as additional.
      const branchGeofences: Geofence[] = [
        {
          centerLat: Number(branch.latitude),
          centerLng: Number(branch.longitude),
          radiusMeters: branch.radiusMeters,
        },
        ...branch.geofences.map((g) => ({
          centerLat: Number(g.centerLat),
          centerLng: Number(g.centerLng),
          radiusMeters: g.radiusMeters,
        })),
      ];
      for (const geofence of branchGeofences) {
        if (isInsideGeofence(point, geofence)) {
          gpsValid = true;
          break;
        }
      }

      const wifiConfigs: WifiConfig[] = branch.wifiConfigs.map((w) => ({
        ssid: w.ssid,
        bssid: w.bssid,
        isActive: w.isActive,
      }));
      if (isBssidWhitelisted(dto.bssid, wifiConfigs)) bssidMatch = true;
      else if (isSsidMatch(dto.ssid, wifiConfigs)) ssidOnlyMatch = true;
    }

    // 5. Device
    const device = await this.upsertDevice(employee.id, dto);

    // 6. Impossible-travel detection
    const checkOutAt = new Date();
    const impossibleTravel = await this.detectImpossibleTravel(
      employee.id,
      checkOutAt,
      dto.latitude,
      dto.longitude,
    );

    // 7. Trust score
    const trustInput: TrustScoreInput = {
      gpsValid,
      accuracyMeters: dto.accuracy_meters ?? null,
      bssidMatch,
      ssidOnlyMatch,
      deviceTrusted: device.isTrusted,
      isNewDevice: false,
      isMockLocation: dto.is_mock_location ?? false,
      impossibleTravel,
      vpnSuspected: false,
    };
    const trustResult = calculateTrustScore(trustInput);
    const validationPassed = gpsValid || bssidMatch || ssidOnlyMatch;

    // 8. Classify via schedule service (covers worked/overtime/status)
    const schedule = await this.scheduleService.resolveSchedule(employee.id, checkOutAt);
    const checkInStatus: 'on_time' | 'late' = session.status === 'late' ? 'late' : 'on_time';
    const existingLate = session.lateMinutes ?? 0;

    let workedMinutes = Math.max(
      0,
      Math.round((checkOutAt.getTime() - session.checkInAt.getTime()) / 60_000),
    );
    let overtimeMinutes = 0;
    let status = session.status;
    let resolvedLateMinutes = existingLate;

    if (schedule) {
      const classification = this.scheduleService.classifyCheckOut(
        checkOutAt,
        session.checkInAt,
        schedule,
        checkInStatus,
        existingLate,
      );
      workedMinutes = classification.workedMinutes;
      overtimeMinutes = classification.overtimeMinutes;
      status = classification.status as typeof status;
      resolvedLateMinutes = classification.lateMinutes;
    }

    // 9. Update session + create event
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.attendanceSession.update({
        where: { id: session.id },
        data: {
          checkOutAt,
          workedMinutes,
          overtimeMinutes,
          lateMinutes: resolvedLateMinutes,
          status,
          trustScore: Math.min(session.trustScore ?? 100, trustResult.score),
        },
      });

      const event = await tx.attendanceEvent.create({
        data: {
          sessionId: session.id,
          employeeId: employee.id,
          branchId: session.branchId,
          deviceId: device.id,
          eventType: 'check_out',
          status: validationPassed ? 'success' : 'failed',
          validationMethod: trustResult.method,
          trustScore: trustResult.score,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracyMeters: dto.accuracy_meters,
          ssid: dto.ssid,
          bssid: dto.bssid?.toLowerCase(),
          riskFlags: trustResult.flags,
          rejectReason: validationPassed ? null : 'GPS and WiFi validation failed',
          deviceMeta: {
            platform: dto.platform,
            device_name: dto.device_name,
            app_version: dto.app_version,
          },
        },
      });

      return { session: updatedSession, event };
    });

    return {
      session_id: result.session.id,
      event_id: result.event.id,
      status: result.session.status,
      validation_method: trustResult.method,
      trust_score: trustResult.score,
      trust_level: trustResult.trustLevel,
      risk_flags: trustResult.flags,
      check_out_at: result.session.checkOutAt,
      worked_minutes: result.session.workedMinutes,
      overtime_minutes: result.session.overtimeMinutes,
      branch: branch
        ? { id: branch.id, name: branch.name }
        : { id: session.branchId, name: 'Unknown' },
    };
  }

  /**
   * Auto-register or update device on each check-in/check-out.
   */
  private async upsertDevice(employeeId: string, dto: CheckInDto | CheckOutDto) {
    const platformMap: Record<string, DevicePlatform> = {
      ios: 'ios',
      android: 'android',
      web: 'web',
    };
    const platform = platformMap[dto.platform] ?? 'web';

    const device = await this.prisma.employeeDevice.upsert({
      where: {
        employeeId_deviceFingerprint: {
          employeeId,
          deviceFingerprint: dto.device_fingerprint,
        },
      },
      update: {
        lastSeenAt: new Date(),
        deviceName: dto.device_name,
        appVersion: dto.app_version,
        platform,
      },
      create: {
        employeeId,
        deviceFingerprint: dto.device_fingerprint,
        platform,
        deviceName: dto.device_name,
        appVersion: dto.app_version,
        isTrusted: false,
        lastSeenAt: new Date(),
      },
    });

    return device;
  }

  // ─── HISTORY & MANAGER ─────────────────────────────────────

  async getMyAttendance(employeeUserId: string, dto: ListMyAttendanceDto) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { userId: employeeUserId },
    });

    const where: any = { employeeId: employee.id };
    if (dto.date_from || dto.date_to) {
      where.workDate = {};
      if (dto.date_from) where.workDate.gte = dto.date_from;
      if (dto.date_to) where.workDate.lte = dto.date_to;
    }

    const [total, items] = await Promise.all([
      this.prisma.attendanceSession.count({ where }),
      this.prisma.attendanceSession.findMany({
        where,
        orderBy: { workDate: 'desc' },
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page: dto.page,
        limit: dto.limit,
        total_pages: Math.ceil(total / dto.limit) || 1,
      },
    };
  }

  async listSessions(managerUserId: string, isSuperAdmin: boolean, dto: ListSessionsDto) {
    const where: any = {};

    if (!isSuperAdmin) {
      const managed = await this.prisma.managerBranch.findMany({
        where: { userId: managerUserId },
        select: { branchId: true },
      });
      const branchIds = managed.map((m) => m.branchId);
      if (branchIds.length === 0) {
        return { items: [], meta: { total: 0, page: 1, limit: dto.limit, total_pages: 1 } };
      }
      where.branchId = { in: branchIds };
    }

    if (dto.branch_id) where.branchId = dto.branch_id;
    if (dto.employee_id) where.employeeId = dto.employee_id;
    if (dto.status) where.status = dto.status;
    if (dto.date_from || dto.date_to) {
      where.workDate = {};
      if (dto.date_from) where.workDate.gte = dto.date_from;
      if (dto.date_to) where.workDate.lte = dto.date_to;
    }

    const [total, data] = await Promise.all([
      this.prisma.attendanceSession.count({ where }),
      this.prisma.attendanceSession.findMany({
        where,
        include: {
          employee: { select: { id: true, employeeCode: true, user: { select: { fullName: true } } } },
          branch: { select: { id: true, name: true } },
        },
        orderBy: { workDate: 'desc' },
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
      }),
    ]);

    // Flatten nested objects for clean output mapping
    const mappedData = data.map(s => ({
      ...s,
      employee: {
        id: s.employee.id,
        employee_code: s.employee.employeeCode,
        full_name: s.employee.user.fullName,
      }
    }));

    return {
      items: mappedData,
      meta: {
        total,
        page: dto.page,
        limit: dto.limit,
        total_pages: Math.ceil(total / dto.limit) || 1,
      },
    };
  }

  async getSessionDetail(managerUserId: string, isSuperAdmin: boolean, sessionId: string) {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        employee: { select: { id: true, employeeCode: true, user: { select: { fullName: true } } } },
        branch: { select: { id: true, name: true } },
        events: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!session) throw new NotFoundException('Session not found');

    if (!isSuperAdmin) {
      const managed = await this.prisma.managerBranch.findUnique({
        where: { userId_branchId: { userId: managerUserId, branchId: session.branchId } },
      });
      if (!managed) {
        throw new NotFoundException('Session not found or outside your scope');
      }
    }

    return {
      ...session,
      employee: {
        id: session.employee.id,
        employee_code: session.employee.employeeCode,
        full_name: session.employee.user.fullName,
      }
    };
  }

  async overrideSession(managerUserId: string, isSuperAdmin: boolean, sessionId: string, dto: OverrideSessionDto) {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new NotFoundException('Session not found');

    if (!isSuperAdmin) {
      const managed = await this.prisma.managerBranch.findUnique({
        where: { userId_branchId: { userId: managerUserId, branchId: session.branchId } },
      });
      if (!managed) {
        throw new NotFoundException('Session not found or outside your scope');
      }
    }

    const { status, note } = dto;
    
    // Create combined note
    const appendedNote = session.note 
      ? `${session.note}\n[${new Date().toISOString()}] Override by manager: ${note}`
      : `[${new Date().toISOString()}] Override by manager: ${note}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceSession.update({
        where: { id: sessionId },
        data: { status, note: appendedNote },
      });

      // Audit log mandatory for override
      await tx.auditLog.create({
        data: {
          userId: managerUserId,
          action: 'update',
          entityType: 'AttendanceSession',
          entityId: sessionId,
          before: { status: session.status, note: session.note },
          after: { status, note: appendedNote },
        },
      });

      return updated;
    });

    return result;
  }
}
