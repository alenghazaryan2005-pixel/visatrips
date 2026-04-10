import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';

export async function GET() {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const now = new Date();
    const tickets = await prisma.ticket.findMany({
      where: {
        status: { in: ['NEW', 'OPEN', 'PENDING'] },
        mergedIntoId: null,
      },
    });

    const breached: { id: string; ticketNumber: number; subject: string; type: string; overdueBy: string }[] = [];
    const warning: { id: string; ticketNumber: number; subject: string; type: string; timeLeft: string }[] = [];

    for (const t of tickets) {
      // First response SLA
      if (t.firstResponseDue && !t.firstRespondedAt) {
        const remaining = t.firstResponseDue.getTime() - now.getTime();
        if (remaining < 0) {
          const hrs = Math.abs(Math.floor(remaining / 3600000));
          breached.push({ id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, type: 'First Response', overdueBy: `${hrs}h` });
        } else if (remaining < 3600000) {
          const mins = Math.floor(remaining / 60000);
          warning.push({ id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, type: 'First Response', timeLeft: `${mins}m` });
        }
      }

      // Resolution SLA
      if (t.resolutionDue && !t.resolvedAt) {
        const remaining = t.resolutionDue.getTime() - now.getTime();
        if (remaining < 0) {
          const hrs = Math.abs(Math.floor(remaining / 3600000));
          breached.push({ id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, type: 'Resolution', overdueBy: `${hrs}h` });
        } else if (remaining < 3600000) {
          const mins = Math.floor(remaining / 60000);
          warning.push({ id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, type: 'Resolution', timeLeft: `${mins}m` });
        }
      }
    }

    return NextResponse.json({ breached, warning, checkedAt: now.toISOString() });
  } catch {
    return NextResponse.json({ error: 'Failed to check SLA' }, { status: 500 });
  }
}
