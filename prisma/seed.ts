import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const hashedPassword = await bcrypt.hash('visatrips2026', 12);

  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@visatrips.com' },
    // On both update and create, force the row into a known-good state:
    // password reset to the seeded value AND role set to 'owner' so the
    // seeded admin always has access to owner-only features (employees,
    // settings, site editor) — otherwise a manual `role = 'employee'`
    // change would silently lock the admin out post-reset.
    update: { password: hashedPassword, role: 'owner' },
    create: {
      name: 'Admin',
      email: 'admin@visatrips.com',
      password: hashedPassword,
      role: 'owner',
    },
  });

  console.log(`✅ Admin user ready: ${admin.name} (${admin.email}) · role: ${admin.role}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
