import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';

// SLA defaults by priority (in hours)
const SLA_FIRST_RESPONSE: Record<string, number> = { LOW: 24, MEDIUM: 8, HIGH: 4, URGENT: 1 };
const SLA_RESOLUTION: Record<string, number> = { LOW: 72, MEDIUM: 48, HIGH: 24, URGENT: 8 };

// GET — list all tickets
export async function GET() {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const tickets = await prisma.ticket.findMany({
      where: { mergedIntoId: null }, // Don't show merged tickets
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
    });
    return NextResponse.json(tickets);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
  }
}

// POST — create a new ticket
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { subject, contactEmail, contactName, priority, group, message, assignedTo } = await req.json();

    if (!subject || !contactEmail || !contactName) {
      return NextResponse.json({ error: 'Subject, contact email, and name are required' }, { status: 400 });
    }

    const prio = priority || 'LOW';
    const now = new Date();
    const firstResponseDue = new Date(now.getTime() + SLA_FIRST_RESPONSE[prio] * 60 * 60 * 1000);
    const resolutionDue = new Date(now.getTime() + SLA_RESOLUTION[prio] * 60 * 60 * 1000);

    const ticket = await prisma.ticket.create({
      data: {
        subject,
        contactEmail: contactEmail.toLowerCase(),
        contactName,
        priority: prio,
        group: group || 'Miscellaneous',
        assignedTo: assignedTo || auth.name,
        firstResponseDue,
        resolutionDue,
        messages: message ? {
          create: {
            sender: 'customer',
            senderName: contactName,
            content: message,
          },
        } : undefined,
        activities: {
          create: {
            action: 'created',
            details: `Ticket created by ${auth.name}`,
            performedBy: auth.name,
          },
        },
      },
      include: { messages: true },
    });

    return NextResponse.json(ticket);
  } catch {
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}

// PATCH — bulk actions
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { ticketIds, action, value } = await req.json();
    if (!ticketIds || !Array.isArray(ticketIds) || !action) {
      return NextResponse.json({ error: 'ticketIds and action are required' }, { status: 400 });
    }

    switch (action) {
      case 'close':
        await prisma.ticket.updateMany({ where: { id: { in: ticketIds } }, data: { status: 'CLOSED', resolvedAt: new Date() } });
        for (const id of ticketIds) {
          await prisma.ticketActivity.create({ data: { ticketId: id, action: 'status_changed', details: `Status changed to Closed (bulk action)`, performedBy: auth.name } });
        }
        break;
      case 'resolve':
        await prisma.ticket.updateMany({ where: { id: { in: ticketIds } }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
        for (const id of ticketIds) {
          await prisma.ticketActivity.create({ data: { ticketId: id, action: 'status_changed', details: `Status changed to Resolved (bulk action)`, performedBy: auth.name } });
        }
        break;
      case 'assign':
        await prisma.ticket.updateMany({ where: { id: { in: ticketIds } }, data: { assignedTo: value } });
        for (const id of ticketIds) {
          await prisma.ticketActivity.create({ data: { ticketId: id, action: 'assigned', details: `Assigned to ${value} (bulk action)`, performedBy: auth.name } });
        }
        break;
      case 'priority':
        await prisma.ticket.updateMany({ where: { id: { in: ticketIds } }, data: { priority: value } });
        break;
      case 'delete':
        await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true, affected: ticketIds.length });
  } catch {
    return NextResponse.json({ error: 'Bulk action failed' }, { status: 500 });
  }
}
