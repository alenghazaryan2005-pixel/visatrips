/**
 * Shared Prisma client + reset helpers for E2E tests.
 *
 * Each spec calls `resetDb()` in `beforeEach` to wipe transactional tables
 * (orders, bot runs, tickets, error logs, custom emails/statuses, settings)
 * while leaving schema + the seeded admin user intact. Keeps specs independent.
 */
import { PrismaClient } from '@prisma/client';

// Single instance reused across all specs — cheaper than reconnecting per test.
// The URL comes from .env.test which the dev:e2e script loads.
export const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL || 'postgresql://expressvisa:expressvisa@localhost:5432/expressvisa_test' },
  },
});

/**
 * Truncate mutable tables between tests. Ordered to respect FK constraints.
 * The admin user stays (we need them to log in); schema stays.
 */
export async function resetDb() {
  // Use raw SQL + CASCADE to avoid order-of-deletes pain from FK relationships.
  await prisma.$executeRawUnsafe(`
    TRUNCATE
      "bot_run_entries",
      "bot_runs",
      "error_logs",
      "ticket_messages",
      "tickets",
      "custom_email_templates",
      "custom_statuses",
      "settings",
      "abandoned_applications",
      "orders"
    RESTART IDENTITY CASCADE;
  `);
}
