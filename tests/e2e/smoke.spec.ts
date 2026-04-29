/**
 * Smoke tests — every page the app ships with should at least *render* without
 * server errors. These are intentionally shallow; deeper flow checks live in
 * their own spec files.
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { resetDb } from './helpers/db';

test.beforeEach(async () => { await resetDb(); });

test('public homepage renders', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/VisaTrips/i);
});

test('unauthenticated /admin shows the login card', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByText(/sign in to admin panel/i)).toBeVisible();
  await expect(page.getByPlaceholder(/admin@visatrips\.com/i)).toBeVisible();
  await expect(page.getByPlaceholder('••••••••')).toBeVisible();
});

test('authenticated /admin renders the dashboard', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin');
  // Orders list is the default view — the Search box is always present for logged-in admins.
  await expect(page.getByPlaceholder(/search by order number/i)).toBeVisible();
});

test('authenticated /admin/settings/india renders with its five tabs', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/settings/india');
  await expect(page.getByRole('heading', { name: /india settings/i })).toBeVisible();
  for (const tab of ['Pricing', 'Email Templates', 'Status Labels', 'Application', 'Bot', 'General']) {
    await expect(page.getByRole('button', { name: tab })).toBeVisible();
  }
});
