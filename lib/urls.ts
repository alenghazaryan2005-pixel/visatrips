/**
 * Shared origin constants used by the admin chrome + CRM chrome to
 * cross-link between the two subdomains. Resolved once at build time
 * — Next inlines `process.env.NEXT_PUBLIC_*` into the client bundle,
 * so referencing these from a client component is free at runtime.
 *
 *   CRM_BASE     — where the CRM lives (support subdomain).
 *   PRIMARY_BASE — where the main admin panel lives.
 *
 * Overrides via env var beat the defaults, so when
 * support.visatrips.com goes live you set:
 *
 *   NEXT_PUBLIC_CRM_URL=https://support.visatrips.com
 *   NEXT_PUBLIC_APP_URL=https://visatrips.com     (once apex is on Vercel)
 *
 * in the Vercel project env and redeploy — no code change needed.
 */

const isProd = process.env.NODE_ENV === 'production';

export const CRM_BASE = process.env.NEXT_PUBLIC_CRM_URL
  || (isProd ? 'https://visatrips-support.vercel.app' : 'http://localhost:3002');

export const PRIMARY_BASE = process.env.NEXT_PUBLIC_APP_URL
  || (isProd ? 'https://visatrips.vercel.app' : 'http://localhost:3000');
