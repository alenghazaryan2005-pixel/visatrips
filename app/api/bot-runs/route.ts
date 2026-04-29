import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/bot-runs?orderId=<id>&limit=50
 * Returns most-recent bot runs (optionally filtered by order), with summary
 * counts per run. Entries aren't included — fetch via /api/bot-runs/[id].
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get('orderId') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);

    const runs = await prisma.botRun.findMany({
      where: orderId ? { orderId } : undefined,
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        _count: { select: { entries: true } },
      },
    });

    // Summarize per-run success / skip / manual / failure counts.
    const summaries = await Promise.all(
      runs.map(async r => {
        const grouped = await prisma.botRunEntry.groupBy({
          by: ['source', 'success'],
          where: { runId: r.id },
          _count: { _all: true },
        });
        let ok = 0, failed = 0, manual = 0, skipped = 0, admin = 0;
        for (const g of grouped) {
          const n = g._count._all;
          if (!g.success) failed += n;
          else if (g.source === 'manual') manual += n;
          else if (g.source === 'skip') skipped += n;
          else if (g.source === 'admin') admin += n;
          else ok += n;
        }
        return {
          id: r.id,
          orderId: r.orderId,
          country: r.country,
          status: r.status,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          errorMsg: r.errorMsg,
          entryCount: r._count.entries,
          counts: { ok, failed, manual, skipped, admin },
        };
      }),
    );

    return NextResponse.json({ runs: summaries });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
