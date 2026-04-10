import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';

export async function GET() {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const responses = await prisma.cannedResponse.findMany({
      orderBy: [{ folder: 'asc' }, { title: 'asc' }],
    });
    return NextResponse.json(responses);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { title, content, folder, tags } = await req.json();
    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    const response = await prisma.cannedResponse.create({
      data: { title, content, folder: folder || 'General', tags: tags || null, createdBy: auth.name },
    });
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
  }
}
