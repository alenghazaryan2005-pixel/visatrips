/**
 * Canned-response collection endpoints. The list-style GET supports
 * server-side search (q), folder filter, and visibility scope filter so
 * the picker on the ticket page can ask for exactly what it needs without
 * hauling everything to the client. POST creates a new response stamped
 * with the current admin's name as createdBy.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, isErrorResponse } from '@/lib/auth';

/** Allowed shortcut characters: lowercase, digits, dash, underscore.
 *  We strip the leading "/" if the caller includes it, then validate. */
function normaliseShortcut(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(/^\/+/, '').trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[a-z0-9_-]{1,40}$/.test(trimmed)) return null;
  return trimmed;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const url = new URL(req.url);
    const q      = (url.searchParams.get('q') || '').trim();
    const folder = (url.searchParams.get('folder') || '').trim();
    // scope = 'mine' | 'shared' | 'all' (default). 'all' means everything
    // the current admin can see — i.e. all shared + their own personal.
    const scope = (url.searchParams.get('scope') || 'all').trim();

    // Visibility filter — the rule is "you can see everything shared, plus
    // your own personal stuff". Personal responses by other admins are
    // never returned, regardless of scope.
    const visibilityFilter =
      scope === 'mine'   ? { AND: [{ visibility: 'personal' }, { createdBy: auth.name }] } :
      scope === 'shared' ? { visibility: 'shared' } :
      { OR: [{ visibility: 'shared' }, { AND: [{ visibility: 'personal' }, { createdBy: auth.name }] }] };

    const where: any = { ...visibilityFilter };
    if (folder && folder !== 'All') where.folder = folder;
    if (q) {
      // Mirror the search across the columns the user actually thinks
      // of as searchable: title, content, tags (comma-list), shortcut.
      where.OR = [
        { title:    { contains: q, mode: 'insensitive' } },
        { content:  { contains: q, mode: 'insensitive' } },
        { tags:     { contains: q, mode: 'insensitive' } },
        { shortcut: { contains: q, mode: 'insensitive' } },
      ];
    }

    const responses = await prisma.cannedResponse.findMany({
      where,
      // Surface frequently-used responses first; otherwise alphabetical
      // within the folder. createdAt as a final tiebreaker keeps order
      // stable for fresh / never-used responses.
      orderBy: [
        { usageCount: 'desc' },
        { folder:     'asc'  },
        { title:      'asc'  },
        { createdAt:  'desc' },
      ],
    });
    return NextResponse.json(responses);
  } catch (err: any) {
    console.error('[GET /api/canned] failed:', err?.message || err);
    return NextResponse.json({
      error: err?.message || 'Failed to fetch',
      code:  err?.code,
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const body = await req.json();
    const { title, content, folder, tags, visibility, shortcut } = body;
    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    const normalisedShortcut = shortcut === undefined || shortcut === null || shortcut === ''
      ? null
      : normaliseShortcut(shortcut);
    if (shortcut && normalisedShortcut === null) {
      return NextResponse.json({
        error: 'Shortcut must be lowercase letters, digits, dashes, or underscores (1–40 chars).',
      }, { status: 400 });
    }

    // Shortcuts must be unique across all responses the user could match
    // against — otherwise typing /welcome would be ambiguous. We dedupe
    // case-insensitively (the input has already been lowercased).
    if (normalisedShortcut) {
      const dupe = await prisma.cannedResponse.findFirst({
        where: { shortcut: normalisedShortcut },
        select: { id: true, title: true },
      });
      if (dupe) {
        return NextResponse.json({
          error: `Shortcut /${normalisedShortcut} is already used by "${dupe.title}".`,
        }, { status: 409 });
      }
    }

    const visibilityValue = visibility === 'personal' ? 'personal' : 'shared';

    const response = await prisma.cannedResponse.create({
      data: {
        title,
        content,
        folder: folder || 'General',
        tags: tags || null,
        visibility: visibilityValue,
        shortcut: normalisedShortcut,
        createdBy: auth.name,
        updatedBy: auth.name,
      },
    });
    return NextResponse.json(response);
  } catch (err: any) {
    // Surface the real error to the client so a blank "Failed to create"
    // toast doesn't mask Prisma drift, schema mismatches, or pooler hiccups.
    // Also logged server-side so it shows up in the dev terminal.
    console.error('[POST /api/canned] failed:', err?.message || err);
    return NextResponse.json({
      error: err?.message || 'Failed to create',
      code:  err?.code,
    }, { status: 500 });
  }
}
