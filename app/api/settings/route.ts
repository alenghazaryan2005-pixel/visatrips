import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { getAllSettings, DEFAULTS } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/settings — return all settings (merged with defaults).
 * Public endpoint (settings like prices are needed on the checkout page),
 * but we filter out any sensitive keys just in case.
 */
export async function GET(_req: NextRequest) {
  try {
    const all = await getAllSettings();
    // Filter out any keys that contain secrets (none right now, but future-proof)
    const sanitized: Record<string, any> = {};
    for (const k of Object.keys(all)) {
      if (k.includes('secret') || k.includes('apiKey') || k.includes('password')) continue;
      sanitized[k] = all[k];
    }
    return NextResponse.json({ settings: sanitized, defaults: DEFAULTS });
  } catch {
    return NextResponse.json({ settings: DEFAULTS, defaults: DEFAULTS });
  }
}

/**
 * POST /api/settings — bulk update (admin only).
 * Body: { updates: { [key]: { value, category } } }
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    if (!body || typeof body.updates !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const results: any[] = [];
    for (const [key, val] of Object.entries(body.updates as Record<string, { value: any; category: string }>)) {
      if (!val || typeof val !== 'object') continue;
      const valueStr = JSON.stringify(val.value);
      const category = val.category || 'general';
      const saved = await prisma.setting.upsert({
        where: { key },
        create: { key, category, value: valueStr, updatedBy: admin.name },
        update: { value: valueStr, updatedBy: admin.name },
      });
      results.push({ key, ok: true, updatedAt: saved.updatedAt });
    }
    return NextResponse.json({ updated: results.length, results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save' }, { status: 500 });
  }
}
