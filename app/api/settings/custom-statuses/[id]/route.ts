import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NAMED_COLORS = ['slate','blue','green','amber','red','purple','pink','emerald'];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
function isValidColor(c: unknown): c is string {
  return typeof c === 'string' && (NAMED_COLORS.includes(c) || HEX_RE.test(c));
}

/**
 * PATCH /api/settings/custom-statuses/[id]
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json();
    const data: any = {};
    if (typeof body.label === 'string') data.label = body.label;
    if (isValidColor(body.color)) data.color = body.color;
    if (body.description !== undefined) data.description = body.description || null;
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder;
    // Note: code is immutable after creation — to rename, delete + recreate.

    const updated = await prisma.customStatus.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

/**
 * DELETE /api/settings/custom-statuses/[id]
 * If any orders still have this status set, the response includes `inUseBy`
 * — caller should pass `?force=true` to proceed anyway. Orders using the
 * status will be reverted to PROCESSING.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';

    const status = await prisma.customStatus.findUnique({ where: { id } });
    if (!status) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const inUseCount = await prisma.order.count({ where: { status: status.code } });
    if (inUseCount > 0 && !force) {
      return NextResponse.json({
        error: 'Status is in use',
        inUseBy: inUseCount,
        message: `${inUseCount} order${inUseCount === 1 ? '' : 's'} still use this status. Pass ?force=true to revert them to PROCESSING.`,
      }, { status: 409 });
    }

    if (inUseCount > 0 && force) {
      await prisma.order.updateMany({
        where: { status: status.code },
        data: { status: 'PROCESSING' },
      });
    }

    await prisma.customStatus.delete({ where: { id } });
    return NextResponse.json({ success: true, reverted: inUseCount });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
