import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/bot-runs/[id]
 * Full details of a single bot run, including all per-field entries.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const run = await prisma.botRun.findUnique({
      where: { id },
      include: {
        entries: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    return NextResponse.json(run);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
