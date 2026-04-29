/**
 * Direct-to-DB order factory for E2E specs.
 *
 * Creates orders via Prisma rather than through the customer apply flow —
 * the apply flow is its own multi-step form and testing it is Phase-5
 * territory. Use this factory when you need a known order state to drive
 * admin or customer status-page tests.
 */
import { prisma } from './db';

interface OrderSeedOpts {
  orderNumber?: number;
  status?: string;
  destination?: string;
  visaType?: string;
  billingEmail?: string;
  totalUSD?: number;
  processingSpeed?: string;
  travelers?: Array<Record<string, any>>;
  flaggedFields?: string | null;
  specialistNotes?: string | null;
  applicationId?: string | null;
  completedAt?: Date | null;
  archivedAt?: Date | null;
}

let nextOrderNumber = 10_000;

/** Create one order with sensible defaults. Returns the full row. */
export async function seedOrder(opts: OrderSeedOpts = {}) {
  const orderNumber = opts.orderNumber ?? nextOrderNumber++;
  const travelers = opts.travelers ?? [
    { firstName: 'Test', lastName: 'User', email: 'test.user@example.com' },
  ];
  return prisma.order.create({
    data: {
      orderNumber,
      destination: opts.destination ?? 'India',
      visaType: opts.visaType ?? 'TOURIST_30',
      totalUSD: opts.totalUSD ?? 79,
      status: opts.status ?? 'PROCESSING',
      billingEmail: opts.billingEmail ?? 'test.user@example.com',
      travelers: JSON.stringify(travelers),
      processingSpeed: opts.processingSpeed ?? 'standard',
      flaggedFields: opts.flaggedFields ?? null,
      specialistNotes: opts.specialistNotes ?? null,
      applicationId: opts.applicationId ?? null,
      completedAt: opts.completedAt ?? null,
      archivedAt: opts.archivedAt ?? null,
    },
  });
}

/** Seed an AbandonedApplication row for cron-daily specs. */
export async function seedAbandoned(opts: {
  email?: string | null;
  destination?: string | null;
  travelers?: Array<Record<string, any>> | null;
  createdAt?: Date;
  reminderCount?: number;
  lastReminderAt?: Date | null;
} = {}) {
  return prisma.abandonedApplication.create({
    data: {
      email: opts.email ?? 'abandoned@example.com',
      destination: opts.destination ?? 'India',
      visaType: 'TOURIST_30',
      travelers: opts.travelers === undefined
        ? JSON.stringify([{ firstName: 'Sam' }])
        : opts.travelers === null
          ? null
          : JSON.stringify(opts.travelers),
      lastStep: 'step2',
      reminderCount: opts.reminderCount ?? 0,
      lastReminderAt: opts.lastReminderAt ?? null,
      // Default created 3 days ago — eligible for a reminder.
      createdAt: opts.createdAt ?? new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });
}

/** Pad an order number into the 5-digit form used in URLs ("00042"). */
export function formatOrderNum(n: number): string {
  if (n <= 99_999) return String(n).padStart(5, '0');
  return `${String(Math.floor(n / 100_000)).padStart(5, '0')}-${String(n % 100_000).padStart(5, '0')}`;
}
