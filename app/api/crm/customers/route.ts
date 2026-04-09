import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET — list all CRM customers
export async function GET() {
  try {
    const customers = await prisma.crmCustomer.findMany({
      include: { activities: { orderBy: { createdAt: 'desc' }, take: 20 } },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(customers);
  } catch (err) {
    console.error('CRM list error:', err);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

// POST — create or get a CRM customer (auto-create from order data)
export async function POST(req: NextRequest) {
  try {
    const { email, name, phone } = await req.json();
    if (!email || !name) {
      return NextResponse.json({ error: 'Email and name are required' }, { status: 400 });
    }

    const customer = await prisma.crmCustomer.upsert({
      where: { email: email.toLowerCase() },
      update: { name, ...(phone ? { phone } : {}) },
      create: { email: email.toLowerCase(), name, phone },
    });

    return NextResponse.json(customer);
  } catch (err) {
    console.error('CRM create error:', err);
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
