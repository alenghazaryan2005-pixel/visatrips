/**
 * PATCH  /api/admin/employees/[id]   — owner-only. Body fields: name, email, password, role.
 *                                       All fields optional; only provided ones are updated.
 *                                       Password is bcrypt-hashed before save.
 * DELETE /api/admin/employees/[id]   — owner-only. Hard delete the row.
 *
 * Safety rails:
 *   - You cannot demote yourself from 'owner' (would lock you out)
 *   - You cannot delete yourself
 *   - You cannot demote / delete the last remaining owner (would leave an
 *     ownerless system with no one able to manage employees)
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
  const { password: _password, ...rest } = user;
  return rest;
}

async function ensureNotLastOwner(targetUserId: string, willStillBeOwner: boolean): Promise<NextResponse | null> {
  // No-op if the change keeps them as owner; we only need to check when an
  // owner is being demoted or deleted.
  if (willStillBeOwner) return null;
  const target = await prisma.adminUser.findUnique({ where: { id: targetUserId } });
  if (!target) return null; // 404 path will catch this
  if (target.role !== 'owner') return null;
  const otherOwners = await prisma.adminUser.count({ where: { role: 'owner', NOT: { id: targetUserId } } });
  if (otherOwners === 0) {
    return NextResponse.json({ error: 'Cannot demote or delete the last remaining owner. Promote another user to owner first.' }, { status: 400 });
  }
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  try {
    const { id } = await params;
    const body = await req.json();
    const target = await prisma.adminUser.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });

    const data: Record<string, any> = {};

    if (typeof body?.name === 'string') {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 });
      if (name.length > MAX_NAME) return NextResponse.json({ error: `Name must be ${MAX_NAME} chars or fewer.` }, { status: 400 });
      data.name = name;
    }
    if (typeof body?.email === 'string') {
      const email = body.email.trim().toLowerCase();
      if (!email.includes('@')) return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
      // Check uniqueness only if it's actually changing.
      if (email !== target.email) {
        const dupe = await prisma.adminUser.findUnique({ where: { email } });
        if (dupe) return NextResponse.json({ error: 'Email already in use.' }, { status: 400 });
      }
      data.email = email;
    }
    if (typeof body?.password === 'string' && body.password.length > 0) {
      if (body.password.length < MIN_PASSWORD) {
        return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, { status: 400 });
      }
      data.password = await bcrypt.hash(body.password, 12);
    }
    if (typeof body?.role === 'string') {
      if (!VALID_ROLES.has(body.role)) {
        return NextResponse.json({ error: `Role must be one of: ${[...VALID_ROLES].join(', ')}.` }, { status: 400 });
      }
      // Self-demotion protection — you can't downgrade your own role.
      if (target.email === auth.email && body.role !== 'owner') {
        return NextResponse.json({ error: 'You cannot demote yourself. Ask another owner to do it.' }, { status: 400 });
      }
      // Last-owner protection — pre-flight before applying the role change.
      const guard = await ensureNotLastOwner(target.id, body.role === 'owner');
      if (guard) return guard;
      data.role = body.role;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const updated = await prisma.adminUser.update({ where: { id }, data });
    return NextResponse.json({ ok: true, employee: safe(updated) });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });
    console.error('[PATCH /api/admin/employees/[id]] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to update employee' }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  try {
    const { id } = await params;
    const target = await prisma.adminUser.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });

    if (target.email === auth.email) {
      return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
    }
    const guard = await ensureNotLastOwner(target.id, false);
    if (guard) return guard;

    await prisma.adminUser.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });
    console.error('[DELETE /api/admin/employees/[id]] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to delete employee' }, { status: 500 });
  }
}
