import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware runs on every request. Two responsibilities:
 *
 *  1. Support-subdomain routing. `support.visatrips.com/*` is scoped
 *     to the CRM. Whitelisted paths (/tickets, /canned, /contact/*)
 *     rewrite to their internal /admin/crm/* equivalents so the CRM
 *     is served from clean URLs. API and static-asset paths pass
 *     through so client-side fetches from CRM pages work same-origin.
 *     Anything else on the support subdomain redirects (308) to the
 *     equivalent path on the primary visatrips.com — keeps the
 *     subdomain from becoming a second copy of the whole site.
 *
 *     Local dev: use `support.localhost:3000` (Chrome auto-resolves
 *     any `.localhost` subdomain to 127.0.0.1; Safari/Firefox need
 *     a `127.0.0.1 support.localhost` line in /etc/hosts).
 *
 *  2. Security headers on every response.
 */

const SUPPORT_HOSTS = ['support.visatrips.com', 'support.localhost:3000', 'support.localhost'];

/** Whitelisted paths on the support subdomain → their internal target. */
function rewriteTarget(path: string): string | null {
  // Root and /tickets both land on the CRM inbox.
  if (path === '/' || path === '/tickets' || path === '/tickets/') return '/admin/crm';
  // /tickets/<id> → /admin/crm/<id>
  if (path.startsWith('/tickets/')) return '/admin/crm' + path.slice('/tickets'.length);
  // /canned → /admin/crm/canned
  if (path === '/canned' || path === '/canned/') return '/admin/crm/canned';
  // /contact/<email> → /admin/crm/contact/<email>
  if (path.startsWith('/contact/')) return '/admin/crm' + path;
  return null;
}

/** Paths that should pass through the subdomain untouched (no rewrite, no redirect). */
function isPassthrough(path: string): boolean {
  return (
    path.startsWith('/api/') ||
    path.startsWith('/_next/') ||
    path.startsWith('/uploads/') ||
    path === '/favicon.ico' ||
    path === '/robots.txt' ||
    path === '/sitemap.xml'
  );
}

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') || '').toLowerCase();
  const path = request.nextUrl.pathname;
  const isSupport = SUPPORT_HOSTS.includes(host);

  let response: NextResponse;

  if (isSupport) {
    const target = rewriteTarget(path);
    if (target) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      response = NextResponse.rewrite(url);
    } else if (isPassthrough(path)) {
      response = NextResponse.next();
    } else {
      // Anything else on the support subdomain isn't CRM — bounce to
      // the equivalent path on the primary domain. 308 = permanent +
      // preserves method (important for POSTs that might miss the mapping).
      const target = new URL(request.nextUrl.pathname + request.nextUrl.search, 'https://visatrips.com');
      response = NextResponse.redirect(target, 308);
    }
  } else {
    response = NextResponse.next();
  }

  // ── Security headers (applies to every response, subdomain or not) ──
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Prevent uploaded files from being executed as scripts
  if (path.startsWith('/uploads/')) {
    response.headers.set('Content-Disposition', 'inline');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
