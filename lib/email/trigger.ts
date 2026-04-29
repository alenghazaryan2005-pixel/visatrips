/**
 * Custom-email trigger dispatcher.
 *
 * Custom email templates (CustomEmailTemplate model) can fire automatically
 * when an order changes to a particular status. This helper renders and sends
 * any enabled templates whose `trigger` matches the given event.
 */

import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/send';
import { renderStructured, interpolate, StructuredEmail } from '@/lib/email/renderer';
import { formatOrderNum, VISA_LABELS } from '@/lib/constants';

/**
 * Fire any enabled custom templates whose `trigger` matches the event string,
 * for the given order. Returns a list of per-template results. Never throws —
 * auto-triggers should never break the calling request.
 */
export async function dispatchTriggeredEmails(params: {
  order: Awaited<ReturnType<typeof prisma.order.findUnique>>;
  event: string;         // e.g. "on_status_SUBMITTED"
  country?: string;      // defaults to "INDIA"
}): Promise<Array<{ id: string; code: string; sent: boolean; error?: string }>> {
  const { order, event } = params;
  const country = (params.country || 'INDIA').toUpperCase();
  if (!order) return [];

  try {
    const templates = await prisma.customEmailTemplate.findMany({
      where: { country, trigger: event, enabled: true },
    });
    if (templates.length === 0) return [];

    // Pull customer name/email and visa info for variable interpolation
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

    // Parse history once (we'll re-save at the end).
    let history: Record<string, string> = {};
    try { if (order.emailHistory) history = JSON.parse(order.emailHistory); } catch {}

    const results: Array<{ id: string; code: string; sent: boolean; error?: string }> = [];
    for (const tpl of templates) {
      try {
        let html = '';
        if (tpl.html) {
          html = interpolate(tpl.html, vars);
        } else if (tpl.structured) {
          const parsed = JSON.parse(tpl.structured) as StructuredEmail;
          html = renderStructured(parsed, vars);
        } else {
          results.push({ id: tpl.id, code: tpl.code, sent: false, error: 'Template has no body' });
          continue;
        }
        const subject = interpolate(tpl.subject, vars);
        await sendEmail(email, { subject, html });
        history[`custom:${tpl.id}`] = new Date().toISOString();
        results.push({ id: tpl.id, code: tpl.code, sent: true });
      } catch (err: any) {
        results.push({ id: tpl.id, code: tpl.code, sent: false, error: err?.message || 'Failed to send' });
      }
    }

    // Persist updated history
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { emailHistory: JSON.stringify(history) },
      });
    } catch {}

    return results;
  } catch (err) {
    // Never let a trigger error break the caller
    console.error('[dispatchTriggeredEmails] failed:', err);
    return [];
  }
}
