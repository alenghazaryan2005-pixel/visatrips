/**
 * NEEDS_CORRECTION round-trip.
 *
 * Scenario:
 *   1. Admin flags a field + writes a specialist note + moves status to NEEDS_CORRECTION.
 *   2. Customer logs in, lands on /status, sees the red banner + specialist note.
 *   3. (Simulated) fix — PATCH with flaggedFields=[] clears flags + status flips back.
 *   4. Banner is gone on the status page.
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsCustomer } from './helpers/auth';
import { prisma, resetDb } from './helpers/db';
import { seedOrder, formatOrderNum } from './helpers/fixtures';

test.beforeEach(async () => { await resetDb(); });

test('admin flag → customer sees banner → fix → banner is gone', async ({ browser }) => {
  const order = await seedOrder({
    orderNumber: 10_100,
    status: 'PROCESSING',
    billingEmail: 'customer@example.com',
    travelers: [{ firstName: 'Jane', lastName: 'Doe', email: 'customer@example.com' }],
  });

  // ── Step 1: Admin PATCHes NEEDS_CORRECTION + flagged fields + specialist notes ──
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await loginAsAdmin(adminPage);

  const patchRes = await adminPage.request.patch(`/api/orders/${order.id}`, {
    data: {
      status: 'NEEDS_CORRECTION',
      flaggedFields: JSON.stringify(['firstName', 'passportNumber']),
      specialistNotes: 'Please re-check spelling of first name and verify the passport number.',
    },
  });
  expect(patchRes.ok()).toBe(true);

  // DB reflects the admin's change
  const afterFlag = await prisma.order.findUnique({ where: { id: order.id } });
  expect(afterFlag?.status).toBe('NEEDS_CORRECTION');
  expect(afterFlag?.specialistNotes).toMatch(/spelling of first name/i);
  expect(JSON.parse(afterFlag!.flaggedFields!)).toEqual(['firstName', 'passportNumber']);

  await adminCtx.close();

  // ── Step 2: Customer logs in, hits /status, sees the red banner ──
  const customerCtx = await browser.newContext();
  const customerPage = await customerCtx.newPage();
  await loginAsCustomer(customerPage, 'customer@example.com', formatOrderNum(order.orderNumber));
  await customerPage.goto('/status');

  // Red correction banner with the heading
  await expect(customerPage.getByText(/there are errors on your application/i)).toBeVisible();
  // Specialist note body rendered
  await expect(customerPage.getByText(/spelling of first name/i)).toBeVisible();
  // "Fix Your Application" CTA present (non-doc flags fallback)
  await expect(customerPage.getByRole('link', { name: /fix your application/i })).toBeVisible();

  // ── Step 3: Customer (or admin) clears the flags — PATCH via API, same path the UI uses ──
  const fixRes = await customerPage.request.patch(`/api/orders/${order.id}`, {
    data: { flaggedFields: JSON.stringify([]) },
  });
  expect(fixRes.ok()).toBe(true);

  // Note: customer PATCH allowlist doesn't include status, so we only expect
  // flaggedFields to be cleared. Status stays NEEDS_CORRECTION until admin acts
  // OR the finish page re-submission (out of scope for this spec).
  const afterFix = await prisma.order.findUnique({ where: { id: order.id } });
  expect(JSON.parse(afterFix!.flaggedFields!)).toEqual([]);

  // ── Step 4: If admin then flips status back to PROCESSING, the banner disappears ──
  const adminCtx2 = await browser.newContext();
  const adminPage2 = await adminCtx2.newPage();
  await loginAsAdmin(adminPage2);
  await adminPage2.request.patch(`/api/orders/${order.id}`, {
    data: { status: 'PROCESSING', specialistNotes: '' },
  });
  await adminCtx2.close();

  await customerPage.reload();
  await expect(customerPage.getByText(/there are errors on your application/i)).not.toBeVisible();
});
