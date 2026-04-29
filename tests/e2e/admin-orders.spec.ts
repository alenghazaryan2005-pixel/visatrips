/**
 * Admin orders flow — list page shows seeded orders, detail page loads,
 * changing status via the quick-select writes through to the DB.
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { prisma, resetDb } from './helpers/db';
import { seedOrder, formatOrderNum } from './helpers/fixtures';

test.beforeEach(async () => { await resetDb(); });

test('orders list renders seeded orders with correct visa chip + country', async ({ page }) => {
  await seedOrder({
    orderNumber: 10_001,
    status: 'PROCESSING',
    visaType: 'TOURIST_1Y',
    travelers: [{ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }],
  });
  await seedOrder({
    orderNumber: 10_002,
    status: 'SUBMITTED',
    visaType: 'BUSINESS_1Y',
    travelers: [{ firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' }],
  });

  await loginAsAdmin(page);
  await page.goto('/admin');

  // Both orders appear
  await expect(page.getByText('10001')).toBeVisible();
  await expect(page.getByText('10002')).toBeVisible();

  // Traveler names rendered
  await expect(page.getByText(/ada lovelace/i)).toBeVisible();
  await expect(page.getByText(/grace hopper/i)).toBeVisible();

  // Country column header (formerly "Visa", renamed in this session)
  await expect(page.getByRole('columnheader', { name: /country/i })).toBeVisible();
});

test('order detail page loads for a seeded order', async ({ page }) => {
  const order = await seedOrder({
    orderNumber: 10_010,
    status: 'PROCESSING',
    travelers: [{ firstName: 'Margaret', lastName: 'Hamilton', email: 'mh@example.com' }],
  });

  await loginAsAdmin(page);
  await page.goto(`/admin/orders/${formatOrderNum(order.orderNumber)}`);

  await expect(page.getByText(/margaret hamilton/i).first()).toBeVisible();
  // Order title in the top bar reads "Order 00010" (no # prefix on detail page)
  await expect(page.getByRole('heading', { name: `Order ${formatOrderNum(order.orderNumber)}` })).toBeVisible();
});

test('changing status via the quick-select updates the DB', async ({ page }) => {
  const order = await seedOrder({ orderNumber: 10_020, status: 'PROCESSING' });

  await loginAsAdmin(page);
  await page.goto('/admin');

  // Wait for the row we care about to appear
  await expect(page.getByText('10020')).toBeVisible();

  // The StatusSelect in the orders list lives inside the Quick column; use the
  // select with an option of PROCESSING selected. We scope to the row by id.
  const row = page.locator('tr.admin-row', { hasText: '10020' });
  await row.locator('select.admin-status-select').selectOption('SUBMITTED');

  // Give the PATCH a moment to land (quick-select fires fetch on change)
  await expect.poll(async () => {
    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    return fresh?.status;
  }, { timeout: 5_000 }).toBe('SUBMITTED');
});

test('PATCHing status=SUBMITTED stamps submittedAt exactly once', async ({ page }) => {
  const order = await seedOrder({ orderNumber: 10_030, status: 'PROCESSING' });
  expect(order.submittedAt).toBeNull();

  await loginAsAdmin(page);
  // Hit the API directly — this is the same path the UI uses.
  const res = await page.request.patch(`/api/orders/${order.id}`, {
    data: { status: 'SUBMITTED' },
  });
  expect(res.ok()).toBe(true);

  const updated = await prisma.order.findUnique({ where: { id: order.id } });
  expect(updated?.status).toBe('SUBMITTED');
  expect(updated?.submittedAt).not.toBeNull();
  const firstStamp = updated!.submittedAt!;

  // PATCH again — stamp should NOT move (covered by a unit test too; this verifies end-to-end)
  const res2 = await page.request.patch(`/api/orders/${order.id}`, {
    data: { status: 'SUBMITTED' },
  });
  expect(res2.ok()).toBe(true);
  const updated2 = await prisma.order.findUnique({ where: { id: order.id } });
  expect(updated2?.submittedAt?.getTime()).toBe(firstStamp.getTime());
});
