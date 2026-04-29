import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for VisaTrips.
 *
 * Runs Next.js on :3100 against the local Docker Postgres (see .env.test).
 * Unit tests (Vitest) live under tests/lib + tests/api + tests/components and
 * are NOT touched by this config.
 *
 * Start the test DB once: `docker compose up -d postgres`
 * Run tests: `pnpm test:e2e`
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Generous timeout — Next dev server is cold the first time it compiles a route.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  fullyParallel: false,     // each test can touch the DB — serial avoids interference
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  /**
   * Boots Next against .env.test before any spec runs. `reuseExistingServer`
   * means you can leave `pnpm dev:e2e` running locally for a fast feedback loop;
   * in CI it starts cold every time.
   */
  webServer: {
    command: 'pnpm dev:e2e',
    url: 'http://localhost:3100/api/admin/session',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
