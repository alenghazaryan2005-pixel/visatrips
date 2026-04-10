import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse, getAdminSession } from '@/lib/auth';
import { sendEmail } from '@/lib/email/send';

// GET — single ticket with all messages, activities, and linked orders
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { id } = await params;
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    // Find linked orders by email
    const allOrders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, orderNumber: true, status: true, destination: true, visaType: true, totalUSD: true, createdAt: true, billingEmail: true, travelers: true },
    });

    const contactLower = ticket.contactEmail.toLowerCase();
    const linkedOrders = allOrders.filter(o => {
      if (o.billingEmail.toLowerCase() === contactLower) return true;
      try {
        const travelers = JSON.parse(o.travelers);
        return travelers.some((t: any) => t.email?.toLowerCase() === contactLower);
      } catch { return false; }
    }).map(({ travelers, billingEmail, ...rest }) => rest);

    return NextResponse.json({ ...ticket, linkedOrders });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch ticket' }, { status: 500 });
  }
}

// PATCH — update ticket fields with activity logging
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { id } = await params;
    const body = await req.json();

    // Handle merge
    if (body.mergeInto) {
      const sourceTicket = await prisma.ticket.findUnique({ where: { id }, include: { messages: true } });
      if (!sourceTicket) return NextResponse.json({ error: 'Source ticket not found' }, { status: 404 });

      // Copy messages to target ticket
      for (const msg of sourceTicket.messages) {
        await prisma.ticketMessage.create({
          data: {
            ticketId: body.mergeInto,
            sender: msg.sender,
            senderName: msg.senderName,
            content: `[Merged from #${sourceTicket.ticketNumber}] ${msg.content}`,
            isInternal: msg.isInternal,
          },
        });
      }

      // Mark source as merged
      await prisma.ticket.update({ where: { id }, data: { mergedIntoId: body.mergeInto, status: 'CLOSED' } });

      // Log activity on both tickets
      await prisma.ticketActivity.create({ data: { ticketId: id, action: 'merged', details: `Merged into ticket`, performedBy: auth.name } });
      await prisma.ticketActivity.create({ data: { ticketId: body.mergeInto, action: 'merged', details: `Ticket #${sourceTicket.ticketNumber} merged into this ticket`, performedBy: auth.name } });

      return NextResponse.json({ success: true });
    }

    // Get current ticket for comparison
    const current = await prisma.ticket.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    const data: Record<string, any> = {};
    const allowed = ['status', 'priority', 'group', 'assignedTo', 'subject', 'tags', 'lastViewedBy', 'lastViewedAt'];
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }

    // Track resolved time
    if (data.status === 'RESOLVED' || data.status === 'CLOSED') {
      if (!current.resolvedAt) data.resolvedAt = new Date();
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data,
      include: { messages: { orderBy: { createdAt: 'asc' } }, activities: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });

    // Log activities for changes
    if (body.status && body.status !== current.status) {
      await prisma.ticketActivity.create({ data: { ticketId: id, action: 'status_changed', details: `Status changed from ${current.status} to ${body.status}`, performedBy: auth.name } });
    }
    if (body.priority && body.priority !== current.priority) {
      await prisma.ticketActivity.create({ data: { ticketId: id, action: 'priority_changed', details: `Priority changed from ${current.priority} to ${body.priority}`, performedBy: auth.name } });
    }
    if (body.assignedTo !== undefined && body.assignedTo !== current.assignedTo) {
      await prisma.ticketActivity.create({ data: { ticketId: id, action: 'assigned', details: `Assigned to ${body.assignedTo || 'Unassigned'}`, performedBy: auth.name } });
    }
    if (body.group && body.group !== current.group) {
      await prisma.ticketActivity.create({ data: { ticketId: id, action: 'group_changed', details: `Group changed from ${current.group} to ${body.group}`, performedBy: auth.name } });
    }

    return NextResponse.json(ticket);
  } catch {
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
  }
}

// POST — add message or reply
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const { content, isInternal, sendToCustomer } = await req.json();

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    // Create the message
    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        sender: isInternal ? 'system' : 'agent',
        senderName: admin.name,
        content,
        isInternal: isInternal || false,
      },
    });

    // Update ticket status + track first response
    const updateData: Record<string, any> = {};
    if (!isInternal && ticket.status === 'NEW') {
      updateData.status = 'OPEN';
    }
    // Re-open resolved/closed tickets on new customer response
    if (!isInternal && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED')) {
      updateData.status = 'OPEN';
      updateData.resolvedAt = null;
    }
    if (!isInternal && !ticket.firstRespondedAt) {
      updateData.firstRespondedAt = new Date();
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.ticket.update({ where: { id }, data: updateData });
    }

    // Log activity
    await prisma.ticketActivity.create({
      data: {
        ticketId: id,
        action: isInternal ? 'note_added' : 'replied',
        details: isInternal ? `Internal note added by ${admin.name}` : `Reply sent by ${admin.name}`,
        performedBy: admin.name,
      },
    });

    // Send email to customer if requested
    if (sendToCustomer && !isInternal) {
      await sendEmail(ticket.contactEmail, {
        subject: `Re: ${ticket.subject} [#${ticket.ticketNumber}]`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#1E293B;">
            <div style="text-align:center;margin-bottom:32px;">
              <span style="font-size:24px;font-weight:800;">VisaTrips<sup style="font-size:10px;color:#6C8AFF;">®</sup></span>
            </div>
            <p>Hi ${ticket.contactName},</p>
            <div style="background:#F8FAFF;border-radius:12px;padding:20px;margin:20px 0;white-space:pre-wrap;">${content}</div>
            <p style="color:#94A3B8;font-size:13px;">Ticket #${ticket.ticketNumber} · ${admin.name}</p>
            <div style="text-align:center;margin-top:32px;padding-top:20px;border-top:1px solid #EDF1F8;color:#94A3B8;font-size:13px;">
              <p>© ${new Date().getFullYear()} VisaTrips. All rights reserved.</p>
            </div>
          </div>
        `,
      });
    }

    return NextResponse.json(message);
  } catch {
    return NextResponse.json({ error: 'Failed to add message' }, { status: 500 });
  }
}

// DELETE — delete ticket
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { id } = await params;
    await prisma.ticket.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete ticket' }, { status: 500 });
  }
}
