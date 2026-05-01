import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession, requireOwner, isErrorResponse } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/custom-emails?country=INDIA
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const url = new URL(req.url);
    const country = (url.searchParams.get('country') || 'INDIA').toUpperCase();
    const templates = await prisma.customEmailTemplate.findMany({
      where: { country },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ templates });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

/**
 * POST /api/settings/custom-emails
 * Body: { country, code, label, description?, trigger, subject, structured?, html? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  const admin = auth;
  try {
    const body = await req.json();
    if (!body.code || !body.label || !body.subject) {
      return NextResponse.json({ error: 'code, label, subject are required' }, { status: 400 });
    }
    const country = (body.country || 'INDIA').toUpperCase();
    const code = String(body.code).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    if (!code) return NextResponse.json({ error: 'Invalid code' }, { status: 400 });

    const created = await prisma.customEmailTemplate.create({
      data: {
        country,
        code,
        label: body.label,
        description: body.description || null,
        trigger: body.trigger || 'manual',
        subject: body.subject,
        structured: body.structured ? JSON.stringify(body.structured) : null,
        html: body.html || null,
        enabled: body.enabled !== false,
        createdBy: admin.name,
      },
    });
    return NextResponse.json(created);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'A template with this code already exists for this country' }, { status: 400 });
    }
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
