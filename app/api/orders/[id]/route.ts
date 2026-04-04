import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { parseOrderNumber } from '@/lib/constants';

function getAdminName(cookieStore: any): string | null {
  const session = cookieStore.get('ev_admin_session');
  if (!session?.value) return null;
  try {
    if (session.value === 'authenticated') return 'Admin';
    const data = JSON.parse(session.value);
    return data.name ?? null;
  } catch { return null; }
}

async function findOrder(idOrNumber: string) {
  // Try as order number first (if it looks numeric or has dashes like 00001-00001)
  const parsed = parseOrderNumber(idOrNumber);
  if (!isNaN(parsed) && parsed > 0) {
    const order = await prisma.order.findFirst({ where: { orderNumber: parsed } });
    if (order) return order;
  }
  // Fall back to database ID
  return prisma.order.findUnique({ where: { id: idOrNumber } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await findOrder(id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    return NextResponse.json(order);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await findOrder(id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const body = await req.json();

    // Build update data — only include fields that are present in the request
    const data: Record<string, any> = {};
    const allowed = ['status', 'notes', 'destination', 'visaType', 'totalUSD', 'billingEmail', 'cardLast4', 'processingSpeed', 'travelers', 'applicationId', 'refundAmount', 'refundReason', 'refundedAt'];
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }

    // Track who made the edit
    const cookieStore = await cookies();
    const adminName = getAdminName(cookieStore);
    if (adminName) data.lastEditedBy = adminName;

    const updated = await prisma.order.update({
      where: { id: order.id },
      data,
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}
