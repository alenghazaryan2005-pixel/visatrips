/**
 * Bot runtime — loads admin bot-mapping overrides and resolves field values.
 *
 * Used by `scripts/process-visa.ts` at bot start-up:
 *   const overrides = await loadBotOverrides(prisma, 'INDIA');
 *
 * Then for each gov-site field, bot code calls `adminOr(...)` to pick between
 * the admin override and the bot's default computation. Zero risk to existing
 * behavior — when there's no override, defaults run unchanged.
 */

import type { PrismaClient } from '@prisma/client';
import {
  BotSource,
  botMappingSettingKey,
  normaliseBotSource,
} from './botMapping';

/** Parse the stored `bot.mapping.<COUNTRY>` setting into a usable overrides map. */
export async function loadBotOverrides(
  prisma: PrismaClient,
  country: string,
): Promise<Record<string, BotSource>> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: botMappingSettingKey(country) },
    });
    if (!row) return {};
    const parsed = JSON.parse(row.value);
    if (!parsed || typeof parsed.overrides !== 'object') return {};
    const clean: Record<string, BotSource> = {};
    for (const [k, v] of Object.entries(parsed.overrides)) {
      const src = normaliseBotSource(v);
      if (src) clean[k] = src;
    }
    return clean;
  } catch {
    return {};
  }
}

export function getOverride(
  stepKey: string,
  fieldKey: string,
  overrides: Record<string, BotSource>,
): BotSource | null {
  return overrides[`${stepKey}.${fieldKey}`] ?? null;
}

export interface ResolvedSource {
  kind: 'value' | 'manual' | 'skip';
  value?: string;
}

/** Resolve a BotSource into a concrete value string (or a manual/skip signal). */
export function resolveSource(
  source: BotSource,
  traveler: any,
  order: any,
): ResolvedSource {
  if (source.type === 'hardcoded') return { kind: 'value', value: source.value };
  if (source.type === 'manual')    return { kind: 'manual' };
  if (source.type === 'skip')      return { kind: 'skip' };
  // schema — read from traveler first, fall back to order
  const key = source.fieldKey;
  const v =
    traveler && traveler[key] !== undefined && traveler[key] !== null
      ? traveler[key]
      : order
        ? order[key]
        : undefined;
  if (v === undefined || v === null || v === '') return { kind: 'skip' };
  return { kind: 'value', value: String(v) };
}

export interface AdminOrResult {
  /** Final value to use (string), or null if the field should be skipped / needs manual action. */
  value: string | null;
  /** Where the value came from — 'default' if no override. */
  source: 'admin' | 'default' | 'manual' | 'skip';
}

/**
 * Admin override OR default value.
 *
 *   const nationality = adminOr('registration', 'nationality', overrides, traveler, order,
 *     COUNTRY_MAP[traveler.passportCountry] || traveler.passportCountry);
 *
 *   if (nationality.source === 'manual') { await waitForEnter(); }
 *   else if (nationality.value) { await selectByText('#nationality_id', nationality.value); }
 *   else { console.log('  ⏭️  Skipped'); }
 *
 * - When admin has set a schema/hardcoded override, returns that literal value
 *   (no transforms — the admin is in charge of getting the format right).
 * - When admin selected "manual" or "skip", returns `null` with the matching source.
 * - When there's no override, returns `defaultValue` with source = 'default'.
 */
export function adminOr(
  stepKey: string,
  fieldKey: string,
  overrides: Record<string, BotSource>,
  traveler: any,
  order: any,
  defaultValue: string | number | undefined | null,
): AdminOrResult {
  const override = getOverride(stepKey, fieldKey, overrides);
  if (!override) {
    const v =
      defaultValue === undefined || defaultValue === null || defaultValue === ''
        ? null
        : String(defaultValue);
    return { value: v, source: 'default' };
  }
  const r = resolveSource(override, traveler, order);
  if (r.kind === 'manual') return { value: null, source: 'manual' };
  if (r.kind === 'skip')   return { value: null, source: 'skip' };
  return { value: r.value!, source: 'admin' };
}

/** Pretty-print the source tag for console logs: (default), (admin override), (skip), (manual). */
export function sourceTag(source: AdminOrResult['source']): string {
  if (source === 'admin')  return ' (admin override)';
  if (source === 'manual') return ' (manual — waiting)';
  if (source === 'skip')   return ' (skipped by admin)';
  return '';
}

// ── Bot-run logging ───────────────────────────────────────────────────────
// Persists per-field audit trail to the bot_runs + bot_run_entries tables.
// Graceful: any DB error is swallowed so logging never breaks the bot.

export interface BotRunLogger {
  /** Log one field attempt. Swallows errors — never throws. */
  log(entry: {
    stepKey: string;
    fieldKey: string;
    label: string;
    action: string;   // fill | select | click | check | upload | skip | manual
    source: string;   // admin | default | manual | skip
    value?: string | null;
    success?: boolean;
    errorMsg?: string;
    selector?: string;
  }): Promise<void>;
  /** Mark the run finished (with optional error). Graceful on DB failure. */
  finish(opts?: { error?: string; cancelled?: boolean }): Promise<void>;
  /** The DB id of this run — useful for linking from admin UI. */
  readonly runId: string;
}

/** Create a logger tied to a fresh bot_runs row. Returns a no-op logger on DB failure. */
export async function createBotRunLogger(
  prisma: PrismaClient,
  opts: { orderId: string; country?: string },
): Promise<BotRunLogger> {
  try {
    const run = await prisma.botRun.create({
      data: {
        orderId: opts.orderId,
        country: (opts.country ?? 'INDIA').toUpperCase(),
        status: 'running',
      },
    });
    const runId = run.id;
    // Idempotency guard: callers commonly invoke finish() in both catch and
    // finally blocks. The first call wins so we don't overwrite an explicit
    // `failed` / `cancelled` state with a bare `completed`.
    let finished = false;
    return {
      runId,
      async log(entry) {
        try {
          await prisma.botRunEntry.create({
            data: {
              runId,
              stepKey:  entry.stepKey,
              fieldKey: entry.fieldKey,
              label:    entry.label,
              action:   entry.action,
              source:   entry.source,
              value:    entry.value == null ? null : String(entry.value).slice(0, 10_000),
              success:  entry.success ?? true,
              errorMsg: entry.errorMsg ?? null,
              selector: entry.selector ?? null,
            },
          });
        } catch {}
      },
      async finish(o) {
        if (finished) return;
        finished = true;
        try {
          await prisma.botRun.update({
            where: { id: runId },
            data: {
              finishedAt: new Date(),
              status: o?.cancelled ? 'cancelled' : o?.error ? 'failed' : 'completed',
              errorMsg: o?.error ?? null,
            },
          });
        } catch {}
      },
    };
  } catch {
    // DB unreachable — hand back a no-op logger so the bot still runs.
    return {
      runId: 'local-only',
      async log() {},
      async finish() {},
    };
  }
}
