import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_COLORS = new Set([
  'slate', 'blue', 'green', 'amber', 'red', 'purple', 'pink', 'emerald',
]);
const MAX_NAME = 40;
const MAX_ICON = 4;            // typical emoji is 1–4 codepoints
const MAX_DESCRIPTION = 200;
const MAX_TAGS = 50;           // soft cap to keep the picker manageable

/**
 * GET /api/order-tags — public-ish (admin-side reads). Returns the full
 * catalog ordered by sortOrder then name.
 */
export async function GET(_req: NextRequest) {
  try {
    const tags = await prisma.orderTag.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json({ tags });
  } catch (err: any) {
    console.error('[GET /api/order-tags] failed:', err?.message || err);
    return NextResponse.json({ error: 'Failed to load tags', detail: err?.message }, { status: 500 });
  }
}

/**
 * POST /api/order-tags — create a new tag (admin only).
 * Body: { name, color?, icon?, description?, sortOrder? }
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    if (name.length > MAX_NAME) {
      return NextResponse.json({ error: `Name must be ${MAX_NAME} characters or fewer.` }, { status: 400 });
    }

    const color = typeof body?.color === 'string' && VALID_COLORS.has(body.color)
      ? body.color : 'blue';
    const icon = typeof body?.icon === 'string'
      ? body.icon.trim().slice(0, MAX_ICON) || null
      : null;
    const description = typeof body?.description === 'string'
      ? body.description.trim().slice(0, MAX_DESCRIPTION) || null
      : null;
    const sortOrder = typeof body?.sortOrder === 'number' && Number.isFinite(body.sortOrder)
      ? Math.max(0, Math.min(999, Math.floor(body.sortOrder)))
      : 50;

    const total = await prisma.orderTag.count();
    if (total >= MAX_TAGS) {
      return NextResponse.json({ error: `Limit of ${MAX_TAGS} tags reached. Delete some to make room.` }, { status: 400 });
    }

    // Reject duplicate names case-insensitively so the picker stays unambiguous.
    const dupe = await prisma.orderTag.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (dupe) return NextResponse.json({ error: `A tag named "${name}" already exists.` }, { status: 400 });

    const tag = await prisma.orderTag.create({
      data: { name, color, icon, description, sortOrder, createdBy: admin.name },
    });
    return NextResponse.json({ ok: true, tag });
  } catch (err: any) {
    console.error('[POST /api/order-tags] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to create tag' }, { status: 400 });
  }
}
