import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// SLA defaults by priority (in hours)
const SLA_FIRST_RESPONSE: Record<string, number> = { LOW: 24, MEDIUM: 8, HIGH: 4, URGENT: 1 };
const SLA_RESOLUTION: Record<string, number> = { LOW: 72, MEDIUM: 48, HIGH: 24, URGENT: 8 };

// Webhook endpoint for incoming emails
// Resend or other email providers can POST to this endpoint
// Expected payload: { from: string, to: string, subject: string, text: string, html?: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { from, subject, text, html } = body;

    if (!from || !subject) {
      return NextResponse.json({ error: 'Missing from or subject' }, { status: 400 });
    }

    // Extract email and name from "from" field
    // Could be "John Smith <john@example.com>" or just "john@example.com"
    let senderEmail = from;
    let senderName = from;
    const emailMatch = from.match(/<(.+?)>/);
    if (emailMatch) {
      senderEmail = emailMatch[1];
      senderName = from.replace(/<.+?>/, '').trim() || senderEmail;
    }
    const emailLower = senderEmail.toLowerCase();

    // Check if this is a reply to an existing ticket
    // Look for ticket number in subject like [#123] or #123
    const ticketMatch = subject.match(/\[?#(\d+)\]?/);
    if (ticketMatch) {
      const ticketNumber = parseInt(ticketMatch[1]);
      const existing = await prisma.ticket.findFirst({ where: { ticketNumber } });
      if (existing) {
        // Add message to existing ticket
        await prisma.ticketMessage.create({
          data: {
            ticketId: existing.id,
            sender: 'customer',
            senderName,
            content: text || html || '(no content)',
          },
        });

        // Re-open if resolved/closed
        if (existing.status === 'RESOLVED' || existing.status === 'CLOSED') {
          await prisma.ticket.update({
            where: { id: existing.id },
            data: { status: 'OPEN', resolvedAt: null },
          });
        }

        // Log activity
        await prisma.ticketActivity.create({
          data: {
            ticketId: existing.id,
            action: 'replied',
            details: `Customer replied via email`,
            performedBy: senderName,
          },
        });

        return NextResponse.json({ action: 'reply_added', ticketId: existing.id, ticketNumber });
      }
    }

    // Create a new ticket
    const now = new Date();
    const priority = 'MEDIUM';
    const firstResponseDue = new Date(now.getTime() + SLA_FIRST_RESPONSE[priority] * 60 * 60 * 1000);
    const resolutionDue = new Date(now.getTime() + SLA_RESOLUTION[priority] * 60 * 60 * 1000);

    const ticket = await prisma.ticket.create({
      data: {
        subject: subject.replace(/^(Re:|Fwd:|FW:)\s*/i, '').trim() || 'No Subject',
        contactEmail: emailLower,
        contactName: senderName,
        priority,
        group: 'Miscellaneous',
        firstResponseDue,
        resolutionDue,
        messages: {
          create: {
            sender: 'customer',
            senderName,
            content: text || html || '(no content)',
          },
        },
        activities: {
          create: {
            action: 'created',
            details: `Ticket auto-created from incoming email`,
            performedBy: 'System',
          },
        },
      },
    });

    return NextResponse.json({ action: 'ticket_created', ticketId: ticket.id, ticketNumber: ticket.ticketNumber });
  } catch (err) {
    console.error('Email webhook error:', err);
    return NextResponse.json({ error: 'Failed to process email' }, { status: 500 });
  }
}
