import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import {
  botMappingSettingKey,
  getBotCatalog,
  normaliseBotSource,
  BotMapping,
  BotSource,
} from '@/lib/botMapping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/bot-mapping?country=INDIA
 * Returns the full catalog (hardcoded per country) + current admin overrides.
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const url = new URL(req.url);
    const country = (url.searchParams.get('country') || 'INDIA').toUpperCase();
    const catalog = getBotCatalog(country);

    const key = botMappingSettingKey(country);
    const row = await prisma.setting.findUnique({ where: { key } });
    let overrides: Record<string, BotSource> = {};
    if (row) {
      try {
        const parsed = JSON.parse(row.value);
        if (parsed && typeof parsed.overrides === 'object') {
          // Validate each override on read — strip anything malformed.
          for (const [k, v] of Object.entries(parsed.overrides)) {
            const src = normaliseBotSource(v);
            if (src) overrides[k] = src;
          }
        }
      } catch {}
    }

    return NextResponse.json({
      country,
      catalog,
      overrides,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/bot-mapping
 * Body: { country, overrides: { [stepKey.fieldKey]: BotSource } }
 */
export async function PUT(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const country = (body.country || 'INDIA').toUpperCase();

    const clean: Record<string, BotSource> = {};
    if (body.overrides && typeof body.overrides === 'object') {
      for (const [k, v] of Object.entries(body.overrides)) {
        const src = normaliseBotSource(v);
        if (src) clean[k] = src;
      }
    }

    const mapping: BotMapping = { country, overrides: clean };
    const key = botMappingSettingKey(country);
    const saved = await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(mapping), updatedBy: admin.name },
      create: { key, category: 'bot', value: JSON.stringify(mapping), updatedBy: admin.name },
    });

    return NextResponse.json({
      country,
      catalog: getBotCatalog(country),
      overrides: clean,
      updatedAt: saved.updatedAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
