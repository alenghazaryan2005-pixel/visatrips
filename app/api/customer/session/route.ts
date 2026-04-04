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
    if (!data.orderId || !data.email) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Verify the order still exists
    const order = await prisma.order.findUnique({ where: { id: data.orderId } });
    if (!order) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      orderId: data.orderId,
      email: data.email,
      orderNumber: data.orderNumber,
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
