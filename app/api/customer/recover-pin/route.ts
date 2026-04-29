import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/send';
import { checkRateLimit } from '@/lib/rate-limit';
import { resolveBuiltInEmail } from '@/lib/email/resolve';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const rateCheck = checkRateLimit(`recover-pin:${ip}`);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: `Too many requests. Try again in ${rateCheck.retryAfter} seconds.` }, { status: 429 });
    }

    const emailLower = email.trim().toLowerCase();
    let customerPin = await prisma.customerPin.findUnique({
      where: { email: emailLower },
    });

    // If no PIN exists, check if this email has any orders — if so, create a PIN
    if (!customerPin) {
      const allOrders = await prisma.order.findMany();
      const hasOrder = allOrders.some(o => {
        if (o.billingEmail.toLowerCase() === emailLower) return true;
        try {
          const travelers = JSON.parse(o.travelers);
          return travelers.some((t: any) => t.email?.toLowerCase() === emailLower);
        } catch { return false; }
      });

      if (hasOrder) {
        const newPin = String(Math.floor(100000 + Math.random() * 900000));
        customerPin = await prisma.customerPin.create({
          data: { email: emailLower, pin: newPin },
        });
      } else {
        // No orders found — return success anyway to prevent enumeration
        return NextResponse.json({ success: true, message: 'If an account exists with that email, we have sent you your PIN.' });
      }
    }

    // Look up a friendly name from any order on file.
    let name = email.trim().split('@')[0];
    try {
      const order = await prisma.order.findFirst({ where: { billingEmail: emailLower } });
      if (order?.travelers) {
        const travelers = JSON.parse(order.travelers);
        if (travelers[0]?.firstName) name = travelers[0].firstName;
      }
    } catch {}

    const template = await resolveBuiltInEmail('pin', { name, pin: customerPin.pin });
    await sendEmail(email.trim(), template);

    return NextResponse.json({ success: true, message: 'If an account exists with that email, we have sent you your PIN.' });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
