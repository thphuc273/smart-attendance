import { PrismaClient, RoleCode } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const SCHEDULE_ID = '00000000-0000-0000-0000-000000000001';

// Tuning knobs for the sample dataset
const EMP_PER_BRANCH = 20; // employees seeded per branch
const DAYS_OF_HISTORY = 90; // calendar days of attendance history (weekdays only)
const CHUNK = 1000; // createMany batch size (keeps well under PG param limit)

const BRANCHES = [
  {
    code: 'HCM-Q1',
    name: 'HCM Quận 1',
    address: '123 Lê Lợi, Quận 1, TP.HCM',
    latitude: 10.7769,
    longitude: 106.7009,
    radiusMeters: 150,
    geofence: { name: 'Main entrance', centerLat: 10.7769, centerLng: 106.7009, radiusMeters: 100 },
    wifiConfigs: [
      { ssid: 'FinOS-HCM-5G', bssid: 'aa:bb:cc:dd:ee:01', priority: 1 },
      { ssid: 'FinOS-HCM-2G', bssid: 'aa:bb:cc:dd:ee:02', priority: 0 },
    ],
    departments: ['Engineering', 'Operations', 'Sales'],
    manager: { email: 'manager.hcm@demo.com', fullName: 'Trần Quốc Mạnh' },
  },
  {
    code: 'HN-HK',
    name: 'HN Hoàn Kiếm',
    address: '45 Tràng Tiền, Hoàn Kiếm, Hà Nội',
    latitude: 21.0285,
    longitude: 105.8542,
    radiusMeters: 200,
    geofence: { name: 'Office gate', centerLat: 21.0285, centerLng: 105.8542, radiusMeters: 150 },
    wifiConfigs: [
      { ssid: 'FinOS-HN-5G', bssid: 'aa:bb:cc:dd:ee:11', priority: 1 },
    ],
    departments: ['Engineering', 'Marketing', 'HR'],
    manager: { email: 'manager.hn@demo.com', fullName: 'Nguyễn Thị Hà' },
  },
  {
    code: 'DN-HC',
    name: 'ĐN Hải Châu',
    address: '78 Bạch Đằng, Hải Châu, Đà Nẵng',
    latitude: 16.0544,
    longitude: 108.2022,
    radiusMeters: 120,
    geofence: { name: 'Building A', centerLat: 16.0544, centerLng: 108.2022, radiusMeters: 100 },
    wifiConfigs: [
      { ssid: 'FinOS-DN-5G', bssid: 'aa:bb:cc:dd:ee:21', priority: 1 },
      { ssid: 'FinOS-DN-Guest', bssid: 'aa:bb:cc:dd:ee:22', priority: 0 },
    ],
    departments: ['Engineering', 'Operations', 'Finance'],
    manager: { email: 'manager.dn@demo.com', fullName: 'Lê Hoàng Đà' },
  },
  {
    code: 'CT-NK',
    name: 'CT Ninh Kiều',
    address: '12 Hòa Bình, Ninh Kiều, Cần Thơ',
    latitude: 10.0341,
    longitude: 105.788,
    radiusMeters: 130,
    geofence: { name: 'Main lobby', centerLat: 10.0341, centerLng: 105.788, radiusMeters: 100 },
    wifiConfigs: [
      { ssid: 'FinOS-CT-5G', bssid: 'aa:bb:cc:dd:ee:31', priority: 1 },
      { ssid: 'FinOS-CT-2G', bssid: 'aa:bb:cc:dd:ee:32', priority: 0 },
    ],
    departments: ['Engineering', 'Operations', 'Sales'],
    manager: { email: 'manager.ct@demo.com', fullName: 'Phạm Minh Cần' },
  },
  {
    code: 'HP-LC',
    name: 'HP Lê Chân',
    address: '88 Tô Hiệu, Lê Chân, Hải Phòng',
    latitude: 20.8449,
    longitude: 106.6881,
    radiusMeters: 160,
    geofence: { name: 'Front gate', centerLat: 20.8449, centerLng: 106.6881, radiusMeters: 120 },
    wifiConfigs: [
      { ssid: 'FinOS-HP-5G', bssid: 'aa:bb:cc:dd:ee:41', priority: 1 },
    ],
    departments: ['Engineering', 'Marketing', 'Finance'],
    manager: { email: 'manager.hp@demo.com', fullName: 'Vũ Thị Hải' },
  },
];

