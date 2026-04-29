/**
 * Admin auth round-trip — real login form, real cookie, real redirect.
 */
import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers/auth';
import { resetDb } from './helpers/db';

test.beforeEach(async () => { await resetDb(); });

test('submitting the login form authenticates and reveals the dashboard', async ({ page }) => {
  await page.goto('/admin');

  // Fill the login form
  await page.getByPlaceholder(/admin@visatrips\.com/i).fill(ADMIN_EMAIL);
  await page.getByPlaceholder('••••••••').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  // After success the login card disappears and the dashboard shell appears
  await expect(page.getByPlaceholder(/search by order number/i)).toBeVisible();
  await expect(page.getByText(/sign in to admin panel/i)).not.toBeVisible();

  // Cookie was actually set
  const cookies = await page.context().cookies();
  expect(cookies.some(c => c.name === 'ev_admin_session')).toBe(true);
});

test('wrong password keeps the login card and shows an error', async ({ page }) => {
  await page.goto('/admin');
  await page.getByPlaceholder(/admin@visatrips\.com/i).fill(ADMIN_EMAIL);
  await page.getByPlaceholder('••••••••').fill('wrong-password');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  await expect(page.getByPlaceholder(/search by order number/i)).not.toBeVisible();
});

test('unknown email is also rejected', async ({ page }) => {
  await page.goto('/admin');
  await page.getByPlaceholder(/admin@visatrips\.com/i).fill('noone@example.com');
  await page.getByPlaceholder('••••••••').fill('whatever');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
});
