import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_COLORS = new Set([
  'slate', 'blue', 'green', 'amber', 'red', 'purple', 'pink', 'emerald',
]);
const MAX_NAME = 40;
const MAX_ICON = 4;
const MAX_DESCRIPTION = 200;

/**
 * PATCH /api/order-tags/[id] — update a tag's name/color/icon/etc.
 * Renames are reflected everywhere — orders just reference the id, not
 * the name, so a rename doesn't require migrating order rows.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, any> = {};

    if (typeof body?.name === 'string') {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 });
      if (name.length > MAX_NAME) return NextResponse.json({ error: `Name must be ${MAX_NAME} chars or fewer.` }, { status: 400 });
      const dupe = await prisma.orderTag.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } } });
      if (dupe) return NextResponse.json({ error: `A tag named "${name}" already exists.` }, { status: 400 });
      data.name = name;
    }
    if (typeof body?.color === 'string' && VALID_COLORS.has(body.color)) data.color = body.color;
    if ('icon' in body) {
      data.icon = typeof body.icon === 'string' ? (body.icon.trim().slice(0, MAX_ICON) || null) : null;
    }
    if ('description' in body) {
      data.description = typeof body.description === 'string'
        ? (body.description.trim().slice(0, MAX_DESCRIPTION) || null)
        : null;
    }
    if (typeof body?.sortOrder === 'number' && Number.isFinite(body.sortOrder)) {
      data.sortOrder = Math.max(0, Math.min(999, Math.floor(body.sortOrder)));
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const tag = await prisma.orderTag.update({ where: { id }, data });
    return NextResponse.json({ ok: true, tag });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Tag not found.' }, { status: 404 });
    console.error('[PATCH /api/order-tags/[id]] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to update tag' }, { status: 400 });
  }
}

/**
 * DELETE /api/order-tags/[id] — remove a tag from the catalog. We also
 * scrub the id out of every Order.tags JSON array so removed tags don't
 * leave orphan references hanging around.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const tag = await prisma.orderTag.findUnique({ where: { id } });
    if (!tag) return NextResponse.json({ error: 'Tag not found.' }, { status: 404 });

    // Scrub the id from every Order.tags JSON array. Done in-process for
    // simplicity (vs. raw SQL JSON ops). Cheap at this scale.
    const orders = await prisma.order.findMany({
      where: { tags: { contains: id } },
      select: { id: true, tags: true },
    });
    for (const o of orders) {
      try {
        const arr = o.tags ? JSON.parse(o.tags) : [];
        if (Array.isArray(arr)) {
          const filtered = arr.filter((t: any) => t !== id);
          await prisma.order.update({
            where: { id: o.id },
            data: { tags: filtered.length ? JSON.stringify(filtered) : null },
          });
        }
      } catch {} // malformed JSON — leave alone, not our problem to fix here
    }

    await prisma.orderTag.delete({ where: { id } });
    return NextResponse.json({ ok: true, scrubbedFromOrders: orders.length });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Tag not found.' }, { status: 404 });
    console.error('[DELETE /api/order-tags/[id]] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to delete tag' }, { status: 500 });
  }
}
