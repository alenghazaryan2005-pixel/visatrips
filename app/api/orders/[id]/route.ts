import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseOrderNumber } from '@/lib/constants';
import { getAdminSession, getCustomerSession } from '@/lib/auth';

async function findOrder(idOrNumber: string) {
  const parsed = parseOrderNumber(idOrNumber);
  if (!isNaN(parsed) && parsed > 0) {
    const order = await prisma.order.findFirst({ where: { orderNumber: parsed } });
    if (order) return order;
  }
  return prisma.order.findUnique({ where: { id: idOrNumber } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await findOrder(id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Check auth — admin can see any order, customer can see their own
    const admin = await getAdminSession();
    if (admin) return NextResponse.json(order);

    const customer = await getCustomerSession();
    if (customer) {
      // Check if customer's email matches billing email or any traveler email
      const customerEmail = customer.email.toLowerCase();
      if (order.billingEmail.toLowerCase() === customerEmail) return NextResponse.json(order);
      try {
        const travelers = JSON.parse(order.travelers);
        if (travelers.some((t: any) => t.email?.toLowerCase() === customerEmail)) return NextResponse.json(order);
      } catch {}
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
  }
}

// Fields customers are allowed to update
const CUSTOMER_ALLOWED = ['travelers', 'flaggedFields'];
// Fields only admins can update
const ADMIN_ALLOWED = ['status', 'notes', 'destination', 'visaType', 'totalUSD', 'billingEmail', 'cardLast4', 'processingSpeed', 'travelers', 'applicationId', 'evisaUrl', 'flaggedFields', 'specialistNotes', 'refundAmount', 'refundReason', 'refundedAt', 'botFlags'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await findOrder(id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const body = await req.json();
    const admin = await getAdminSession();
    const customer = await getCustomerSession();

    // Must be either admin or the order's customer
    let isOwner = false;
    if (customer) {
      const ce = customer.email.toLowerCase();
      if (order.billingEmail.toLowerCase() === ce) isOwner = true;
      else try { const t = JSON.parse(order.travelers); isOwner = t.some((tr: any) => tr.email?.toLowerCase() === ce); } catch {}
    }
    if (!admin && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Build update data — restrict fields based on role
    const data: Record<string, any> = {};
    const allowed = admin ? ADMIN_ALLOWED : CUSTOMER_ALLOWED;
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }

    // Track who made the edit (admin only)
    if (admin) data.lastEditedBy = admin.name;

    // Validate critical fields
    if ('totalUSD' in data && (typeof data.totalUSD !== 'number' || data.totalUSD < 0)) {
      return NextResponse.json({ error: 'Invalid total amount' }, { status: 400 });
    }
    if ('refundAmount' in data && data.refundAmount !== null && (typeof data.refundAmount !== 'number' || data.refundAmount < 0)) {
      return NextResponse.json({ error: 'Invalid refund amount' }, { status: 400 });
    }
    if ('status' in data && !admin) {
      // Customers can only set status to PROCESSING (re-submission after completing finish page)
      if (data.status !== 'PROCESSING') {
        delete data.status;
      }
    }
    // Auto-stamp timestamps when status changes
    if ('status' in data && admin) {
      if (data.status === 'SUBMITTED' && !order.submittedAt) data.submittedAt = new Date();
      if (data.status === 'COMPLETED' && !order.completedAt) data.completedAt = new Date();
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data,
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}
