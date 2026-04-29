import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import {
  schemaSettingKey,
  mergeWithDefaults,
  ApplicationSchema,
  CustomSection,
  CustomField,
  BotAction,
  SchemaPage,
} from '@/lib/applicationSchema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_FIELD_TYPES = ['text','email','tel','date','number','textarea','select','radio','checkbox'];
const VALID_BOT_ACTIONS: BotAction[] = ['fill','select','click','check','upload','skip'];

function sanitizeKey(k: unknown, fallback: string): string {
  const s = String(k || fallback).trim();
  return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]+/, '').slice(0, 40) || fallback;
}

function normaliseField(f: any, i: number): CustomField | null {
  if (!f || typeof f !== 'object') return null;
  const key = sanitizeKey(f.key, `field_${i}`);
  const label = typeof f.label === 'string' ? f.label.trim() : '';
  if (!label) return null;
  const type = VALID_FIELD_TYPES.includes(f.type) ? f.type : 'text';
  return {
    key,
    label,
    type,
    required: !!f.required,
    options: Array.isArray(f.options) ? f.options.filter((o: any) => typeof o === 'string' && o.trim()) : undefined,
    placeholder: typeof f.placeholder === 'string' ? f.placeholder : undefined,
    helpText: typeof f.helpText === 'string' ? f.helpText : undefined,
    hidden: !!f.hidden,
    builtIn: !!f.builtIn,
    botSelector: typeof f.botSelector === 'string' ? f.botSelector : undefined,
    botAction: VALID_BOT_ACTIONS.includes(f.botAction) ? f.botAction : undefined,
  };
}

function normaliseSection(s: any, i: number): CustomSection | null {
  if (!s || typeof s !== 'object') return null;
  const key = sanitizeKey(s.key, `section_${i}`);
  const title = typeof s.title === 'string' ? s.title.trim() : '';
  if (!title) return null;
  const fields = Array.isArray(s.fields)
    ? s.fields.map((f: any, j: number) => normaliseField(f, j)).filter(Boolean) as CustomField[]
    : [];
  const pages: SchemaPage[] = Array.isArray(s.pages)
    ? s.pages.filter((p: any) => p === 'apply' || p === 'finish')
    : ['finish'];
  // visibleForVisaTypes — array of visa codes. We accept any non-empty
  // string, dedupe, and cap at 20 entries to prevent an admin (or buggy
  // client) from blowing up the schema row.
  const visibleForVisaTypes: string[] | undefined = Array.isArray(s.visibleForVisaTypes)
    ? Array.from(new Set(
        s.visibleForVisaTypes
          .filter((v: any) => typeof v === 'string')
          .map((v: string) => v.trim())
          .filter((v: string) => v.length > 0 && v.length < 60),
      )).slice(0, 20) as string[]
    : undefined;
  // visibleForPurposes — same rules but values are sub-purpose strings
  // ("Attend Technical/Business Meetings" etc.). Allow up to 120 chars
  // each since these are full phrases, not codes.
  const visibleForPurposes: string[] | undefined = Array.isArray(s.visibleForPurposes)
    ? Array.from(new Set(
        s.visibleForPurposes
          .filter((v: any) => typeof v === 'string')
          .map((v: string) => v.trim())
          .filter((v: string) => v.length > 0 && v.length < 120),
      )).slice(0, 20) as string[]
    : undefined;
  return {
    key,
    title,
    icon: typeof s.icon === 'string' ? s.icon : undefined,
    emoji: typeof s.emoji === 'string' ? s.emoji : undefined,
    description: typeof s.description === 'string' ? s.description : undefined,
    hidden: !!s.hidden,
    builtIn: !!s.builtIn,
    pages: pages.length > 0 ? pages : ['finish'],
    // Only include the field if admin actually set something (keeps
    // payloads tidy for sections with no visa-type restriction).
    ...(visibleForVisaTypes && visibleForVisaTypes.length > 0 ? { visibleForVisaTypes } : {}),
    ...(visibleForPurposes && visibleForPurposes.length > 0 ? { visibleForPurposes } : {}),
    fields,
  };
}

/**
 * GET /api/settings/application-schema?country=INDIA
 * Public — apply/finish pages fetch this without admin auth.
 * Returns the schema merged with current code-defined built-in defaults so
 * new fields appear without requiring a resave.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const country = (url.searchParams.get('country') || 'INDIA').toUpperCase();
    const key = schemaSettingKey(country);
    const record = await prisma.setting.findUnique({ where: { key } });

    let stored: Partial<ApplicationSchema> | null = null;
    if (record) {
      try {
        const parsed = JSON.parse(record.value);
        stored = {
          country: parsed.country || country,
          // Migrate Phase 1 `customSections` → Phase 2 `sections`.
          sections: Array.isArray(parsed.sections)
            ? parsed.sections
            : Array.isArray(parsed.customSections)
              ? parsed.customSections.map((s: any) => ({ ...s, builtIn: false }))
              : [],
          // Tombstones — built-in keys the admin has explicitly removed.
          deletedBuiltIns: Array.isArray(parsed.deletedBuiltIns)
            ? parsed.deletedBuiltIns.filter((k: any) => typeof k === 'string')
            : undefined,
          updatedAt: record.updatedAt?.toISOString?.() ?? record.updatedAt as any,
        };
      } catch {}
    }

    const merged = mergeWithDefaults(stored, country);
    if (record && !merged.updatedAt) merged.updatedAt = record.updatedAt?.toISOString?.() ?? (record.updatedAt as any);
    return NextResponse.json(merged);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/application-schema
 * Body: { country, sections: [...] }
 * Admin only.
 */
export async function PUT(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const country = (body.country || 'INDIA').toUpperCase();
    const sections = Array.isArray(body.sections)
      ? body.sections.map((s: any, i: number) => normaliseSection(s, i)).filter(Boolean) as CustomSection[]
      : [];

    // Tombstones — only accept strings shaped like `key` or `key.fieldKey`,
    // and dedupe. Limits unbounded growth from buggy clients.
    const deletedBuiltIns: string[] = Array.isArray(body.deletedBuiltIns)
      ? Array.from(new Set<string>(
          (body.deletedBuiltIns as unknown[])
            .filter((k): k is string => typeof k === 'string')
            .map(k => k.trim())
            .filter(k => /^[\w-]+(\.[\w-]+)?$/.test(k)),
        )).slice(0, 500)
      : [];

    const clean: ApplicationSchema = {
      country,
      sections,
      ...(deletedBuiltIns.length > 0 ? { deletedBuiltIns } : {}),
    };
    const key = schemaSettingKey(country);

    const saved = await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(clean), updatedBy: admin.name },
      create: { key, category: 'application', value: JSON.stringify(clean), updatedBy: admin.name },
    });

    // Return the merged schema so the UI reflects any newly-introduced code defaults too.
    const merged = mergeWithDefaults(clean, country);
    merged.updatedAt = saved.updatedAt?.toISOString?.() ?? (saved.updatedAt as any);
    return NextResponse.json(merged);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
