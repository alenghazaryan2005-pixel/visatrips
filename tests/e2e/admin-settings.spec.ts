/**
 * Settings-page Cancel button — added earlier today. This spec validates the
 * round-trip: make an edit, hit Cancel, see the edit revert, confirm nothing
 * was persisted.
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { prisma, resetDb } from './helpers/db';

test.beforeEach(async () => { await resetDb(); });

test('main-page Cancel clears all unsaved drafts without persisting', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/settings/india');

  // Wait for /api/settings fetch to resolve — the Pricing inputs don't render
  // until `data` is set. Without this we can race the async initial state.
  await page.waitForLoadState('networkidle');

  // Pricing is the default tab. Find the first visa-pricing input.
  const firstPriceInput = page.locator('input.settings-input').first();
  await expect(firstPriceInput).toBeVisible();
  const original = await firstPriceInput.inputValue();
  const distinct = String(Number(original || 0) + 1234); // guaranteed different

  // Scoped assertion — the top-right main-page Save button lives under .settings-save-btn
  const mainSaveBtn = page.locator('.settings-save-btn');
  await expect(mainSaveBtn).toHaveText(/saved/i);

  // Fill a distinct value + commit via blur
  await firstPriceInput.fill(distinct);
  await firstPriceInput.press('Tab');

  // Main-page Save button flips to unsaved
  await expect(mainSaveBtn).toHaveText(/save \d+ change/i);

  // Cancel button appears (new behavior)
  const cancelBtn = page.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancelBtn).toBeVisible();

  // Click Cancel
  await cancelBtn.click();

  // Input restored to original value
  await expect(firstPriceInput).toHaveValue(original);

  // Save button back to clean state
  await expect(mainSaveBtn).toHaveText(/saved/i);

  // Nothing was written to the DB (settings table still empty)
  const count = await prisma.setting.count();
  expect(count).toBe(0);
});

test('Application tab Cancel reverts schema edits', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/settings/india');

  // Switch to Application tab
  await page.getByRole('button', { name: 'Application' }).click();

  // Wait for the schema to render. "+ Add Custom Section" is unique to this tab.
  const addBtn = page.getByRole('button', { name: /add custom section/i });
  await expect(addBtn).toBeVisible();

  // The Application tab has its own Save button. Scope by excluding the
  // top-right main-page button (`.settings-save-btn` class).
  const appSaveBtn = page
    .getByRole('button', { name: /^(save schema|saved|saving)/i })
    .and(page.locator(':not(.settings-save-btn)'));
  await expect(appSaveBtn).toHaveText(/saved/i);

  // Add a custom section to dirty the schema
  await addBtn.click();

  // Save button flips to "Save Schema" (dirty)
  await expect(appSaveBtn).toHaveText(/save schema/i);
  const cancelBtn = page.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancelBtn).toBeVisible();

  // Cancel
  await cancelBtn.click();

  // Back to clean state
  await expect(appSaveBtn).toHaveText(/saved/i);
  await expect(cancelBtn).not.toBeVisible();

  // Nothing persisted
  const row = await prisma.setting.findUnique({ where: { key: 'application.schema.INDIA' } });
  expect(row).toBeNull();
});
