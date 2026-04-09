import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/send';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const { name, email, message, orderNumber } = await req.json();

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Name, email, and message are required' }, { status: 400 });
    }

    // Rate limit — 5 contact submissions per 15 minutes per IP
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const rateCheck = checkRateLimit(`contact:${ip}`);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
    }

    // Create a CRM ticket
    const subject = orderNumber
      ? `Contact Form — Order #${orderNumber}`
      : `Contact Form — ${name}`;

    const ticket = await prisma.ticket.create({
      data: {
        subject,
        contactEmail: email.toLowerCase(),
        contactName: name,
        priority: 'MEDIUM',
        group: orderNumber ? 'Visa Processing' : 'Miscellaneous',
        messages: {
          create: {
            sender: 'customer',
            senderName: name,
            content: message,
          },
        },
      },
    });

    // Send confirmation email to customer
    await sendEmail(email, {
      subject: `We received your message [#${ticket.ticketNumber}]`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#1E293B;">
          <div style="text-align:center;margin-bottom:32px;">
            <span style="font-size:24px;font-weight:800;">VisaTrips<sup style="font-size:10px;color:#6C8AFF;">®</sup></span>
          </div>
          <h1 style="font-size:24px;margin-bottom:8px;">We got your message!</h1>
          <p style="color:#94A3B8;margin-bottom:24px;">Hi ${name.split(' ')[0]}, thanks for reaching out. We'll get back to you within 24 hours.</p>
          <div style="background:#F8FAFF;border-radius:12px;padding:20px;margin:20px 0;">
            <p style="color:#94A3B8;font-size:13px;margin:0 0 8px;">Your message:</p>
            <p style="margin:0;white-space:pre-wrap;">${message}</p>
          </div>
          <p style="font-size:13px;color:#94A3B8;">Ticket #${ticket.ticketNumber} · We'll reply to ${email}</p>
          <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #EDF1F8;color:#94A3B8;font-size:13px;">
            <p>© ${new Date().getFullYear()} VisaTrips. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    // Send notification email to admin
    await sendEmail('admin@visatrips.com', {
      subject: `New Contact Form Submission [#${ticket.ticketNumber}] — ${name}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#1E293B;">
          <h1 style="font-size:20px;">New Contact Form Submission</h1>
          <div style="background:#F8FAFF;border-radius:12px;padding:20px;margin:20px 0;">
            <table style="width:100%;font-size:14px;" cellpadding="6">
              <tr><td style="color:#94A3B8;">Name</td><td style="text-align:right;font-weight:600;">${name}</td></tr>
              <tr><td style="color:#94A3B8;">Email</td><td style="text-align:right;">${email}</td></tr>
              ${orderNumber ? `<tr><td style="color:#94A3B8;">Order #</td><td style="text-align:right;">${orderNumber}</td></tr>` : ''}
              <tr><td style="color:#94A3B8;">Ticket #</td><td style="text-align:right;">${ticket.ticketNumber}</td></tr>
            </table>
          </div>
          <p style="font-weight:600;margin-bottom:8px;">Message:</p>
          <div style="background:#f1f5f9;border-radius:8px;padding:16px;white-space:pre-wrap;">${message}</div>
        </div>
      `,
    });

    return NextResponse.json({ success: true, ticketNumber: ticket.ticketNumber });
  } catch (err) {
    console.error('Contact form error:', err);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