/** Deterministic 0-99 hash — stable across re-runs, good spread (FNV-1a). */
function hashPct(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log('🌱 Seeding roles…');
  const roles = await Promise.all(
    [
      { code: RoleCode.admin, name: 'Admin' },
      { code: RoleCode.manager, name: 'Manager' },
      { code: RoleCode.employee, name: 'Employee' },
    ].map((r) =>
      prisma.role.upsert({ where: { code: r.code }, update: {}, create: r }),
    ),
  );
  const adminRole = roles.find((r) => r.code === RoleCode.admin)!;
  const managerRole = roles.find((r) => r.code === RoleCode.manager)!;
  const employeeRole = roles.find((r) => r.code === RoleCode.employee)!;

  // ── Admin ──
  console.log('🌱 Seeding admin…');
  const adminPwd = await argon2.hash('Admin@123');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      email: 'admin@demo.com',
      passwordHash: adminPwd,
      fullName: 'System Admin',
      status: 'active',
      userRoles: { create: [{ roleId: adminRole.id }] },
    },
  });

  // ── Default work schedule ──
  console.log('🌱 Seeding work schedule…');
  const schedule = await prisma.workSchedule.upsert({
    where: { id: SCHEDULE_ID },
    update: {},
    create: {
      id: SCHEDULE_ID,
      name: 'Standard 8-5',
      startTime: '08:00',
      endTime: '17:00',
      graceMinutes: 10,
      overtimeAfterMinutes: 60,
      workdays: [1, 2, 3, 4, 5],
    },
  });

  // ── Branches + departments + wifi + geofence ──
  console.log(`🌱 Seeding ${BRANCHES.length} branches…`);
  const branchRecords: Array<{
    id: string;
    code: string;
    deptIds: string[];
    latitude: number;
    longitude: number;
    ssid: string | null;
    bssid: string | null;
  }> = [];

  for (const b of BRANCHES) {
    const branch = await prisma.branch.upsert({
      where: { code: b.code },
      update: {},
      create: {
        code: b.code,
        name: b.name,
        address: b.address,
        latitude: b.latitude,
        longitude: b.longitude,
        radiusMeters: b.radiusMeters,
      },
    });

    // Geofence
    const existingGeo = await prisma.branchGeofence.findFirst({ where: { branchId: branch.id } });
    if (!existingGeo) {
      await prisma.branchGeofence.create({
        data: {
          branchId: branch.id,
          name: b.geofence.name,
          centerLat: b.geofence.centerLat,
          centerLng: b.geofence.centerLng,
          radiusMeters: b.geofence.radiusMeters,
        },
      });
    }

    // WiFi configs
    for (const w of b.wifiConfigs) {
      const existingWifi = await prisma.branchWifiConfig.findFirst({
        where: { branchId: branch.id, bssid: w.bssid },
      });
      if (!existingWifi) {
        await prisma.branchWifiConfig.create({
          data: { branchId: branch.id, ssid: w.ssid, bssid: w.bssid, priority: w.priority },
        });
      }
    }

    // Departments
    const deptIds: string[] = [];
    for (const deptName of b.departments) {
      const dept = await prisma.department.upsert({
        where: { branchId_name: { branchId: branch.id, name: deptName } },
        update: {},
        create: { branchId: branch.id, name: deptName },
      });
      deptIds.push(dept.id);
    }

    branchRecords.push({
      id: branch.id,
      code: b.code,
      deptIds,
      latitude: b.latitude,
      longitude: b.longitude,
      ssid: b.wifiConfigs[0]?.ssid ?? null,
      bssid: b.wifiConfigs[0]?.bssid ?? null,
    });
  }

  // ── Branch managers (one dedicated manager per branch) ──
  console.log(`🌱 Seeding ${BRANCHES.length} branch managers…`);
  const managerPwd = await argon2.hash('Manager@123');
  for (const b of BRANCHES) {
    const managerUser = await prisma.user.upsert({
      where: { email: b.manager.email },
      update: {},
      create: {
        email: b.manager.email,
        passwordHash: managerPwd,
        fullName: b.manager.fullName,
        status: 'active',
        userRoles: { create: [{ roleId: managerRole.id }] },
      },
    });
    const rec = branchRecords.find((r) => r.code === b.code)!;
    await prisma.managerBranch.upsert({
      where: { userId_branchId: { userId: managerUser.id, branchId: rec.id } },
      update: {},
      create: { userId: managerUser.id, branchId: rec.id },
    });
  }

  // ── Employees (EMP_PER_BRANCH per branch, per-branch code namespace) ──
  const totalEmployees = EMP_PER_BRANCH * branchRecords.length;
  console.log(`🌱 Seeding ${totalEmployees} employees (${EMP_PER_BRANCH}/branch)…`);
  const employeePwd = await argon2.hash('Employee@123');
  let firstEmployee = true;
  let phoneSeq = 1000000;

  for (const branch of branchRecords) {
    for (let i = 1; i <= EMP_PER_BRANCH; i++) {
      const suffix = String(i).padStart(2, '0');
      const code = `${branch.code}-E${suffix}`;
      const email = `${branch.code.toLowerCase()}.emp${suffix}@demo.com`;
      const deptId = branch.deptIds[(i - 1) % branch.deptIds.length];

      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          passwordHash: employeePwd,
          fullName: `Nhân viên ${code}`,
          phone: `09${String(phoneSeq++).padStart(8, '0')}`,
          status: 'active',
          userRoles: { create: [{ roleId: employeeRole.id }] },
        },
      });

      const existingEmp = await prisma.employee.findUnique({ where: { userId: user.id } });
      if (!existingEmp) {
        const emp = await prisma.employee.create({
          data: {
            userId: user.id,
            employeeCode: code,
            departmentId: deptId,
            primaryBranchId: branch.id,
          },
        });

        // Assign the standard work schedule
        await prisma.workScheduleAssignment.create({
          data: {
            employeeId: emp.id,
            scheduleId: schedule.id,
            effectiveFrom: new Date('2026-01-01'),
          },
        });

        // The very first employee gets a trusted device (for testing)
        if (firstEmployee) {
          await prisma.employeeDevice.create({
            data: {
              employeeId: emp.id,
              deviceFingerprint: 'ios-test-device-001',
              platform: 'ios',
              deviceName: 'iPhone 14 (Test)',
              appVersion: '1.0.0',
              isTrusted: true,
              lastSeenAt: new Date(),
            },
          });
        }
      }
      firstEmployee = false;
    }
  }

  // ── Attendance history (weekdays only) ──
  console.log(`🌱 Seeding ${DAYS_OF_HISTORY} days of attendance history (weekdays only)…`);

  const employees = await prisma.employee.findMany({
    select: { id: true, primaryBranchId: true },
  });

  // Build the list of weekday dates to seed (ending today, inclusive).
  // Dates are anchored to UTC midnight: the `@db.Date` workDate column
  // serializes from the JS Date's UTC components, so a local-midnight Date
  // in UTC+7 would land workDate one calendar day early.
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const datesToSeed: Date[] = [];
  for (let d = DAYS_OF_HISTORY - 1; d >= 0; d--) {
    const day = new Date(todayUtc);
    day.setUTCDate(todayUtc.getUTCDate() - d);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue; // skip Sat/Sun
    datesToSeed.push(day);
  }

  // Idempotency: skip (employee, date) pairs that already have a session
  const existingSessions = await prisma.attendanceSession.findMany({
    where: { workDate: { in: datesToSeed } },
    select: { employeeId: true, workDate: true },
  });
  const seenKeys = new Set(
    existingSessions.map(
      (s) => `${s.employeeId}|${s.workDate.toISOString().slice(0, 10)}`,
    ),
  );

  const branchMeta = new Map(branchRecords.map((b) => [b.id, b]));

  const sessionRows: any[] = [];
  const summaryRows: any[] = [];
  const eventRows: any[] = [];

  for (const day of datesToSeed) {
    const dayKey = day.toISOString().slice(0, 10);
    for (const emp of employees) {
      if (seenKeys.has(`${emp.id}|${dayKey}`)) continue;

      const rand = hashPct(`${emp.id}|${dayKey}`);
      const meta = branchMeta.get(emp.primaryBranchId);

      let checkInOffset = 0; // minutes relative to 08:00
      let checkOutOffset = 0; // minutes relative to 17:00
      let status: string;

      if (rand < 70) {
        status = 'on_time';
        checkInOffset = -15; // 07:45
        checkOutOffset = 5; // 17:05
      } else if (rand < 85) {
        status = 'late';
        checkInOffset = 45; // 08:45
        checkOutOffset = 0; // 17:00
      } else if (rand < 92) {
        status = 'overtime';
        checkInOffset = -10; // 07:50
        checkOutOffset = 95; // 18:35
      } else if (rand < 97) {
        status = 'absent';
      } else {
        status = 'missing_checkout';
        checkInOffset = -5; // 07:55
      }

      let checkInAt: Date | null = null;
      let checkOutAt: Date | null = null;
      let workedMinutes = 0;
      let overtimeMinutes = 0;
      let lateMinutes = 0;
      let trustScore: number | null = null;

      if (status !== 'absent') {
        checkInAt = new Date(day);
        checkInAt.setHours(8, checkInOffset, 0, 0);

        if (status !== 'missing_checkout') {
          checkOutAt = new Date(day);
          checkOutAt.setHours(17, checkOutOffset, 0, 0);
          workedMinutes = Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
        }
        if (status === 'overtime') overtimeMinutes = checkOutOffset;
        if (checkInOffset > 10) lateMinutes = checkInOffset;
        // ~10% of working sessions get a low trust score for variety
        trustScore = rand % 10 === 0 ? 40 : 90;
      }

      const sessionId = randomUUID();
      sessionRows.push({
        id: sessionId,
        employeeId: emp.id,
        branchId: emp.primaryBranchId,
        workDate: day,
        checkInAt,
        checkOutAt,
        workedMinutes,
        overtimeMinutes,
        lateMinutes,
        // session starts 'on_time'; the missing-checkout cron later flips it
        status: status === 'missing_checkout' ? 'on_time' : status,
        trustScore,
      });

      summaryRows.push({
        employeeId: emp.id,
        branchId: emp.primaryBranchId,
        workDate: day,
        status,
        workedMinutes,
        overtimeMinutes,
        lateMinutes,
        trustScoreAvg: trustScore,
      });

      if (status !== 'absent') {
        // Check-in success event
        eventRows.push({
          sessionId,
          employeeId: emp.id,
          branchId: emp.primaryBranchId,
          eventType: 'check_in',
          status: 'success',
          validationMethod: 'wifi',
          trustScore: trustScore!,
          latitude: null,
          longitude: null,
          ssid: meta?.ssid ?? null,
          bssid: meta?.bssid ?? null,
          riskFlags: [],
          rejectReason: null,
          createdAt: checkInAt!,
        });

        // ~20% of days have a failed attempt just before the successful check-in
        if (rand % 5 === 0) {
          const failAt = new Date(checkInAt!);
          failAt.setMinutes(failAt.getMinutes() - 2);
          eventRows.push({
            sessionId,
            employeeId: emp.id,
            branchId: emp.primaryBranchId,
            eventType: 'check_in',
            status: 'failed',
            validationMethod: 'none',
            trustScore: 0,
            latitude: null,
            longitude: null,
            ssid: null,
            bssid: null,
            riskFlags: ['outside_geofence'],
            rejectReason: 'Vị trí ngoài geofence',
            createdAt: failAt,
          });
        }

        // Check-out success event
        if (checkOutAt) {
          eventRows.push({
            sessionId,
            employeeId: emp.id,
            branchId: emp.primaryBranchId,
            eventType: 'check_out',
            status: 'success',
            validationMethod: 'gps',
            trustScore: trustScore!,
            latitude: meta?.latitude ?? null,
            longitude: meta?.longitude ?? null,
            ssid: null,
            bssid: null,
            riskFlags: [],
            rejectReason: null,
            createdAt: checkOutAt,
          });
        }
      }
    }
  }

  // Bulk insert in chunks (pre-filtered above; skipDuplicates is belt-and-braces)
  for (const c of chunk(sessionRows, CHUNK)) {
    await prisma.attendanceSession.createMany({ data: c, skipDuplicates: true });
  }
  for (const c of chunk(summaryRows, CHUNK)) {
    await prisma.dailyAttendanceSummary.createMany({ data: c, skipDuplicates: true });
  }
  for (const c of chunk(eventRows, CHUNK)) {
    await prisma.attendanceEvent.createMany({ data: c });
  }
  console.log(`   → ${sessionRows.length} new sessions, ${eventRows.length} events`);

  console.log('✅ Seed complete!');
  console.log(`  Branches: ${BRANCHES.map((b) => b.code).join(', ')}`);
  console.log('  Admin:    admin@demo.com / Admin@123');
  console.log(`  Managers: ${BRANCHES.map((b) => b.manager.email).join(', ')} / Manager@123`);
  console.log(
    `  Employees: ${totalEmployees} (${EMP_PER_BRANCH}/branch) — e.g. hcm-q1.emp01@demo.com / Employee@123`,
  );
  console.log(`  Admin id: ${admin.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
