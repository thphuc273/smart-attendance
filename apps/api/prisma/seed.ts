import { PrismaClient, RoleCode } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding roles…');
  const roles = await Promise.all(
    [
      { code: RoleCode.admin, name: 'Admin' },
      { code: RoleCode.manager, name: 'Manager' },
      { code: RoleCode.employee, name: 'Employee' },
    ].map((r) =>
      prisma.role.upsert({
        where: { code: r.code },
        update: {},
        create: r,
      }),
    ),
  );

  const adminRole = roles.find((r) => r.code === RoleCode.admin)!;

  console.log('Seeding admin user…');
  const adminPassword = await argon2.hash('Admin@123');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      email: 'admin@demo.com',
      passwordHash: adminPassword,
      fullName: 'System Admin',
      status: 'active',
      userRoles: {
        create: [{ roleId: adminRole.id }],
      },
    },
  });

  console.log('Seeding default work schedule…');
  await prisma.workSchedule.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Standard 8-5',
      startTime: '08:00',
      endTime: '17:00',
      graceMinutes: 10,
      overtimeAfterMinutes: 60,
      workdays: [1, 2, 3, 4, 5],
    },
  });

  console.log('✓ Seed complete.');
  console.log(`  Admin login: admin@demo.com / Admin@123 (id=${admin.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
