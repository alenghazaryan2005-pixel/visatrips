/**
 * GET  /api/admin/employees                   — list all admin users (owner-only)
 * POST /api/admin/employees { name, email, password, role? }  — create (owner-only)
 *
 * Owner role required for both. Employees who hit this get 403. Passwords
 * are bcrypt-hashed on write; the response NEVER includes the password
 * column. Email uniqueness is enforced by the AdminUser @unique constraint.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOwner, isErrorResponse } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NAME = 80;
const MIN_PASSWORD = 8;
const VALID_ROLES = new Set(['owner', 'employee']);

function safe(user: any) {
  // Strip the password before returning to clients.
  const { password: _password, ...rest } = user;
  return rest;
}

export async function GET() {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  try {
    const users = await prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
    return NextResponse.json({ employees: users.map(safe) });
  } catch (err: any) {
    console.error('[GET /api/admin/employees] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to load employees' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  try {
    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const requestedRole = typeof body?.role === 'string' ? body.role : 'employee';

    if (!name)  return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    if (name.length > MAX_NAME) return NextResponse.json({ error: `Name must be ${MAX_NAME} characters or fewer.` }, { status: 400 });
    if (!email || !email.includes('@')) return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    if (password.length < MIN_PASSWORD) {
      return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, { status: 400 });
    }
    if (!VALID_ROLES.has(requestedRole)) {
      return NextResponse.json({ error: `Role must be one of: ${[...VALID_ROLES].join(', ')}.` }, { status: 400 });
    }

    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'An admin user with this email already exists.' }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 12);
    const created = await prisma.adminUser.create({
      data: { name, email, password: hashed, role: requestedRole },
    });

    return NextResponse.json({ ok: true, employee: safe(created) });
  } catch (err: any) {
    console.error('[POST /api/admin/employees] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to create employee' }, { status: 400 });
  }
}
