import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession, requireOwner, isErrorResponse } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Legacy named-color presets (kept for backward compat). New statuses should
// just pass a hex like "#8b5cf6".
const NAMED_COLORS = ['slate','blue','green','amber','red','purple','pink','emerald'];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
function isValidColor(c: unknown): c is string {
  return typeof c === 'string' && (NAMED_COLORS.includes(c) || HEX_RE.test(c));
}

/**
 * GET /api/settings/custom-statuses?country=INDIA
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const url = new URL(req.url);
    const country = (url.searchParams.get('country') || 'INDIA').toUpperCase();
    const statuses = await prisma.customStatus.findMany({
      where: { country },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ statuses });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

/**
 * POST /api/settings/custom-statuses
 * Body: { country?, code, label, color?, description?, sortOrder? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  const admin = auth;
  try {
    const body = await req.json();
    if (!body.code || !body.label) {
      return NextResponse.json({ error: 'code and label are required' }, { status: 400 });
    }
    const country = (body.country || 'INDIA').toUpperCase();
    // Sanitize code → uppercase snake_case, alphanumeric + underscores only
    const code = String(body.code).toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
    if (!code) return NextResponse.json({ error: 'Invalid code' }, { status: 400 });

    // Block collision with built-in codes
    const BUILT_IN = ['UNFINISHED','PROCESSING','SUBMITTED','COMPLETED','NEEDS_CORRECTION','ON_HOLD','REJECTED','REFUNDED','PENDING','UNDER_REVIEW','APPROVED'];
    if (BUILT_IN.includes(code)) {
      return NextResponse.json({ error: `"${code}" is a built-in status. Pick a different code.` }, { status: 400 });
    }

    const color = isValidColor(body.color) ? body.color : 'slate';

    const created = await prisma.customStatus.create({
      data: {
        country,
        code,
        label: body.label,
        color,
        description: body.description || null,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 50,
        createdBy: admin.name,
      },
    });
    return NextResponse.json(created);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'A status with this code already exists for this country' }, { status: 400 });
    }
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
