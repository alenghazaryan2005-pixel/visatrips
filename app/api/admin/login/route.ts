import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

const SESSION_TOKEN = 'ev_admin_session';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    const admin = await prisma.adminUser.findUnique({ where: { email } });

    if (!admin || admin.password !== password) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set(SESSION_TOKEN, JSON.stringify({ name: admin.name, email: admin.email }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    });

    return NextResponse.json({ success: true, name: admin.name });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
