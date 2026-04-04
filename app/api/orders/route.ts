import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { destination, visaType, totalUSD, travelers, billingEmail, cardLast4, processingSpeed } = body;

    if (!destination || !visaType || !totalUSD || !travelers || !billingEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const order = await prisma.order.create({
      data: { destination, visaType, totalUSD, travelers, billingEmail, cardLast4: cardLast4 ?? null, processingSpeed: processingSpeed ?? 'standard' },
    });

    const num = order.orderNumber;
    const formatted = num <= 99999
      ? String(num).padStart(5, '0')
      : `${String(Math.floor(num / 100000)).padStart(5, '0')}-${String(num % 100000).padStart(5, '0')}`;

    return NextResponse.json({ success: true, orderId: formatted, id: order.id });
  } catch (err: any) {
    console.error('Order creation error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(orders);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
