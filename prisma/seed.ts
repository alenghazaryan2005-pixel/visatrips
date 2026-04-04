import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Upsert default admin user
  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@visatrips.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@visatrips.com',
      password: 'visatrips2026',
    },
  });

  console.log(`✅ Admin user ready: ${admin.name} (${admin.email})`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
