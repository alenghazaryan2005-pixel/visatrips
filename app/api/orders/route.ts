import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';
import { sendEmail } from '@/lib/email/send';
import { orderConfirmationEmail } from '@/lib/email/templates';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { destination, visaType, totalUSD, travelers, billingEmail, cardLast4, processingSpeed } = body;

    if (!destination || !visaType || !totalUSD || !travelers || !billingEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const order = await prisma.order.create({
      data: { destination, visaType, totalUSD, travelers, billingEmail, cardLast4: cardLast4 ?? null, processingSpeed: processingSpeed ?? 'standard' },
    });

    const num = order.orderNumber;
    const formatted = num <= 99999
      ? String(num).padStart(5, '0')
      : `${String(Math.floor(num / 100000)).padStart(5, '0')}-${String(num % 100000).padStart(5, '0')}`;

    // Send confirmation email
    try {
      let name = billingEmail;
      try {
        const t = JSON.parse(travelers);
        if (t[0]?.firstName) name = `${t[0].firstName} ${t[0].lastName || ''}`.trim();
      } catch {}
      const travelerCount = (() => { try { return JSON.parse(travelers).length; } catch { return 1; } })();
      await sendEmail(billingEmail, orderConfirmationEmail({
        name,
        orderNumber: formatted,
        destination,
        visaType: visaType.replace(/_/g, ' '),
        total: totalUSD,
        travelers: travelerCount,
      }));
    } catch (emailErr) {
      console.error('Failed to send confirmation email:', emailErr);
    }

    return NextResponse.json({ success: true, orderId: formatted, id: order.id });
  } catch {
    return NextResponse.json({ error: 'Order creation failed' }, { status: 500 });
  }
}

export async function GET() {
  // Admin only
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(orders);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
