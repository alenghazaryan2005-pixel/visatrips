import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for VisaTrips unit tests.
 *
 * Two environments in one suite:
 *  - `node`     — default, used for lib + API route tests.
 *  - `happy-dom` — for React component tests. Enabled per-file via the
 *    `// @vitest-environment happy-dom` doc-comment at the top of a test file.
 *
 * Not tested here: Playwright scripts, Prisma side-effect modules (DB), and
 * pages whose bodies exceed ~1k lines (integration-test territory). Keeps
 * the suite under 1s and cheap to maintain.
 */
export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      // Any test under tests/components/ gets a DOM automatically.
      ['tests/components/**', 'jsdom'],
    ],
    // React 19 + Testing Library needs IS_REACT_ACT_ENVIRONMENT set BEFORE
    // React renders. Our setup also adds jest-dom matchers + auto-cleanup.
    setupFiles: ['tests/setup-dom.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts', 'lib/**/*.tsx'],
      exclude: [
        'lib/prisma.ts',       // just a Prisma client instance
        'lib/settings.ts',     // DB-backed
        'lib/rate-limit.ts',   // DB-backed
        'lib/error-log.ts',    // DB-backed
        // Email side-effect layer — needs integration tests, not unit tests:
        'lib/email/resend.ts',   // Resend SDK wrapper
        'lib/email/resolve.ts',  // DB-backed template resolver
        'lib/email/send.ts',     // network send
        'lib/email/templates.ts', // legacy HTML templates
        'lib/email/trigger.ts',  // DB + network orchestration
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
