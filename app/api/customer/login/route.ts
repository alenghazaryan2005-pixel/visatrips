import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { parseOrderNumber } from '@/lib/constants';

const SESSION_TOKEN = 'ev_customer_session';

export async function POST(req: NextRequest) {
  try {
    const { email, orderNumber } = await req.json();
    if (!email || !orderNumber) {
      return NextResponse.json({ error: 'Email and order number are required' }, { status: 400 });
    }

    const parsed = parseOrderNumber(orderNumber.trim());
    if (isNaN(parsed) || parsed <= 0) {
      return NextResponse.json({ error: 'Invalid order number' }, { status: 400 });
    }

    // Find order by order number, then check if any traveler's email matches
    const order = await prisma.order.findFirst({
      where: { orderNumber: parsed },
    });

    if (!order) {
      return NextResponse.json({ error: 'No order found with that order number' }, { status: 401 });
    }

    // Check traveler emails inside the JSON
    let travelerEmailMatch = false;
    let matchedEmail = email.trim();
    try {
      const travelers = JSON.parse(order.travelers);
      travelerEmailMatch = travelers.some((t: any) =>
        t.email && t.email.trim().toLowerCase() === email.trim().toLowerCase()
      );
    } catch {}

    if (!travelerEmailMatch) {
      return NextResponse.json({ error: 'No order found with that email and order number' }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set(SESSION_TOKEN, JSON.stringify({ orderId: order.id, email: matchedEmail, orderNumber: order.orderNumber }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (err) {
    console.error('Customer login error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
