import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const hashedPassword = await bcrypt.hash('visatrips2026', 12);

  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@visatrips.com' },
    update: { password: hashedPassword },
    create: {
      name: 'Admin',
      email: 'admin@visatrips.com',
      password: hashedPassword,
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
