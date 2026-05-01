/**
 * GET  /api/features          — returns current value of every flag in the catalog
 * POST /api/features { id, enabled }  — admin-only flip
 *
 * Reads/writes Setting rows keyed `features.<id>`. Unknown ids are rejected.
 * Public GET (so any authed-or-not page on the site can check flags); only
 * admins can flip via POST.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOwner, isErrorResponse } from '@/lib/auth';
import { FEATURE_FLAGS, FLAG_BY_ID, flagSettingKey, parseFlagValue } from '@/lib/featureFlags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const keys = FEATURE_FLAGS.map(f => flagSettingKey(f.id));
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const byKey = new Map(rows.map(r => [r.key, r.value]));

    const flags = FEATURE_FLAGS.map(f => ({
      id: f.id,
      label: f.label,
      description: f.description,
      details: f.details ?? [],
      enabled: parseFlagValue(byKey.get(flagSettingKey(f.id)) ?? null, f.defaultValue),
      defaultValue: f.defaultValue,
    }));

    return NextResponse.json({ flags });
  } catch (err: any) {
    console.error('[GET /api/features] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to load features' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Feature-flag toggles are owner-only — employees can read flags (so the
  // admin pages know what UI to render) but can't flip them.
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  const admin = auth;

  try {
    const body = await req.json();
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!FLAG_BY_ID[id]) {
      return NextResponse.json({ error: `Unknown feature flag: ${id}` }, { status: 400 });
    }
    if (typeof body?.enabled !== 'boolean') {
      return NextResponse.json({ error: '`enabled` must be a boolean' }, { status: 400 });
    }
    const key = flagSettingKey(id);
    const value = JSON.stringify(body.enabled);
    await prisma.setting.upsert({
      where:  { key },
      create: { key, category: 'features', value, updatedBy: admin.name },
      update: { value, updatedBy: admin.name },
    });
    return NextResponse.json({ ok: true, id, enabled: body.enabled });
  } catch (err: any) {
    console.error('[POST /api/features] failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to update feature' }, { status: 500 });
  }
}
