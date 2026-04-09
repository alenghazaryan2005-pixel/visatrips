import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET — single customer with activities
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const customer = await prisma.crmCustomer.findUnique({
      where: { id },
      include: { activities: { orderBy: { createdAt: 'desc' } } },
    });
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    return NextResponse.json(customer);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
  }
}

// PATCH — update customer fields (tags, notes, name, phone)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, any> = {};
    const allowed = ['name', 'phone', 'tags', 'notes'];
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }

    const customer = await prisma.crmCustomer.update({ where: { id }, data });

    // Log activity if notes or tags changed
    if ('notes' in body) {
      await prisma.crmActivity.create({
        data: { customerId: id, type: 'note', content: body.notes || '(cleared)', createdBy: body.adminName },
      });
    }
    if ('tags' in body) {
      await prisma.crmActivity.create({
        data: { customerId: id, type: 'tag_change', content: `Tags updated: ${body.tags || '(none)'}`, createdBy: body.adminName },
      });
    }

    return NextResponse.json(customer);
  } catch {
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

// DELETE — delete customer
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.crmCustomer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
}
