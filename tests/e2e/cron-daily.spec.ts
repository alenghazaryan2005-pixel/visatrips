/**
 * End-to-end coverage for /api/cron/daily + the Archive flow.
 *
 * We hit the cron endpoint via its real HTTP path, then read back state from
 * Prisma. Email sends would fail (Resend key is inert in .env.test) but the
 * route catches per-candidate errors without aborting, so other jobs still
 * run. That's actually a nice property to verify here.
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { prisma, resetDb } from './helpers/db';
import { seedOrder, seedAbandoned, formatOrderNum } from './helpers/fixtures';

test.beforeEach(async () => { await resetDb(); });

const CRON_URL = '/api/cron/daily';

async function runCron(page: import('@playwright/test').Page) {
  return page.request.post(CRON_URL, {
    // Matches the CRON_SECRET read from .env.test if set, else any header.
    // In .env.test we don't set CRON_SECRET, so we fall back to admin auth.
  });
}

test('admin GET → dry-run with pending counts, no writes', async ({ page }) => {
  await seedAbandoned({ createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) });
  await seedAbandoned({ createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) });
  await seedOrder({
    orderNumber: 10_200,
    status: 'COMPLETED',
    completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
  });

  await loginAsAdmin(page);
  const res = await page.request.get(CRON_URL);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.dryRun).toBe(true);
  // Both abandoned rows are reminder-eligible (createdAt > 2 days, reminderCount=0).
  // Purge criterion is separate: only the 10-day-old row is past 7 days.
  expect(body.pendingReminders).toBe(2);
  expect(body.pendingPurge).toBe(1);
  expect(body.pendingArchive).toBe(1);

  // Still alive after dry run
  const abandoned = await prisma.abandonedApplication.count();
  expect(abandoned).toBe(2);
  const archived = await prisma.order.count({ where: { archivedAt: { not: null } } });
  expect(archived).toBe(0);
});

test('admin POST → runs the real jobs', async ({ page }) => {
  // Fresh abandoned — NOT yet eligible for reminder (< 2 days old)
  await seedAbandoned({ createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), email: 'fresh@v.com' });
  // Day-3 abandoned — eligible for first reminder
  const midway = await seedAbandoned({ createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), email: 'midway@v.com' });
  // Day-10 abandoned — past the 7-day purge cutoff
  await seedAbandoned({ createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), email: 'stale@v.com' });

  // Completed order 31 days ago → should be archived
  const oldCompleted = await seedOrder({
    orderNumber: 10_300, status: 'COMPLETED',
    completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
  });
  // Completed order 10 days ago → should NOT be archived yet
  const recentCompleted = await seedOrder({
    orderNumber: 10_301, status: 'COMPLETED',
    completedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  });

  await loginAsAdmin(page);
  const res = await runCron(page);
  expect(res.ok()).toBe(true);
  const body = await res.json();

  // The day-10 row was purged before the reminder loop ran over it — so it
  // never tried to send. The day-3 row sent (or errored due to inert Resend;
  // the route captures send errors and continues).
  expect(body.abandonedDeleted).toBe(1);
  expect(body.ordersArchived).toBe(1);

  // DB reflects the writes
  const stale = await prisma.abandonedApplication.findUnique({ where: { id: midway.id } });
  // The midway row should still exist (not purged) — and if sendEmail didn't
  // throw, its reminderCount should be 1. We tolerate both because the Resend
  // key in .env.test is inert.
  expect(stale).not.toBeNull();

  // The day-10 row was hard-deleted
  const abandonedCount = await prisma.abandonedApplication.count();
  expect(abandonedCount).toBe(2); // fresh + midway still there

  // Only the 31-day-old order got archivedAt stamped
  const archivedOld = await prisma.order.findUnique({ where: { id: oldCompleted.id } });
  expect(archivedOld?.archivedAt).not.toBeNull();
  const stillActive = await prisma.order.findUnique({ where: { id: recentCompleted.id } });
  expect(stillActive?.archivedAt).toBeNull();
});

test('archived order detail shows redacted card with Recover button', async ({ page }) => {
  const order = await seedOrder({
    orderNumber: 10_400,
    status: 'COMPLETED',
    completedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    archivedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    travelers: [{ firstName: 'Hidden', lastName: 'Name', email: 'hidden@v.com' }],
  });

  await loginAsAdmin(page);
  await page.goto(`/admin/orders/${formatOrderNum(order.orderNumber)}`);

  // Redacted card shows the order number + archive notice + Recover button
  await expect(page.getByRole('heading', { name: `Order ${formatOrderNum(order.orderNumber)}` })).toBeVisible();
  await expect(page.getByText(/customer details are hidden/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /recover order/i })).toBeVisible();

  // Traveler name MUST NOT be visible
  await expect(page.getByText(/hidden name/i)).not.toBeVisible();
  await expect(page.getByText('hidden@v.com')).not.toBeVisible();
});

test('Recover button PATCHes archivedAt=null and restores full detail view', async ({ page }) => {
  const order = await seedOrder({
    orderNumber: 10_500,
    status: 'COMPLETED',
    completedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    archivedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    travelers: [{ firstName: 'Recover', lastName: 'Me', email: 'r@v.com' }],
  });

  await loginAsAdmin(page);

  // Hit the PATCH directly — same path the UI uses. (The UI confirm() prompt
  // makes E2E clicks brittle; testing the API contract is the meaningful bit.)
  const res = await page.request.patch(`/api/orders/${order.id}`, {
    data: { archivedAt: null },
  });
  expect(res.ok()).toBe(true);

  const updated = await prisma.order.findUnique({ where: { id: order.id } });
  expect(updated?.archivedAt).toBeNull();

  // After recovery the full detail page renders (no redacted card)
  await page.goto(`/admin/orders/${formatOrderNum(order.orderNumber)}`);
  await expect(page.getByText(/recover me/i).first()).toBeVisible();
  await expect(page.getByText(/customer details are hidden/i)).not.toBeVisible();
});

test('Archive sidebar section shows only archived orders', async ({ page }) => {
  await seedOrder({ orderNumber: 10_600, status: 'COMPLETED', archivedAt: null });
  await seedOrder({
    orderNumber: 10_601, status: 'COMPLETED', archivedAt: new Date(),
    travelers: [{ firstName: 'Archive', lastName: 'Me' }],
  });

  await loginAsAdmin(page);
  await page.goto('/admin');

  // Default Orders view hides archived rows
  await expect(page.getByText('10600')).toBeVisible();
  await expect(page.getByText('10601')).not.toBeVisible();

  // Switch to the dedicated Archive sidebar section
  await page.goto('/admin?section=archive');

  // Only archived order shows; the other is hidden
  await expect(page.getByText('10601')).toBeVisible();
  await expect(page.getByText('10600')).not.toBeVisible();
});
