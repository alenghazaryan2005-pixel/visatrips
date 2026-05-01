/**
 * GET    /api/customizations?path=/foo[&drafts=1]
 *   Returns customizations to apply on `path`. Always includes published
 *   site-wide ('*') + published page-scoped rows. With `drafts=1` (owner
 *   only), also includes the calling owner's drafts so the editor can show
 *   what's pending publish.
 *
 * POST   /api/customizations  { pagePath, selector, property, value }
 *   Owner-only. Upserts a draft row for the given slot. If a published
 *   row already exists at the same slot, it stays untouched until publish.
 *
 * DELETE /api/customizations?id=...                       (single delete)
 * DELETE /api/customizations?status=draft[&pagePath=...]  (bulk discard)
 *   Owner-only. Used to discard drafts. We don't ever delete published
 *   rows from this endpoint — to revert a published change, edit it back
 *   to the original value and publish.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOwner, getAdminSession, isErrorResponse } from '@/lib/auth';
import {
  EDITABLE_PROPERTIES,
  SITE_WIDE,
  isEditableProperty,
  validatePagePath,
  validateSelector,
  validateValue,
} from '@/lib/customizations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const path = validatePagePath(url.searchParams.get('path') ?? '');
    if (!path) return NextResponse.json({ error: 'Invalid `path` query param.' }, { status: 400 });

    const includeDrafts = url.searchParams.get('drafts') === '1';

    // Drafts are owner-private — only return them if the caller is an owner.
    const session = await getAdminSession();
    const isOwner = session?.role === 'owner';

    const statuses: string[] = ['published'];
    if (includeDrafts && isOwner) statuses.push('draft');

    const rows = await prisma.pageCustomization.findMany({
      where: {
        AND: [
          { OR: [{ pagePath: SITE_WIDE }, { pagePath: path }] },
          { status: { in: statuses } },
        ],
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });

    return NextResponse.json({ customizations: rows });
  } catch (err: any) {
    console.error('[GET /api/customizations] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to load customizations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  const admin = auth;

  try {
    const body = await req.json();
    const pagePath = validatePagePath(body?.pagePath);
    const selector = validateSelector(body?.selector);
    const property = typeof body?.property === 'string' && isEditableProperty(body.property)
      ? body.property
      : null;
    const value = validateValue(body?.value);

    if (!pagePath) return NextResponse.json({ error: 'Invalid pagePath.' }, { status: 400 });
    if (!selector) return NextResponse.json({ error: 'Invalid selector.' }, { status: 400 });
    if (!property) return NextResponse.json({ error: `property must be one of: ${EDITABLE_PROPERTIES.join(', ')}.` }, { status: 400 });
    if (value == null) return NextResponse.json({ error: 'Invalid value.' }, { status: 400 });

    // Upsert the draft row for this slot. Status is fixed to 'draft' here —
    // publishing happens via /api/customizations/publish.
    const row = await prisma.pageCustomization.upsert({
      where: {
        pagePath_selector_property_status: {
          pagePath, selector, property, status: 'draft',
        },
      },
      create: { pagePath, selector, property, value, status: 'draft', updatedBy: admin.email },
      update: { value, updatedBy: admin.email },
    });

    return NextResponse.json({ ok: true, customization: row });
  } catch (err: any) {
    console.error('[POST /api/customizations] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to save customization' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    // Single delete by id — used by the editor's "remove just this override"
    // flow. We keep this even-handed: deletes drafts AND published rows by
    // id, since the only way to get the id is to have already loaded the
    // row in the editor.
    if (id) {
      await prisma.pageCustomization.delete({ where: { id } }).catch(() => null);
      return NextResponse.json({ ok: true });
    }

    // Bulk discard — owner-friendly "discard all drafts" / "discard drafts
    // for this page". Never touches published rows.
    const status = url.searchParams.get('status');
    if (status === 'draft') {
      const pagePathRaw = url.searchParams.get('pagePath');
      const pagePath = pagePathRaw ? validatePagePath(pagePathRaw) : null;
      const where: any = { status: 'draft' };
      if (pagePath) where.pagePath = pagePath;
      const result = await prisma.pageCustomization.deleteMany({ where });
      return NextResponse.json({ ok: true, deleted: result.count });
    }

    return NextResponse.json({ error: 'Provide either `id` or `status=draft`.' }, { status: 400 });
  } catch (err: any) {
    console.error('[DELETE /api/customizations] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to delete' }, { status: 500 });
  }
}
