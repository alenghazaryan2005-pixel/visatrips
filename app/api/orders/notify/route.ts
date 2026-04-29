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
import { renderStructured, interpolate, StructuredEmail } from '@/lib/email/renderer';

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
            // Custom template lookup — accepts either "custom:<id>" or a bare code.
            {
              const isIdRef = t.startsWith('custom:');
              const custom = isIdRef
                ? await prisma.customEmailTemplate.findUnique({ where: { id: t.slice('custom:'.length) } })
                : await prisma.customEmailTemplate.findFirst({ where: { code: t, country: 'INDIA' } });
              if (!custom) {
                results.push({ type: t, sent: false, error: 'Unknown email type' });
                continue;
              }
              if (!custom.enabled) {
                results.push({ type: t, sent: false, error: 'Template is disabled' });
                continue;
              }
              const vars: Record<string, any> = {
                name,
                orderNumber: orderNum,
                destination: order.destination,
                visaType: VISA_LABELS[order.visaType] || order.visaType,
                total: order.totalUSD,
                travelers: travelerCount,
                status: order.status,
                applicationId: order.applicationId || '',
                specialistNotes: order.specialistNotes || '',
              };
              let html = '';
              if (custom.html) {
                html = interpolate(custom.html, vars);
              } else if (custom.structured) {
                try {
                  const parsed = JSON.parse(custom.structured) as StructuredEmail;
                  html = renderStructured(parsed, vars);
                } catch (err: any) {
                  results.push({ type: t, sent: false, error: 'Invalid template: ' + (err?.message || 'parse error') });
                  continue;
                }
              } else {
                results.push({ type: t, sent: false, error: 'Template has no body' });
                continue;
              }
              const subject = interpolate(custom.subject, vars);
              template = { subject, html };
              break;
            }
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
