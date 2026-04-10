import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { parseOrderNumber } from '@/lib/constants';
import { checkRateLimit } from '@/lib/rate-limit';

const SESSION_TOKEN = 'ev_customer_session';

export async function POST(req: NextRequest) {
  try {
    const { email, pin, orderNumber } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!pin && !orderNumber) {
      return NextResponse.json({ error: 'PIN or order number is required' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const rateCheck = checkRateLimit(`customer-login:${ip}`);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${rateCheck.retryAfter} seconds.` }, { status: 429 });
    }

    const emailLower = email.trim().toLowerCase();

    // PIN-based login
    if (pin) {
      const customerPin = await prisma.customerPin.findUnique({
        where: { email: emailLower },
      });

      if (!customerPin || customerPin.pin !== pin.trim()) {
        return NextResponse.json({ error: 'Invalid email or PIN' }, { status: 401 });
      }

      const cookieStore = await cookies();
      cookieStore.set(SESSION_TOKEN, JSON.stringify({ email: emailLower }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24,
        path: '/',
      });

      return NextResponse.json({ success: true });
    }

    // Order number-based login (fallback)
    if (orderNumber) {
      const parsed = parseOrderNumber(orderNumber.trim());
      if (isNaN(parsed) || parsed <= 0) {
        return NextResponse.json({ error: 'Invalid order number' }, { status: 400 });
      }

      const order = await prisma.order.findFirst({ where: { orderNumber: parsed } });
      if (!order) {
        return NextResponse.json({ error: 'No order found with that order number' }, { status: 401 });
      }

      // Check if email matches billing or traveler email
      let emailMatch = order.billingEmail.toLowerCase() === emailLower;
      if (!emailMatch) {
        try {
          const travelers = JSON.parse(order.travelers);
          emailMatch = travelers.some((t: any) => t.email?.trim().toLowerCase() === emailLower);
        } catch {}
      }

      if (!emailMatch) {
        return NextResponse.json({ error: 'No order found with that email and order number' }, { status: 401 });
      }

      const cookieStore = await cookies();
      cookieStore.set(SESSION_TOKEN, JSON.stringify({ email: emailLower }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24,
        path: '/',
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (err) {
    console.error('Customer login error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
