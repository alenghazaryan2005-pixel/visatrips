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

/**
 * The CRM is served under two URL families depending on origin:
 *   support subdomain → clean paths (/tickets, /canned, /contact/*)
 *                        that middleware rewrites to /admin/crm/*
 *   primary admin origin → /admin/crm/* directly (no middleware)
 *
 * Hardcoding one form or the other in a Link/href breaks the other
 * origin. On the support subdomain, an href to /admin/crm/xxx hits
 * middleware's fall-through branch and gets 308-redirected to
 * visatrips.com — a domain not attached to Vercel, so the user
 * lands nowhere useful. Symmetric bug the other direction.
 *
 * `crmPath()` picks the right form at CLIENT-side call time by
 * inspecting `window.location.pathname`. Safe to render into a
 * <Link href> via useEffect / useState. For onClick / imperative
 * navigation (`window.location.href = ...`), just call it inline —
 * click handlers only fire client-side.
 *
 * Server-render fallback returns the /admin/crm form (safer default —
 * works on primary; hydration corrects it on support before the user
 * has time to interact with the initial paint).
 */
export type CrmPathKind = 'inbox' | 'ticket' | 'canned' | 'contact';

export function crmPath(kind: CrmPathKind, arg?: string): string {
  const onSupport = typeof window !== 'undefined' && (
    window.location.pathname === '/tickets'
    || window.location.pathname.startsWith('/tickets/')
    || window.location.pathname === '/canned'
    || window.location.pathname.startsWith('/canned/')
    || window.location.pathname.startsWith('/contact/')
    || window.location.pathname === '/'
  );
  if (onSupport) {
    switch (kind) {
      case 'inbox':   return '/tickets';
      case 'ticket':  return `/tickets/${arg}`;
      case 'canned':  return '/canned';
      case 'contact': return `/contact/${arg}`;
    }
  }
  switch (kind) {
    case 'inbox':   return '/admin/crm';
    case 'ticket':  return `/admin/crm/${arg}`;
    case 'canned':  return '/admin/crm/canned';
    case 'contact': return `/admin/crm/contact/${arg}`;
  }
}
