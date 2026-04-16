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
import { isInsideGeofence, distanceToGeofence, type Geofence } from '../../common/utils/geo';
import { isBssidWhitelisted, isSsidMatch, type WifiConfig } from '../../common/utils/wifi';
import { calculateTrustScore, type TrustScoreInput } from '../../common/utils/trust-score';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      // Check geofences
      for (const geo of branch.geofences) {
        const geofence: Geofence = {
          centerLat: Number(geo.centerLat),
          centerLng: Number(geo.centerLng),
          radiusMeters: geo.radiusMeters,
        };
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

    // 6. Calculate trust score
    const trustInput: TrustScoreInput = {
      gpsValid,
      accuracyMeters: dto.accuracy_meters ?? null,
      bssidMatch,
      ssidOnlyMatch,
      deviceTrusted: device.isTrusted,
      isNewDevice: !device.isTrusted && device.createdAt.getTime() > Date.now() - 60_000,
      isMockLocation: dto.is_mock_location ?? false,
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

    // 9. Determine status (on_time / late)
    const schedule = await this.prisma.workScheduleAssignment.findFirst({
      where: {
        employeeId: employee.id,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      include: { schedule: true },
    });

    let sessionStatus: 'on_time' | 'late' = 'on_time';
    if (schedule) {
      const [startHour, startMin] = schedule.schedule.startTime.split(':').map(Number);
      const graceMinutes = schedule.schedule.graceMinutes;
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setHours(startHour, startMin + graceMinutes, 0, 0);
      if (now > cutoff) {
        sessionStatus = 'late';
      }
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
            checkInAt: validationPassed ? new Date() : null,
            status: validationPassed ? sessionStatus : 'absent',
            trustScore: trustResult.score,
          },
        });
        sessionId = created.id;
        checkInAt = created.checkInAt;
      } else if (validationPassed) {
        const updated = await tx.attendanceSession.update({
          where: { id: existingSession.id },
          data: {
            checkInAt: new Date(),
            status: sessionStatus,
            trustScore: trustResult.score,
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
      throw new UnprocessableEntityException({
        code: 'INVALID_LOCATION',
        message: 'Vị trí ngoài geofence và WiFi không khớp',
        details: {
          event_id: result.event.id,
          trust_score: trustResult.score,
          risk_flags: trustResult.flags,
          distance_meters: Math.round(closestDistance),
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
      for (const geo of branch.geofences) {
        const geofence: Geofence = {
          centerLat: Number(geo.centerLat),
          centerLng: Number(geo.centerLng),
          radiusMeters: geo.radiusMeters,
        };
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

    // 6. Trust score
    const trustInput: TrustScoreInput = {
      gpsValid,
      accuracyMeters: dto.accuracy_meters ?? null,
      bssidMatch,
      ssidOnlyMatch,
      deviceTrusted: device.isTrusted,
      isNewDevice: false,
      isMockLocation: dto.is_mock_location ?? false,
    };
    const trustResult = calculateTrustScore(trustInput);
    const validationPassed = gpsValid || bssidMatch || ssidOnlyMatch;

    // 7. Calculate worked time
    const checkOutAt = new Date();
    const workedMinutes = Math.round(
      (checkOutAt.getTime() - session.checkInAt.getTime()) / 60_000,
    );

    // Calculate overtime
    const scheduleAssignment = await this.prisma.workScheduleAssignment.findFirst({
      where: {
        employeeId: employee.id,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      include: { schedule: true },
    });

    let overtimeMinutes = 0;
    let status = session.status;
    if (scheduleAssignment) {
      const [endHour, endMin] = scheduleAssignment.schedule.endTime.split(':').map(Number);
      const scheduledEnd = new Date(checkOutAt);
      scheduledEnd.setHours(endHour, endMin, 0, 0);

      const overtimeThreshold = scheduledEnd.getTime() + scheduleAssignment.schedule.overtimeAfterMinutes * 60_000;
      if (checkOutAt.getTime() > overtimeThreshold) {
        overtimeMinutes = Math.round((checkOutAt.getTime() - scheduledEnd.getTime()) / 60_000);
        if (status === 'on_time') status = 'overtime';
      }

      if (checkOutAt < scheduledEnd) {
        status = 'early_leave';
      }
    }

    // 8. Update session + create event
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.attendanceSession.update({
        where: { id: session.id },
        data: {
          checkOutAt,
          workedMinutes,
          overtimeMinutes,
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

}
