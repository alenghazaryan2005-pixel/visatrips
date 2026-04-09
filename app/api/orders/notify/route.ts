import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';
import { sendEmail } from '@/lib/email/send';
import { correctionNeededEmail, evisaReadyEmail, statusUpdateEmail } from '@/lib/email/templates';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { orderId, type } = await req.json();
    if (!orderId || !type) {
      return NextResponse.json({ error: 'orderId and type are required' }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Get customer email and name from travelers
    let email = order.billingEmail;
    let name = email;
    try {
      const travelers = JSON.parse(order.travelers);
      if (travelers[0]?.email) email = travelers[0].email;
      if (travelers[0]?.firstName) name = `${travelers[0].firstName} ${travelers[0].lastName || ''}`.trim();
    } catch {}

    const orderNum = order.orderNumber <= 99999
      ? String(order.orderNumber).padStart(5, '0')
      : `${String(Math.floor(order.orderNumber / 100000)).padStart(5, '0')}-${String(order.orderNumber % 100000).padStart(5, '0')}`;

    let template;
    switch (type) {
      case 'correction':
        const flagged = order.flaggedFields ? JSON.parse(order.flaggedFields) : [];
        template = correctionNeededEmail({
          name,
          orderNumber: orderNum,
          specialistNotes: order.specialistNotes || '',
          flaggedFields: flagged,
        });
        break;

      case 'evisa':
        template = evisaReadyEmail({
          name,
          orderNumber: orderNum,
          destination: order.destination,
        });
        break;

      case 'status':
        template = statusUpdateEmail({
          name,
          orderNumber: orderNum,
          status: order.status,
        });
        break;

      default:
        return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
    }

    await sendEmail(email, template);
    return NextResponse.json({ success: true, sentTo: email });
  } catch {
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
