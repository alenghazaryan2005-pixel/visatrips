import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/send';
import { abandonedReminderEmail } from '@/lib/email/templates';
import { getAdminSession } from '@/lib/auth';
import { logError } from '@/lib/error-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/cron/daily — three idempotent jobs, called hourly by Vercel Cron.
 *
 *   1. Abandoned reminders: email pre-payment drop-offs every 2 days, up to 3x.
 *   2. Abandoned purge: hard-delete abandoned rows older than 7 days.
 *   3. Archive: stamp archivedAt on COMPLETED orders older than 30 days.
 *
 * Auth modes:
 *   - `Authorization: Bearer <CRON_SECRET>` — full run, for Vercel Cron + manual.
 *   - Admin session — dry-run preview (counts only, no writes). Lets admins
 *     sanity-check what the next run will touch before it fires.
 *
 * Why both GET and POST:
 *   Vercel Cron only issues GET. POST is kept for manual invocation via
 *   scripts or curl — both are handled identically.
 */
async function runDaily() {
  const now = new Date();
  const twoDaysAgo    = new Date(now.getTime() - 2  * 24 * 60 * 60 * 1000);
  const sevenDaysAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const result = { remindersSent: 0, abandonedDeleted: 0, ordersArchived: 0, errors: [] as string[] };

  // ── 1. Send reminder emails to abandoned applications ──
  try {
    const candidates = await prisma.abandonedApplication.findMany({
      where: {
        email: { not: null },
        reminderCount: { lt: 3 },
        OR: [
          { lastReminderAt: null, createdAt: { lte: twoDaysAgo } },
          { lastReminderAt: { lte: twoDaysAgo } },
        ],
      },
    });

    for (const app of candidates) {
      try {
        const travelers = app.travelers ? JSON.parse(app.travelers) : null;
        const firstName = Array.isArray(travelers) && travelers[0]?.firstName
          ? travelers[0].firstName
          : 'there';
        const next = (app.reminderCount || 0) + 1;
        const tpl = abandonedReminderEmail({
          name: firstName,
          destination: app.destination,
          reminderIndex: next,
        });
        await sendEmail(app.email!, tpl);
        await prisma.abandonedApplication.update({
          where: { id: app.id },
          data: { reminderCount: next, lastReminderAt: now },
        });
        result.remindersSent++;
      } catch (err: any) {
        result.errors.push(`reminder ${app.id}: ${err?.message}`);
        await logError(err, {
          source: 'server', level: 'error', url: '/api/cron/daily',
          extra: { job: 'abandoned-reminder', abandonedId: app.id },
        });
      }
    }
  } catch (err: any) {
    result.errors.push(`reminder query: ${err?.message}`);
  }

  // ── 2. Hard-delete abandoned applications older than 7 days ──
  try {
    const deleted = await prisma.abandonedApplication.deleteMany({
      where: { createdAt: { lte: sevenDaysAgo } },
    });
    result.abandonedDeleted = deleted.count;
  } catch (err: any) {
    result.errors.push(`purge: ${err?.message}`);
    await logError(err, { source: 'server', level: 'error', url: '/api/cron/daily', extra: { job: 'abandoned-purge' } });
  }

  // ── 3. Archive Completed orders older than 30 days ──
  try {
    const archived = await prisma.order.updateMany({
      where: {
        status: 'COMPLETED',
        completedAt: { not: null, lte: thirtyDaysAgo },
        archivedAt: null,
      },
      data: { archivedAt: now },
    });
    result.ordersArchived = archived.count;
  } catch (err: any) {
    result.errors.push(`archive: ${err?.message}`);
    await logError(err, { source: 'server', level: 'error', url: '/api/cron/daily', extra: { job: 'archive-completed' } });
  }

  return result;
}

async function preview() {
  const now = new Date();
  const twoDaysAgo    = new Date(now.getTime() - 2  * 24 * 60 * 60 * 1000);
  const sevenDaysAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [pendingReminders, pendingPurge, pendingArchive] = await Promise.all([
    prisma.abandonedApplication.count({
      where: {
        email: { not: null },
        reminderCount: { lt: 3 },
        OR: [
          { lastReminderAt: null, createdAt: { lte: twoDaysAgo } },
          { lastReminderAt: { lte: twoDaysAgo } },
        ],
      },
    }),
    prisma.abandonedApplication.count({ where: { createdAt: { lte: sevenDaysAgo } } }),
    prisma.order.count({
      where: { status: 'COMPLETED', completedAt: { not: null, lte: thirtyDaysAgo }, archivedAt: null },
    }),
  ]);

  return { dryRun: true, pendingReminders, pendingPurge, pendingArchive };
}

async function authed(req: NextRequest): Promise<'cron' | 'admin' | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && token && token === cronSecret) return 'cron';
  const admin = await getAdminSession();
  if (admin) return 'admin';
  return null;
}

export async function GET(req: NextRequest) {
  const role = await authed(req);
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Admins get a dry run so they can preview the next cycle safely.
  // Cron callers (Bearer CRON_SECRET) do the real work.
  if (role === 'admin') return NextResponse.json(await preview());
  return NextResponse.json(await runDaily());
}

export async function POST(req: NextRequest) {
  const role = await authed(req);
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await runDaily());
}
