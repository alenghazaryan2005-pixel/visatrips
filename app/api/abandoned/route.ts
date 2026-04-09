import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';

// POST — create or update an abandoned application
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, destination, visaType, email, travelers, passportData, lastStep } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    // Upsert by sessionId (stored as id)
    const abandoned = await prisma.abandonedApplication.upsert({
      where: { id: sessionId },
      update: {
        ...(destination !== undefined && { destination }),
        ...(visaType !== undefined && { visaType }),
        ...(email !== undefined && { email }),
        ...(travelers !== undefined && { travelers: typeof travelers === 'string' ? travelers : JSON.stringify(travelers) }),
        ...(passportData !== undefined && { passportData: typeof passportData === 'string' ? passportData : JSON.stringify(passportData) }),
        ...(lastStep !== undefined && { lastStep }),
      },
      create: {
        id: sessionId,
        destination: destination ?? null,
        visaType: visaType ?? null,
        email: email ?? null,
        travelers: travelers ? (typeof travelers === 'string' ? travelers : JSON.stringify(travelers)) : null,
        passportData: passportData ? (typeof passportData === 'string' ? passportData : JSON.stringify(passportData)) : null,
        lastStep: lastStep ?? 'step1',
        ipAddress: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null,
        userAgent: req.headers.get('user-agent') ?? null,
      },
    });

    return NextResponse.json({ id: abandoned.id });
  } catch (e: any) {
    console.error('Abandoned save error:', e);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

// GET — list all abandoned applications (admin only)
export async function GET() {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const abandoned = await prisma.abandonedApplication.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(abandoned);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

// DELETE — remove an abandoned application (e.g. when they complete checkout)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await prisma.abandonedApplication.delete({ where: { id } }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
