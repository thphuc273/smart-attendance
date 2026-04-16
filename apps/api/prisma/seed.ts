import { PrismaClient, RoleCode } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const SCHEDULE_ID = '00000000-0000-0000-0000-000000000001';

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
  },
];

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
  console.log('🌱 Seeding branches…');
  const branchRecords: Array<{ id: string; code: string; deptIds: string[] }> = [];

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

    branchRecords.push({ id: branch.id, code: b.code, deptIds });
  }

  // ── Manager ──
  console.log('🌱 Seeding manager…');
  const managerPwd = await argon2.hash('Manager@123');
  const managerUser = await prisma.user.upsert({
    where: { email: 'manager.hcm@demo.com' },
    update: {},
    create: {
      email: 'manager.hcm@demo.com',
      passwordHash: managerPwd,
      fullName: 'Trần Văn Manager',
      status: 'active',
      userRoles: { create: [{ roleId: managerRole.id }] },
    },
  });
  // Assign manager to HCM-Q1
  const hcmBranch = branchRecords.find((b) => b.code === 'HCM-Q1')!;
  await prisma.managerBranch.upsert({
    where: { userId_branchId: { userId: managerUser.id, branchId: hcmBranch.id } },
    update: {},
    create: { userId: managerUser.id, branchId: hcmBranch.id },
  });

  // ── Employees (30 total, 10 per branch) ──
  console.log('🌱 Seeding 30 employees…');
  const employeePwd = await argon2.hash('Employee@123');
  let empIdx = 1;

  for (const branch of branchRecords) {
    for (let i = 0; i < 10; i++) {
      const code = `EMP${String(empIdx).padStart(3, '0')}`;
      const email = `employee${String(empIdx).padStart(3, '0')}@demo.com`;
      const deptId = branch.deptIds[i % branch.deptIds.length];

      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          passwordHash: employeePwd,
          fullName: `Nhân viên ${code}`,
          phone: `090${String(1000000 + empIdx)}`,
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

        // Assign work schedule
        await prisma.workScheduleAssignment.create({
          data: {
            employeeId: emp.id,
            scheduleId: schedule.id,
            effectiveFrom: new Date('2026-01-01'),
          },
        });

        // First employee gets a trusted device (for testing)
        if (empIdx === 1) {
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

      empIdx++;
    }
  }

  // ── Seed 7 Days of Attendance History ──
  console.log('🌱 Seeding 7 days of historical attendance data (this may take a few seconds)…');
  
  // Get all employees we just created
  const employees = await prisma.employee.findMany();
  
  // Generate 7 consecutive days ending yesterday
  const now = new Date();
  now.setHours(12, 0, 0, 0); // stable mid-day anchor for relative math
  
  const datesToSeed: Date[] = [];
  for (let d = 7; d >= 1; d--) {
    const historicalDate = new Date(now);
    historicalDate.setDate(now.getDate() - d);
    historicalDate.setHours(0, 0, 0, 0);
    // optionally skip weekends if we want strict, but the spec says "7 days attendance data"
    // let's just make it consecutive calendar days 
    datesToSeed.push(historicalDate);
  }

  for (const workDate of datesToSeed) {
    for (const emp of employees) {
      // Determine what happened on this day for this employee pseudo-randomly
      // We use a deterministic hash based on date + employee_id so re-runs of seed update instead of create
      const combinedForSeed = emp.id.charCodeAt(0) + workDate.getDate();
      const rand = combinedForSeed % 100; // 0-99

      let checkInOffset = 0; // minutes relative to 08:00
      let checkOutOffset = 0; // minutes relative to 17:00
      let status: 'on_time' | 'late' | 'absent' | 'early_leave' | 'overtime' | 'missing_checkout';
      
      if (rand < 70) {
        status = 'on_time';
        checkInOffset = -15; // 07:45
        checkOutOffset = 5;  // 17:05
      } else if (rand < 85) {
        status = 'late';
        checkInOffset = 45;  // 08:45
        checkOutOffset = 0;  // 17:00
      } else if (rand < 95) {
        status = 'absent';
      } else {
        status = 'missing_checkout';
        checkInOffset = -5;  // 07:55
      }

      // Check-in / Checkout times
      let checkInAt: Date | null = null;
      let checkOutAt: Date | null = null;
      let workedMinutes = 0;
      let overtimeMinutes = 0;
      let lateMinutes = 0;
      let trustScoreAvg = 0;

      if (status !== 'absent') {
        checkInAt = new Date(workDate);
        checkInAt.setHours(8, checkInOffset, 0, 0);

        if (status !== 'missing_checkout') {
          checkOutAt = new Date(workDate);
          checkOutAt.setHours(17, checkOutOffset, 0, 0);
          workedMinutes = Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
          if (checkOutOffset > 60) {
            status = 'overtime';
            overtimeMinutes = checkOutOffset;
          }
        }
        
        if (checkInOffset > 10) lateMinutes = checkInOffset;
        trustScoreAvg = 90; // Default good score
        if (rand % 10 === 0) trustScoreAvg = 40; // Simulate some low trust sessions
      }

      const existingSession = await prisma.attendanceSession.findUnique({
        where: { employeeId_workDate: { employeeId: emp.id, workDate } }
      });

      if (!existingSession) {
        // Create session
        const session = await prisma.attendanceSession.create({
          data: {
            employeeId: emp.id,
            branchId: emp.primaryBranchId,
            workDate,
            checkInAt,
            checkOutAt,
            workedMinutes,
            overtimeMinutes,
            status: status === 'missing_checkout' ? 'on_time' : status, // the session starts 'on_time' typically and cron closes it as missing_checkout
            trustScore: status === 'absent' ? null : trustScoreAvg,
          }
        });

        // Create matching DailySummary
        await prisma.dailyAttendanceSummary.create({
          data: {
            employeeId: emp.id,
            branchId: emp.primaryBranchId,
            workDate,
            status,
            workedMinutes,
            overtimeMinutes,
            lateMinutes,
            trustScoreAvg: status === 'absent' ? null : trustScoreAvg
          }
        });

        // Add events
        if (status !== 'absent') {
          // Check-in success event
          await prisma.attendanceEvent.create({
            data: {
              sessionId: session.id,
              employeeId: emp.id,
              branchId: emp.primaryBranchId,
              eventType: 'check_in',
              status: 'success',
              validationMethod: 'wifi',
              trustScore: trustScoreAvg,
              ssid: 'FinOS-HCM-5G',
              createdAt: checkInAt!,
            }
          });

          // Some daily anomalies (failed attempts)
          if (rand % 5 === 0) {
            const failTime = new Date(checkInAt!);
            failTime.setMinutes(failTime.getMinutes() - 2);
            await prisma.attendanceEvent.create({
              data: {
                sessionId: session.id,
                employeeId: emp.id,
                branchId: emp.primaryBranchId,
                eventType: 'check_in',
                status: 'failed',
                validationMethod: 'none',
                trustScore: 0,
                rejectReason: 'Vị trí ngoài geofence',
                riskFlags: ['outside_geofence'],
                createdAt: failTime,
              }
            });
          }

          if (checkOutAt) {
            await prisma.attendanceEvent.create({
              data: {
                sessionId: session.id,
                employeeId: emp.id,
                branchId: emp.primaryBranchId,
                eventType: 'check_out',
                status: 'success',
                validationMethod: 'gps',
                trustScore: trustScoreAvg,
                latitude: 10.7769,
                longitude: 106.7009,
                createdAt: checkOutAt,
              }
            });
          }
        }
      }
    }
  }

  console.log('✅ Seed complete!');
  console.log('  Admin:    admin@demo.com / Admin@123');
  console.log('  Manager:  manager.hcm@demo.com / Manager@123 (HCM-Q1)');
  console.log('  Employee: employee001@demo.com … employee030@demo.com / Employee@123');
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
