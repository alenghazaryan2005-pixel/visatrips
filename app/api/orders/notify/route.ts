import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';
import { sendEmail } from '@/lib/email/send';
import {
  orderConfirmationEmail,
  correctionNeededEmail,
  evisaReadyEmail,
  statusUpdateEmail,
  finishReminderEmail,
  applicationSubmittedEmail,
  autoClosedEmail,
} from '@/lib/email/templates';
import { formatOrderNum, VISA_LABELS } from '@/lib/constants';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { orderId, type, types } = await req.json();
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });

    // Accept either a single `type` or an array `types`
    const emailTypes: string[] = Array.isArray(types) ? types : type ? [type] : [];
    if (emailTypes.length === 0) {
      return NextResponse.json({ error: 'type or types required' }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Get customer email and name
    let email = order.billingEmail;
    let name = email;
    let travelerCount = 1;
    try {
      const travelers = JSON.parse(order.travelers);
      if (travelers[0]?.email) email = travelers[0].email;
      if (travelers[0]?.firstName) name = `${travelers[0].firstName} ${travelers[0].lastName || ''}`.trim();
      travelerCount = travelers.length || 1;
    } catch {}

    const orderNum = formatOrderNum(order.orderNumber);

    // Parse existing email history
    let history: Record<string, string> = {};
    try { if (order.emailHistory) history = JSON.parse(order.emailHistory); } catch {}

    const results: Array<{ type: string; sent: boolean; error?: string }> = [];

    for (const t of emailTypes) {
      try {
        let template;
        switch (t) {
          case 'confirmation':
            template = orderConfirmationEmail({
              name,
              orderNumber: orderNum,
              destination: order.destination,
              visaType: VISA_LABELS[order.visaType] || order.visaType,
              total: order.totalUSD,
              travelers: travelerCount,
            });
            break;
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
          case 'reminder':
            template = finishReminderEmail({
              name,
              orderNumber: orderNum,
            });
            break;
          case 'submitted':
            if (!order.applicationId) {
              results.push({ type: t, sent: false, error: 'No Application ID on this order yet.' });
              continue;
            }
            template = applicationSubmittedEmail({
              name,
              orderNumber: orderNum,
              applicationId: order.applicationId,
              destination: order.destination,
            });
            break;
          case 'autoClosed':
            template = autoClosedEmail({
              name,
              orderNumber: orderNum,
            });
            break;
          default:
            results.push({ type: t, sent: false, error: 'Unknown email type' });
            continue;
        }

        await sendEmail(email, template);
        history[t] = new Date().toISOString();
        results.push({ type: t, sent: true });
      } catch (err: any) {
        results.push({ type: t, sent: false, error: err?.message || 'Failed to send' });
      }
    }

    // Save updated history
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { emailHistory: JSON.stringify(history) },
      });
    } catch {}

    return NextResponse.json({ sentTo: email, results, history });
  } catch {
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
