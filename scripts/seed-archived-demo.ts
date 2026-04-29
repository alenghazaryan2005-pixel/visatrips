/**
 * Seed two archived dummy orders so the admin can manually test the
 * Recover flow without waiting 30 days for the cron to archive a real one.
 *
 * Idempotent: re-running won't duplicate — it looks up by billingEmail and
 * skips orders that already exist.
 *
 * Usage:
 *   pnpm tsx scripts/seed-archived-demo.ts             # uses .env (production)
 *   DATABASE_URL=... pnpm tsx scripts/seed-archived-demo.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Dummy {
  billingEmail: string;
  destination: string;
  visaType: string;
  totalUSD: number;
  daysCompleted: number;
  daysArchived: number;
  travelers: Array<Record<string, unknown>>;
}

// Variety pack — different visa types, totals, archive ages, traveler counts.
// Idempotent by `billingEmail` so re-running just adds the new ones.
const DUMMIES: Dummy[] = [
  {
    billingEmail: 'archive-demo-1@example.com',
    destination: 'India', visaType: 'TOURIST_30', totalUSD: 51.25,
    daysCompleted: 60, daysArchived: 30,
    travelers: [{ firstName: 'Eleanor', lastName: 'Whitcombe', email: 'archive-demo-1@example.com', phoneNumber: '14155551001', passportCountry: 'United States', passportNumber: 'P00000001', finishStep: 'complete' }],
  },
  {
    billingEmail: 'archive-demo-2@example.com',
    destination: 'India', visaType: 'BUSINESS_1Y', totalUSD: 199.0,
    daysCompleted: 90, daysArchived: 60,
    travelers: [{ firstName: 'Marcus', lastName: 'Holloway', email: 'archive-demo-2@example.com', phoneNumber: '14155551002', passportCountry: 'United States', passportNumber: 'P00000002', finishStep: 'complete' }],
  },
  {
    billingEmail: 'archive-demo-3@example.com',
    destination: 'India', visaType: 'TOURIST_5Y', totalUSD: 159.99,
    daysCompleted: 120, daysArchived: 90,
    travelers: [{ firstName: 'Priya', lastName: 'Raman', email: 'archive-demo-3@example.com', phoneNumber: '442075551003', passportCountry: 'United Kingdom', passportNumber: 'GB1003789', finishStep: 'complete' }],
  },
  {
    billingEmail: 'archive-demo-4@example.com',
    destination: 'India', visaType: 'MEDICAL_60', totalUSD: 84.50,
    daysCompleted: 45, daysArchived: 14,
    travelers: [{ firstName: 'Hiroshi', lastName: 'Tanaka', email: 'archive-demo-4@example.com', phoneNumber: '81335551004', passportCountry: 'Japan', passportNumber: 'TR1004221', finishStep: 'complete' }],
  },
  {
    billingEmail: 'archive-demo-5@example.com',
    destination: 'India', visaType: 'TOURIST_1Y', totalUSD: 99.00,
    daysCompleted: 200, daysArchived: 170,
    // Multi-traveler family
    travelers: [
      { firstName: 'Sofia',    lastName: 'Almeida', email: 'archive-demo-5@example.com', phoneNumber: '5511999551005', passportCountry: 'Brazil',    passportNumber: 'BR1005556', finishStep: 'complete' },
      { firstName: 'Bernardo', lastName: 'Almeida', email: 'archive-demo-5@example.com', phoneNumber: '5511999551005', passportCountry: 'Brazil',    passportNumber: 'BR1005557', finishStep: 'complete' },
      { firstName: 'Lúcia',    lastName: 'Almeida', email: 'archive-demo-5@example.com', phoneNumber: '5511999551005', passportCountry: 'Brazil',    passportNumber: 'BR1005558', finishStep: 'complete' },
    ],
  },
  {
    billingEmail: 'archive-demo-6@example.com',
    destination: 'India', visaType: 'TOURIST_30', totalUSD: 51.25,
    daysCompleted: 70, daysArchived: 40,
    travelers: [{ firstName: 'Anneliese', lastName: 'Vogel', email: 'archive-demo-6@example.com', phoneNumber: '4930551006', passportCountry: 'Germany', passportNumber: 'DE1006334', finishStep: 'complete' }],
  },
  {
    billingEmail: 'archive-demo-7@example.com',
    destination: 'India', visaType: 'BUSINESS_1Y', totalUSD: 199.0,
    daysCompleted: 365, daysArchived: 335,
    travelers: [{ firstName: 'Ji-won',   lastName: 'Park',    email: 'archive-demo-7@example.com', phoneNumber: '8225551007', passportCountry: 'Republic of Korea', passportNumber: 'KR1007441', finishStep: 'complete' }],
  },
  {
    billingEmail: 'archive-demo-8@example.com',
    destination: 'India', visaType: 'TOURIST_5Y', totalUSD: 159.99,
    daysCompleted: 50, daysArchived: 20,
    travelers: [
      { firstName: 'Léa',     lastName: 'Moreau', email: 'archive-demo-8@example.com', phoneNumber: '33145551008', passportCountry: 'France', passportNumber: 'FR1008118', finishStep: 'complete' },
      { firstName: 'Antoine', lastName: 'Moreau', email: 'archive-demo-8@example.com', phoneNumber: '33145551008', passportCountry: 'France', passportNumber: 'FR1008119', finishStep: 'complete' },
    ],
  },
];

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function main() {
  const summary: Array<{ orderNumber: number; billingEmail: string; archivedAt: Date | null; created: boolean }> = [];

  for (const dummy of DUMMIES) {
    const existing = await prisma.order.findFirst({ where: { billingEmail: dummy.billingEmail } });
    if (existing) {
      console.log(`↩︎  Skipping ${dummy.billingEmail} — already exists as #${existing.orderNumber}`);
      summary.push({
        orderNumber: existing.orderNumber,
        billingEmail: existing.billingEmail,
        archivedAt: existing.archivedAt,
        created: false,
      });
      continue;
    }
    const created = await prisma.order.create({
      data: {
        destination: dummy.destination,
        visaType: dummy.visaType,
        totalUSD: dummy.totalUSD,
        status: 'COMPLETED',
        billingEmail: dummy.billingEmail,
        travelers: JSON.stringify(dummy.travelers),
        processingSpeed: 'standard',
        cardLast4: '4242',
        applicationId: `IND-${dummy.billingEmail.split('-')[2]?.split('@')[0] ?? 'X'}-DEMO`,
        completedAt: daysAgo(dummy.daysCompleted),
        archivedAt:  daysAgo(dummy.daysArchived),
        // Spread the createdAt back so the date column also looks coherent.
        createdAt: daysAgo(dummy.daysCompleted + 7),
      },
    });
    console.log(`✅ Created archived order #${created.orderNumber} (${dummy.billingEmail})`);
    summary.push({
      orderNumber: created.orderNumber,
      billingEmail: created.billingEmail,
      archivedAt: created.archivedAt,
      created: true,
    });
  }

  console.log('\nSummary:');
  console.table(summary);
}

main()
  .catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
