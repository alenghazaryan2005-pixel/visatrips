/**
 * Single-response endpoints — PATCH for partial updates, DELETE for
 * hard removal. Both stamp updatedBy from the current admin's session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';

function normaliseShortcut(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;     // not in payload — leave alone
  if (raw === null || raw === '') return null; // explicit clear
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(/^\/+/, '').trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[a-z0-9_-]{1,40}$/.test(trimmed)) return null;
  return trimmed;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { id } = await params;
    const body = await req.json();
    const { title, content, folder, tags, visibility, shortcut } = body;

    const data: any = { updatedBy: auth.name };
    if (title    !== undefined) data.title    = title;
    if (content  !== undefined) data.content  = content;
    if (folder   !== undefined) data.folder   = folder;
    if (tags     !== undefined) data.tags     = tags;
    if (visibility !== undefined) {
      data.visibility = visibility === 'personal' ? 'personal' : 'shared';
    }
    if (shortcut !== undefined) {
      const normalised = normaliseShortcut(shortcut);
      if (shortcut !== '' && shortcut !== null && normalised === null) {
        return NextResponse.json({
          error: 'Shortcut must be lowercase letters, digits, dashes, or underscores (1–40 chars).',
        }, { status: 400 });
      }
      // Uniqueness check — exclude this row from the dedupe scan.
      if (normalised) {
        const dupe = await prisma.cannedResponse.findFirst({
          where: { shortcut: normalised, NOT: { id } },
          select: { id: true, title: true },
        });
        if (dupe) {
          return NextResponse.json({
            error: `Shortcut /${normalised} is already used by "${dupe.title}".`,
          }, { status: 409 });
        }
      }
      data.shortcut = normalised;
    }

    const response = await prisma.cannedResponse.update({ where: { id }, data });
    return NextResponse.json(response);
  } catch (err: any) {
    console.error('[PATCH /api/canned/[id]] failed:', err?.message || err);
    return NextResponse.json({
      error: err?.message || 'Failed to update',
      code:  err?.code,
    }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const { id } = await params;
    await prisma.cannedResponse.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
