import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get('ev_customer_session');

  if (!session?.value) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const data = JSON.parse(session.value);
    if (!data.email) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Find all orders for this email (check both billingEmail and traveler emails)
    const allOrders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const email = data.email.toLowerCase();
    const orders = allOrders.filter(o => {
      if (o.billingEmail.toLowerCase() === email) return true;
      try {
        const travelers = JSON.parse(o.travelers);
        return travelers.some((t: any) => t.email?.toLowerCase() === email);
      } catch { return false; }
    });

    return NextResponse.json({
      authenticated: true,
      email: data.email,
      orders: orders.map(o => {
        let travelerName = '';
        try {
          const t = JSON.parse(o.travelers);
          if (t[0]?.firstName) travelerName = `${t[0].firstName} ${t[0].lastName || ''}`.trim();
        } catch {}
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          destination: o.destination,
          visaType: o.visaType,
          totalUSD: o.totalUSD,
          createdAt: o.createdAt,
          travelerName,
        };
      }),
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
