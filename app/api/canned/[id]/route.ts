import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { id } = await params;
    const { title, content, folder, tags } = await req.json();
    const response = await prisma.cannedResponse.update({
      where: { id },
      data: { ...(title && { title }), ...(content && { content }), ...(folder && { folder }), ...(tags !== undefined && { tags }) },
    });
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { id } = await params;
    await prisma.cannedResponse.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
