import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * PATCH /api/settings/[key] — update a single setting.
 * Body: { value, category? }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { key } = await params;
    const body = await req.json();
    const valueStr = JSON.stringify(body.value);
    const category = body.category || key.split('.')[0] || 'general';
    const saved = await prisma.setting.upsert({
      where: { key },
      create: { key, category, value: valueStr, updatedBy: admin.name },
      update: { value: valueStr, updatedBy: admin.name },
    });
    return NextResponse.json(saved);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

/**
 * DELETE /api/settings/[key] — reset a setting to its default by removing the override.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { key } = await params;
    await prisma.setting.delete({ where: { key } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
