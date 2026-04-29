/**
 * Log in as the seeded admin user by POSTing to /api/admin/login.
 *
 * Playwright's BrowserContext picks up the Set-Cookie header automatically,
 * so subsequent page.goto calls are authenticated. No cookie injection
 * needed — this exercises the real auth path which is what E2E is for.
 */
import type { Page } from '@playwright/test';

export const ADMIN_EMAIL = 'admin@visatrips.com';
export const ADMIN_PASSWORD = 'visatrips2026';

export async function loginAsAdmin(page: Page): Promise<void> {
  const res = await page.request.post('/api/admin/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`admin login failed (status=${res.status()}): ${body}`);
  }
}

/**
 * Drop the admin cookie by POSTing to logout. Used in specs that want to
 * assert the unauthenticated view.
 */
export async function logoutAdmin(page: Page): Promise<void> {
  await page.request.post('/api/admin/logout').catch(() => {});
}

/**
 * Log in as a customer via the email + orderNumber fallback path (no PIN
 * seeding needed). The email must match the order's billingEmail or one of
 * its travelers' emails — matches the real customer login logic.
 */
export async function loginAsCustomer(
  page: Page,
  email: string,
  orderNumber: string,
): Promise<void> {
  const res = await page.request.post('/api/customer/login', {
    data: { email, orderNumber },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`customer login failed (status=${res.status()}): ${body}`);
  }
}
