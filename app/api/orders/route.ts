import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';
import { sendEmail } from '@/lib/email/send';
import { orderConfirmationEmail } from '@/lib/email/templates';

function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { destination, visaType, totalUSD, travelers, billingEmail, cardLast4, processingSpeed } = body;

    if (!destination || !visaType || !totalUSD || !travelers || !billingEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get the contact email from travelers (primary email)
    let contactEmail = billingEmail;
    let contactName = billingEmail;
    try {
      const t = JSON.parse(travelers);
      if (t[0]?.email) contactEmail = t[0].email;
      if (t[0]?.firstName) contactName = `${t[0].firstName} ${t[0].lastName || ''}`.trim();
    } catch {}

    const order = await prisma.order.create({
      data: { destination, visaType, totalUSD, travelers, billingEmail, cardLast4: cardLast4 ?? null, processingSpeed: processingSpeed ?? 'standard' },
    });

    const num = order.orderNumber;
    const formatted = num <= 99999
      ? String(num).padStart(5, '0')
      : `${String(Math.floor(num / 100000)).padStart(5, '0')}-${String(num % 100000).padStart(5, '0')}`;

    // Check if this email already has a PIN — if not, create one
    let pin: string | null = null;
    let isNewAccount = false;
    const existing = await prisma.customerPin.findUnique({ where: { email: contactEmail.toLowerCase() } });
    if (!existing) {
      pin = generatePin();
      await prisma.customerPin.create({ data: { email: contactEmail.toLowerCase(), pin } });
      isNewAccount = true;
    }

    // Send confirmation email (include PIN if new account)
    try {
      const travelerCount = (() => { try { return JSON.parse(travelers).length; } catch { return 1; } })();

      if (isNewAccount && pin) {
        // Send email with PIN
        await sendEmail(contactEmail, {
          subject: `Order Confirmed — #${formatted} | Your Account PIN`,
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#1E293B;">
              <div style="text-align:center;margin-bottom:32px;">
                <span style="font-size:24px;font-weight:800;">VisaTrips<sup style="font-size:10px;color:#6C8AFF;">®</sup></span>
              </div>
              <h1 style="font-size:24px;margin-bottom:8px;">Your order is confirmed!</h1>
              <p style="color:#94A3B8;margin-bottom:24px;">Thank you, ${contactName}. Here are your order details.</p>
              <div style="background:#F8FAFF;border-radius:12px;padding:20px;margin:20px 0;">
                <table style="width:100%;font-size:14px;" cellpadding="6">
                  <tr><td style="color:#94A3B8;">Order #</td><td style="text-align:right;font-weight:600;">${formatted}</td></tr>
                  <tr><td style="color:#94A3B8;">Destination</td><td style="text-align:right;">${destination}</td></tr>
                  <tr><td style="color:#94A3B8;">Visa Type</td><td style="text-align:right;">${visaType.replace(/_/g, ' ')}</td></tr>
                  <tr><td style="color:#94A3B8;">Travelers</td><td style="text-align:right;">${travelerCount}</td></tr>
                  <tr><td style="color:#94A3B8;border-top:1px solid #EDF1F8;padding-top:12px;">Total</td><td style="text-align:right;font-weight:700;font-size:18px;color:#6C8AFF;border-top:1px solid #EDF1F8;padding-top:12px;">$${totalUSD} USD</td></tr>
                </table>
              </div>
              <div style="background:#F0FDF4;border:2px solid #86EFAC;border-radius:12px;padding:20px;margin:20px 0;text-align:center;">
                <p style="font-weight:700;font-size:14px;color:#065F46;margin:0 0 8px;">Your Account PIN</p>
                <p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#059669;margin:0;">${pin}</p>
                <p style="font-size:12px;color:#065F46;margin:8px 0 0;">Use this PIN with your email to log in and check your application status.</p>
              </div>
              <div style="text-align:center;margin:32px 0;">
                <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login" style="display:inline-block;padding:14px 32px;background:#6C8AFF;color:white;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;">Check Your Status</a>
              </div>
              <p style="font-size:13px;color:#94A3B8;">Keep your PIN safe — you'll need it to access your account.</p>
              <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #EDF1F8;color:#94A3B8;font-size:13px;">
                <p>© ${new Date().getFullYear()} VisaTrips. All rights reserved.</p>
              </div>
            </div>
          `,
        });
      } else {
        // Existing account — send regular confirmation
        await sendEmail(contactEmail, orderConfirmationEmail({
          name: contactName,
          orderNumber: formatted,
          destination,
          visaType: visaType.replace(/_/g, ' '),
          total: totalUSD,
          travelers: travelerCount,
        }));
      }
    } catch (emailErr) {
      console.error('Failed to send confirmation email:', emailErr);
    }

    return NextResponse.json({ success: true, orderId: formatted, id: order.id });
  } catch {
    return NextResponse.json({ error: 'Order creation failed' }, { status: 500 });
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(orders);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
