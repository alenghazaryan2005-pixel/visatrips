/**
 * Settings helpers — read from DB with sensible defaults.
 *
 * Settings are stored as JSON-stringified values in the `settings` table,
 * keyed by dotted path. Examples:
 *   pricing.visa.TOURIST_30       -> 51.25
 *   pricing.processing.rush       -> 20
 *   email.confirmation.subject    -> "Order Confirmed — #{orderNumber}"
 *   email.confirmation.html       -> "<h1>..."
 *   status.labels                 -> {"UNFINISHED":"Unfinished",...}
 *   general.supportEmail          -> "support@visatrips.com"
 */

import { prisma } from '@/lib/prisma';

export const DEFAULTS = {
  // Visa pricing (base price per traveler, before processing surcharge)
  'pricing.visa.TOURIST_30': 25,
  'pricing.visa.TOURIST_1Y': 40,
  'pricing.visa.TOURIST_5Y': 80,
  'pricing.visa.BUSINESS_1Y': 80,
  'pricing.visa.MEDICAL_60': 25,

  // Processing speed surcharges
  'pricing.processing.standard': 0,
  'pricing.processing.rush': 20,
  'pricing.processing.super': 60,

  // Additional fees layered on top of visa + processing
  // Government fee is per traveler (each applicant has their own gov fee).
  // Transaction fee is a percentage of the subtotal (visa + processing + gov).
  'pricing.fees.government': 10,
  'pricing.fees.transactionPercent': 8,

  // General site settings
  'general.supportEmail': 'support@visatrips.com',
  'general.fromEmail': 'VisaTrips <onboarding@resend.dev>',
  'general.siteUrl': 'https://visatrips.com',
  'general.reminderIntervalDays': 2,
  'general.reminderMaxCount': 3,

  // Status labels (pretty display text). Editable by admin and consumed by
  // useCustomStatuses provider — overrides what STATUS_LABELS in constants.ts
  // would otherwise show.
  'status.labels': {
    UNFINISHED: 'Unfinished',
    PROCESSING: 'Processing',
    SUBMITTED: 'Submitted',
    COMPLETED: 'Completed',
    NEEDS_CORRECTION: 'Needs Correction',
    ON_HOLD: 'On Hold',
    REJECTED: 'Rejected',
    REFUNDED: 'Refunded',
  } as Record<string, string>,

  // Status colors (hex). Defaults match the existing CSS class palette in
  // app/globals.css. Admin can override via the Status Labels tab.
  'status.colors': {
    UNFINISHED:       '#94a3b8',  // slate
    PROCESSING:       '#6c8aff',  // blue (brand accent)
    SUBMITTED:        '#10b981',  // emerald
    COMPLETED:        '#059669',  // green
    NEEDS_CORRECTION: '#dc2626',  // red
    ON_HOLD:          '#f59e0b',  // amber
    REJECTED:         '#ef4444',  // red-500
    REFUNDED:         '#7c3aed',  // violet
  } as Record<string, string>,

  // Customer-friendly description shown next to the status (optional, blank
  // by default). Used as a tooltip + on the customer status page.
  'status.descriptions': {} as Record<string, string>,

  // Tombstones — built-in status codes the admin has explicitly deleted.
  // Tombstoned codes are filtered out of dropdowns / filter tabs / customer
  // pages. Existing orders that still reference a deleted code keep their
  // value but render with a fallback label.
  'status.deleted': [] as string[],
};

type SettingKey = keyof typeof DEFAULTS;

/**
 * Fetch all settings at once, keyed by their path.
 * Returns merged object: defaults + any DB overrides.
 */
export async function getAllSettings(): Promise<Record<string, any>> {
  try {
    const rows = await prisma.setting.findMany();
    const out: Record<string, any> = { ...DEFAULTS };
    for (const row of rows) {
      try { out[row.key] = JSON.parse(row.value); } catch { out[row.key] = row.value; }
    }
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Fetch a single setting value with default fallback.
 */
export async function getSetting<K extends SettingKey>(key: K): Promise<typeof DEFAULTS[K]> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (row) {
      try { return JSON.parse(row.value); } catch { return row.value as any; }
    }
  } catch {}
  return DEFAULTS[key];
}

/**
 * Save a setting (upsert).
 */
export async function saveSetting(key: string, category: string, value: any, updatedBy?: string) {
  const valueStr = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
  await prisma.setting.upsert({
    where: { key },
    create: { key, category, value: valueStr, updatedBy },
    update: { value: valueStr, updatedBy },
  });
}

/**
 * Returns the visa price + processing surcharge.
 */
export async function getVisaPrice(visaCode: string, processingSpeed: 'standard' | 'rush' | 'super' = 'standard'): Promise<{ base: number; surcharge: number; total: number }> {
  const all = await getAllSettings();
  const base = Number(all[`pricing.visa.${visaCode}`] ?? 0);
  const surcharge = Number(all[`pricing.processing.${processingSpeed}`] ?? 0);
  return { base, surcharge, total: base + surcharge };
}

/**
 * Get all visa prices as a map (code -> price).
 */
export async function getAllVisaPrices(): Promise<Record<string, number>> {
  const all = await getAllSettings();
  const out: Record<string, number> = {};
  for (const k of Object.keys(all)) {
    if (k.startsWith('pricing.visa.')) {
      out[k.replace('pricing.visa.', '')] = Number(all[k]);
    }
  }
  return out;
}

/**
 * Get status labels (display names).
 */
export async function getStatusLabels(): Promise<Record<string, string>> {
  return getSetting('status.labels');
}
