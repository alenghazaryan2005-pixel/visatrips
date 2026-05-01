/**
 * POST /api/customizations/publish
 *   Owner-only. Promotes every draft row to published. For each draft we
 *   delete the matching published row at the same (pagePath, selector,
 *   property) slot, then update the draft's status. Atomic per-slot via
 *   $transaction so visitors never see a "published row gone, draft not
 *   yet promoted" gap.
 *
 * Body (optional): { pagePath?: string }  — narrows the publish to a
 *   single path's drafts. Without it, every pending draft across every
 *   path goes live in one click.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOwner, isErrorResponse } from '@/lib/auth';
import { validatePagePath } from '@/lib/customizations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  const admin = auth;

  try {
    let scopedPath: string | null = null;
    try {
      const body = await req.json();
      if (body?.pagePath) scopedPath = validatePagePath(body.pagePath);
    } catch {
      // Empty body is fine — publish everything.
    }

    const where: any = { status: 'draft' };
    if (scopedPath) where.pagePath = scopedPath;
    const drafts = await prisma.pageCustomization.findMany({ where });

    if (drafts.length === 0) {
      return NextResponse.json({ ok: true, published: 0 });
    }

    // Per-slot transaction — atomically replace the published row with the
    // promoted draft so visitors loading the page mid-publish always see
    // some valid value (either the old published one or the new one).
    let publishedCount = 0;
    for (const draft of drafts) {
      try {
        await prisma.$transaction([
          prisma.pageCustomization.deleteMany({
            where: {
              pagePath: draft.pagePath,
              selector: draft.selector,
              property: draft.property,
              status: 'published',
            },
          }),
          prisma.pageCustomization.update({
            where: { id: draft.id },
            data: { status: 'published', updatedBy: admin.email },
          }),
        ]);
        publishedCount++;
      } catch (err) {
        // A failure on one slot shouldn't block the rest. Log and continue.
        console.error(`[publish] slot failed (${draft.pagePath} / ${draft.selector} / ${draft.property}):`, err);
      }
    }

    return NextResponse.json({ ok: true, published: publishedCount });
  } catch (err: any) {
    console.error('[POST /api/customizations/publish] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to publish' }, { status: 500 });
  }
}
