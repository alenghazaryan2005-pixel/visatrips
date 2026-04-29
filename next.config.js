/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  // E2E tests set NEXT_DIST_DIR=.next-test (via .env.test) so they get their own
  // build lock — lets the test server run concurrently with `pnpm dev` without
  // Next 16's per-distDir dev-server lock tripping.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Output standalone for better Vercel compatibility
  output: 'standalone',
  // Allow uploaded images
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

// Only wrap with Sentry if a DSN is configured
const shouldUseSentry = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

module.exports = shouldUseSentry
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      widenClientFileUpload: true,
      tunnelRoute: '/monitoring',
      hideSourceMaps: true,
      disableLogger: true,
      automaticVercelMonitors: false,
    })
  : nextConfig;
