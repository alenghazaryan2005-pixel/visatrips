import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/send';
import { finishReminderEmail } from '@/lib/email/templates';
import { getAdminSession } from '@/lib/auth';
import { formatOrderNum } from '@/lib/constants';
import { logError } from '@/lib/error-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/send-reminders
 * Sends reminder emails to UNFINISHED orders.
 *
 * Rules:
 *   - Only orders with status = UNFINISHED
 *   - Only if it's been >= 2 days since the last reminder (or since createdAt if no reminder yet)
 *   - Max 3 reminders total per order
 *   - After the 3rd reminder is sent, the order is auto-marked as COMPLETED
 *
 * Auth: requires either admin session OR a CRON_SECRET env var in the Authorization header
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  // Auth: admin session OR cron secret header
  const admin = await getAdminSession();
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const cronSecret = process.env.CRON_SECRET;
  const authedByCron = cronSecret && token && token === cronSecret;

  if (!admin && !authedByCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    // Find UNFINISHED orders that need a reminder
    const orders = await prisma.order.findMany({
      where: {
        status: 'UNFINISHED',
        reminderCount: { lt: 3 },
        OR: [
          { lastReminderAt: null, createdAt: { lte: twoDaysAgo } },
          { lastReminderAt: { lte: twoDaysAgo } },
        ],
      },
    });

    let sent = 0;
    let autoCompleted = 0;
    const errors: string[] = [];

    for (const order of orders) {
      try {
        const travelers = typeof order.travelers === 'string' ? JSON.parse(order.travelers) : order.travelers;
        const firstName = travelers?.[0]?.firstName || 'there';
        const email = order.billingEmail;

        const template = finishReminderEmail({
          name: firstName,
          orderNumber: formatOrderNum(order.orderNumber),
        });

        await sendEmail(email, template);
        sent++;

        const newCount = (order.reminderCount || 0) + 1;
        const shouldAutoComplete = newCount >= 3;

        await prisma.order.update({
          where: { id: order.id },
          data: {
            reminderCount: newCount,
            lastReminderAt: new Date(),
            ...(shouldAutoComplete ? { status: 'COMPLETED', completedAt: new Date() } : {}),
          },
        });
        if (shouldAutoComplete) autoCompleted++;
      } catch (err: any) {
        errors.push(`Order #${order.orderNumber}: ${err?.message}`);
        await logError(err, {
          source: 'server',
          level: 'error',
          url: '/api/cron/send-reminders',
          extra: { orderId: order.id, orderNumber: order.orderNumber },
        });
      }
    }

    return NextResponse.json({
      checked: orders.length,
      sent,
      autoCompleted,
      errors,
    });
  } catch (err) {
    await logError(err, { source: 'server', url: '/api/cron/send-reminders', level: 'error' });
    return NextResponse.json({ error: 'Failed to send reminders' }, { status: 500 });
  }
}

/**
 * GET — dry run / preview who would get a reminder (admin only)
 */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const orders = await prisma.order.findMany({
      where: {
        status: 'UNFINISHED',
        reminderCount: { lt: 3 },
        OR: [
          { lastReminderAt: null, createdAt: { lte: twoDaysAgo } },
          { lastReminderAt: { lte: twoDaysAgo } },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        billingEmail: true,
        reminderCount: true,
        lastReminderAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ pending: orders.length, orders });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
