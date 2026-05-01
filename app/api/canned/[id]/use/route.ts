/**
 * POST /api/canned/[id]/use
 *
 * Increments usageCount + stamps lastUsedAt. Called by the ticket-reply
 * picker right after an admin inserts a canned response into a draft
 * reply. Fire-and-forget on the client — this endpoint is best-effort
 * (the insert itself has already happened in the textarea), so we never
 * block the UX on its result.
 *
 * Sort priority on the picker side relies on usageCount + lastUsedAt to
 * surface frequently-used / recently-used responses first.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { id } = await params;
    const updated = await prisma.cannedResponse.update({
      where: { id },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
      select: { id: true, usageCount: true, lastUsedAt: true },
    });
    return NextResponse.json({ ok: true, ...updated });
  } catch {
    // Don't surface — the insert already happened on the client; tracking
    // the usage is incidental.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
