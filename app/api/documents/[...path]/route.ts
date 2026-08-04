/**
 * Authenticated document streaming.
 *
 * Customer documents (passport bio pages, ID photos, issued e-Visas) live in
 * PRIVATE Vercel Blob storage and have no reachable URL of their own. This is
 * the only way to read one, and it authorises every request first.
 *
 * That replaces the previous scheme, where documents sat in `public/uploads/`
 * under sequential, guessable, completely unauthenticated paths — anyone who
 * tried `/uploads/00042/passport.pdf` got a passport bio page, and
 * middleware.ts explicitly passes `/uploads/*` through. That also directly
 * contradicted the published privacy policy's promise that access is
 * "restricted to authorized employees on a strict need-to-know basis".
 *
 * Authorisation mirrors GET /api/orders/[id] exactly:
 *   - any admin may read any document
 *   - a customer may read documents belonging to an order whose billingEmail
 *     or one of whose traveler emails matches their session
 *
 * The order is identified from the blob pathname, which we generate as
 * `orders/<orderId>/<type>-<random>.<ext>` (see lib/documents.ts). We do NOT
 * trust the path beyond extracting that segment — the lookup goes through
 * Prisma and the ownership check is done against the real row.
 *
 * NOTE: this is only as strong as the session it checks, and sessions are
 * currently unsigned JSON cookies that can be forged by hand. Private storage
 * is still strictly better than public — but the access control here does not
 * become meaningful until those cookies are signed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseOrderNumber } from '@/lib/constants';
import { getAdminSession, getCustomerSession } from '@/lib/auth';
import { openDocumentStream, isBlobConfigured } from '@/lib/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Pull the order segment out of `orders/<orderId>/<file>`. */
function orderIdFromPathname(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[0] === 'orders') return parts[1];
  return null;
}

async function findOrder(idOrNumber: string) {
  const parsed = parseOrderNumber(idOrNumber);
  if (!isNaN(parsed) && parsed > 0) {
    const order = await prisma.order.findFirst({ where: { orderNumber: parsed } });
    if (order) return order;
  }
  return prisma.order.findUnique({ where: { id: idOrNumber } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: segments } = await params;
    const pathname = (segments ?? []).map(decodeURIComponent).join('/');

    if (!pathname) {
      return NextResponse.json({ error: 'Missing document path' }, { status: 400 });
    }
    // Defence in depth: the blob SDK is not a filesystem, but refuse anything
    // that looks like traversal rather than passing it through.
    if (pathname.includes('..')) {
      return NextResponse.json({ error: 'Invalid document path' }, { status: 400 });
    }

    // ── Authorise ───────────────────────────────────────────────────────
    // Deliberately BEFORE the storage-configuration check: an anonymous
    // caller shouldn't be able to probe whether Blob is wired up.
    const admin = await getAdminSession();
    let authorised = Boolean(admin);

    if (!authorised) {
      const customer = await getCustomerSession();
      if (!customer) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const orderRef = orderIdFromPathname(pathname);
      if (!orderRef) {
        // Unrecognised layout — no way to prove ownership, so deny.
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const order = await findOrder(orderRef);
      if (!order) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const email = customer.email.toLowerCase();
      if (order.billingEmail.toLowerCase() === email) {
        authorised = true;
      } else {
        try {
          const travelers = JSON.parse(order.travelers);
          if (Array.isArray(travelers) && travelers.some((t: any) => t?.email?.toLowerCase() === email)) {
            authorised = true;
          }
        } catch { /* malformed travelers JSON — fall through to deny */ }
      }
      if (!authorised) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // ── Stream ──────────────────────────────────────────────────────────
    if (!isBlobConfigured()) {
      return NextResponse.json({ error: 'Document storage is not configured.' }, { status: 503 });
    }

    const result = await openDocumentStream(pathname);
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return new NextResponse(result.stream, {
      status: 200,
      headers: {
        'Content-Type': result.blob.contentType || 'application/octet-stream',
        // Render inline so the admin panel's <img> tags and PDF previews
        // work, but keep nosniff so a mislabelled file can't be executed.
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        // These are personal identity documents — never let a shared cache
        // hold them, and never let a proxy serve one user's doc to another.
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
  }
}
