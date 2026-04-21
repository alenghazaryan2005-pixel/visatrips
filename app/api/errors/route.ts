import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/errors — receive error from client/bot/external
 * Public endpoint (rate-limited at the middleware level) since the client
 * needs to report its own errors. Body size is capped.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.message) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    const userAgent = body.userAgent || req.headers.get('user-agent') || undefined;
    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || undefined;

    const saved = await prisma.errorLog.create({
      data: {
        level: body.level || 'error',
        source: body.source || 'client',
        message: String(body.message).slice(0, 2000),
        stack: body.stack ? String(body.stack).slice(0, 10000) : null,
        url: body.url ? String(body.url).slice(0, 500) : null,
        method: body.method || null,
        statusCode: typeof body.statusCode === 'number' ? body.statusCode : null,
        userAgent: userAgent?.slice(0, 500),
        ipAddress: ipAddress?.slice(0, 50),
        userEmail: body.userEmail ? String(body.userEmail).slice(0, 200) : null,
        userType: body.userType || null,
        context: body.context ? String(body.context).slice(0, 10000) : null,
        sentryId: body.sentryId ? String(body.sentryId).slice(0, 50) : null,
      },
    });

    return NextResponse.json({ id: saved.id });
  } catch {
    return NextResponse.json({ error: 'Failed to log error' }, { status: 500 });
  }
}

/**
 * GET /api/errors — list errors (admin only)
 * Supports filters: ?resolved=false&level=error&source=server&search=...
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const resolved = url.searchParams.get('resolved');
    const level = url.searchParams.get('level');
    const source = url.searchParams.get('source');
    const search = url.searchParams.get('search');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

    const where: any = {};
    if (resolved === 'true') where.resolved = true;
    if (resolved === 'false') where.resolved = false;
    if (level) where.level = level;
    if (source) where.source = source;
    if (search) {
      where.OR = [
        { message: { contains: search, mode: 'insensitive' } },
        { url: { contains: search, mode: 'insensitive' } },
        { userEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [errors, counts] = await Promise.all([
      prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.errorLog.groupBy({
        by: ['resolved'],
        _count: { _all: true },
      }),
    ]);

    const unresolvedCount = counts.find(c => !c.resolved)?._count._all || 0;
    const resolvedCount = counts.find(c => c.resolved)?._count._all || 0;

    return NextResponse.json({ errors, counts: { unresolved: unresolvedCount, resolved: resolvedCount } });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch errors' }, { status: 500 });
  }
}
