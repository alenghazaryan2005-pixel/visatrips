import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';
import { sendEmail } from '@/lib/email/send';
import { orderConfirmationEmail } from '@/lib/email/templates';
import { resolveBuiltInEmail } from '@/lib/email/resolve';

function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      destination, visaType, totalUSD, travelers, billingEmail, cardLast4,
      processingSpeed, rejectionProtection,
    } = body;

    if (!destination || !visaType || !totalUSD || !travelers || !billingEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get the contact email from travelers (primary email)
    let contactEmail = billingEmail;
    let contactName = billingEmail;
    try {
      const t = JSON.parse(travelers);
      if (t[0]?.email) contactEmail = t[0].email;
      if (t[0]?.firstName) contactName = `${t[0].firstName} ${t[0].lastName || ''}`.trim();
    } catch {}

    const order = await prisma.order.create({
      data: {
        destination, visaType, totalUSD, travelers, billingEmail,
        cardLast4: cardLast4 ?? null,
        processingSpeed: processingSpeed ?? 'standard',
        rejectionProtection: Boolean(rejectionProtection),
      },
    });

    const num = order.orderNumber;
    const formatted = num <= 99999
      ? String(num).padStart(5, '0')
      : `${String(Math.floor(num / 100000)).padStart(5, '0')}-${String(num % 100000).padStart(5, '0')}`;

    // Check if this email already has a PIN — if not, create one
    let pin: string | null = null;
    let isNewAccount = false;
    const existing = await prisma.customerPin.findUnique({ where: { email: contactEmail.toLowerCase() } });
    if (!existing) {
      pin = generatePin();
      await prisma.customerPin.create({ data: { email: contactEmail.toLowerCase(), pin } });
      isNewAccount = true;
    }

    // Send confirmation email (include PIN if new account)
    try {
      const travelerCount = (() => { try { return JSON.parse(travelers).length; } catch { return 1; } })();

      if (isNewAccount && pin) {
        // First order for this email — send the combined welcome email
        // (order details + PIN). Honors admin overrides saved in Settings.
        const welcomeTemplate = await resolveBuiltInEmail('welcome', {
          name: contactName,
          orderNumber: formatted,
          destination,
          visaType: visaType.replace(/_/g, ' '),
          travelers: travelerCount,
          total: totalUSD,
          pin,
        });
        await sendEmail(contactEmail, welcomeTemplate);
      } else {
        // Existing account — send regular confirmation
        await sendEmail(contactEmail, orderConfirmationEmail({
          name: contactName,
          orderNumber: formatted,
          destination,
          visaType: visaType.replace(/_/g, ' '),
          total: totalUSD,
          travelers: travelerCount,
        }));
      }
    } catch (emailErr) {
      console.error('Failed to send confirmation email:', emailErr);
    }

    return NextResponse.json({ success: true, orderId: formatted, id: order.id });
  } catch {
    return NextResponse.json({ error: 'Order creation failed' }, { status: 500 });
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(orders);
  } catch (err: any) {
    // Don't swallow — log so we can diagnose intermittent Neon/Prisma blips
    // (cold starts, pooler hiccups, connection-limit hits) instead of just
    // returning an empty list to the client.
    console.error('[GET /api/orders] failed:', err?.message || err);
    try {
      await prisma.errorLog.create({
        data: {
          level: 'error',
          source: 'server',
          message: `GET /api/orders failed: ${err?.message || String(err)}`,
          stack: err?.stack ?? null,
          url: '/api/orders',
          method: 'GET',
          statusCode: 500,
          context: JSON.stringify({ name: err?.name, code: err?.code }),
        },
      });
    } catch {} // never let logging itself break the response
    return NextResponse.json({ error: 'Failed to fetch orders', detail: err?.message }, { status: 500 });
  }
}
