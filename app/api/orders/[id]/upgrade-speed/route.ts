/**
 * POST /api/orders/[id]/upgrade-speed
 *
 * Lets the order's customer (or any admin) upgrade an order's processing
 * speed mid-flight. The new speed must be FASTER than the current one —
 * downgrades aren't allowed via this endpoint (admin can refund manually
 * if needed). The price difference is computed using the live settings
 * surcharges + transaction percent, so it matches what the customer would
 * have paid at checkout if they'd picked the faster speed initially.
 *
 * The order's `processingSpeed` is updated and `totalUSD` is bumped by
 * the diff. Status check: only orders that are still in active processing
 * (UNFINISHED, PROCESSING, NEEDS_CORRECTION) are upgradable — once a
 * submission has been sent to the gov form (SUBMITTED+), the speed is
 * immaterial to the actual processing time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession, getCustomerSession } from '@/lib/auth';
import { parseOrderNumber } from '@/lib/constants';
import { getAllSettings } from '@/lib/settings';
import {
  SPEED_ORDER,
  SPEED_LABELS,
  computeUpgradeDiff,
  extractPricingFromSettings,
  isUpgrade,
  type ProcessingSpeed,
} from '@/lib/processingSpeeds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Statuses where a customer-initiated speed upgrade is still useful.
 * SUBMITTED is included on purpose — even after the bot has handed the
 * application off to the Indian government, a customer can still pay for
 * faster service so the admin team prioritises follow-ups / escalations.
 * Final-state statuses (COMPLETED, REJECTED, REFUNDED, ON_HOLD) are NOT
 * upgradable. Admin can always force any status via lastEditedBy + the
 * generic PATCH route — this gate is only for self-service.
 */
const UPGRADABLE_STATUSES = new Set([
  'UNFINISHED',
  'PROCESSING',
  'PENDING',           // legacy alias
  'UNDER_REVIEW',      // legacy alias
  'NEEDS_CORRECTION',
  'SUBMITTED',
]);

async function findOrder(idOrNumber: string) {
  const parsed = parseOrderNumber(idOrNumber);
  if (!isNaN(parsed) && parsed > 0) {
    const order = await prisma.order.findFirst({ where: { orderNumber: parsed } });
    if (order) return order;
  }
  return prisma.order.findUnique({ where: { id: idOrNumber } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await findOrder(id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Auth — customer (owner) OR any admin can upgrade.
    const admin    = await getAdminSession();
    const customer = await getCustomerSession();
    let isOwner = false;
    if (customer) {
      const ce = customer.email.toLowerCase();
      if (order.billingEmail.toLowerCase() === ce) isOwner = true;
      else try { const t = JSON.parse(order.travelers); isOwner = t.some((tr: any) => tr.email?.toLowerCase() === ce); } catch {}
    }
    if (!admin && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const target = body?.targetSpeed as ProcessingSpeed | undefined;
    if (!target || !SPEED_ORDER.includes(target)) {
      return NextResponse.json({ error: `targetSpeed must be one of: ${SPEED_ORDER.join(', ')}` }, { status: 400 });
    }

    const current = (order.processingSpeed ?? 'standard') as ProcessingSpeed;
    if (!SPEED_ORDER.includes(current)) {
      return NextResponse.json({ error: `Order has an unrecognized current speed (${current}).` }, { status: 400 });
    }
    if (!isUpgrade(current, target)) {
      return NextResponse.json({
        error: `Cannot ${current === target ? 'upgrade to the same speed' : 'downgrade'} via this endpoint.`,
        current, target,
      }, { status: 400 });
    }

    // Allow admin override on status check (admin might want to honour an
    // upgrade request that's already SUBMITTED for goodwill). Customers are
    // strictly gated to active-processing statuses.
    if (!admin && !UPGRADABLE_STATUSES.has(order.status)) {
      return NextResponse.json({
        error: `This order can no longer be upgraded (status: ${order.status}).`,
      }, { status: 400 });
    }

    // Determine traveler count from the JSON column.
    let travelersCount = 1;
    try {
      const arr = JSON.parse(order.travelers);
      if (Array.isArray(arr) && arr.length > 0) travelersCount = arr.length;
    } catch {}

    // Pull live pricing from settings to compute the diff. Falls back to
    // hard-coded defaults if a key is missing — same behaviour as the
    // apply-page checkout.
    const settings = await getAllSettings();
    const { surcharges, txPct } = extractPricingFromSettings(settings);
    const diff = computeUpgradeDiff({ current, target, surcharges, travelers: travelersCount, txPct });

    if (diff.total <= 0) {
      // Belt-and-suspenders — isUpgrade already passed, so this shouldn't fire.
      return NextResponse.json({ error: 'Upgrade computed to no cost — refusing.' }, { status: 400 });
    }

    const newTotalUSD = +(order.totalUSD + diff.total).toFixed(2);

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        processingSpeed: target,
        totalUSD:        newTotalUSD,
        // Stamp who initiated the upgrade. Customer self-service shows up
        // as "Customer (email)" in the audit row.
        lastEditedBy:    admin ? admin.name : `Customer (${customer?.email ?? order.billingEmail})`,
      },
    });

    return NextResponse.json({
      ok: true,
      order: updated,
      upgrade: {
        from: current,
        to: target,
        fromLabel: SPEED_LABELS[current],
        toLabel:   SPEED_LABELS[target],
        travelers: travelersCount,
        ...diff,
      },
    });
  } catch (err: any) {
    console.error('[POST /api/orders/[id]/upgrade-speed] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to upgrade speed' }, { status: 500 });
  }
}
