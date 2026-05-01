import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession, requireOwner, isErrorResponse } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/custom-emails/[id]
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const template = await prisma.customEmailTemplate.findUnique({ where: { id } });
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(template);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/custom-emails/[id]
 * Body: partial CustomEmailTemplate fields
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;
  try {
    const body = await req.json();
    const data: any = {};
    if (typeof body.label === 'string') data.label = body.label;
    if (typeof body.description === 'string' || body.description === null) data.description = body.description;
    if (typeof body.trigger === 'string') data.trigger = body.trigger;
    if (typeof body.subject === 'string') data.subject = body.subject;
    if (body.structured !== undefined) {
      data.structured = body.structured ? JSON.stringify(body.structured) : null;
    }
    if (body.html !== undefined) data.html = body.html || null;
    if (typeof body.enabled === 'boolean') data.enabled = body.enabled;

    const updated = await prisma.customEmailTemplate.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

/**
 * DELETE /api/settings/custom-emails/[id]
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;
  try {
    await prisma.customEmailTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
