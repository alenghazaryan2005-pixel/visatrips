/**
 * POST /api/orders/[id]/add-rejection-protection
 *
 * Lets the order's customer (or any admin) opt into the Rejection
 * Protection Plan add-on after the fact — i.e. they declined it at
 * checkout but want to add it later. Same idempotency + auth model as
 * the speed-upgrade endpoint:
 *
 *   - Customer owner OR any admin can call this.
 *   - Add-on can only be enabled while the order is still in active
 *     processing (UNFINISHED → SUBMITTED). After that the protection
 *     would be retroactive insurance, which we don't honour.
 *   - Price comes from the live Setting `pricing.addons.rejectionProtection`
 *     so an admin price change reaches new opt-ins immediately.
 *   - The flat fee is added to the order's totalUSD; no transaction-fee
 *     uplift is applied (matches how Stripe processing fees on the
 *     original cart already covered the gateway cost).
 *   - If the order already has rejectionProtection=true, returns 409 so
 *     the customer can't double-charge themselves.
 *
 * Mirrors `app/api/orders/[id]/upgrade-speed/route.ts` for code shape.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession, getCustomerSession } from '@/lib/auth';
import { parseOrderNumber } from '@/lib/constants';
import { getAllSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Statuses where customer self-service opt-in is meaningful. Mirrors the
 * upgrade-speed endpoint's gate (with one less entry — we drop SUBMITTED
 * because once submitted, the gov has the application; protection at
 * that point isn't really protecting anything you can still influence).
 * Admin can still flip the flag via the generic PATCH for goodwill.
 */
const ELIGIBLE_STATUSES = new Set([
  'UNFINISHED',
  'PROCESSING',
  'PENDING',           // legacy alias
  'UNDER_REVIEW',      // legacy alias
  'NEEDS_CORRECTION',
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

    // Auth — customer owner OR any admin.
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

    // Idempotency — once it's on, refuse to re-add (would double-charge).
    if (order.rejectionProtection) {
      return NextResponse.json({
        error: 'Rejection Protection is already active on this order.',
      }, { status: 409 });
    }

    // Status gate (admin override allowed — they might want to comp this
    // for a SUBMITTED order as goodwill).
    if (!admin && !ELIGIBLE_STATUSES.has(order.status)) {
      return NextResponse.json({
        error: `Rejection Protection can no longer be added (order status: ${order.status}).`,
      }, { status: 400 });
    }

    // Pull the live price from settings. Match what the apply-page
    // checkout would have charged today.
    const settings = await getAllSettings();
    const rawPrice = settings['pricing.addons.rejectionProtection'];
    const price = Number(typeof rawPrice === 'string' ? JSON.parse(rawPrice) : rawPrice) || 0;
    if (price < 0) {
      return NextResponse.json({ error: 'Add-on price is misconfigured.' }, { status: 500 });
    }

    const newTotalUSD = +(order.totalUSD + price).toFixed(2);

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        rejectionProtection: true,
        totalUSD:            newTotalUSD,
        lastEditedBy:        admin ? admin.name : `Customer (${customer?.email ?? order.billingEmail})`,
      },
    });

    return NextResponse.json({
      ok: true,
      order: updated,
      addon: {
        name:  'Rejection Protection Plan',
        price,
        newTotalUSD,
      },
    });
  } catch (err: any) {
    console.error('[POST /api/orders/[id]/add-rejection-protection] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to add Rejection Protection' }, { status: 500 });
  }
}
