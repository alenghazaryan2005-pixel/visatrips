import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limit';

const SESSION_TOKEN = 'ev_admin_session';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Rate limiting
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const rateKey = `admin-login:${ip}`;
    const rateCheck = checkRateLimit(rateKey);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: `Too many login attempts. Try again in ${rateCheck.retryAfter} seconds.` }, { status: 429 });
    }

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Support both bcrypt hashed and legacy plaintext (for migration)
    let valid = false;
    if (admin.password.startsWith('$2')) {
      valid = await bcrypt.compare(password, admin.password);
    } else {
      // Legacy plaintext — auto-upgrade to bcrypt
      valid = admin.password === password;
      if (valid) {
        const hashed = await bcrypt.hash(password, 12);
        await prisma.adminUser.update({ where: { id: admin.id }, data: { password: hashed } });
      }
    }

    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const role = admin.role === 'owner' ? 'owner' : 'employee';
    const cookieStore = await cookies();
    cookieStore.set(SESSION_TOKEN, JSON.stringify({ name: admin.name, email: admin.email, role }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 4, // 4 hours
      path: '/',
    });

    return NextResponse.json({ success: true, name: admin.name, role });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
