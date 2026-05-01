import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isErrorResponse } from '@/lib/auth';
import {
  generateUserPresetId,
  isBuiltInPresetId,
  validateThemeStrict,
  type UserPreset,
} from '@/lib/theme';
import { getUserPresets, saveUserPresets } from '@/lib/theme-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PRESETS = 30;
const MAX_NAME_LEN = 60;
const MAX_DESC_LEN = 240;

/**
 * POST /api/theme/presets — create a new user preset for the calling admin.
 * Per-user, so any logged-in admin can save their own presets.
 * Body: { name: string, description?: string, colors: ThemeColors }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;
  const admin = auth;

  try {
    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    if (name.length > MAX_NAME_LEN) {
      return NextResponse.json({ error: `Name must be ${MAX_NAME_LEN} chars or fewer.` }, { status: 400 });
    }
    const description = typeof body?.description === 'string'
      ? body.description.trim().slice(0, MAX_DESC_LEN)
      : undefined;
    const colors = validateThemeStrict(body?.colors);

    const existing = await getUserPresets(admin.email);
    if (existing.length >= MAX_PRESETS) {
      return NextResponse.json(
        { error: `Limit of ${MAX_PRESETS} user presets reached. Delete one to make room.` },
        { status: 400 },
      );
    }
    // Reject duplicate names within THIS admin's presets (case-insensitive).
    if (existing.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json(
        { error: `A preset named "${name}" already exists.` },
        { status: 400 },
      );
    }

    const newPreset: UserPreset = {
      id: generateUserPresetId(),
      name,
      description,
      builtIn: false,
      colors,
      createdAt: new Date().toISOString(),
      createdBy: admin.name,
    };
    const next = [...existing, newPreset];
    await saveUserPresets(admin.email, next, admin.name);
    return NextResponse.json({ ok: true, preset: newPreset, presets: next });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create preset' }, { status: 400 });
  }
}

/**
 * DELETE /api/theme/presets?id=<id> — remove one of THIS admin's presets.
 * Built-in presets cannot be deleted; presets belonging to other admins
 * are invisible to this caller (different per-user keys).
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;
  const admin = auth;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'Missing id param.' }, { status: 400 });
    if (isBuiltInPresetId(id)) {
      return NextResponse.json({ error: 'Built-in presets cannot be deleted.' }, { status: 400 });
    }

    const existing = await getUserPresets(admin.email);
    const next = existing.filter(p => p.id !== id);
    if (next.length === existing.length) {
      return NextResponse.json({ error: 'Preset not found.' }, { status: 404 });
    }
    await saveUserPresets(admin.email, next, admin.name);
    return NextResponse.json({ ok: true, presets: next });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete preset' }, { status: 500 });
  }
}
