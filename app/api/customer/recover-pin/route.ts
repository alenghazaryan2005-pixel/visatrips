import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/send';
import { checkRateLimit } from '@/lib/rate-limit';

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

    await sendEmail(email.trim(), {
      subject: 'Your VisaTrips PIN',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#1E293B;">
          <div style="text-align:center;margin-bottom:32px;">
            <span style="font-size:24px;font-weight:800;">VisaTrips<sup style="font-size:10px;color:#6C8AFF;">®</sup></span>
          </div>
          <h1 style="font-size:24px;margin-bottom:8px;text-align:center;">Your PIN Recovery</h1>
          <p style="color:#94A3B8;text-align:center;margin-bottom:24px;">You requested your account PIN. Here it is:</p>
          <div style="background:#F0FDF4;border:2px solid #86EFAC;border-radius:12px;padding:24px;margin:20px 0;text-align:center;">
            <p style="font-size:36px;font-weight:800;letter-spacing:8px;color:#059669;margin:0;">${customerPin.pin}</p>
          </div>
          <div style="text-align:center;margin:32px 0;">
            <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login" style="display:inline-block;padding:14px 32px;background:#6C8AFF;color:white;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;">Log In Now</a>
          </div>
          <p style="font-size:13px;color:#94A3B8;text-align:center;">If you didn't request this, you can safely ignore this email.</p>
          <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #EDF1F8;color:#94A3B8;font-size:13px;">
            <p>© ${new Date().getFullYear()} VisaTrips. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ success: true, message: 'If an account exists with that email, we have sent you your PIN.' });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
