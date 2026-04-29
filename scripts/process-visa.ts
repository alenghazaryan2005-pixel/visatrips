/**
 * VisaTrips — Indian eVisa Auto-Fill Bot
 *
 * Usage: npx tsx scripts/process-visa.ts <orderNumber>
 * Example: npx tsx scripts/process-visa.ts 00015
 *
 * This script:
 * 1. Fetches order data from the database
 * 2. Opens the official Indian eVisa registration page
 * 3. Fills in all fields from the customer's application data
 * 4. Pauses at CAPTCHA for manual solving (or auto if possible)
 * 5. Proceeds through all steps
 */

import { chromium, Page } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { loadBotOverrides, adminOr, sourceTag, AdminOrResult, createBotRunLogger, BotRunLogger } from '../lib/botRuntime';
import type { BotSource } from '../lib/botMapping';
import { normaliseReligion } from '../lib/constants';

const prisma = new PrismaClient();

// ── Helpers ──

function parseOrderNumber(input: string): number {
  const clean = input.replace(/[^0-9]/g, '');
  return parseInt(clean, 10);
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface SelectResult {
  ok: boolean;
  /** Every option that was on the page — used by callers to surface a debug
   *  entry to the admin Bot Run panel when the match failed. */
  options: Array<{ value: string; text: string }>;
}

/**
 * Select a dropdown option by visible text. Returns { ok, options } so
 * callers can both log success/failure correctly AND persist the available
 * options to the bot run log when nothing matched.
 */
async function selectDropdownByText(page: Page, selector: string, text: string): Promise<SelectResult> {
  try {
    const options: Array<{ value: string; text: string }> = await page.$$eval(`${selector} option`, (opts: any[]) =>
      opts.map(o => ({ value: o.value, text: (o.textContent || '').trim() }))
    );
    // Try exact match first, then partial
    const textLower = text.toLowerCase();
    let match = options.find(o => o.text?.toLowerCase() === textLower);
    if (!match) match = options.find(o => o.text?.toLowerCase().startsWith(textLower));
    if (!match) match = options.find(o => o.text?.toLowerCase().includes(textLower));
    if (match) {
      await page.selectOption(selector, match.value);
      return { ok: true, options };
    }
    // Dump options to console too — useful when running the bot from a terminal.
    console.warn(`⚠️  Could not find option "${text}" in ${selector}. Available options:`);
    for (const o of options) console.warn(`     - value="${o.value}" text="${o.text}"`);
    return { ok: false, options };
  } catch (e) {
    console.warn(`⚠️  Error selecting "${text}" in ${selector}:`, e);
    return { ok: false, options: [] };
  }
}

async function fillField(page: Page, selector: string, value: string | undefined, label: string) {
  if (!value) { console.log(`  ⏭️  Skipping ${label} (no value)`); return; }
  try {
    await page.waitForSelector(selector, { timeout: 5000 });
    await page.fill(selector, value);
    console.log(`  ✅ ${label}: ${value}`);
  } catch {
    console.warn(`  ⚠️  Could not fill ${label} (${selector})`);
  }
}

async function selectField(page: Page, selector: string, value: string | undefined, label: string) {
  if (!value) { console.log(`  ⏭️  Skipping ${label} (no value)`); return; }
  try {
    await page.waitForSelector(selector, { timeout: 5000 });
    await selectDropdownByText(page, selector, value);
    console.log(`  ✅ ${label}: ${value}`);
  } catch {
    console.warn(`  ⚠️  Could not select ${label} (${selector})`);
  }
}

async function clickRadio(page: Page, name: string, value: string, label: string) {
  try {
    await page.click(`input[name="${name}"][value="${value}"]`);
    console.log(`  ✅ ${label}: ${value}`);
  } catch {
    console.warn(`  ⚠️  Could not click radio ${label}`);
  }
}

// ── Bot field wrapper ──
// Honors admin overrides (Bot tab in admin) with a default fallback.
// Generic callback form so callers can do fill/select/click/upload/evaluate.
// Also writes a per-field audit trail entry via the optional logger.
async function withBotField(
  opts: {
    step: string;
    field: string;
    label: string;
    overrides: Record<string, BotSource>;
    traveler: any;
    order: any;
    defaultValue: string | number | undefined | null;
    execute: (val: string) => Promise<void>;
    /** Optional custom handler for manual mode — otherwise the caller is prompted to press Enter. */
    onManual?: () => Promise<void>;
    /** Optional logger to persist the attempt. */
    logger?: BotRunLogger;
    /** Optional action name for the log entry; defaults to 'fill'. */
    action?: string;
    /** Optional selector for the log entry (useful context when debugging). */
    selector?: string;
  },
): Promise<void> {
  const r = adminOr(opts.step, opts.field, opts.overrides, opts.traveler, opts.order, opts.defaultValue);
  const baseLog = {
    stepKey: opts.step, fieldKey: opts.field, label: opts.label,
    action: opts.action ?? 'fill',
    source: r.source,
    selector: opts.selector,
  };
  if (r.source === 'manual') {
    await opts.logger?.log({ ...baseLog, action: 'manual', success: true, value: null });
    if (opts.onManual) { await opts.onManual(); return; }
    console.log(`  ⏸️  ${opts.label} marked manual — solve in browser, press Enter to continue...`);
    await waitForEnter();
    return;
  }
  if (!r.value) {
    await opts.logger?.log({ ...baseLog, action: 'skip', success: true, value: null });
    console.log(`  ⏭️  ${opts.label}${sourceTag(r.source)}`);
    return;
  }
  try {
    await opts.execute(r.value);
    await opts.logger?.log({ ...baseLog, value: r.value, success: true });
    console.log(`  ✅ ${opts.label}: ${r.value}${sourceTag(r.source)}`);
  } catch (err: any) {
    await opts.logger?.log({ ...baseLog, value: r.value, success: false, errorMsg: err?.message || 'error' });
    console.warn(`  ⚠️  Could not fill ${opts.label}: ${err?.message || 'error'}`);
  }
}

// ── Visa Type Mapping ──

const VISA_TYPE_MAP: Record<string, string> = {
  'TOURIST_30': '31',
  'TOURIST_1Y': '3',
  'TOURIST_5Y': '32',
  'BUSINESS_1Y': '1',
  'MEDICAL_60': '16',
  'tourist-30': '31',
  'tourist-1y': '3',
  'tourist-5y': '32',
  'business-1y': '1',
  'medical-60': '16',
};

// ── Country Code Mapping ──

const COUNTRY_MAP: Record<string, string> = {
  'US': 'UNITED STATES OF AMERICA', 'United States': 'UNITED STATES OF AMERICA',
  'GB': 'UNITED KINGDOM', 'United Kingdom': 'UNITED KINGDOM', 'CA': 'CANADA', 'AU': 'AUSTRALIA',
  'DE': 'GERMANY', 'FR': 'FRANCE', 'IT': 'ITALY', 'ES': 'SPAIN', 'NL': 'NETHERLANDS',
  'JP': 'JAPAN', 'KR': 'REPUBLIC OF KOREA', 'SG': 'SINGAPORE', 'AE': 'UNITED ARAB EMIRATES',
  // Legacy synonym — orders saved before we renamed the customer dropdown
  // (early 2026) stored 'South Korea'. Keep mapping forward to the gov-form
  // label so those orders still bot-process cleanly.
  'South Korea': 'REPUBLIC OF KOREA',
  'BR': 'BRAZIL', 'MX': 'MEXICO', 'ZA': 'SOUTH AFRICA', 'NG': 'NIGERIA', 'KE': 'KENYA',
  'TR': 'TURKEY', 'PH': 'PHILIPPINES', 'ID': 'INDONESIA', 'MY': 'MALAYSIA', 'TH': 'THAILAND',
  'VN': 'VIETNAM', 'EG': 'EGYPT', 'MA': 'MOROCCO', 'PT': 'PORTUGAL', 'PL': 'POLAND',
  'SE': 'SWEDEN', 'CH': 'SWITZERLAND', 'NZ': 'NEW ZEALAND', 'AR': 'ARGENTINA', 'GH': 'GHANA',
};

// ── Port of Arrival Mapping ──

const PORT_MAP: Record<string, string> = {
  'Delhi (Airport)': 'DEL', 'Mumbai (Airport)': 'BOM', 'Bengaluru (Airport)': 'BLR',
  'Chennai (Airport)': 'MAA', 'Kolkata (Airport)': 'CCU', 'Hyderabad (Airport)': 'HYD',
  'Cochin (Airport)': 'COK', 'Goa (Dabolim) (Airport)': 'GOI', 'Goa (Mopa) (Airport)': 'GOX',
  'Ahmedabad (Airport)': 'AMD', 'Amritsar (Airport)': 'ATQ', 'Jaipur (Airport)': 'JAI',
  'Lucknow (Airport)': 'LKO', 'Varanasi (Airport)': 'VNS', 'Pune (Airport)': 'PNQ',
  'Guwahati (Airport)': 'GAU', 'Calicut (Airport)': 'CCJ', 'Mangalore (Airport)': 'IXE',
  'Nagpur (Airport)': 'NAG', 'Coimbatore (Airport)': 'CJB', 'Bagdogra (Airport)': 'IXB',
  'Bhubaneswar (Airport)': 'BBI', 'Chandigarh (Airport)': 'IXC', 'Gaya (Airport)': 'GAY',
  'Indore (Airport)': 'IDR', 'Kannur (Airport)': 'CNN', 'Madurai (Airport)': 'IXM',
  'Port Blair (Airport)': 'IXZ', 'Surat (Airport)': 'STV', 'Thiruvananthapuram (Airport)': 'TRV',
  'Trichy (Airport)': 'TRZ', 'Vijayawada (Airport)': 'VGA', 'Visakhapatnam (Airport)': 'VTZ',
};

// ── Date helpers ──

function parseDateString(dateStr: string | undefined): { day: string; month: string; year: string } | null {
  if (!dateStr) return null;
  // Try "Month Day, Year" format (e.g., "January 15, 2025")
  const match = dateStr.match(/^(\w+)\s+(\d+),?\s+(\d{4})$/);
  if (match) {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthIdx = months.indexOf(match[1]);
    if (monthIdx !== -1) {
      return { day: match[2].padStart(2, '0'), month: String(monthIdx + 1).padStart(2, '0'), year: match[3] };
    }
  }
  return null;
}

function formatDateForForm(dateStr: string | undefined): string {
  if (!dateStr) return '';

  // If in MM/DD/YYYY format (our website), convert to DD/MM/YYYY (India site)
  const mmddyyyy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mmddyyyy) {
    // mmddyyyy[1] = MM, mmddyyyy[2] = DD, mmddyyyy[3] = YYYY
    return `${mmddyyyy[2]}/${mmddyyyy[1]}/${mmddyyyy[3]}`;
  }

  // Try "Month Day, Year" format (e.g., "January 15, 2025")
  const parsed = parseDateString(dateStr);
  if (parsed) return `${parsed.day}/${parsed.month}/${parsed.year}`;

  return dateStr; // Return as-is if can't parse
}

// ── Main Bot ──

async function processVisa(orderNumberInput: string) {
  console.log('\n🚀 VisaTrips Auto-Fill Bot');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Hoisted so catch/finally can finalize the bot_runs row even on early failure.
  let botRunLog: BotRunLogger | null = null;

  // 1. Fetch order data
  const orderNum = parseOrderNumber(orderNumberInput);
  console.log(`📋 Fetching order #${orderNum}...`);

  const order = await prisma.order.findFirst({ where: { orderNumber: orderNum } });
  if (!order) {
    console.error('❌ Order not found!');
    process.exit(1);
  }

  let traveler: any;
  try {
    const travelers = JSON.parse(order.travelers);
    traveler = travelers[0];
  } catch {
    console.error('❌ Could not parse traveler data!');
    process.exit(1);
  }

  console.log(`✅ Found order: ${traveler.firstName} ${traveler.lastName}`);

  // Refuse to run when either document hasn't been explicitly approved by
  // an admin. Both approval timestamps default to null on new orders, so
  // admin must click ✓ Approve next to each document before the bot can
  // submit. Submitting unreviewed documents wastes the submission slot and
  // triggers a manual rejection downstream.
  if (!order.photoApprovedAt || !order.passportApprovedAt) {
    const pending: string[] = [];
    if (!order.photoApprovedAt)    pending.push('photo (📸)');
    if (!order.passportApprovedAt) pending.push('passport bio (📄)');
    console.error('\n🛑 Bot refused to start — the following documents need admin approval:');
    console.error(`     ${pending.join(', ')}`);
    console.error('   Open the order in the admin panel, review each document,');
    console.error('   then click ✓ Approve next to it before re-running the bot.\n');
    process.exit(1);
  }

  // Track bot issues that need manual attention
  const botFlags: string[] = [];
  console.log(`   Destination: ${order.destination}`);
  console.log(`   Visa Type: ${order.visaType}`);
  console.log(`   Email: ${traveler.email}\n`);

  // 2. Launch browser
  console.log('🌐 Launching browser (clean profile)...\n');
  // Graceful shutdown — when bot-server sends SIGTERM (admin clicked Cancel),
  // close the browser cleanly so Chrome's renderer/GPU subprocesses also die.
  // Without this, SIGKILL on the Node process leaves orphan Chrome windows.
  let browserHandle: import('playwright').Browser | null = null;
  let cancelling = false;
  const onSigterm = async () => {
    if (cancelling) return;
    cancelling = true;
    console.log('\n⛔ SIGTERM received — closing browser + finalizing run...');
    // Mark the run cancelled BEFORE killing the browser so the row never
    // stays stuck at status='running' just because admin clicked Cancel.
    try { await botRunLog?.finish({ cancelled: true }); } catch {}
    try { await browserHandle?.close(); } catch {}
    process.exit(143);
  };
  process.on('SIGTERM', onSigterm);
  process.on('SIGINT',  onSigterm);

  const browser = await chromium.launch({
    headless: false,
    slowMo: 150,
    channel: 'chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--no-first-run',
    ],
  });
  browserHandle = browser; // expose to SIGTERM handler defined above
  // Create a fresh context with no cookies/storage — same as incognito
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    storageState: undefined,
  });

  // Remove webdriver flag to avoid detection
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  page.setDefaultTimeout(30000);

  try {
    // ── Shared modules and helpers for all steps ──
    const path = require('path');
    const fs = require('fs');

    const fillById = async (id: string, value: string, label: string) => {
      try { await page.fill(`#${id}`, value); console.log(`  ✅ ${label}: ${value}`); }
      catch {
        try {
          await page.evaluate(function(a) { var el = document.getElementById(a.id) as any; if (el) { el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true })); } }, { id, v: value });
          console.log(`  ✅ ${label}: ${value} (JS)`);
        } catch { console.log(`  ⚠️  ${label}: failed`); }
      }
    };
    const selectById = async (id: string, value: string, label: string) => {
      try { await selectDropdownByText(page, `#${id}`, value); console.log(`  ✅ ${label}: ${value}`); }
      catch { console.log(`  ⚠️  ${label}: failed`); }
    };
    // ── Override-aware variants of fillById / selectById ──
    // Used by Steps 3, 4, 9, 11 (clean ID-based gov selectors). These check
    // the admin Bot-tab overrides first; fall back to the default value.
    const fillByIdOr = (step: string, field: string, id: string, label: string, defaultValue: string | number | undefined | null) =>
      withBotField({
        step, field, label, overrides: botOverrides, traveler, order, defaultValue,
        action: 'fill', selector: `#${id}`, logger: botRunLog ?? undefined,
        execute: async (val: string) => {
          try { await page.fill(`#${id}`, val); }
          catch {
            await page.evaluate(function(a) { var el = document.getElementById(a.id) as any; if (el) { el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true })); } }, { id, v: val });
          }
        },
      });
    const selectByIdOr = (step: string, field: string, id: string, label: string, defaultValue: string | number | undefined | null) =>
      withBotField({
        step, field, label, overrides: botOverrides, traveler, order, defaultValue,
        action: 'select', selector: `#${id}`, logger: botRunLog ?? undefined,
        execute: async (val: string) => { await selectDropdownByText(page, `#${id}`, val); },
      });

    // ── Load admin bot-mapping overrides (from /admin/settings/india → Bot tab) ──
    const botOverrides: Record<string, BotSource> = await loadBotOverrides(prisma, 'INDIA');
    const overrideCount = Object.keys(botOverrides).length;
    if (overrideCount > 0) {
      console.log(`📋 Loaded ${overrideCount} admin bot-mapping override${overrideCount === 1 ? '' : 's'}:`);
      for (const [key, src] of Object.entries(botOverrides)) {
        const summary = src.type === 'hardcoded' ? `"${src.value}"` : src.type === 'schema' ? `schema:${src.fieldKey}` : src.type;
        console.log(`   • ${key} → ${summary}`);
      }
    } else {
      console.log(`📋 No admin bot-mapping overrides — using defaults for all fields`);
    }

    // ── Create bot-run log (persisted to bot_runs + bot_run_entries) ──
    botRunLog = await createBotRunLogger(prisma, { orderId: order.id, country: 'INDIA' });
    console.log(`📝 Bot run logged as ${botRunLog.runId}`);
    console.log('');

    // ══════════════════════════════════════════════════════════
    // STEP 1 — INITIAL REGISTRATION
    // ══════════════════════════════════════════════════════════
    console.log('📝 STEP 1 — Initial Registration');
    console.log('────────────────────────────────────────────\n');

    /**
     * Step 1 logging helpers — wrap the existing select/fill/check primitives
     * with bot_run_entries audit-trail writes. Until now Step 1 logged to
     * console only, leaving the admin Bot Run panel empty for this step.
     */
    const logStep1Select = async (opts: {
      fieldKey: string;
      label: string;
      selector: string;
      resolved: AdminOrResult;
    }) => {
      const { resolved: r, fieldKey, label, selector } = opts;
      if (r.source === 'manual') {
        console.log(`  ⏸️  ${label} marked manual — handle in browser, press Enter...`);
        await botRunLog?.log({
          stepKey: 'registration', fieldKey, label,
          action: 'select', source: 'manual', value: null, success: true, selector,
        });
        await waitForEnter();
        return;
      }
      if (r.source === 'skip' || !r.value) {
        console.log(`  ⏭️  ${label}${sourceTag(r.source)}`);
        await botRunLog?.log({
          stepKey: 'registration', fieldKey, label,
          action: 'select', source: r.source, value: null, success: true, selector,
        });
        return;
      }
      const result = await selectDropdownByText(page, selector, r.value);
      if (result.ok) {
        console.log(`  ✅ ${label}: ${r.value}${sourceTag(r.source)}`);
        await botRunLog?.log({
          stepKey: 'registration', fieldKey, label,
          action: 'select', source: r.source, value: r.value, success: true, selector,
        });
      } else {
        console.log(`  ⚠️  ${label}: no <option> matched "${r.value}"`);
        await botRunLog?.log({
          stepKey: 'registration', fieldKey, label,
          action: 'select', source: r.source,
          value: JSON.stringify({ tried: r.value, options: result.options }),
          success: false,
          errorMsg: `No <option> matched "${r.value}" in ${selector}. ${result.options.length} option${result.options.length !== 1 ? 's' : ''} on the page — see value JSON.`,
          selector,
        });
      }
    };

    const logStep1Fill = async (opts: {
      fieldKey: string;
      label: string;
      selector: string;
      resolved: AdminOrResult;
      /** Optional override for the fill itself — e.g. a date picker that needs JS injection. */
      doFill?: (value: string) => Promise<void>;
    }) => {
      const { resolved: r, fieldKey, label, selector, doFill } = opts;
      if (r.source === 'manual') {
        console.log(`  ⏸️  ${label} marked manual — handle in browser, press Enter...`);
        await botRunLog?.log({
          stepKey: 'registration', fieldKey, label,
          action: 'fill', source: 'manual', value: null, success: true, selector,
        });
        await waitForEnter();
        return;
      }
      if (r.source === 'skip' || !r.value) {
        console.log(`  ⏭️  ${label}${sourceTag(r.source)}`);
        await botRunLog?.log({
          stepKey: 'registration', fieldKey, label,
          action: 'fill', source: r.source, value: null, success: true, selector,
        });
        return;
      }
      try {
        if (doFill) await doFill(r.value);
        else await page.fill(selector, r.value);
        console.log(`  ✅ ${label}: ${r.value}${sourceTag(r.source)}`);
        await botRunLog?.log({
          stepKey: 'registration', fieldKey, label,
          action: 'fill', source: r.source, value: r.value, success: true, selector,
        });
      } catch (err: any) {
        console.log(`  ⚠️  ${label}: fill failed`);
        await botRunLog?.log({
          stepKey: 'registration', fieldKey, label,
          action: 'fill', source: r.source, value: r.value, success: false,
          errorMsg: err?.message || 'page.fill threw', selector,
        });
      }
    };

    console.log('  ⏳ Opening the Indian eVisa site...');

    // Retry loop: if site takes >20s, reload up to 5 times
    const evisaUrl = 'https://indianvisaonline.gov.in/evisa/Registration';
    let loaded = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`  🔄 Attempt ${attempt}/5: loading ${evisaUrl}...`);
      try {
        await page.goto(evisaUrl, { timeout: 20000, waitUntil: 'domcontentloaded' });
        console.log(`  ✅ Navigated to page (DOM loaded)`);
        // Check that the expected page content is present
        try {
          // The main popup or "Apply Here for E-Visa" link should be detectable
          await page.waitForFunction(function() {
            return document.body && document.body.innerText.length > 100;
          }, { timeout: 10000 });
          loaded = true;
          break;
        } catch {
          console.log(`  ⚠️  Attempt ${attempt}: page loaded but content not ready`);
        }
      } catch (err: any) {
        console.log(`  ⚠️  Attempt ${attempt} timed out after 20s — retrying...`);
      }
      await delay(1000);
    }

    if (!loaded) {
      console.log('  ❌ Could not load site after 5 attempts. Please navigate manually and press Enter.');
      await waitForEnter();
    }

    // Wait for page to fully settle
    console.log('  ⏳ Waiting for page to fully load...');
    try {
      await page.waitForLoadState('load', { timeout: 30000 });
      console.log('  ✅ Page loaded');
    } catch { console.log('  ⚠️  Load event timeout — continuing anyway'); }
    try {
      await page.waitForLoadState('networkidle', { timeout: 20000 });
      console.log('  ✅ Network idle');
    } catch { console.log('  ⚠️  Network not idle — continuing anyway'); }
    await delay(2000);

    // Tab past the popup to "Apply Here for E-Visa", then Enter
    console.log('  ⏭️  Tabbing to "Apply Here for E-Visa" (34 tabs)...');
    for (let i = 0; i < 34; i++) {
      await page.keyboard.press('Tab');
      await delay(50);
    }
    await page.keyboard.press('Enter');
    console.log('  ✅ Pressed Enter on "Apply Here for E-Visa"');

    // Wait for Step 1 form to FULLY load
    console.log('  ⏳ Waiting for Step 1 form to load...');
    try {
      await page.waitForSelector('#nationality_id', { timeout: 120000, state: 'visible' });
      console.log('  ✅ Nationality dropdown found');
    } catch {
      console.log('  ⚠️  Could not detect Step 1 form — waiting extra time...');
      await delay(10000);
    }
    try {
      await page.waitForLoadState('networkidle', { timeout: 30000 });
    } catch {}
    await delay(2000);

    console.log('  ✅ Page ready — starting auto-fill...\n');

    // Discover ALL form field selectors
    console.log('  🔍 Discovering ALL form fields...\n');
    const selects = await page.$$eval('select', (els: any[]) => els.map(el => ({ id: el.id, name: el.name, class: el.className, options: el.options?.length })));
    const inputs = await page.$$eval('input', (els: any[]) => els.map(el => ({ id: el.id, name: el.name, type: el.type, placeholder: el.placeholder, class: el.className })));
    const textareas = await page.$$eval('textarea', (els: any[]) => els.map(el => ({ id: el.id, name: el.name })));
    console.log('  SELECTS:', JSON.stringify(selects, null, 2));
    console.log('\n  INPUTS:', JSON.stringify(inputs, null, 2));
    if (textareas.length) console.log('\n  TEXTAREAS:', JSON.stringify(textareas, null, 2));

    // ── REAL SELECTORS (discovered from the site) ──

    // Nationality — #nationality_id
    {
      const passportCountry = traveler.passportCountry || 'US';
      const defaultNationality = COUNTRY_MAP[passportCountry] || passportCountry;
      const r = adminOr('registration', 'nationality', botOverrides, traveler, order, defaultNationality);
      await logStep1Select({
        fieldKey: 'nationality', label: 'Nationality',
        selector: '#nationality_id', resolved: r,
      });
    }
    await delay(2000);

    // Tab twice + Enter to hit OK on nationality popup
    console.log('  ⏳ Waiting for nationality popup...');
    await delay(2000);
    await page.keyboard.press('Tab');
    await delay(100);
    await page.keyboard.press('Tab');
    await delay(100);
    await page.keyboard.press('Tab');
    await delay(100);
    await page.keyboard.press('Enter');
    console.log('  ✅ Clicked OK on nationality popup');
    await delay(1000);

    // Passport Type — #ppt_type_id
    {
      const r = adminOr('registration', 'passportType', botOverrides, traveler, order, 'ORDINARY');
      await logStep1Select({
        fieldKey: 'passportType', label: 'Passport Type',
        selector: '#ppt_type_id', resolved: r,
      });
    }
    await delay(500);

    // Port of Arrival — #missioncode_id
    {
      const arrivalPoint = traveler.arrivalPoint || 'Delhi (Airport)';
      const defaultPort = arrivalPoint.split(' (')[0].toUpperCase();
      const r = adminOr('registration', 'portOfArrival', botOverrides, traveler, order, defaultPort);
      await logStep1Select({
        fieldKey: 'portOfArrival', label: 'Port of Arrival',
        selector: '#missioncode_id', resolved: r,
      });
    }
    await delay(500);

    // Date of Birth — #dob_id (datepicker — bypass widget by setting el.value directly)
    {
      const dob = parseDateString(traveler.dob);
      const defaultDob = dob ? `${dob.day}/${dob.month}/${dob.year}` : undefined;
      const r = adminOr('registration', 'dob', botOverrides, traveler, order, defaultDob);
      await logStep1Fill({
        fieldKey: 'dob', label: 'Date of Birth',
        selector: '#dob_id', resolved: r,
        doFill: async (val) => {
          await page.evaluate((v: string) => {
            const el = document.getElementById('dob_id') as HTMLInputElement;
            if (el) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
          }, val);
        },
      });
    }
    await delay(500);

    // Email — #email_id
    {
      const r = adminOr('registration', 'email', botOverrides, traveler, order, traveler.email);
      await logStep1Fill({
        fieldKey: 'email', label: 'Email',
        selector: '#email_id', resolved: r,
      });
    }
    await delay(300);

    // Re-enter Email — #email_re_id
    {
      const r = adminOr('registration', 'emailRepeat', botOverrides, traveler, order, traveler.email);
      await logStep1Fill({
        fieldKey: 'emailRepeat', label: 'Re-enter Email',
        selector: '#email_re_id', resolved: r,
      });
    }
    await delay(500);

    // Visiting India for — dropdown with full option strings
    // Match must contain ALL phrases in order to select (most specific match)
    const VISA_MATCH: Record<string, { must: string[]; label: string }> = {
      'TOURIST_30':  { must: ['E-TOURIST', '30 DAYS', 'RECREATION'], label: 'e-Tourist 30 day - Recreation' },
      'TOURIST_1Y':  { must: ['E-TOURIST', '1 YEAR',  'RECREATION'], label: 'e-Tourist 1 year - Recreation' },
      'TOURIST_5Y':  { must: ['E-TOURIST', '5 YEAR',  'RECREATION'], label: 'e-Tourist 5 year - Recreation' },
      'BUSINESS_1Y': { must: ['E-BUSINESS', 'BUSINESS MEETING'],     label: 'e-Business - Meetings' },
      'MEDICAL_60':  { must: ['E-MEDICAL', 'SHORT TERM'],            label: 'e-Medical - Short Term' },
      'tourist-30':  { must: ['E-TOURIST', '30 DAYS', 'RECREATION'], label: 'e-Tourist 30 day - Recreation' },
      'tourist-1y':  { must: ['E-TOURIST', '1 YEAR',  'RECREATION'], label: 'e-Tourist 1 year - Recreation' },
      'tourist-5y':  { must: ['E-TOURIST', '5 YEAR',  'RECREATION'], label: 'e-Tourist 5 year - Recreation' },
      'business-1y': { must: ['E-BUSINESS', 'BUSINESS MEETING'],     label: 'e-Business - Meetings' },
      'medical-60':  { must: ['E-MEDICAL', 'SHORT TERM'],            label: 'e-Medical - Short Term' },
    };
    let visaMatch = VISA_MATCH[order.visaType] || { must: ['E-TOURIST', 'RECREATION'], label: 'e-Tourist (default)' };

    // For business visas, the gov form's Visa Purpose dropdown has 10
    // distinct sub-purpose options ("TO SET UP INDUSTRIAL/BUSINESS VENTURE",
    // "TO ATTEND TECHNICAL/BUSINESS MEETINGS", etc.). The customer picks one
    // at apply Step 1 — here we map their choice to the phrases that
    // uniquely identify the matching <option> in the gov dropdown.
    //
    // Falls back to "BUSINESS MEETINGS" if the customer didn't pick a
    // sub-purpose (legacy orders) — same as the previous default.
    const BUSINESS_PURPOSE_MAP: Record<string, string[]> = {
      'Set Up Industrial/Business Venture':       ['SET UP INDUSTRIAL'],
      'Sale/Purchase/Trade':                      ['SALE', 'PURCHASE'],
      'Attend Technical/Business Meetings':       ['ATTEND TECHNICAL', 'BUSINESS MEETINGS'],
      'Recruit Manpower':                         ['RECRUIT MANPOWER'],
      'Participation in Exhibitions/Trade Fairs': ['EXHIBITIONS'],
      'Expert/Specialist for Ongoing Project':    ['EXPERT'],
      'Conducting Tours':                         ['CONDUCTING TOUR'],
      'Deliver Lectures (GIAN)':                  ['LECTURE', 'GIAN'],
      'Sports Related Activity':                  ['SPORTS'],
      'Join Vessel':                              ['JOIN', 'VESSEL'],
    };
    if (order.visaType === 'BUSINESS_1Y' && traveler.purposeOfVisit) {
      const subMust = BUSINESS_PURPOSE_MAP[traveler.purposeOfVisit];
      if (subMust) {
        // Replace the default 'BUSINESS MEETING' phrase set with the
        // customer-specific one. Prefix with E-BUSINESS to keep the
        // visa-class scope so we don't accidentally match a tourist option.
        visaMatch = { must: ['E-BUSINESS', ...subMust], label: `e-Business — ${traveler.purposeOfVisit}` };
        console.log(`  🎯 Business sub-purpose: ${traveler.purposeOfVisit} → must contain ${visaMatch.must.join(' + ')}`);
      } else {
        console.log(`  ⚠️  Unknown business sub-purpose "${traveler.purposeOfVisit}" — falling back to default Business Meetings`);
      }
    }

    // Visa Purpose — special phrase-matching algorithm by default.
    // Admin override: user gives a LITERAL option text and we pick the matching <option> by exact/partial text.
    {
      const visaOverride = adminOr('registration', 'visaPurpose', botOverrides, traveler, order, undefined);
      if (visaOverride.source === 'manual') {
        console.log('  ⏸️  Visa Purpose marked manual — select in browser, press Enter...');
        await waitForEnter();
      } else if (visaOverride.source === 'admin' && visaOverride.value) {
        // Admin told us the exact option text (or a partial match). Select the first option whose text contains it.
        const picked = await page.evaluate(function(args) {
          var selects = document.querySelectorAll('select');
          for (var i = 0; i < selects.length; i++) {
            var sel = selects[i] as HTMLSelectElement;
            if (sel.id.toLowerCase().indexOf('visit') < 0 && sel.id.toLowerCase().indexOf('purpose') < 0 && sel.id.toLowerCase().indexOf('visa') < 0) continue;
            for (var j = 0; j < sel.options.length; j++) {
              if (sel.options[j].text.toUpperCase().indexOf(args.needle) >= 0) {
                sel.value = sel.options[j].value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                return { id: sel.id, text: sel.options[j].text };
              }
            }
          }
          return null;
        }, { needle: visaOverride.value.toUpperCase() });
        if (picked) console.log(`  ✅ Visiting India for: ${picked.text} (admin override)`);
        else console.log(`  ⚠️  Admin override "${visaOverride.value}" did not match any visa-purpose option`);
      } else if (visaOverride.source === 'skip') {
        console.log('  ⏭️  Visa Purpose (skipped by admin)');
      } else {
        // Default phrase-match algorithm
        const result = await page.evaluate(function(args) {
          var selects = document.querySelectorAll('select');
          for (var i = 0; i < selects.length; i++) {
            var sel = selects[i] as HTMLSelectElement;
            if (sel.id.toLowerCase().indexOf('visit') < 0 && sel.id.toLowerCase().indexOf('purpose') < 0 && sel.id.toLowerCase().indexOf('visa') < 0) continue;
            for (var j = 0; j < sel.options.length; j++) {
              var text = sel.options[j].text.toUpperCase();
              var allMatch = true;
              for (var k = 0; k < args.must.length; k++) {
                if (text.indexOf(args.must[k]) < 0) { allMatch = false; break; }
              }
              if (allMatch) {
                sel.value = sel.options[j].value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                return { id: sel.id, text: sel.options[j].text };
              }
            }
          }
          return null;
        }, { must: visaMatch.must });

        if (result) {
          console.log(`  ✅ Visiting India for: ${result.text}`);
        } else {
          console.log(`  ⚠️  Could not find option matching ${visaMatch.must.join(' + ')}`);
          const available = await page.evaluate(function() {
            var selects = document.querySelectorAll('select');
            for (var i = 0; i < selects.length; i++) {
              var sel = selects[i] as HTMLSelectElement;
              if (sel.id.toLowerCase().indexOf('visit') >= 0 || sel.id.toLowerCase().indexOf('purpose') >= 0) {
                return { id: sel.id, count: sel.options.length };
              }
            }
            return null;
          });
          console.log(`  📋 Purpose dropdown: ${JSON.stringify(available)}`);
        }
      }
    }
    await delay(500);

    // Expected Date of Arrival — #jouryney_id (note the gov-side typo: "jouryney")
    {
      const defaultArrival = traveler.arrivalDate ? formatDateForForm(traveler.arrivalDate) : undefined;
      const r = adminOr('registration', 'arrivalDate', botOverrides, traveler, order, defaultArrival);
      if (r.source === 'manual') {
        console.log('  ⏸️  Arrival Date marked manual — enter in browser, press Enter...');
        await waitForEnter();
      } else if (r.value) {
        await page.evaluate((val: string) => {
          const el = document.getElementById('jouryney_id') as HTMLInputElement;
          if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
        }, r.value);
        console.log(`  ✅ Expected Arrival: ${r.value}${sourceTag(r.source)}`);
      } else {
        console.log(`  ⏭️  Expected Arrival${sourceTag(r.source)}`);
      }
    }
    await delay(500);

    // Declaration checkbox — admin can override to "manual" or "skip"; other source types ignored
    {
      const r = adminOr('registration', 'declarationCheck', botOverrides, traveler, order, 'true');
      if (r.source === 'manual') {
        console.log('  ⏸️  Declaration marked manual — check it in browser, press Enter...');
        await waitForEnter();
      } else if (r.source === 'skip') {
        console.log('  ⏭️  Declaration checkbox skipped by admin');
      } else {
        try {
          await page.click('#read_instructions_check');
          console.log(`  ✅ Declaration checkbox checked${sourceTag(r.source)}`);
        } catch {
          console.log('  ⚠️  Could not check declaration — please check it manually');
        }
      }
    }

    // Check declaration checkbox — scroll into view THEN get fresh coordinates
    console.log('  🔍 Checking declaration checkbox...');
    try {
      // Scroll the checkbox into view first
      await page.evaluate(() => {
        const cb = document.getElementById('read_instructions_check');
        if (cb) cb.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      await delay(1000);

      // Now get fresh coordinates after scroll
      const cbBox = await page.evaluate(() => {
        const cb = document.getElementById('read_instructions_check');
        if (cb) {
          const rect = cb.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
        return null;
      });
      if (cbBox) {
        await page.mouse.click(cbBox.x, cbBox.y);
        console.log(`  ✅ Declaration checkbox clicked at (${cbBox.x}, ${cbBox.y})`);
        await delay(300);
        // Verify it's checked
        const isChecked = await page.evaluate(() => {
          const cb = document.getElementById('read_instructions_check') as HTMLInputElement;
          return cb?.checked;
        });
        if (!isChecked) {
          console.log('  ⚠️  Click didn\'t register — trying again...');
          await page.mouse.click(cbBox.x, cbBox.y);
          await delay(300);
        }
      } else {
        console.log('  ⚠️  Could not find checkbox — please check it manually');
      }
    } catch {
      console.log('  ⚠️  Could not check declaration — please check it manually');
    }
    await delay(300);

    // CAPTCHA — auto-focus the input, user types + clicks Continue themselves
    console.log('\n  🔒 CAPTCHA — auto-focusing input...');
    try {
      await page.focus('#captcha');
      console.log('  ✅ CAPTCHA field focused — type the CAPTCHA in the browser');
    } catch {
      console.log('  ⚠️  Could not focus CAPTCHA field');
    }
    console.log('  ⏸️  Type the CAPTCHA and click "Continue" in the browser — bot will auto-detect.\n');

    // Save current URL and wait for it to change (user clicks Continue in browser)
    const initialUrl = page.url();
    const startTime = Date.now();
    const maxWait = 300000; // 5 minutes

    while (Date.now() - startTime < maxWait) {
      await delay(1000);
      // Check 1: URL changed (page navigated)
      if (page.url() !== initialUrl) {
        console.log('  ✅ Page navigated — Continue was clicked');
        break;
      }
      // Check 2: Captcha field is gone (page rendered differently)
      const captchaStillExists = await page.$('#captcha').catch(() => null);
      if (!captchaStillExists) {
        console.log('  ✅ CAPTCHA field gone — Continue was clicked');
        break;
      }
      // Check 3: A popup/dialog is now visible
      const popupVisible = await page.evaluate(function() {
        var dialogs = document.querySelectorAll('.ui-dialog, [role="dialog"], .modal, .popup');
        for (var i = 0; i < dialogs.length; i++) {
          var el = dialogs[i] as HTMLElement;
          if (el.offsetParent !== null) return true;
        }
        return false;
      }).catch(() => false);
      if (popupVisible) {
        console.log('  ✅ Popup detected — Continue was clicked');
        break;
      }
    }
    await delay(2000);

    // First popup after submit — Tab 2 + Enter
    console.log('  ⏳ Dismissing first popup...');
    await page.keyboard.press('Tab');
    await delay(100);
    await page.keyboard.press('Tab');
    await delay(100);
    await page.keyboard.press('Enter');
    console.log('  ✅ Dismissed first popup');
    await delay(3000);

    // Second popup (document requirements) — Tab 2 + Enter
    console.log('  ⏳ Dismissing second popup...');
    await page.keyboard.press('Tab');
    await delay(100);
    await page.keyboard.press('Tab');
    await delay(100);
    await page.keyboard.press('Enter');
    console.log('  ✅ Dismissed second popup');
    await delay(5000);

    // ══════════════════════════════════════════════════════════
    // STEP 2 — APPLICANT DETAILS
    // ══════════════════════════════════════════════════════════
    while (true) { // redo loop for Step 2
    console.log('\n📝 STEP 2 — Applicant Details');
    console.log('────────────────────────────────────────────\n');

    // Wait for Step 2 to fully load — use a Step 2-specific field
    console.log('  ⏳ Waiting for Step 2 to load...');
    try {
      // surname field is unique to Step 2
      await page.waitForSelector('#surname_id, [name="appl.surname"]', { timeout: 120000, state: 'visible' });
      console.log('  ✅ Step 2 form detected');
    } catch {
      console.log('  ⚠️  Could not detect Step 2 — waiting extra time...');
      await delay(10000);
    }
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {}
    await delay(2000);

    // Discover Step 2 fields
    const step2Selects = await page.$$eval('select', (els: any[]) => els.map(el => ({ id: el.id, name: el.name, options: el.options?.length })));
    const step2Inputs = await page.$$eval('input, textarea', (els: any[]) => els.map(el => ({ id: el.id, name: el.name, type: el.type, placeholder: el.placeholder })));
    console.log('  📋 Step 2 SELECTS:', JSON.stringify(step2Selects, null, 2));
    console.log('  📋 Step 2 INPUTS:', JSON.stringify(step2Inputs.filter((i: any) => i.type !== 'hidden'), null, 2));

    // Use the actual field IDs/names discovered from the form
    // The site uses input fields with names and some selects
    // Let's find all fields dynamically and fill by index/position

    // Get all text inputs and selects in order
    const allFields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"], select, input[type="radio"]'));
      return inputs.map((el: any, i: number) => ({
        index: i,
        tag: el.tagName,
        type: el.type,
        id: el.id,
        name: el.name,
        value: el.value,
      }));
    });
    console.log('  📋 All form fields:', JSON.stringify(allFields.slice(0, 30), null, 2));

    // Fill Surname and Given Name (these worked already)
    const textInputs = await page.$$('input[type="text"]');
    const step2SelectEls = await page.$$('select');

    // Get only VISIBLE text inputs and selects
    const visibleTextInputs = await page.$$('input[type="text"]:visible');
    const visibleSelects = await page.$$('select:visible');

    // If :visible doesn't work with Playwright, filter manually
    let visInputs = visibleTextInputs;
    let visSelects = visibleSelects;
    if (visInputs.length === 0) {
      // Fallback: get all and filter by visibility
      const allTextInputs = await page.$$('input[type="text"]');
      visInputs = [];
      for (const inp of allTextInputs) {
        if (await inp.isVisible()) visInputs.push(inp);
      }
    }
    if (visSelects.length === 0) {
      const allSelects = await page.$$('select');
      visSelects = [];
      for (const sel of allSelects) {
        if (await sel.isVisible()) visSelects.push(sel);
      }
    }

    console.log(`  📋 Found ${visInputs.length} visible text inputs, ${visSelects.length} visible selects`);

    // Log what we found
    for (let i = 0; i < visInputs.length; i++) {
      const id = await visInputs[i].getAttribute('id') || '';
      const name = await visInputs[i].getAttribute('name') || '';
      console.log(`    Input[${i}]: id="${id}" name="${name}"`);
    }
    for (let i = 0; i < visSelects.length; i++) {
      const id = await visSelects[i].getAttribute('id') || '';
      const name = await visSelects[i].getAttribute('name') || '';
      console.log(`    Select[${i}]: id="${id}" name="${name}"`);
    }

    // labelToFieldKey: stable bot_run_entries.fieldKey derived from a label
    // (e.g. "City of Birth" → "city_of_birth"). Keeps the audit trail readable
    // and lets us re-run grouped queries by field across runs.
    const labelToFieldKey = (label: string) =>
      label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    // Fill fields by position (only visible ones). Every attempt — pass or
    // fail — writes a bot_run_entries row so admins can see Step 2 in the
    // Bot Run History panel without watching the bot server's stdout.
    const fillInput = async (idx: number, value: string, label: string) => {
      if (idx >= visInputs.length || !value) return;
      const id = (await visInputs[idx].getAttribute('id')) || `input[${idx}]`;
      try {
        await visInputs[idx].fill(value);
        console.log(`  ✅ ${label}`);
        await botRunLog?.log({
          stepKey: 'applicant', fieldKey: labelToFieldKey(label), label,
          action: 'fill', source: 'default', value, success: true, selector: `#${id}`,
        });
      } catch (e: any) {
        console.log(`  ⚠️  ${label} failed`);
        await botRunLog?.log({
          stepKey: 'applicant', fieldKey: labelToFieldKey(label), label,
          action: 'fill', source: 'default', value, success: false,
          errorMsg: e?.message || 'fill threw', selector: `#${id}`,
        });
      }
    };

    const fillSelect = async (idx: number, value: string, label: string) => {
      if (idx < visSelects.length && value) {
        try {
          const id = await visSelects[idx].getAttribute('id');
          if (!id) { console.log(`  ⚠️  ${label}: no id on select#${idx}`); return; }
          const result = await selectDropdownByText(page, `#${id}`, value);
          if (result.ok) {
            console.log(`  ✅ ${label}`);
            await botRunLog?.log({
              stepKey: 'applicant', fieldKey: labelToFieldKey(label), label,
              action: 'select', source: 'default', value, success: true, selector: `#${id}`,
            });
          } else {
            // Surface the available options into the admin Bot Run panel so
            // we can update mappings without re-running the bot to read stdout.
            console.log(`  ⚠️  ${label} (no matching option for "${value}")`);
            const fieldKey = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            await botRunLog?.log({
              stepKey:  'applicant',
              fieldKey,
              label,
              action:   'select',
              source:   'default',
              value:    JSON.stringify({ tried: value, options: result.options }),
              success:  false,
              errorMsg: `No <option> matched "${value}" in #${id}. ${result.options.length} option${result.options.length !== 1 ? 's' : ''} on the page.`,
              selector: `#${id}`,
            });
          }
        } catch { console.log(`  ⚠️  ${label} failed`); }
      }
    };

    // Surname — Input[0]
    await fillInput(0, traveler.lastName?.toUpperCase() || '', 'Surname');
    // Given Name — Input[1]
    await fillInput(1, traveler.firstName || '', 'Given Name');
    await delay(300);

    // Gender — Select[0]
    if (traveler.gender) {
      const genderVal = traveler.gender === 'Male' ? 'MALE' : traveler.gender === 'Female' ? 'FEMALE' : 'TRANSGENDER';
      await fillSelect(0, genderVal, 'Gender');
    }
    await delay(300);

    // Town/City of birth — Input[2]
    await fillInput(2, traveler.cityOfBirth || '', 'City of Birth');
    await delay(300);

    // Country/Region of birth — Select[1]
    if (traveler.countryOfBirth) {
      const cobMapped = COUNTRY_MAP[traveler.countryOfBirth] || traveler.countryOfBirth.toUpperCase();
      await fillSelect(1, cobMapped, 'Country of Birth');
    }
    await delay(300);

    // Citizenship/National ID — Input[3]
    await fillInput(3, traveler.citizenshipId || 'NA', 'Citizenship ID');
    await delay(300);

    // Religion — Select[2]. Canonical gov-site values come from the customer
    // dropdown (now using INDIA_RELIGIONS); normaliseReligion handles legacy
    // free-text orders like "Christian" / "Hindu" that predated the dropdown.
    if (traveler.religion) {
      const rValue = normaliseReligion(traveler.religion);
      if (rValue) await fillSelect(2, rValue, 'Religion');
    }
    await delay(300);

    // Visible marks — Input[4]
    await fillInput(4, traveler.visibleMarks || 'NONE', 'Visible Marks');
    await delay(300);

    // Educational Qualification — Select[3]
    if (traveler.educationalQualification) await fillSelect(3, traveler.educationalQualification.toUpperCase(), 'Education');
    await delay(300);

    // Qualification from University — Input[5]
    const eduMap: Record<string, string> = {
      'Graduate': 'DEGREE', 'Post Graduate': 'POST GRADUATE DEGREE', 'Doctorate': 'DOCTORATE',
      'Professional': 'PROFESSIONAL DEGREE', 'Matriculation': 'MATRICULATION', 'Higher Secondary': 'HIGHER SECONDARY',
    };
    const uniQual = eduMap[traveler.educationalQualification || ''] || '';
    await fillInput(5, uniQual, 'University Qualification');

    // Nationality acquired by — Select[4]
    if (traveler.nationalityByBirth) {
      const natVal = traveler.nationalityByBirth === 'birth' ? 'BY BIRTH' : 'NATURALIZATION';
      await fillSelect(4, natVal, 'Nationality Acquired');
    }
    await delay(300);

    // Discover all radio buttons on this page
    const allRadios = await page.$$eval('input[type="radio"]', (els: any[]) =>
      els.map(el => ({ name: el.name, value: el.value, id: el.id, checked: el.checked }))
    );
    console.log('  📋 All radios:', JSON.stringify(allRadios, null, 2));

    // Lived 2+ years — radio by name (IDs flip between site versions). Admin can override Yes/No/manual/skip.
    console.log('  🔍 Setting Lived 2+ years...');
    {
      const r = adminOr('applicant', 'livedTwoYears', botOverrides, traveler, order, 'YES');
      if (r.source === 'manual') {
        console.log('  ⏸️  Lived 2+ years marked manual — pick in browser, press Enter...');
        await botRunLog?.log({
          stepKey: 'applicant', fieldKey: 'livedTwoYears', label: 'Lived 2+ years',
          action: 'click', source: 'manual', value: null, success: true,
          selector: 'input[name="appl.refer_flag"]',
        });
        await waitForEnter();
      } else if (r.source === 'skip') {
        console.log('  ⏭️  Lived 2+ years skipped by admin');
        await botRunLog?.log({
          stepKey: 'applicant', fieldKey: 'livedTwoYears', label: 'Lived 2+ years',
          action: 'click', source: 'skip', value: null, success: true,
          selector: 'input[name="appl.refer_flag"]',
        });
      } else {
        const pickYes = /^y/i.test(String(r.value || 'YES'));
        // IMPORTANT: gov form's value attributes are INVERTED from the visible
        // labels — value="N" sits next to the visible "Yes" text and value="Y"
        // sits next to the visible "No" text. We can't trust the value to
        // mean what it suggests. Resolve the right radio by reading the text
        // adjacent to each input and matching the *visible* label.
        const wantedLabel = pickYes ? 'YES' : 'NO';
        const targetId = await page.evaluate((label: string) => {
          const radios = Array.from(document.querySelectorAll('input[name="appl.refer_flag"]')) as HTMLInputElement[];
          for (const radio of radios) {
            // Text immediately after the input (most common form pattern)
            let next: Node | null = radio.nextSibling;
            let neighborText = '';
            while (next && neighborText.length < 40) {
              neighborText += (next.textContent || '');
              next = next.nextSibling;
            }
            // Also check parent text (in case the input is wrapped in a label)
            const parentText = (radio.parentElement?.textContent || '').replace(/\s+/g, ' ').trim();
            const probe = (neighborText + ' ' + parentText).trim().toUpperCase();
            // Use word-boundary match so "YES" doesn't match "yesterday" etc.
            if (new RegExp(`\\b${label}\\b`).test(probe)) return radio.id;
          }
          return null;
        }, wantedLabel);

        // Capture the question text near the radio so the audit trail proves
        // we're answering the right question.
        let questionText = '';
        try {
          questionText = await page.evaluate(() => {
            const radio = document.querySelector('input[name="appl.refer_flag"]') as HTMLInputElement | null;
            if (!radio) return '';
            // Walk up to the nearest <tr>/<div>/<fieldset> and grab its text.
            let el: HTMLElement | null = radio;
            for (let i = 0; i < 6 && el; i++) {
              if (el.tagName === 'TR' || el.tagName === 'FIELDSET' || (el.tagName === 'DIV' && el.children.length > 1)) {
                return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
              }
              el = el.parentElement;
            }
            return '';
          });
        } catch {}

        // The gov form's radio is finicky — earlier attempts (mouse coords,
        // .check, force-click, JS click) all reported success but submit time
        // showed both radios empty. Suspicion: a JS handler on the prior
        // <select> change re-renders the radios, wiping the click. So we
        // retry up to 3 times, re-querying the element each pass, and verify
        // via the input's own .checked property (not a fresh document query).
        // tryClick — clicks by ID resolved from the visible-label match above.
        // Re-queries each pass in case JS re-rendered the radios since the
        // text-match (the prior <select> change can wipe state).
        const tryClick = async (): Promise<{ clicked: boolean; checked: boolean }> => {
          if (!targetId) return { clicked: false, checked: false };
          const targetRadio = await page.$(`#${targetId}`);
          if (!targetRadio) return { clicked: false, checked: false };
          await targetRadio.scrollIntoViewIfNeeded().catch(() => {});
          await delay(150);

          // Tier 1 — Playwright .check() honours invisibility/label affordances
          try { await targetRadio.check({ timeout: 1500 }); }
          catch {
            // Tier 2 — force click the input itself
            try { await targetRadio.click({ force: true, timeout: 1500 }); }
            catch {
              // Tier 3 — JS click bypassing Playwright entirely
              await targetRadio.evaluate(el => (el as HTMLInputElement).click()).catch(() => {});
            }
          }
          await delay(400);
          const checked = await targetRadio.evaluate(el => (el as HTMLInputElement).checked).catch(() => false);
          return { clicked: true, checked };
        };

        let attempts = 0;
        let landed = false;
        while (attempts < 3 && !landed) {
          attempts++;
          const r2 = await tryClick();
          if (!r2.clicked) {
            console.log(`  ⚠️  Could not find ${pickYes ? 'Yes' : 'No'} radio for Lived 2+ years (attempt ${attempts})`);
            break;
          }
          if (r2.checked) { landed = true; break; }
          console.log(`  ↻ Lived 2+ years: click landed but radio still unchecked — retrying (attempt ${attempts}/3)`);
          await delay(500);
        }
        await delay(500);

        // Verify which radio is checked + log to the audit trail. Dump the
        // full radio group state on failure so we can spot duplicates or
        // mid-form re-renders.
        const radioState = await page.evaluate(() => {
          const radios = Array.from(document.querySelectorAll('input[name="appl.refer_flag"]')) as HTMLInputElement[];
          return radios.map(r => ({
            value: r.value, id: r.id, checked: r.checked,
            visible: !!r.offsetParent, disabled: r.disabled,
          }));
        });
        const checkedRadio = radioState.find(r => r.checked);
        const referVal = checkedRadio?.value ?? 'none';
        // Verify by checking that the radio whose ID we resolved (by label
        // text) is the one that ended up checked. We do NOT verify against
        // value attributes — they're inverted on this gov form.
        const ok = !!checkedRadio && targetId !== null && checkedRadio.id === targetId;

        await botRunLog?.log({
          stepKey: 'applicant', fieldKey: 'livedTwoYears', label: 'Lived 2+ years',
          action: 'click', source: r.source,
          value: JSON.stringify({
            wanted: pickYes ? 'YES' : 'NO',
            // What ended up actually checked, both visually-resolved id + value
            checkedId: checkedRadio?.id ?? null,
            checkedValue: referVal,
            // The id we picked by reading visible label text adjacent to each radio
            resolvedTargetId: targetId,
            attempts,
            radios: radioState,
            question: questionText,
          }),
          success: ok,
          errorMsg: ok ? undefined : (
            !targetId
              ? `Could not find a radio whose adjacent text matches "${pickYes ? 'YES' : 'NO'}".`
              : `Resolved target id=${targetId} for "${pickYes ? 'YES' : 'NO'}" but checked radio is id=${checkedRadio?.id ?? 'none'}.`
          ),
          selector: 'input[name="appl.refer_flag"]',
        });

        if (ok) {
          console.log(`  ✅ Lived 2+ years: ${pickYes ? 'Yes' : 'No'} (value="${referVal}")${sourceTag(r.source)}`);
        } else {
          console.log(`  ⚠️  Lived 2+ years: ${referVal} — FLAGGED for manual fix`);
          botFlags.push(`🔴 "${questionText || 'Have you lived for at least two years in the country where you are applying visa?'}" — Bot could not select ${pickYes ? 'Yes' : 'No'}. Please set this radio manually.`);
        }
      }
    }
    await delay(300);

    // ── Passport Details ──
    console.log('\n  📕 Passport Details');

    // Re-scan visible inputs since page may have changed
    const passInputs: any[] = [];
    const allInputsAgain = await page.$$('input[type="text"]');
    for (const inp of allInputsAgain) {
      if (await inp.isVisible()) passInputs.push(inp);
    }
    console.log(`  📋 Found ${passInputs.length} visible text inputs total`);

    // Log passport section fields
    for (let i = 6; i < Math.min(passInputs.length, 15); i++) {
      const id = await passInputs[i]?.getAttribute('id') || '';
      const name = await passInputs[i]?.getAttribute('name') || '';
      console.log(`    Input[${i}]: id="${id}" name="${name}"`);
    }

    // Passport Number — #passport_no (admin override supported)
    await fillByIdOr('applicant', 'passportNumber', 'passport_no', 'Passport Number', traveler.passportNumber);

    // Place of Issue — #passport_issue_place (admin override supported)
    await fillByIdOr('applicant', 'passportPlaceOfIssue', 'passport_issue_place', 'Place of Issue', traveler.passportPlaceOfIssue);

    // Date of Issue — #passport_issue_date (datepicker — custom execute via JS)
    await withBotField({
      step: 'applicant', field: 'passportIssued', label: 'Date of Issue',
      overrides: botOverrides, traveler, order,
      defaultValue: traveler.passportIssued ? formatDateForForm(traveler.passportIssued) : undefined,
      execute: async (val: string) => {
        await page.evaluate((v: string) => {
          const el = document.getElementById('passport_issue_date') as HTMLInputElement;
          if (el) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
        }, val);
      },
    });

    // Date of Expiry — #passport_expiry_date (datepicker)
    await withBotField({
      step: 'applicant', field: 'passportExpiry', label: 'Date of Expiry',
      overrides: botOverrides, traveler, order,
      defaultValue: traveler.passportExpiry ? formatDateForForm(traveler.passportExpiry) : undefined,
      execute: async (val: string) => {
        await page.evaluate((v: string) => {
          const el = document.getElementById('passport_expiry_date') as HTMLInputElement;
          if (el) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
        }, val);
      },
    });
    await delay(300);

    // Other passport/IC held — appl.oth_ppt radio (admin override supported: Yes/No/manual/skip)
    let hasOtherPP = false;
    {
      const r = adminOr('applicant', 'otherPassportFlag', botOverrides, traveler, order, traveler.hasOtherPassport === 'yes' ? 'YES' : 'NO');
      if (r.source === 'manual') {
        console.log('  ⏸️  Other Passport flag marked manual — pick Yes/No in browser, press Enter...');
        await waitForEnter();
        // We can't know if user picked YES; detect by looking for #other_ppt_no visibility
        hasOtherPP = !!(await page.$('#other_ppt_no'));
      } else if (r.source === 'skip') {
        console.log('  ⏭️  Other Passport flag skipped by admin');
      } else {
        hasOtherPP = /^y/i.test(String(r.value || 'NO'));
        const otherPPVal = hasOtherPP ? 'YES' : 'NO';
        try {
          await page.click(`input[name="appl.oth_ppt"][value="${otherPPVal}"]`);
          console.log(`  ✅ Other Passport: ${hasOtherPP ? 'Yes' : 'No'}${sourceTag(r.source)}`);
        } catch {
          console.log('  ⚠️  Could not click Other Passport radio');
        }
      }
    }

    if (hasOtherPP) {
      await delay(1000);

      // Country of Issue for other passport — find the select that appeared
      // (still position-based — dynamically appearing selects don't have stable IDs in our catalog)
      const otherCountry = COUNTRY_MAP[traveler.passportCountryOfIssue || traveler.passportCountry || ''] || (traveler.passportCountryOfIssue || '').toUpperCase();
      if (otherCountry) {
        const newSelects: any[] = [];
        const allSels = await page.$$('select');
        for (const s of allSels) { if (await s.isVisible()) newSelects.push(s); }
        if (newSelects.length >= 7) {
          const othCountrySel = newSelects[newSelects.length - 2];
          const othNatSel = newSelects[newSelects.length - 1];
          const othCountryId = await othCountrySel.getAttribute('id') || '';
          const othNatId = await othNatSel.getAttribute('id') || '';
          if (othCountryId) { await selectDropdownByText(page, `#${othCountryId}`, otherCountry); console.log('  ✅ Other PP Country of Issue'); }
          if (othNatId) { await selectDropdownByText(page, `#${othNatId}`, otherCountry); console.log('  ✅ Other PP Nationality Therein'); }
        }
      }

      // Other Passport Number — #other_ppt_no (admin override supported)
      await fillByIdOr('applicant', 'otherPassportNumber', 'other_ppt_no', 'Other Passport Number', traveler.otherPassportNumber);

      // Other Passport Date of Issue — datepicker (admin override supported)
      await withBotField({
        step: 'applicant', field: 'otherPassportDateOfIssue', label: 'Other Passport Date of Issue',
        overrides: botOverrides, traveler, order,
        defaultValue: traveler.otherPassportDateOfIssue ? formatDateForForm(traveler.otherPassportDateOfIssue) : undefined,
        execute: async (val: string) => {
          await page.evaluate((v: string) => {
            const el = document.getElementById('other_ppt_issue_date') as HTMLInputElement;
            if (el) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
          }, val);
        },
      });

      // Other Passport Place of Issue — #other_ppt_issue_place (admin override supported)
      await fillByIdOr('applicant', 'otherPassportPlaceOfIssue', 'other_ppt_issue_place', 'Other Passport Place of Issue', traveler.otherPassportPlaceOfIssue);
    }

    // Country of Issue — only fill if not already handled by "other passport" section
    // Skip this if other passport is No (the select at index 5 might be hidden/wrong)
    // The main passport country of issue should already be set from Step 1

    break;
    } // end Step 2 redo loop

    // Auto-submit Step 2 via Tab + Enter
    console.log('  ⏸️  Clicking Save and Continue...');
    await delay(1000);
    await page.keyboard.press('Tab');
    await delay(100);
    await page.keyboard.press('Enter');
    console.log('  ✅ Submitted Step 2');
    await delay(5000);

    // ── Helper functions for label-based filling (used in Steps 3-5) ──
    const fillByLabel = async (labelText: string, value: string | undefined, label: string) => {
      if (!value) return;
      try {
        await page.evaluate((args: { labelText: string; value: string }) => {
          const tds = Array.from(document.querySelectorAll('td, th, label'));
          for (const td of tds) {
            if (td.textContent?.trim().toLowerCase().includes(args.labelText.toLowerCase())) {
              const row = td.closest('tr') || td.parentElement;
              if (row) {
                const input = row.querySelector('input[type="text"]') as HTMLInputElement;
                if (input) { input.value = args.value; input.dispatchEvent(new Event('change', { bubbles: true })); return; }
              }
            }
          }
        }, { labelText, value });
        console.log(`  ✅ ${label}: ${value}`);
      } catch { console.log(`  ⚠️  ${label} failed`); }
    };

    const selectByLabel = async (labelText: string, value: string | undefined, label: string) => {
      if (!value) return;
      try {
        await page.evaluate((args: { labelText: string; value: string }) => {
          const tds = Array.from(document.querySelectorAll('td, th, label'));
          for (const td of tds) {
            if (td.textContent?.trim().toLowerCase().includes(args.labelText.toLowerCase())) {
              const row = td.closest('tr') || td.parentElement;
              if (row) {
                const select = row.querySelector('select') as HTMLSelectElement;
                if (select) {
                  const opts = Array.from(select.options);
                  const match = opts.find(o => o.text.toLowerCase() === args.value.toLowerCase()) ||
                                opts.find(o => o.text.toLowerCase().startsWith(args.value.toLowerCase())) ||
                                opts.find(o => o.text.toLowerCase().includes(args.value.toLowerCase()));
                  if (match) { select.value = match.value; select.dispatchEvent(new Event('change', { bubbles: true })); }
                  return;
                }
              }
            }
          }
        }, { labelText, value });
        console.log(`  ✅ ${label}: ${value}`);
      } catch { console.log(`  ⚠️  ${label} failed`); }
    };

    const clickRadioByName = async (name: string, value: string, label: string) => {
      try {
        await page.evaluate((args: { name: string; value: string }) => {
          const r = document.querySelector(`input[name="${args.name}"][value="${args.value}"]`) as HTMLInputElement;
          if (r) { r.checked = true; r.click(); r.dispatchEvent(new Event('change', { bubbles: true })); }
        }, { name, value });
        console.log(`  ✅ ${label}`);
      } catch { console.log(`  ⚠️  ${label} failed`); }
    };

    // ══════════════════════════════════════════════════════════
    // STEP 3 — ADDRESS & FAMILY DETAILS
    // ══════════════════════════════════════════════════════════
    while (true) { // redo loop for Step 3
    console.log('\n📝 STEP 3 — Address & Family Details');
    console.log('────────────────────────────────────────────\n');

    // Wait for Step 3 to load — pres_add1 is the first field
    console.log('  ⏳ Waiting for Step 3 to load...');
    try {
      await page.waitForSelector('#pres_add1', { timeout: 60000, state: 'visible' });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      console.log('  ✅ Step 3 form detected');
    } catch {
      console.log('  ⚠️  Could not detect Step 3 — waiting extra time...');
    }
    await delay(1500);

    // Discover Step 3 fields
    const s3Inputs: any[] = [];
    const s3AllInputs = await page.$$('input[type="text"]');
    for (const inp of s3AllInputs) { if (await inp.isVisible()) s3Inputs.push(inp); }
    const s3Selects: any[] = [];
    const s3AllSelects = await page.$$('select');
    for (const sel of s3AllSelects) { if (await sel.isVisible()) s3Selects.push(sel); }
    console.log(`  📋 Found ${s3Inputs.length} visible inputs, ${s3Selects.length} visible selects`);

    // Log fields for debugging
    for (let i = 0; i < Math.min(s3Inputs.length, 20); i++) {
      const id = await s3Inputs[i].getAttribute('id') || '';
      const name = await s3Inputs[i].getAttribute('name') || '';
      console.log(`    Input[${i}]: id="${id}" name="${name}"`);
    }
    for (let i = 0; i < Math.min(s3Selects.length, 15); i++) {
      const id = await s3Selects[i].getAttribute('id') || '';
      const name = await s3Selects[i].getAttribute('name') || '';
      console.log(`    Select[${i}]: id="${id}" name="${name}"`);
    }

    // Also discover radios for Step 3
    const s3Radios = await page.$$eval('input[type="radio"]', (els: any[]) =>
      els.map(el => ({ name: el.name, value: el.value, id: el.id }))
    );
    console.log('  📋 Step 3 radios:', JSON.stringify(s3Radios, null, 2));

    // ── Fill Step 3 using known field IDs ──
    const addrCountry = COUNTRY_MAP[traveler.residenceCountry || ''] || traveler.residenceCountry || COUNTRY_MAP[traveler.countryOfBirth || ''] || 'UNITED STATES OF AMERICA';
    const isUnemployed = !traveler.employmentStatus || traveler.employmentStatus === 'Unemployed';

    // ── Present Address ──
    console.log('  📍 Present Address');
    await fillByIdOr('addressFamily', 'addrLine1', 'pres_add1', 'House No./Street', traveler.address || 'NA');
    await fillByIdOr('addressFamily', 'city',      'pres_add2', 'Village/Town/City', traveler.city || 'NA');
    await selectByIdOr('addressFamily', 'residenceCountry', 'pres_country', 'Country', addrCountry);
    await delay(500);
    await fillByIdOr('addressFamily', 'state', 'pres_add3', 'State/Province', traveler.state || 'NA');
    await fillByIdOr('addressFamily', 'zip',   'pincode',   'Postal/Zip Code', traveler.zip || '00000');
    await fillByIdOr('addressFamily', 'phone', 'pres_phone', 'Phone',  traveler.phoneNumber || 'NA');
    await fillByIdOr('addressFamily', 'mobile', 'mobile',   'Mobile',  traveler.phoneNumber || 'NA');
    await delay(300);

    // ── Permanent Address ──
    console.log('\n  📍 Permanent Address (same as present)');
    {
      const r = adminOr('addressFamily', 'permanentSameCheck', botOverrides, traveler, order, 'true');
      if (r.source === 'manual') {
        console.log('  ⏸️  Permanent = Present checkbox marked manual — check in browser, press Enter...');
        await waitForEnter();
      } else if (r.source === 'skip') {
        console.log('  ⏭️  Permanent = Present checkbox skipped by admin');
      } else {
        try { await page.check('input[type="checkbox"]', { force: true, timeout: 3000 }); console.log(`  ✅ Same Address checked${sourceTag(r.source)}`); }
        catch { try { const cb = await page.$('input[type="checkbox"]'); if (cb) { const b = await cb.boundingBox(); if (b) await page.mouse.click(b.x+b.width/2, b.y+b.height/2); } console.log(`  ✅ Same Address checked (mouse)${sourceTag(r.source)}`); } catch { console.log('  ⚠️  Checkbox failed'); } }
      }
    }
    await delay(1000);

    // ── Father's Details ──
    console.log('\n  👨 Father\'s Details');
    await fillByIdOr('addressFamily', 'fatherName',       'fthrname',               "Father's Name",             traveler.fatherName || 'NA');
    await fillByIdOr('addressFamily', 'fatherBirthplace', 'father_place_of_birth',  "Father's Place of Birth",   traveler.fatherPlaceOfBirth || 'NA');
    await selectByIdOr('addressFamily', 'fatherNationality', 'father_nationality',  "Father's Nationality",      COUNTRY_MAP[traveler.fatherNationality || ''] || traveler.fatherNationality || addrCountry);
    await selectByIdOr('addressFamily', 'fatherCountryOfBirth', 'father_country_of_birth', "Father's Country of Birth", COUNTRY_MAP[traveler.fatherCountryOfBirth || ''] || traveler.fatherCountryOfBirth || addrCountry);

    // ── Mother's Details ──
    console.log('\n  👩 Mother\'s Details');
    await fillByIdOr('addressFamily', 'motherName',       'mother_name',             "Mother's Name",             traveler.motherName || 'NA');
    await fillByIdOr('addressFamily', 'motherBirthplace', 'mother_place_of_birth',   "Mother's Place of Birth",   traveler.motherPlaceOfBirth || 'NA');
    await selectByIdOr('addressFamily', 'motherNationality', 'mother_nationality',   "Mother's Nationality",      COUNTRY_MAP[traveler.motherNationality || ''] || traveler.motherNationality || addrCountry);
    await selectByIdOr('addressFamily', 'motherCountryOfBirth', 'mother_country_of_birth', "Mother's Country of Birth", COUNTRY_MAP[traveler.motherCountryOfBirth || ''] || traveler.motherCountryOfBirth || addrCountry);

    // ── Marital Status ──
    console.log('\n  💍 Marital Status');
    const maritalVal = ({'Single':'SINGLE','Married':'MARRIED','Divorced':'DIVORCED','Widowed':'WIDOWED','Separated':'SEPARATED'} as Record<string,string>)[traveler.maritalStatus || ''] || 'SINGLE';
    await selectByIdOr('addressFamily', 'maritalStatus', 'marital_status', 'Marital Status', maritalVal);
    await delay(500);

    // ── Pakistan parents — default No, admin can override Yes/manual/skip ──
    console.log('\n  🇵🇰 Pakistan Heritage');
    {
      const r = adminOr('addressFamily', 'parentsFromPakistan', botOverrides, traveler, order, 'NO');
      if (r.source === 'manual') {
        console.log('  ⏸️  Pakistan heritage marked manual — select in browser, press Enter...');
        await waitForEnter();
      } else if (r.source === 'skip') {
        console.log('  ⏭️  Pakistan heritage skipped by admin');
      } else {
        // Determine which radio to click (Yes = grandparent_flag1, No = grandparent_flag2)
        const pickYes = /^y/i.test(String(r.value || 'NO'));
        const targetId = pickYes ? 'grandparent_flag1' : 'grandparent_flag2';
        const otherId  = pickYes ? 'grandparent_flag2' : 'grandparent_flag1';
        const labelVal = pickYes ? 'Yes' : 'No';

        // Method 1: Mouse click at element coordinates
        try {
          const pak = await page.$(`#${targetId}`);
          if (pak) {
            const box = await pak.boundingBox();
            if (box) {
              await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
              console.log(`  ✅ Pakistan parents: ${labelVal} (mouse click)${sourceTag(r.source)}`);
            }
          }
        } catch {}
        // Method 2: Focus + Space
        try { await page.focus(`#${targetId}`); await page.keyboard.press('Space'); } catch {}
        // Method 3: JS with full event chain
        await page.evaluate(function(args) {
          var target = document.getElementById(args.targetId) as HTMLInputElement;
          var other = document.getElementById(args.otherId) as HTMLInputElement;
          if (other) other.checked = false;
          if (target) {
            target.checked = true;
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, { targetId, otherId });
        // Verify
        const pakResult = await page.evaluate(function(id) {
          var el = document.getElementById(id) as HTMLInputElement;
          return el ? el.checked : false;
        }, targetId);
        console.log(`  📋 Pakistan ${labelVal} checked: ${pakResult}`);
        if (!pakResult) {
          botFlags.push(`🔴 "Were your Parents/Grandparents Pakistan Nationals?" — Bot could not select ${labelVal}. Please set this manually.`);
          console.log('  ⚠️  FLAGGED for manual fix');
        }
      }
    }

    // ── Employment ──
    console.log('\n  💼 Employment');
    const occVal = ({'Employed':'PRIVATE SERVICE','Self-employed':'SELF EMPLOYED','Unemployed':'UN-EMPLOYED','Student':'STUDENT','Retired':'RETIRED','Homemaker':'HOUSE WIFE','Business Owner':'BUSINESS','Government':'GOVT SERVICE'} as Record<string,string>)[traveler.employmentStatus || ''] || 'UN-EMPLOYED';
    await selectByIdOr('addressFamily', 'occupation',      'occupation',    'Occupation',      occVal);
    await delay(500);
    await fillByIdOr('addressFamily',   'employerName',    'empname',        'Employer Name',   isUnemployed ? 'NA' : (traveler.employerName || 'NA'));
    await fillByIdOr('addressFamily',   'designation',     'empdesignation', 'Designation',     'NA');
    await fillByIdOr('addressFamily',   'employerAddress', 'empaddress',     'Employer Address', isUnemployed ? 'NA' : (traveler.employerAddress || traveler.address || 'NA'));
    // Employer phone — skipped (optional, causes issues)

    // ── Military — default No, admin can override Yes/manual/skip ──
    console.log('\n  🎖️ Military/Police');
    {
      const r = adminOr('addressFamily', 'militaryFlag', botOverrides, traveler, order, 'NO');
      if (r.source === 'manual') {
        console.log('  ⏸️  Military flag marked manual — select in browser, press Enter...');
        await waitForEnter();
      } else if (r.source === 'skip') {
        console.log('  ⏭️  Military flag skipped by admin');
      } else {
        const pickYes = /^y/i.test(String(r.value || 'NO'));
        const targetId = pickYes ? 'prev_org1' : 'prev_org2';
        const labelVal = pickYes ? 'Yes' : 'No';
        try { await page.click(`#${targetId}`, { force: true }); console.log(`  ✅ Military/Police: ${labelVal}${sourceTag(r.source)}`); }
        catch { console.log('  ⚠️  Military radio failed'); }
      }
    }

    // (old logging removed)

    // (old prepare values removed — now using fillById/selectById above)

    // (old positional fill code removed — now using ID-based fills above)

    // Auto-continue to Step 4 — no review prompt
    await delay(1500);
    break;
    } // end Step 3 redo loop

    await page.keyboard.press('Tab');
    await delay(100);
    await page.keyboard.press('Enter');
    console.log('  ✅ Submitted Step 3');
    await delay(5000);

    // ══════════════════════════════════════════════════════════
    // STEP 4 — VISA DETAILS
    // ══════════════════════════════════════════════════════════
    while (true) { // redo loop for Step 4
    console.log('\n📝 STEP 4 — Visa Details');
    console.log('────────────────────────────────────────────\n');

    // Wait for Step 4 to load — placesToBeVisited1_id is the first field
    console.log('  ⏳ Waiting for Step 4 to load...');
    try {
      await page.waitForSelector('#placesToBeVisited1_id', { timeout: 60000, state: 'visible' });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      console.log('  ✅ Step 4 form detected');
    } catch {
      console.log('  ⚠️  Could not detect Step 4 — waiting extra time...');
    }
    await delay(1500);

    // ── Discover ALL fields on Step 4 ──
    const s4AllInputs = await page.$$('input[type="text"], textarea');
    const s4VisInputs: any[] = [];
    for (const inp of s4AllInputs) { if (await inp.isVisible()) s4VisInputs.push(inp); }
    const s4AllSelects = await page.$$('select');
    const s4VisSelects: any[] = [];
    for (const sel of s4AllSelects) { if (await sel.isVisible()) s4VisSelects.push(sel); }
    console.log(`\n  📋 Step 4: ${s4VisInputs.length} inputs, ${s4VisSelects.length} selects`);
    for (let i = 0; i < s4VisInputs.length; i++) {
      const id = await s4VisInputs[i].getAttribute('id') || '';
      const name = await s4VisInputs[i].getAttribute('name') || '';
      console.log(`    Input[${i}]: id="${id}" name="${name}"`);
    }
    for (let i = 0; i < s4VisSelects.length; i++) {
      const id = await s4VisSelects[i].getAttribute('id') || '';
      const name = await s4VisSelects[i].getAttribute('name') || '';
      console.log(`    Select[${i}]: id="${id}" name="${name}"`);
    }
    const s4Radios = await page.$$eval('input[type="radio"]', function(els) {
      var r: any[] = [];
      for (var i = 0; i < els.length; i++) {
        var e = els[i] as HTMLInputElement;
        r.push({ name: e.name, value: e.value, id: e.id });
      }
      return r;
    });
    console.log('  📋 Step 4 radios:', JSON.stringify(s4Radios, null, 2));

    // ── Fill Visa Details ──
    console.log('\n  🎫 Visa Details');
    // Random Indian cities (pick 3 from popular tourist destinations)
    const indianCities = ['DELHI', 'MUMBAI', 'AGRA', 'JAIPUR', 'VARANASI', 'BANGALORE', 'KOLKATA', 'CHENNAI', 'GOA', 'UDAIPUR', 'AMRITSAR', 'RISHIKESH', 'KOCHI', 'HYDERABAD', 'MYSORE'];
    const shuffled = [...indianCities].sort(() => Math.random() - 0.5);
    const placesVal = traveler.placesToVisit || shuffled.slice(0, 3).join(', ');
    await fillByIdOr('visaDetails', 'placesToVisit', 'placesToBeVisited1_id', 'Places to Visit', placesVal);

    // Exit port — dropdown
    const exitPort = traveler.exitPort?.split(' (')[0]?.toUpperCase() || shuffled[0] || 'DELHI';
    await selectByIdOr('visaDetails', 'exitPort', 'exitpoint', 'Port of Exit', exitPort);

    // ── Radio questions — default to No ──
    console.log('\n  ❓ Yes/No Questions');

    /**
     * Click a Yes/No radio identified by `name*=<pattern>`, choosing the
     * radio whose ADJACENT text matches the visible Yes/No label. The gov
     * form sometimes inverts value attributes vs labels (we hit this on
     * lived-2-years), so resolving by visible text is the only reliable
     * approach. Multi-tier escalation handles styled radios where the
     * input itself is hidden behind a label or sibling.
     */
    const clickRadioByNameAndLabel = async (cfg: {
      fieldKey: string;
      label: string;
      namePattern: string;
      pickYes: boolean;
      source: 'admin' | 'default';
    }) => {
      const wantedLabel = cfg.pickYes ? 'YES' : 'NO';
      // Walk text nodes immediately around each radio, STOPPING at the next
      // <input> so radio #1's label can't leak into radio #2's read or vice
      // versa. Capture both before- and after-text because gov forms mix
      // styles (e.g. `<input>Yes` for refuse_flag, `Yes <input>` for
      // old_visa_flag).
      // NOTE: helper logic is INLINED below (not lifted into a named const)
      // because tsx/esbuild adds `__name(...)` wrappers to named function
      // expressions for tooling, and that identifier doesn't exist in the
      // browser context Playwright evaluates this in. Inlining sidesteps it.
      const radios = await page.evaluate((pat: string) => {
        const all = Array.from(document.querySelectorAll(`input[type="radio"][name*="${pat}"]`)) as HTMLInputElement[];
        return all.map(r => {
          // Walk forward — stop at next <input>
          let after = '';
          let nNext: Node | null = r.nextSibling;
          while (nNext && after.length < 30) {
            if (nNext.nodeType === 1 && (nNext as Element).tagName === 'INPUT') break;
            after += (nNext.textContent || '');
            nNext = nNext.nextSibling;
          }
          // Walk backward — stop at previous <input>
          let before = '';
          let nPrev: Node | null = r.previousSibling;
          while (nPrev && before.length < 30) {
            if (nPrev.nodeType === 1 && (nPrev as Element).tagName === 'INPUT') break;
            before = (nPrev.textContent || '') + before;
            nPrev = nPrev.previousSibling;
          }
          return {
            id: r.id, name: r.name, value: r.value,
            visible: r.offsetParent !== null,
            disabled: r.disabled,
            before: before.replace(/\s+/g, ' ').trim(),
            after:  after.replace(/\s+/g, ' ').trim(),
          };
        });
      }, cfg.namePattern);

      if (radios.length === 0) {
        // The form on this run doesn't contain a radio with this name —
        // possibly conditional rendering or the field's been renamed.
        // Dump EVERY radio on the page (with its name + adjacent text) so
        // we can spot what name the question actually uses, without needing
        // another round-trip.
        const allRadios = await page.evaluate(() => {
          const all = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
          return all.map(r => {
            let next: Node | null = r.nextSibling;
            let neighborText = '';
            while (next && neighborText.length < 30) {
              neighborText += (next.textContent || '');
              next = next.nextSibling;
            }
            return {
              name: r.name, value: r.value, id: r.id,
              visible: r.offsetParent !== null,
              neighborText: neighborText.trim(),
            };
          });
        });
        await botRunLog?.log({
          stepKey: 'visaDetails', fieldKey: cfg.fieldKey, label: cfg.label,
          action: 'click', source: cfg.source,
          value: JSON.stringify({ wanted: wantedLabel, namePattern: cfg.namePattern, allRadiosOnPage: allRadios }),
          success: false,
          errorMsg: `No radios found with name*="${cfg.namePattern}". ${allRadios.length} radio${allRadios.length === 1 ? '' : 's'} on page — see value JSON for the list.`,
          selector: `input[name*="${cfg.namePattern}"]`,
        });
        botFlags.push(`🔴 "${cfg.label}" — Bot could not find the radio on the page. Set manually.`);
        return;
      }

      // Match the label STRICTLY positioned next to the input:
      //  - after-style  ("<input>Yes ..."):  after-text starts with the label
      //  - before-style ("...Yes <input>"):  before-text ends with the label
      // We use `\s*` (whitespace only) — NOT `\W*` — to avoid swallowing
      // separators like "/" or "·". For old_visa_flag the after-text of
      // flag1 is "/ No" — the "/" tells us "No" belongs to the NEXT radio,
      // not this one. Whitespace-only padding correctly excludes that case.
      const matchAfter  = new RegExp(`^\\s*${wantedLabel}\\b`, 'i');
      const matchBefore = new RegExp(`\\b${wantedLabel}\\s*$`, 'i');
      let target = radios.find(r => matchAfter.test(r.after));
      if (!target) target = radios.find(r => matchBefore.test(r.before));

      if (!target?.id) {
        await botRunLog?.log({
          stepKey: 'visaDetails', fieldKey: cfg.fieldKey, label: cfg.label,
          action: 'click', source: cfg.source,
          value: JSON.stringify({ wanted: wantedLabel, namePattern: cfg.namePattern, radios }),
          success: false,
          errorMsg: `Could not match "${wantedLabel}" against the before/after text of any radio in name*="${cfg.namePattern}".`,
          selector: `input[name*="${cfg.namePattern}"]`,
        });
        botFlags.push(`🔴 "${cfg.label}" — Could not find ${wantedLabel} option. Set manually.`);
        return;
      }

      // Click with multi-tier escalation, retrying up to 3 times in case
      // the form re-renders the radios mid-attempt.
      const tryClick = async () => {
        const el = await page.$(`#${target.id}`);
        if (!el) return false;
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await delay(150);
        try { await el.check({ timeout: 1500 }); }
        catch {
          try { await el.click({ force: true, timeout: 1500 }); }
          catch {
            await el.evaluate(node => (node as HTMLInputElement).click()).catch(() => {});
          }
        }
        await delay(400);
        return await el.evaluate(node => (node as HTMLInputElement).checked).catch(() => false);
      };

      let attempts = 0;
      let landed = false;
      while (attempts < 3 && !landed) {
        attempts++;
        landed = await tryClick();
        if (landed) break;
        await delay(500);
      }

      // Re-read the checked state from the document so we know which radio
      // (if any) actually ended up checked.
      const finalState = await page.evaluate((pat: string) => {
        const all = Array.from(document.querySelectorAll(`input[type="radio"][name*="${pat}"]`)) as HTMLInputElement[];
        const checked = all.find(r => r.checked);
        return checked ? { id: checked.id, value: checked.value } : null;
      }, cfg.namePattern);

      const ok = !!finalState && finalState.id === target.id;
      console.log(`  ${ok ? '✅' : '⚠️ '} ${cfg.label}: ${wantedLabel}${sourceTag(cfg.source)}`);

      await botRunLog?.log({
        stepKey: 'visaDetails', fieldKey: cfg.fieldKey, label: cfg.label,
        action: 'click', source: cfg.source,
        value: JSON.stringify({
          wanted: wantedLabel,
          resolvedTargetId: target.id,
          finalCheckedId: finalState?.id ?? null,
          finalCheckedValue: finalState?.value ?? null,
          attempts,
        }),
        success: ok,
        errorMsg: ok ? undefined : (
          finalState
            ? `Resolved target id=${target.id} but checked radio is id=${finalState.id}.`
            : `Click attempted ${attempts} time(s) but no radio in the group is checked.`
        ),
        selector: `#${target.id}`,
      });
      if (!ok) {
        botFlags.push(`🔴 "${cfg.label}" — Bot tried to click ${wantedLabel} but it didn't register. Set manually.`);
      }
    };

    // ── Wire visaRefusedBefore ──
    // adminOr resolves the value (with admin override + traveler fallback +
    // explicit default of NO). NOTE: `visitedIndiaBefore` was removed — the
    // gov form's Step 4 doesn't actually have a "Visited India before?"
    // radio. The catalog entry was a phantom from an old form version. The
    // 4 radio groups on Step 4 are: hotel, old_visa_flag, refuse_flag,
    // saarc_flag — all of which are wired below.
    {
      const r = adminOr('visaDetails', 'visaRefusedBefore', botOverrides, traveler, order, 'NO');
      if (r.source === 'manual') {
        console.log('  ⏸️  Visa refused before? marked manual — answer in browser, press Enter...');
        await botRunLog?.log({
          stepKey: 'visaDetails', fieldKey: 'visaRefusedBefore', label: 'Visa refused before?',
          action: 'click', source: 'manual', value: null, success: true,
          selector: 'input[name*="refuse"]',
        });
        await waitForEnter();
      } else if (r.source === 'skip') {
        console.log('  ⏭️  Visa refused before? skipped by admin');
        await botRunLog?.log({
          stepKey: 'visaDetails', fieldKey: 'visaRefusedBefore', label: 'Visa refused before?',
          action: 'click', source: 'skip', value: null, success: true,
          selector: 'input[name*="refuse"]',
        });
      } else {
        await clickRadioByNameAndLabel({
          fieldKey: 'visaRefusedBefore', label: 'Visa refused before?',
          namePattern: 'refuse', pickYes: /^y/i.test(String(r.value || 'NO')),
          source: r.source === 'admin' ? 'admin' : 'default',
        });
      }
    }
    await delay(300);

    // Hotel Booked — use customer's answer
    if (traveler.bookedHotel === 'yes') {
      console.log('\n  🏨 Hotel Booked: Yes (from customer)');

      // Check if already Yes — skip click if so
      const alreadyYes = await page.evaluate(function() {
        var el = document.getElementById('haveYouBookedRoomInHotel_yes_id') as HTMLInputElement;
        return el ? el.checked : false;
      });

      if (alreadyYes) {
        console.log('  ✅ Hotel Booked: Yes (already selected)');
      } else {
        try {
          // Combo approach: multiple methods targeting Yes — all try to select Yes, none select No
          const yesRadio = await page.$('#haveYouBookedRoomInHotel_yes_id');
          if (yesRadio) await yesRadio.scrollIntoViewIfNeeded();
          await delay(200);

          // Method A: Focus Yes + Space (keyboard activation)
          try { await page.focus('#haveYouBookedRoomInHotel_yes_id'); await page.keyboard.press('Space'); } catch {}
          await delay(150);

          // Method B: Click the label (if any exists)
          try { await page.click(`label[for="haveYouBookedRoomInHotel_yes_id"]`, { force: true, timeout: 1000 }); } catch {}
          await delay(150);

          // Method C: mousedown/up at element coords (the most reliable one)
          if (yesRadio) {
            const box = await yesRadio.boundingBox();
            if (box) {
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              await delay(50);
              await page.mouse.down();
              await delay(30);
              await page.mouse.up();
            }
          }

          await delay(1500);
          console.log('  🏨 Hotel click attempted (3-method combo)');
        } catch (err: any) { console.log(`  ⚠️  Hotel Yes error: ${err?.message}`); }
      }

      // Discover all visible text input IDs/names in one evaluate (much faster)
      const hotelFieldInfo = await page.evaluate(function() {
        var inputs = document.querySelectorAll('input[type="text"], textarea');
        var results: Array<{id: string; name: string}> = [];
        for (var i = 0; i < inputs.length; i++) {
          var el = inputs[i] as HTMLInputElement;
          if ((el as HTMLElement).offsetParent === null) continue; // skip hidden
          results.push({ id: el.id || '', name: el.name || '' });
        }
        return results;
      });
      let filledAny = false;
      // Helper to resolve a dynamically-discovered field with admin override support.
      // `fieldKey` is the catalog key (e.g. 'tourOpName'); the selector comes from runtime discovery.
      const resolveAndFill = async (fieldKey: string, label: string, selector: string, defaultValue: string | undefined) => {
        const r = adminOr('visaDetails', fieldKey, botOverrides, traveler, order, defaultValue);
        if (r.source === 'manual') {
          console.log(`  ⏸️  ${label} marked manual — fill in browser, press Enter...`);
          await waitForEnter();
          filledAny = true;
        } else if (r.source === 'skip') {
          console.log(`  ⏭️  ${label} skipped by admin`);
        } else if (r.value) {
          try {
            await page.fill(selector, r.value);
            console.log(`  ✅ ${label}: ${r.value}${sourceTag(r.source)}`);
            filledAny = true;
          } catch {}
        }
      };

      for (const info of hotelFieldInfo) {
        const idLower = info.id.toLowerCase();
        const nameLower = info.name.toLowerCase();
        const isTour = idLower.includes('touroperator') || nameLower.includes('touroperator') || idLower.includes('tour_op') || nameLower.includes('tour_op');
        const isHotel = idLower.includes('hotel') || nameLower.includes('hotel');
        if (!isTour && !isHotel) continue;
        const selector = info.id ? `#${info.id}` : `[name="${info.name}"]`;
        if (isTour) {
          if (idLower.includes('name') || nameLower.includes('name')) {
            await resolveAndFill('tourOpName', 'Tour Operator Name', selector, traveler.tourOperatorName || 'NA');
          } else if (idLower.includes('addr') || nameLower.includes('addr')) {
            await resolveAndFill('tourOpAddr', 'Tour Operator Address', selector, traveler.tourOperatorAddress || 'NA');
          }
        }
        if (isHotel) {
          if (idLower.includes('name') || nameLower.includes('name')) {
            await resolveAndFill('hotelName', 'Hotel Name', selector, traveler.hotelName || 'NA');
          } else if (idLower.includes('addr') || nameLower.includes('addr') || idLower.includes('place') || nameLower.includes('place')) {
            await resolveAndFill('hotelPlace', 'Hotel Place', selector, traveler.hotelPlace || 'NA');
          }
        }
      }
      // Audit trail entry for the bookedHotel=yes branch — record whether
      // the sub-fields actually rendered + got filled.
      const yesNowChecked = await page.evaluate(() => {
        const el = document.getElementById('haveYouBookedRoomInHotel_yes_id') as HTMLInputElement | null;
        return !!el?.checked;
      });
      await botRunLog?.log({
        stepKey: 'visaDetails', fieldKey: 'bookedHotel', label: 'Booked hotel?',
        action: 'click', source: 'default',
        value: JSON.stringify({ wanted: 'YES', yesChecked: yesNowChecked, subFieldsFilled: filledAny }),
        success: yesNowChecked && filledAny,
        errorMsg: yesNowChecked && filledAny
          ? undefined
          : !yesNowChecked
            ? 'Yes radio did not register as checked'
            : 'Yes radio is checked but hotel/tour-op sub-fields did not appear',
        selector: '#haveYouBookedRoomInHotel_yes_id',
      });

      if (!filledAny) {
        console.log('  ⚠️  Hotel fields did not appear — FLAGGED');
        botFlags.push('🔴 "Have you booked any room in Hotel/Resort through any Tour Operator?" — Bot could not select Yes or hotel sub-fields did not appear. Please set this manually and fill hotel details.');
      }
    } else {
      console.log('\n  🏨 Hotel Booked: No (from customer)');
      // Earlier we assumed the gov form defaults to No so a click was
      // unnecessary. Wrong — the form has NEITHER radio selected initially,
      // so submitting without clicking triggers "Please select yes or no".
      // Always click No explicitly when the customer answered no.
      let noChecked = false;
      try {
        const noRadio = await page.$('#haveYouBookedRoomInHotel_no_id');
        if (noRadio) {
          await noRadio.scrollIntoViewIfNeeded();
          await delay(200);

          // Tier 1 — Playwright .check() (handles label-based affordances)
          try { await noRadio.check({ timeout: 1500 }); } catch {
            // Tier 2 — focus + Space
            try { await page.focus('#haveYouBookedRoomInHotel_no_id'); await page.keyboard.press('Space'); } catch {}
            // Tier 3 — force click the input
            try { await noRadio.click({ force: true, timeout: 1000 }); } catch {}
            // Tier 4 — JS click bypassing Playwright entirely
            try { await noRadio.evaluate(el => (el as HTMLInputElement).click()); } catch {}
          }
          await delay(500);
        }
        noChecked = await page.evaluate(() => {
          const el = document.getElementById('haveYouBookedRoomInHotel_no_id') as HTMLInputElement | null;
          return !!el?.checked;
        });
      } catch (err: any) {
        console.log(`  ⚠️  Hotel No click error: ${err?.message}`);
      }

      await botRunLog?.log({
        stepKey: 'visaDetails', fieldKey: 'bookedHotel', label: 'Booked hotel?',
        action: 'click', source: 'default',
        value: JSON.stringify({ wanted: 'NO', noChecked, subFieldsFilled: false }),
        success: noChecked,
        errorMsg: noChecked ? undefined : 'No radio did not register as checked after click attempts',
        selector: '#haveYouBookedRoomInHotel_no_id',
      });

      if (noChecked) {
        console.log('  ✅ Hotel Booked: No (clicked)');
      } else {
        console.log('  ⚠️  Hotel Booked: No click did not register — FLAGGED');
        botFlags.push('🔴 "Have you booked any room in Hotel/Resort through any Tour Operator?" — Bot tried to click No but the radio did not register. Please set this manually.');
      }
    }
    await delay(200);

    // Previous visa + SAARC — default No, admin can override Yes/manual/skip.
    //
    // refuseFlag is intentionally NOT in this list anymore: visaRefusedBefore
    // (above, name*="refuse") already targets refuse_flag1/2 by visible label.
    // Including it here would re-click and override with the WRONG radio
    // because the previous hardcoded id-1=Yes, id-2=No convention is
    // inverted on this gov form (refuse_flag1's value="YES" sits next to the
    // visible "No" label).
    //
    // For oldVisaFlag + saarcFlag we use the same label-based resolution so
    // the same inversion bug can't bite us if the gov form ever flips those
    // too.
    const labelBasedRadios: Array<{ field: string; namePattern: string; label: string; defaultVal: 'YES' | 'NO' }> = [
      { field: 'oldVisaFlag', namePattern: 'old_visa', label: 'Previous visa',     defaultVal: 'NO' },
      { field: 'saarcFlag',   namePattern: 'saarc',    label: 'SAARC national',    defaultVal: 'NO' },
    ];
    for (const info of labelBasedRadios) {
      const r = adminOr('visaDetails', info.field, botOverrides, traveler, order, info.defaultVal);
      if (r.source === 'manual') {
        console.log(`  ⏸️  ${info.label} marked manual — select in browser, press Enter...`);
        await botRunLog?.log({
          stepKey: 'visaDetails', fieldKey: info.field, label: info.label,
          action: 'click', source: 'manual', value: null, success: true,
          selector: `input[name*="${info.namePattern}"]`,
        });
        await waitForEnter();
        continue;
      }
      if (r.source === 'skip') {
        console.log(`  ⏭️  ${info.label} skipped by admin`);
        await botRunLog?.log({
          stepKey: 'visaDetails', fieldKey: info.field, label: info.label,
          action: 'click', source: 'skip', value: null, success: true,
          selector: `input[name*="${info.namePattern}"]`,
        });
        continue;
      }
      const pickYes = /^y/i.test(String(r.value || info.defaultVal));
      await clickRadioByNameAndLabel({
        fieldKey: info.field, label: info.label,
        namePattern: info.namePattern, pickYes,
        source: r.source === 'admin' ? 'admin' : 'default',
      });
    }

    // ── Business Meeting sub-form (BUSINESS_1Y + Attend Technical/Business
    //    Meetings only). The gov form surfaces "Details of the Applicants
    //    Company" and "Details of Indian Firm" sections after the visa-purpose
    //    radios. Each section has Name / Address+Phone / Website inputs.
    //
    //    Field IDs are not stable across gov form versions, so we discover
    //    them by walking the DOM: find inputs whose nearest section header
    //    contains "Applicant" / "Company" or "Indian" / "Firm", then match
    //    their label cell to the field we want.
    if (order.visaType === 'BUSINESS_1Y' && traveler.purposeOfVisit === 'Attend Technical/Business Meetings') {
      console.log('\n  🏢 Business Meeting Details');

      const businessInputs = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('input[type="text"], textarea')) as HTMLInputElement[];
        return all.map((input, docIdx) => {
          // Skip hidden inputs
          if (input.offsetParent === null) return null;
          // Walk up to find the nearest section header. Gov forms use a
          // leading <tr> or <div> with a "Details of …" caption above each
          // group of inputs. Stop at the FIRST match so we get the closest
          // header, not the most distant one.
          let header = '';
          let walker: HTMLElement | null = input.parentElement;
          for (let i = 0; i < 20 && walker && !header; i++) {
            let prev = walker.previousElementSibling as HTMLElement | null;
            while (prev && !header) {
              const text = (prev.textContent || '').replace(/\s+/g, ' ').trim();
              if (/Details of/i.test(text)) { header = text.slice(0, 120); break; }
              prev = prev.previousElementSibling as HTMLElement | null;
            }
            walker = walker.parentElement;
          }
          // Field label — try multiple sources because gov-form layouts vary:
          //   1. <label for="ID">  (semantic)
          //   2. The <td> immediately preceding the input's containing <td>
          //   3. Any <td> in the row that has no input/textarea inside
          //   4. First <td> in the row
          //   5. placeholder / title attributes
          let label = '';
          if (input.id) {
            const lbl = document.querySelector(`label[for="${input.id}"]`) as HTMLElement | null;
            if (lbl) label = (lbl.textContent || '').replace(/\s+/g, ' ').trim();
          }
          const row = input.closest('tr');
          if (!label && row) {
            const cellWithInput = input.closest('td');
            if (cellWithInput) {
              const prevTd = cellWithInput.previousElementSibling as HTMLElement | null;
              if (prevTd && prevTd.tagName === 'TD') {
                label = (prevTd.textContent || '').replace(/\s+/g, ' ').trim();
              }
            }
          }
          if (!label && row) {
            // Find the first <td> in the row that doesn't contain a form control
            const tds = Array.from(row.querySelectorAll(':scope > td')) as HTMLElement[];
            const labelTd = tds.find(td => !td.querySelector('input, textarea, select'));
            if (labelTd) label = (labelTd.textContent || '').replace(/\s+/g, ' ').trim();
          }
          if (!label && row) {
            const firstTd = row.querySelector('td') as HTMLElement | null;
            if (firstTd) label = (firstTd.textContent || '').replace(/\s+/g, ' ').trim();
          }
          if (!label) label = (input.placeholder || input.title || '').trim();
          label = label.slice(0, 80);
          return { id: input.id || '', name: input.name || '', header, label, docIdx };
        }).filter(Boolean) as Array<{ id: string; name: string; header: string; label: string; docIdx: number }>;
      });

      // Primary match: section + label regex (works when gov form labels are
      // wired up properly — i.e. via <label for>, sibling <td>, etc.).
      const findByLabel = (sectionRe: RegExp, labelRe: RegExp) =>
        businessInputs.find(i => sectionRe.test(i.header) && labelRe.test(i.label));

      // Fallback: position within section. The 6 business-meeting fields all
      // carry the distinctive form-builder name "service_req_form_values"
      // (distinct from the appl.* reference fields), and within each section
      // they appear in fixed visible order: Name → Address → Website. This
      // works even when label discovery returns empty strings (which happens
      // on some gov-form layouts where the label sits in a structurally
      // disconnected cell).
      const sectionInputsByPosition = (sectionRe: RegExp) =>
        businessInputs
          .filter(i => sectionRe.test(i.header) && i.name === 'service_req_form_values')
          .sort((a, b) => a.docIdx - b.docIdx);

      const findByPosition = (sectionRe: RegExp, position: number) => {
        const list = sectionInputsByPosition(sectionRe);
        return list[position];
      };

      // The gov form combines address + phone into a single cell, but our
      // website stores them separately. Recombine here with a comma separator
      // so admins+customers get clean fields on our side and the gov form
      // gets the single string it expects.
      const joinAddrPhone = (addr?: string, phone?: string) => {
        const a = (addr ?? '').trim();
        const p = (phone ?? '').trim();
        if (a && p) return `${a}, ${p}`;
        return a || p || 'NA';
      };

      const fillSpec = [
        { key: 'applicantCompanyName',    sectionRe: /Applicant.*Company|Applicants.*Company/i, labelRe: /\bName\b/i,   pos: 0, value: traveler.applicantCompanyName    || 'NA' },
        { key: 'applicantCompanyAddress', sectionRe: /Applicant.*Company|Applicants.*Company/i, labelRe: /Address/i,    pos: 1, value: joinAddrPhone(traveler.applicantCompanyAddress, traveler.applicantCompanyPhone) },
        { key: 'applicantCompanyWebsite', sectionRe: /Applicant.*Company|Applicants.*Company/i, labelRe: /Website/i,    pos: 2, value: traveler.applicantCompanyWebsite || 'NA' },
        { key: 'indianFirmName',          sectionRe: /Indian.*Firm/i,                            labelRe: /\bName\b/i,   pos: 0, value: traveler.indianFirmName          || 'NA' },
        { key: 'indianFirmAddress',       sectionRe: /Indian.*Firm/i,                            labelRe: /Address/i,    pos: 1, value: joinAddrPhone(traveler.indianFirmAddress, traveler.indianFirmPhone) },
        { key: 'indianFirmWebsite',       sectionRe: /Indian.*Firm/i,                            labelRe: /Website/i,    pos: 2, value: traveler.indianFirmWebsite       || 'NA' },
      ];

      for (const f of fillSpec) {
        let target = findByLabel(f.sectionRe, f.labelRe);
        let resolution = 'label';
        if (!target?.id && !target?.name) {
          target = findByPosition(f.sectionRe, f.pos);
          resolution = 'position';
        }
        if (!target?.id && !target?.name) {
          // Couldn't discover even with the position fallback — log the full
          // input dump so we can debug what the gov form actually offered.
          await botRunLog?.log({
            stepKey: 'visaDetails', fieldKey: f.key, label: f.key,
            action: 'fill', source: 'default',
            value: JSON.stringify({ tried: f.value, sectionRe: f.sectionRe.source, labelRe: f.labelRe.source, position: f.pos, businessInputsOnPage: businessInputs }),
            success: false,
            errorMsg: `Could not discover ${f.key} via label OR position. ${businessInputs.length} text input${businessInputs.length === 1 ? '' : 's'} scanned — see value JSON.`,
            selector: `(business meeting) ${f.sectionRe.source} / ${f.labelRe.source} / pos=${f.pos}`,
          });
          console.log(`  ⚠️  ${f.key}: not found on the page`);
          botFlags.push(`🔴 Business meeting field "${f.key}" — bot couldn't locate the input on the page. Set manually.`);
          continue;
        }
        const selector = target.id ? `#${target.id}` : `[name="${target.name}"]`;
        try {
          await page.fill(selector, f.value);
          console.log(`  ✅ ${f.key}: ${f.value} (resolved by ${resolution})`);
          await botRunLog?.log({
            stepKey: 'visaDetails', fieldKey: f.key, label: f.key,
            action: 'fill', source: 'default', value: f.value, success: true,
            selector: `${selector} (resolved by ${resolution})`,
          });
        } catch (err: any) {
          console.log(`  ⚠️  ${f.key}: fill failed`);
          await botRunLog?.log({
            stepKey: 'visaDetails', fieldKey: f.key, label: f.key,
            action: 'fill', source: 'default', value: f.value, success: false,
            errorMsg: err?.message || 'page.fill threw', selector,
          });
        }
      }
    }

    // ── Reference in India — use customer's data from the website ──
    console.log('\n  🇮🇳 Reference in India');
    await fillByIdOr('visaDetails', 'refNameIndia',  'nameofsponsor_ind', 'India Ref Name',   traveler.refNameIndia || 'NA');
    await fillByIdOr('visaDetails', 'refAddr1India', 'add1ofsponsor_ind', 'India Ref Addr 1', traveler.refAddressIndia || 'NA');
    await fillByIdOr('visaDetails', 'refAddr2India', 'add2ofsponsor_ind', 'India Ref Addr 2', traveler.refAddressIndia || 'NA');

    // Default state+district for major Indian tourist cities (when customer didn't provide)
    const CITY_STATE_MAP: Record<string, { state: string; district: string }> = {
      'DELHI':     { state: 'DELHI',         district: 'NEW DELHI' },
      'MUMBAI':    { state: 'MAHARASHTRA',   district: 'MUMBAI' },
      'AGRA':      { state: 'UTTAR PRADESH', district: 'AGRA' },
      'JAIPUR':    { state: 'RAJASTHAN',     district: 'JAIPUR' },
      'VARANASI':  { state: 'UTTAR PRADESH', district: 'VARANASI' },
      'BANGALORE': { state: 'KARNATAKA',     district: 'BANGALORE' },
      'KOLKATA':   { state: 'WEST BENGAL',   district: 'KOLKATA' },
      'CHENNAI':   { state: 'TAMIL NADU',    district: 'CHENNAI' },
      'GOA':       { state: 'GOA',           district: 'NORTH GOA' },
      'UDAIPUR':   { state: 'RAJASTHAN',     district: 'UDAIPUR' },
      'AMRITSAR':  { state: 'PUNJAB',        district: 'AMRITSAR' },
      'RISHIKESH': { state: 'UTTARAKHAND',   district: 'DEHRADUN' },
      'KOCHI':     { state: 'KERALA',        district: 'ERNAKULAM' },
      'HYDERABAD': { state: 'TELANGANA',     district: 'HYDERABAD' },
      'MYSORE':    { state: 'KARNATAKA',     district: 'MYSORE' },
    };
    // Determine fallback state/district from the first shuffled city
    const fallbackCity = (shuffled[0] || 'DELHI').toUpperCase();
    const fallback = CITY_STATE_MAP[fallbackCity] || { state: 'DELHI', district: 'NEW DELHI' };
    const finalState = (traveler.refStateIndia || fallback.state).toUpperCase();
    const finalDistrict = (traveler.refDistrictIndia || fallback.district).toUpperCase();

    // Select state
    await page.evaluate(function(args) {
      var stateSel = document.getElementById('stateofsponsor_ind') as HTMLSelectElement;
      if (stateSel && stateSel.options.length > 1) {
        var opts = Array.from(stateSel.options);
        var match = null;
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].text.toUpperCase() === args.state) { match = opts[i]; break; }
        }
        if (!match) {
          for (var i = 0; i < opts.length; i++) {
            if (opts[i].text.toUpperCase().includes(args.state)) { match = opts[i]; break; }
          }
        }
        stateSel.value = match ? match.value : stateSel.options[1].value;
        stateSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { state: finalState });
    await delay(2000); // wait for district dropdown to populate

    // Select district
    await page.evaluate(function(args) {
      var distSel = document.getElementById('districtofsponsor_ind') as HTMLSelectElement;
      if (distSel && distSel.options.length > 1) {
        var opts = Array.from(distSel.options);
        var match = null;
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].text.toUpperCase() === args.district) { match = opts[i]; break; }
        }
        if (!match) {
          for (var i = 0; i < opts.length; i++) {
            if (opts[i].text.toUpperCase().includes(args.district)) { match = opts[i]; break; }
          }
        }
        distSel.value = match ? match.value : distSel.options[1].value;
        distSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { district: finalDistrict });
    console.log(`  ✅ India State: ${finalState}`);
    console.log(`  ✅ India District: ${finalDistrict}`);
    await fillByIdOr('visaDetails', 'refPhoneIndia', 'phoneofsponsor_ind', 'India Ref Phone', traveler.refPhoneIndia || '9999999999');

    // ── Reference in Home Country — use customer's data from our website ──
    console.log('\n  🏠 Reference in Home Country');
    await fillByIdOr('visaDetails', 'refNameHome',  'nameofsponsor_msn', 'Home Ref Name',    traveler.refNameHome || `${traveler.firstName} ${traveler.lastName}`);
    await fillByIdOr('visaDetails', 'refAddr1Home', 'add1ofsponsor_msn', 'Home Ref Addr 1',  traveler.refAddressHome || traveler.address || 'NA');
    // State + ZIP (refDistrictHome is repurposed as ZIP on our website)
    const homeStateZip = [traveler.refStateHome, traveler.refDistrictHome].filter(Boolean).join(', ') || `${traveler.city || ''}, ${traveler.state || ''}`.trim() || 'NA';
    await fillByIdOr('visaDetails', 'refAddr2Home', 'add2ofsponsor_msn', 'Home Ref Addr 2',  homeStateZip);
    await fillByIdOr('visaDetails', 'refPhoneHome', 'phoneofsponsor_msn', 'Home Ref Phone',  traveler.refPhoneHome || traveler.phoneNumber || '0000000000');

    // Auto-continue to Step 5
    await delay(1500);
    break;
    } // end Step 4 redo loop

    // Click "Save and Continue" button — try multiple selectors
    let clicked = false;
    const saveSelectors = [
      'input[type="submit"][value*="Save and Continue"]',
      'input[type="button"][value*="Save and Continue"]',
      'input[value="Save and Continue"]',
      'button:has-text("Save and Continue")',
      'input[type="submit"][value*="Save"]',
      '.btn-primary[value*="Save"]',
    ];
    for (const sel of saveSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.scrollIntoViewIfNeeded();
          await delay(300);
          const box = await el.boundingBox();
          if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            console.log(`  ✅ Clicked Save and Continue (${sel})`);
            clicked = true;
            break;
          }
        }
      } catch {}
    }
    if (!clicked) {
      // Fallback: find by JS — any submit button
      const submitted = await page.evaluate(function() {
        var inputs = document.querySelectorAll('input[type="submit"], input[type="button"], button');
        for (var i = 0; i < inputs.length; i++) {
          var el = inputs[i] as HTMLInputElement;
          var val = (el.value || el.textContent || '').toLowerCase();
          if (val.indexOf('save') >= 0 && val.indexOf('continue') >= 0) {
            el.click();
            return val;
          }
        }
        return null;
      });
      if (submitted) {
        console.log(`  ✅ Clicked Save and Continue via JS: ${submitted}`);
        clicked = true;
      }
    }
    if (!clicked) {
      console.log('  ⚠️  Could not click Save and Continue — please click manually');
    }
    await delay(5000);

    // ══════════════════════════════════════════════════════════
    // STEP 5 — SECURITY QUESTIONS
    // ══════════════════════════════════════════════════════════
    while (true) { // redo loop for Step 5
    console.log('\n📝 STEP 5 — Security Questions');
    console.log('────────────────────────────────────────────\n');

    // Wait for Step 5 to ACTUALLY load. The previous version waited for any
    // visible radio button — but Step 4 has radios too (hotel, SAARC, prior
    // visa…), so it resolved instantly on the still-displayed Step 4 form
    // and the bot proceeded to click "NO" on every Step 4 radio group,
    // clobbering the hotel answer.
    //
    // Strategy now: wait for a Step-4-defining field to disappear BEFORE
    // scanning radios. Use multiple Step 4 markers — if any are gone the
    // page has transitioned. Then verify Step 5 radios are visible.
    console.log('  ⏳ Waiting for Step 5 to load (waiting for Step 4 to unload)...');
    const step4Markers = ['#placesToBeVisited1_id', '#nameofsponsor_ind', '#exitpoint'];
    try {
      // Poll up to 60s for Step 4 markers to vanish (detached or hidden).
      const start = Date.now();
      let step4Cleared = false;
      while (Date.now() - start < 60_000) {
        const stillThere = await page.evaluate((ids: string[]) => {
          for (const sel of ids) {
            const el = document.querySelector(sel) as HTMLElement | null;
            // visible = still in the DOM AND has layout (offsetParent set)
            if (el && el.offsetParent !== null) return true;
          }
          return false;
        }, step4Markers);
        if (!stillThere) { step4Cleared = true; break; }
        await delay(500);
      }
      if (!step4Cleared) {
        console.log('  ⚠️  Step 4 markers still visible after 60s — Step 5 may not have loaded.');
        console.log('     Will scan radios anyway but they may be Step 4 leftovers.');
      } else {
        console.log('  ✅ Step 4 unloaded — waiting for Step 5 form...');
      }
      // Now wait for Step 5 radios + network settle
      await page.waitForSelector('input[type="radio"]', { timeout: 30_000, state: 'visible' });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      console.log('  ✅ Step 5 form detected');
    } catch {
      console.log('  ⚠️  Could not detect Step 5 — waiting extra time...');
    }
    await delay(1500);

    // Discover Step 5 radios
    const s5Radios = await page.$$eval('input[type="radio"]', function(els) {
      var r: any[] = [];
      for (var i = 0; i < els.length; i++) {
        var e = els[i] as HTMLInputElement;
        r.push({ name: e.name, value: e.value, id: e.id });
      }
      return r;
    });
    console.log('  📋 Step 5 radios:', JSON.stringify(s5Radios, null, 2));

    // Group radios by name
    const s5Groups = new Map<string, any[]>();
    for (const r of s5Radios) {
      if (!s5Groups.has(r.name)) s5Groups.set(r.name, []);
      s5Groups.get(r.name)!.push(r);
    }

    // Click the admin-chosen answer on each group (default = NO for all security questions).
    // Admin can override with hardcoded "YES"/"NO" for bulk, or "manual"/"skip".
    {
      const r = adminOr('security', 'securityRadios', botOverrides, traveler, order, 'NO');
      if (r.source === 'manual') {
        console.log('  ⏸️  Security radios marked manual — answer all in browser, press Enter...');
        await waitForEnter();
      } else if (r.source === 'skip') {
        console.log('  ⏭️  Security radios skipped by admin');
      } else {
        const pick = String(r.value || 'NO').toUpperCase();
        for (const [name, radios] of s5Groups) {
          const target = radios.find((rr: any) =>
            (pick === 'YES' ? ['YES', 'Yes', 'Y'] : ['NO', 'No', 'N']).includes(rr.value),
          );
          if (target && target.id) {
            try {
              const el = await page.$(`#${target.id}`);
              if (el) {
                await el.scrollIntoViewIfNeeded();
                await delay(150);
                const box = await el.boundingBox();
                if (box) {
                  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                  await delay(50);
                  await page.mouse.down();
                  await delay(30);
                  await page.mouse.up();
                  console.log(`  ✅ ${name}: ${pick}${sourceTag(r.source)}`);
                }
              }
            } catch { console.log(`  ⚠️  ${name}: click failed`); }
          }
        }
      }
    }

    // ── Declaration checkbox on Step 5 — admin can override to manual/skip ──
    console.log('\n  ☑️  Declaration checkbox');
    {
      const r = adminOr('security', 'declarationCheck', botOverrides, traveler, order, 'true');
      if (r.source === 'manual') {
        console.log('  ⏸️  Declaration marked manual — check in browser, press Enter...');
        await waitForEnter();
      } else if (r.source === 'skip') {
        console.log('  ⏭️  Declaration checkbox skipped by admin');
      } else {
        try {
          // Find any checkbox that's related to declaration
          const cbInfo = await page.evaluate(function() {
            var cbs = document.querySelectorAll('input[type="checkbox"]');
            for (var i = 0; i < cbs.length; i++) {
              var cb = cbs[i] as HTMLInputElement;
              if (!cb.checked) {
                var row = cb.closest('tr') || cb.parentElement?.parentElement;
                var rowText = row ? (row.textContent || '') : '';
                if (rowText.toLowerCase().indexOf('declare') >= 0 || rowText.toLowerCase().indexOf('hereby') >= 0 || rowText.toLowerCase().indexOf('correct to the best') >= 0) {
                  return { id: cb.id, name: cb.name };
                }
              }
            }
            for (var i = 0; i < cbs.length; i++) {
              var cb = cbs[i] as HTMLInputElement;
              if (!cb.checked) return { id: cb.id, name: cb.name };
            }
            return null;
          });
          if (cbInfo) {
            const selector = cbInfo.id ? `#${cbInfo.id}` : `input[name="${cbInfo.name}"]`;
            const cbEl = await page.$(selector);
            if (cbEl) {
              await cbEl.scrollIntoViewIfNeeded();
              await delay(300);
              const box = await cbEl.boundingBox();
              if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                console.log(`  ✅ Declaration checkbox clicked (${selector})${sourceTag(r.source)}`);
              }
            }
          } else {
            console.log('  ⚠️  No declaration checkbox found');
          }
        } catch (err: any) { console.log(`  ⚠️  Declaration checkbox failed: ${err?.message}`); }
      }
    }

    // Auto-continue to Step 6
    await delay(1500);
    break;
    } // end Step 5 redo loop

    // Click "Save and Continue" button
    let s5Clicked = false;
    for (const sel of ['input[type="submit"][value*="Save and Continue"]', 'input[value="Save and Continue"]', 'input[type="submit"][value*="Save"]']) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.scrollIntoViewIfNeeded();
          await delay(300);
          const box = await el.boundingBox();
          if (box) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); s5Clicked = true; break; }
        }
      } catch {}
    }
    if (!s5Clicked) {
      const submitted = await page.evaluate(function() {
        var inputs = document.querySelectorAll('input[type="submit"], input[type="button"], button');
        for (var i = 0; i < inputs.length; i++) {
          var el = inputs[i] as HTMLInputElement;
          var val = (el.value || el.textContent || '').toLowerCase();
          if (val.indexOf('save') >= 0 && val.indexOf('continue') >= 0) { el.click(); return val; }
        }
        return null;
      });
      if (submitted) s5Clicked = true;
    }
    console.log(s5Clicked ? '  ✅ Clicked Save and Continue' : '  ⚠️  Could not click Save and Continue');
    await delay(5000);

    // ══════════════════════════════════════════════════════════
    // STEP 6 — PHOTO UPLOAD
    // ══════════════════════════════════════════════════════════
    while (true) { // redo loop for Step 6
    console.log('\n📝 STEP 6 — Photo Upload');
    console.log('────────────────────────────────────────────\n');

    // Wait for Step 6 to load
    console.log('  ⏳ Waiting for Step 6 to load...');
    try {
      await page.waitForSelector('input[type="file"]', { timeout: 60000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      console.log('  ✅ Step 6 form detected');
    } catch {
      console.log('  ⚠️  Could not detect file input — waiting extra...');
    }
    await delay(1500);

    // Try to upload the photo automatically — admin override check first
    const photoOverride = adminOr('photoUpload', 'photo', botOverrides, traveler, order, traveler.photoUrl);
    if (photoOverride.source === 'manual') {
      console.log('  ⏸️  Photo upload marked manual — upload in browser, press Enter when done...');
      await waitForEnter();
    } else if (photoOverride.source === 'skip') {
      console.log('  ⏭️  Photo upload skipped by admin');
    } else if (photoOverride.value) {
      const photoRef = photoOverride.value;
      // If the override gave us an absolute path, use it; otherwise treat as relative to public/
      const photoPath = photoRef.startsWith('/') && fs.existsSync(photoRef)
        ? photoRef
        : path.resolve(process.cwd(), 'public', photoRef.replace(/^\//, ''));
      if (fs.existsSync(photoPath)) {
        const stat = fs.statSync(photoPath);
        const sizeKB = Math.round(stat.size / 1024);
        console.log(`  📷 Photo: ${photoPath} (${sizeKB} KB)`);
        if (stat.size < 10 * 1024) {
          console.log(`  ⚠️  Photo is ${sizeKB} KB — Indian eVisa requires minimum 10 KB`);
          botFlags.push(`🔴 Photo too small (${sizeKB} KB). Indian eVisa requires minimum 10 KB. Please ask customer to re-upload a proper photo.`);
        }
        if (stat.size > 1024 * 1024) {
          console.log(`  ⚠️  Photo is ${sizeKB} KB — Indian eVisa max is 1 MB`);
          botFlags.push(`🔴 Photo too large (${sizeKB} KB). Indian eVisa max is 1024 KB.`);
        }
        try {
          // Dump detailed form info — find ALL file inputs AND any labels/buttons targeting them
          const formDetails = await page.evaluate(function() {
            var inputs = document.querySelectorAll('input[type="file"]');
            var fileInputResults: any[] = [];
            for (var i = 0; i < inputs.length; i++) {
              var el = inputs[i] as HTMLInputElement;
              var style = window.getComputedStyle(el);
              fileInputResults.push({
                id: el.id,
                name: el.name,
                accept: el.accept,
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                rect: el.getBoundingClientRect(),
              });
            }
            // Find any labels pointing to a file input
            var labels: any[] = [];
            var allLabels = document.querySelectorAll('label');
            for (var i = 0; i < allLabels.length; i++) {
              var lb = allLabels[i] as HTMLLabelElement;
              if (lb.htmlFor) {
                var target = document.getElementById(lb.htmlFor) as HTMLInputElement;
                if (target && target.type === 'file') {
                  labels.push({ for: lb.htmlFor, text: lb.textContent?.trim().slice(0,80) });
                }
              }
            }
            // Check if there's a "Choose File" button/link nearby the file input
            var chooseButtons: any[] = [];
            var allBtns = document.querySelectorAll('button, input[type="button"]');
            for (var i = 0; i < allBtns.length; i++) {
              var btn = allBtns[i] as HTMLButtonElement | HTMLInputElement;
              var txt = ((btn as any).textContent || (btn as any).value || '').trim();
              if (txt.toLowerCase().indexOf('choose') >= 0 || txt.toLowerCase().indexOf('browse') >= 0) {
                chooseButtons.push({ id: btn.id, name: (btn as any).name || '', text: txt.slice(0, 60) });
              }
            }
            // Get the HTML around the file input for inspection
            var snippet = '';
            if (inputs.length > 0) {
              var parent = inputs[0].parentElement;
              if (parent && parent.parentElement) parent = parent.parentElement;
              snippet = parent ? parent.outerHTML.slice(0, 2000) : '';
            }
            return { fileInputs: fileInputResults, labels, chooseButtons, snippet };
          });
          console.log(`  📋 File inputs: ${JSON.stringify(formDetails.fileInputs, null, 2)}`);
          if (formDetails.labels.length) console.log(`  📋 Labels targeting file input: ${JSON.stringify(formDetails.labels)}`);
          if (formDetails.chooseButtons.length) console.log(`  📋 Choose/Browse buttons: ${JSON.stringify(formDetails.chooseButtons)}`);
          console.log(`  📋 HTML snippet around file input:\n${formDetails.snippet}`);

          const fileInputs = await page.$$('input[type="file"]');
          if (fileInputs.length > 0) {
            // Use filechooser event — simulates real user clicking "Choose File"
            // This is more trusted by anti-automation checks than direct setInputFiles
            console.log('  🔄 Triggering filechooser via real click...');
            const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
            // Click the file input (or its label) as a user would
            try {
              await fileInputs[0].click({ force: true });
            } catch {
              // If click fails (e.g., hidden input), dispatch a click via JS
              await page.evaluate(function() {
                var inp = document.querySelector('input[type="file"]') as HTMLInputElement;
                if (inp) inp.click();
              });
            }
            try {
              const fileChooser = await fileChooserPromise;
              await fileChooser.setFiles(photoPath);
              console.log('  ✅ Photo file attached via filechooser');
            } catch {
              // Fallback to direct setInputFiles
              console.log('  ⚠️  filechooser didn\'t open — falling back to setInputFiles');
              await fileInputs[0].setInputFiles(photoPath);
              console.log('  ✅ Photo file attached to input[0] (direct)');
            }

            // Verify the file was actually attached
            const attached = await page.evaluate(function() {
              var input = document.querySelector('input[type="file"]') as HTMLInputElement;
              if (!input) return { ok: false, reason: 'no input' };
              if (!input.files || input.files.length === 0) return { ok: false, reason: 'no files' };
              return { ok: true, name: input.files[0].name, size: input.files[0].size };
            });
            console.log(`  📋 File input state: ${JSON.stringify(attached)}`);

            // Trigger change event in case the site's JS listens for it
            await page.evaluate(function() {
              var input = document.querySelector('input[type="file"]') as HTMLInputElement;
              if (input) {
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('input', { bubbles: true }));
              }
            });
            // Wait longer for site's JS to process the file selection
            await delay(5000);

            // Click "Upload Photo" button (or similar)
            let uploadClicked = false;
            const uploadSelectors = [
              'input[type="submit"][value="Upload Photo"]',
              'input[type="button"][value="Upload Photo"]',
              'input[type="submit"][value*="Upload"]',
              'input[type="button"][value*="Upload"]',
              'button:has-text("Upload Photo")',
              'button:has-text("Upload")',
            ];
            for (const sel of uploadSelectors) {
              try {
                const btn = await page.$(sel);
                if (btn && await btn.isVisible()) {
                  await btn.scrollIntoViewIfNeeded();
                  await delay(300);
                  const box = await btn.boundingBox();
                  if (box) {
                    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                    console.log(`  ✅ Clicked Upload button (${sel})`);
                    uploadClicked = true;
                    break;
                  }
                }
              } catch {}
            }
            if (!uploadClicked) {
              // Fallback: JS search for any submit button with "upload" in text
              const result = await page.evaluate(function() {
                var btns = document.querySelectorAll('input[type="submit"], input[type="button"], button');
                for (var i = 0; i < btns.length; i++) {
                  var el = btns[i] as HTMLInputElement;
                  var val = (el.value || el.textContent || '').toLowerCase();
                  if (val.indexOf('upload') >= 0) { el.click(); return val; }
                }
                return null;
              });
              if (result) { console.log(`  ✅ Clicked Upload button via JS: ${result}`); uploadClicked = true; }
            }
            if (!uploadClicked) {
              console.log('  ⚠️  Could not find Upload button — please click manually');
            }

            // Wait for upload to process — wait for network idle + page change
            console.log('  ⏳ Waiting for upload to process...');
            await delay(3000);
            try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}

            // Check for error messages (red text, alerts)
            const errorText = await page.evaluate(function() {
              var errorSelectors = ['.error', '.alert', '[style*="color:red"]', '[style*="color: red"]', 'font[color="red"]', '.validation-message'];
              for (var i = 0; i < errorSelectors.length; i++) {
                var els = document.querySelectorAll(errorSelectors[i]);
                for (var j = 0; j < els.length; j++) {
                  var text = (els[j].textContent || '').trim();
                  if (text && text.length > 3 && text.length < 300 && (text.toLowerCase().indexOf('error') >= 0 || text.toLowerCase().indexOf('invalid') >= 0 || text.toLowerCase().indexOf('must') >= 0 || text.toLowerCase().indexOf('failed') >= 0 || text.toLowerCase().indexOf('rejected') >= 0)) {
                    return text;
                  }
                }
              }
              return null;
            });
            if (errorText) {
              console.log(`  ⚠️  Site error message: "${errorText}"`);
              botFlags.push(`🔴 Step 6: Gov site rejected photo: "${errorText}"`);
            }

            // Check for success indicators — image preview showing the photo, or URL change to next step
            const hasPreview = await page.evaluate(function() {
              var imgs = document.querySelectorAll('img');
              for (var i = 0; i < imgs.length; i++) {
                var img = imgs[i] as HTMLImageElement;
                var src = img.src || '';
                // Skip logo/decorative images
                if (src.indexOf('logo') >= 0 || src.indexOf('banner') >= 0 || src.indexOf('.gif') >= 0) continue;
                // Data URLs or blob URLs indicate a local preview
                if (src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) return true;
                // Check for uploaded images (common patterns)
                if (src.indexOf('uploaded') >= 0 || src.indexOf('photo') >= 0 || src.indexOf('preview') >= 0) return true;
              }
              return false;
            });

            if (hasPreview && !errorText) {
              console.log('  ✅ Photo preview detected — upload likely succeeded');
            } else if (!errorText) {
              console.log('  ⚠️  Upload status unclear — proceeding to crop step, adjust in browser if needed');
            }
          } else {
            console.log('  ⚠️  No file input found');
            botFlags.push('🔴 Step 6: File input not found on page. Please upload photo manually.');
          }
        } catch (err: any) {
          console.log(`  ⚠️  Auto-upload failed: ${err?.message}`);
          botFlags.push(`🔴 Step 6: Auto-upload failed (${err?.message}). Please upload photo manually.`);
        }
      } else {
        console.log(`  ⚠️  Photo file not found at: ${photoPath}`);
        botFlags.push(`🔴 Step 6: Photo file missing (${photoRef}). Please check the customer's upload.`);
      }
    } else {
      console.log('  ⚠️  No photo URL in customer data');
      botFlags.push('🔴 Step 6: Customer has not uploaded a photo yet.');
    }

    // Auto-continue to Step 7 (crop) — no Enter needed
    await delay(1500);
    break;
    } // end Step 6 redo loop

    // ══════════════════════════════════════════════════════════
    // STEP 7 — CROP PHOTO (manual)
    // ══════════════════════════════════════════════════════════
    console.log('\n📝 STEP 7 — Crop Photo');
    console.log('────────────────────────────────────────────\n');
    console.log('  ⏸️  Please adjust the crop box in the browser and click "Crop and Save".');
    console.log('  ⏳ Bot will auto-detect when Step 8 (preview) loads...\n');

    // Auto-detect when Step 8 loads by polling for "Upload Image Again" button or "Save and Continue"
    // (those appear after Crop and Save is clicked)
    const cropStart = Date.now();
    const cropTimeout = 300000; // 5 min max
    let step8Loaded = false;
    while (Date.now() - cropStart < cropTimeout) {
      let hasStep8 = false;
      try {
        hasStep8 = await page.evaluate(function() {
          var btns = document.querySelectorAll('input[type="submit"], input[type="button"], button');
          for (var i = 0; i < btns.length; i++) {
            var el = btns[i] as HTMLInputElement;
            var val = (el.value || el.textContent || '').toLowerCase();
            // "Upload Image Again" is unique to Step 8
            if (val.indexOf('upload image again') >= 0) return true;
            // "Save and Continue" combined with no "Crop and Save" button indicates Step 8
            if (val.indexOf('save and continue') >= 0) {
              var stillCrop = false;
              for (var j = 0; j < btns.length; j++) {
                var v2 = ((btns[j] as HTMLInputElement).value || btns[j].textContent || '').toLowerCase();
                if (v2.indexOf('crop and save') >= 0) { stillCrop = true; break; }
              }
              if (!stillCrop) return true;
            }
          }
          return false;
        });
      } catch (err: any) {
        // Page navigated mid-evaluation — wait for it to settle and re-check
        const msg = (err?.message || '').toLowerCase();
        if (msg.indexOf('execution context was destroyed') >= 0 || msg.indexOf('navigation') >= 0) {
          console.log('  🔄 Page navigated — waiting for it to settle...');
          try { await page.waitForLoadState('domcontentloaded', { timeout: 10000 }); } catch {}
          await delay(1500);
          continue; // re-try evaluate
        }
        // Unknown error — log and retry after delay
      }
      if (hasStep8) {
        step8Loaded = true;
        console.log('  ✅ Crop saved — Step 8 (Photo Preview) loaded');
        break;
      }
      await delay(1000);
    }
    if (!step8Loaded) {
      console.log('  ⚠️  Step 8 not detected after 5 min — please press Enter when ready');
      await waitForEnter();
    }
    await delay(1500);

    // ══════════════════════════════════════════════════════════
    // STEP 8 — PHOTO PREVIEW / SAVE AND CONTINUE
    // ══════════════════════════════════════════════════════════
    console.log('\n📝 STEP 8 — Photo Preview');
    console.log('────────────────────────────────────────────\n');

    let s8Clicked = false;
    for (const sel of ['input[type="submit"][value="Save and Continue"]', 'input[type="submit"][value*="Save and Continue"]', 'input[value="Save and Continue"]']) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.scrollIntoViewIfNeeded();
          await delay(300);
          const box = await el.boundingBox();
          if (box) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); s8Clicked = true; break; }
        }
      } catch {}
    }
    console.log(s8Clicked ? '  ✅ Clicked Save and Continue' : '  ⚠️  Could not find Save and Continue — please click manually');
    await delay(3000);

    // ══════════════════════════════════════════════════════════
    // STEP 9 — DOCUMENT UPLOAD (PASSPORT)
    // ══════════════════════════════════════════════════════════
    while (true) { // redo loop for Step 9
    console.log('\n📝 STEP 9 — Passport Document Upload');
    console.log('────────────────────────────────────────────\n');

    // Wait for Step 9 file input to load
    console.log('  ⏳ Waiting for Step 9 to load...');
    try {
      await page.waitForSelector('input[type="file"]', { timeout: 60000, state: 'visible' });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      console.log('  ✅ Step 9 form detected');
    } catch {
      console.log('  ⚠️  Could not detect file input — waiting extra...');
    }
    await delay(1500);

    // Upload the passport PDF/image — admin override check first
    const passportOverride = adminOr('passportDoc', 'passportBio', botOverrides, traveler, order, traveler.passportBioUrl);
    if (passportOverride.source === 'manual') {
      console.log('  ⏸️  Passport upload marked manual — upload in browser, press Enter when done...');
      await waitForEnter();
    } else if (passportOverride.source === 'skip') {
      console.log('  ⏭️  Passport upload skipped by admin');
    } else if (passportOverride.value) {
      const passportRef = passportOverride.value;
      const passportPath = passportRef.startsWith('/') && fs.existsSync(passportRef)
        ? passportRef
        : path.resolve(process.cwd(), 'public', passportRef.replace(/^\//, ''));
      if (fs.existsSync(passportPath)) {
        const stat = fs.statSync(passportPath);
        const sizeKB = Math.round(stat.size / 1024);
        console.log(`  📄 Passport: ${passportPath} (${sizeKB} KB)`);
        if (stat.size > 300 * 1024) {
          console.log(`  ⚠️  Passport is ${sizeKB} KB — Indian eVisa max is 300 KB`);
          botFlags.push(`🔴 Passport too large (${sizeKB} KB). Indian eVisa max for documents is 300 KB.`);
        }
        try {
          const fileInputs = await page.$$('input[type="file"]');
          if (fileInputs.length > 0) {
            // Use filechooser event for trusted upload
            const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
            try { await fileInputs[0].click({ force: true }); } catch {}
            try {
              const fileChooser = await fileChooserPromise;
              await fileChooser.setFiles(passportPath);
              console.log('  ✅ Passport attached via filechooser');
            } catch {
              await fileInputs[0].setInputFiles(passportPath);
              console.log('  ✅ Passport attached (direct)');
            }
            await delay(2000);

            // Click "Upload Document"
            let uploadDocClicked = false;
            for (const sel of ['input[type="submit"][value="Upload Document"]', 'input[type="button"][value="Upload Document"]', 'input[value*="Upload Document"]', 'button:has-text("Upload Document")']) {
              try {
                const btn = await page.$(sel);
                if (btn && await btn.isVisible()) {
                  await btn.scrollIntoViewIfNeeded();
                  await delay(300);
                  const box = await btn.boundingBox();
                  if (box) {
                    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                    console.log(`  ✅ Clicked Upload Document`);
                    uploadDocClicked = true;
                    break;
                  }
                }
              } catch {}
            }
            if (!uploadDocClicked) {
              const result = await page.evaluate(function() {
                var btns = document.querySelectorAll('input[type="submit"], input[type="button"], button');
                for (var i = 0; i < btns.length; i++) {
                  var el = btns[i] as HTMLInputElement;
                  var val = (el.value || el.textContent || '').toLowerCase();
                  if (val.indexOf('upload') >= 0 && val.indexOf('document') >= 0) { el.click(); return val; }
                }
                return null;
              });
              if (result) { console.log(`  ✅ Clicked Upload Document via JS`); uploadDocClicked = true; }
            }

            // Wait for upload to finish
            console.log('  ⏳ Waiting for upload to process...');
            await delay(3000);
            try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}

            // Check the "I have verified..." checkbox — admin override: manual / skip allowed
            console.log('  ☑️  Checking verification checkbox...');
            {
              const rv = adminOr('passportDoc', 'verifiedCheck', botOverrides, traveler, order, 'true');
              if (rv.source === 'manual') {
                console.log('  ⏸️  Verification marked manual — check in browser, press Enter...');
                await waitForEnter();
              } else if (rv.source === 'skip') {
                console.log('  ⏭️  Verification checkbox skipped by admin');
              } else {
                try {
                  const cbInfo = await page.evaluate(function() {
                    var cbs = document.querySelectorAll('input[type="checkbox"]');
                    for (var i = 0; i < cbs.length; i++) {
                      var cb = cbs[i] as HTMLInputElement;
                      if (!cb.checked) {
                        var row = cb.closest('tr') || cb.parentElement?.parentElement;
                        var rowText = row ? (row.textContent || '') : '';
                        if (rowText.toLowerCase().indexOf('verified') >= 0 || rowText.toLowerCase().indexOf('requirement') >= 0 || rowText.toLowerCase().indexOf('uploaded') >= 0) {
                          return { id: cb.id, name: cb.name };
                        }
                      }
                    }
                    for (var i = 0; i < cbs.length; i++) {
                      var cb = cbs[i] as HTMLInputElement;
                      if (!cb.checked) return { id: cb.id, name: cb.name };
                    }
                    return null;
                  });
                  if (cbInfo) {
                    const selector = cbInfo.id ? `#${cbInfo.id}` : `input[name="${cbInfo.name}"]`;
                    const cbEl = await page.$(selector);
                    if (cbEl) {
                      await cbEl.scrollIntoViewIfNeeded();
                      await delay(300);
                      const box = await cbEl.boundingBox();
                      if (box) {
                        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                        console.log(`  ✅ Checked verification checkbox${sourceTag(rv.source)}`);
                      }
                    }
                  } else {
                    console.log('  ⚠️  No verification checkbox found');
                  }
                } catch {}
              }
            }

            await delay(1000);

            // Click "Confirm" button — admin override: manual / skip allowed
            console.log('  ✓  Clicking Confirm...');
            {
              const rc = adminOr('passportDoc', 'confirmBtn', botOverrides, traveler, order, 'click');
              if (rc.source === 'manual') {
                console.log('  ⏸️  Confirm marked manual — click in browser, press Enter...');
                await waitForEnter();
              } else if (rc.source === 'skip') {
                console.log('  ⏭️  Confirm button skipped by admin');
              } else {
                let confirmClicked = false;
                for (const sel of ['input[type="submit"][value="Confirm"]', 'input[type="button"][value="Confirm"]', 'input[value="Confirm"]', 'button:has-text("Confirm")']) {
                  try {
                    const btn = await page.$(sel);
                    if (btn && await btn.isVisible()) {
                      await btn.scrollIntoViewIfNeeded();
                      await delay(300);
                      const box = await btn.boundingBox();
                      if (box) {
                        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                        console.log(`  ✅ Clicked Confirm${sourceTag(rc.source)}`);
                        confirmClicked = true;
                        break;
                      }
                    }
                  } catch {}
                }
                if (!confirmClicked) {
                  const result = await page.evaluate(function() {
                    var btns = document.querySelectorAll('input[type="submit"], input[type="button"], button');
                    for (var i = 0; i < btns.length; i++) {
                      var el = btns[i] as HTMLInputElement;
                      var val = (el.value || el.textContent || '').toLowerCase();
                      if (val.indexOf('confirm') >= 0) { el.click(); return val; }
                    }
                    return null;
                  });
                  if (result) { console.log(`  ✅ Clicked Confirm via JS${sourceTag(rc.source)}`); confirmClicked = true; }
                }
                if (!confirmClicked) console.log('  ⚠️  Could not find Confirm button — please click manually');
              }
            }
            await delay(5000);
          } else {
            console.log('  ⚠️  No file input found on Step 9');
            botFlags.push('🔴 Step 9: File input not found. Please upload passport document manually.');
          }
        } catch (err: any) {
          console.log(`  ⚠️  Passport upload failed: ${err?.message}`);
          botFlags.push(`🔴 Step 9: Passport upload failed (${err?.message}). Please upload manually.`);
        }
      } else {
        console.log(`  ⚠️  Passport file not found at: ${passportPath}`);
        botFlags.push(`🔴 Step 9: Passport file missing (${passportRef}). Please check the customer's upload.`);
      }
    } else {
      console.log('  ⚠️  No passport URL in customer data');
      botFlags.push('🔴 Step 9: Customer has not uploaded a passport document yet.');
    }

    // Auto-continue to Step 10
    await delay(1500);
    break;
    } // end Step 9 redo loop

    // ══════════════════════════════════════════════════════════
    // STEP 10 — VERIFIED AND CONTINUE (review summary page)
    // ══════════════════════════════════════════════════════════
    console.log('\n📝 STEP 10 — Verified and Continue');
    console.log('────────────────────────────────────────────\n');

    // Wait for the summary page to load, then wait for user to click "Verified and Continue"
    console.log('  ⏳ Waiting for summary page to load...');
    try {
      await page.waitForFunction(function() {
        var btns = document.querySelectorAll('input[type="submit"], input[type="button"], button');
        for (var i = 0; i < btns.length; i++) {
          var el = btns[i] as HTMLInputElement;
          var val = (el.value || el.textContent || '').toLowerCase();
          if (val.indexOf('verified') >= 0 && val.indexOf('continue') >= 0) return true;
        }
        return false;
      }, { timeout: 60000 });
      console.log('  ✅ Summary page detected');
    } catch { console.log('  ⚠️  Could not detect summary page — continuing anyway'); }

    console.log('\n  ⏸️  Please review the summary and click "Verified and Continue" in the browser.');
    console.log('  ⏳ Bot will auto-detect when Step 11 (payment page) loads...\n');

    // Poll for payment page (has "Pay Now" button and "Application Id" text)
    const vStart = Date.now();
    const vTimeout = 300000; // 5 min
    let paymentPageLoaded = false;
    while (Date.now() - vStart < vTimeout) {
      let found = false;
      try {
        found = await page.evaluate(function() {
          var btns = document.querySelectorAll('input[type="submit"], input[type="button"], button');
          for (var i = 0; i < btns.length; i++) {
            var el = btns[i] as HTMLInputElement;
            var val = (el.value || el.textContent || '').toLowerCase();
            if (val.indexOf('pay now') >= 0) return true;
          }
          return false;
        });
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        if (msg.indexOf('execution context was destroyed') >= 0 || msg.indexOf('navigation') >= 0) {
          console.log('  🔄 Page navigated — waiting for it to settle...');
          try { await page.waitForLoadState('domcontentloaded', { timeout: 10000 }); } catch {}
          await delay(1500);
          continue;
        }
      }
      if (found) {
        paymentPageLoaded = true;
        console.log('  ✅ Payment page (Step 11) loaded');
        break;
      }
      await delay(1000);
    }
    if (!paymentPageLoaded) {
      console.log('  ⚠️  Payment page not detected after 5 min — please press Enter when ready');
      await waitForEnter();
    }
    await delay(1500);

    // ══════════════════════════════════════════════════════════
    // STEP 11 — PAYMENT PAGE (capture Application ID, click Pay Now, select PayPal)
    // ══════════════════════════════════════════════════════════
    console.log('\n📝 STEP 11 — Payment');
    console.log('────────────────────────────────────────────\n');

    // Wait for payment page to load (has "Pay Now" or "Application id")
    console.log('  ⏳ Waiting for payment page to load...');
    try {
      await page.waitForFunction(function() {
        var bodyText = document.body.innerText.toLowerCase();
        return (bodyText.indexOf('application id') >= 0 || bodyText.indexOf('pay now') >= 0);
      }, { timeout: 60000 });
      console.log('  ✅ Payment page detected');
    } catch { console.log('  ⚠️  Could not detect payment page — continuing anyway'); }
    await delay(2000);

    // Extract Application ID from the page
    console.log('  🔍 Extracting Application ID...');
    const govAppId = await page.evaluate(function() {
      // Scan the body text for pattern like "Application id : XXXXXXXXXXXX" or "Application Id: XXXXXXXX"
      var bodyText = document.body.innerText || '';
      // Match patterns like "Application id : 3S32V64C3226" or "Application Id:- 09170753YARPV9F"
      var patterns = [
        /Application\s*[Ii][Dd]\s*[:\-]?\s*([A-Z0-9]{8,20})/,
        /Temporary\s*Application\s*[Ii][Dd]\s*[:\-]?\s*([A-Z0-9]{8,20})/,
      ];
      for (var i = 0; i < patterns.length; i++) {
        var m = bodyText.match(patterns[i]);
        if (m && m[1]) return m[1];
      }
      return null;
    });

    if (govAppId) {
      console.log(`  ✅ Application ID found: ${govAppId}`);
      // Save to our database + mark as SUBMITTED
      try {
        await prisma.order.update({
          where: { id: order.id },
          data: { applicationId: govAppId, status: 'SUBMITTED', submittedAt: new Date() },
        });
        console.log(`  ✅ Application ID saved & status set to SUBMITTED on order ${order.orderNumber}`);
      } catch (err: any) {
        console.log(`  ⚠️  Could not save Application ID: ${err?.message}`);
      }
    } else {
      console.log('  ⚠️  Could not extract Application ID from page');
      botFlags.push('🔴 Step 11: Could not extract Application ID from payment page. Please copy it manually from the browser and paste into the order.');
    }

    // ── Select "Yes" on the Undertaking radio ── (admin can override: manual/skip)
    console.log('  ☑️  Selecting Yes on Undertaking...');
    {
      const ru = adminOr('payment', 'undertaking', botOverrides, traveler, order, 'YES');
      if (ru.source === 'manual') {
        console.log('  ⏸️  Undertaking marked manual — click Yes in browser, press Enter...');
        await waitForEnter();
      } else if (ru.source === 'skip') {
        console.log('  ⏭️  Undertaking skipped by admin');
      } else {
        const pickYes = /^y/i.test(String(ru.value || 'YES'));
        const wantedVals = pickYes ? ['Y', 'YES'] : ['N', 'NO'];
        try {
          const radio = await page.evaluate(function(args) {
            var radios = document.querySelectorAll('input[type="radio"]');
            for (var i = 0; i < radios.length; i++) {
              var r = radios[i] as HTMLInputElement;
              var val = (r.value || '').toUpperCase();
              if (args.wanted.indexOf(val) >= 0) return { id: r.id, name: r.name, value: r.value };
            }
            return null;
          }, { wanted: wantedVals });
          if (radio) {
            const selector = radio.id ? `#${radio.id}` : `input[name="${radio.name}"][value="${radio.value}"]`;
            const el = await page.$(selector);
            if (el) {
              await el.scrollIntoViewIfNeeded();
              await delay(500);
              const box = await el.boundingBox();
              if (box) {
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await delay(100);
                await page.mouse.down();
                await delay(50);
                await page.mouse.up();
                console.log(`  ✅ Undertaking: ${pickYes ? 'Yes' : 'No'}${sourceTag(ru.source)}`);
              }
            }
          } else {
            console.log('  ⚠️  Could not find Undertaking radio');
          }
        } catch (err: any) { console.log(`  ⚠️  Undertaking failed: ${err?.message}`); }
      }
    }
    await delay(800);

    // ── Click "Pay Now" ── (admin can override: manual/skip)
    console.log('  💳 Clicking Pay Now...');
    {
      const rp = adminOr('payment', 'payNow', botOverrides, traveler, order, 'click');
      if (rp.source === 'manual') {
        console.log('  ⏸️  Pay Now marked manual — click in browser, press Enter...');
        await waitForEnter();
      } else if (rp.source === 'skip') {
        console.log('  ⏭️  Pay Now skipped by admin');
      } else {
        let payClicked = false;
        for (const sel of ['input[type="submit"][value="Pay Now"]', 'input[type="button"][value="Pay Now"]', 'input[value="Pay Now"]', 'button:has-text("Pay Now")']) {
          try {
            const btn = await page.$(sel);
            if (btn && await btn.isVisible()) {
              await btn.scrollIntoViewIfNeeded();
              await delay(300);
              const box = await btn.boundingBox();
              if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                console.log(`  ✅ Clicked Pay Now${sourceTag(rp.source)}`);
                payClicked = true;
                break;
              }
            }
          } catch {}
        }
        if (!payClicked) {
          const result = await page.evaluate(function() {
            var btns = document.querySelectorAll('input[type="submit"], input[type="button"], button');
            for (var i = 0; i < btns.length; i++) {
              var el = btns[i] as HTMLInputElement;
              var val = (el.value || el.textContent || '').toLowerCase();
              if (val.indexOf('pay now') >= 0) { el.click(); return val; }
            }
            return null;
          });
          if (result) { console.log(`  ✅ Clicked Pay Now via JS${sourceTag(rp.source)}`); payClicked = true; }
        }
        if (!payClicked) console.log('  ⚠️  Could not find Pay Now button');
      }
    }
    await delay(2000);

    // ── Select payment gateway (default PayPal) ── admin can hardcode another label (e.g. 'Stripe'), manual, or skip
    console.log('  💳 Selecting payment gateway...');
    {
      const rg = adminOr('payment', 'gatewayPaypal', botOverrides, traveler, order, 'PayPal');
      if (rg.source === 'manual') {
        console.log('  ⏸️  Payment gateway marked manual — pick in browser, press Enter...');
        await waitForEnter();
      } else if (rg.source === 'skip') {
        console.log('  ⏭️  Payment gateway skipped by admin');
      } else {
        const needle = String(rg.value || 'PayPal').toLowerCase();
        let gatewayClicked = false;
        try {
          const idx = await page.evaluate(function(args) {
            var radios = document.querySelectorAll('input[type="radio"]');
            for (var i = 0; i < radios.length; i++) {
              var r = radios[i] as HTMLInputElement;
              var labelText = '';
              if (r.id) {
                var lb = document.querySelector('label[for="' + r.id + '"]');
                if (lb) labelText = (lb.textContent || '').trim().toLowerCase();
              }
              if (labelText.indexOf(args.needle) === 0) return i;
              if ((r.value || '').toLowerCase() === args.needle) return i;
              var sibling = r.nextSibling;
              var firstText = '';
              while (sibling && !firstText) {
                if (sibling.nodeType === 3) firstText = (sibling.textContent || '').trim();
                else if (sibling.nodeType === 1) firstText = ((sibling as HTMLElement).textContent || '').trim();
                sibling = sibling.nextSibling;
              }
              firstText = firstText.split(/\s{2,}|\n/)[0].trim().toLowerCase();
              if (firstText === args.needle || firstText.indexOf(args.needle) === 0) return i;
            }
            return -1;
          }, { needle });
          if (idx >= 0) {
            console.log(`  📍 ${rg.value} radio at index ${idx}`);
            const allRadios = await page.$$('input[type="radio"]');
            if (idx < allRadios.length) {
              const el = allRadios[idx];
              await el.scrollIntoViewIfNeeded();
              await delay(300);
              const box = await el.boundingBox();
              if (box) {
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await delay(50);
                await page.mouse.down();
                await delay(30);
                await page.mouse.up();
                console.log(`  ✅ ${rg.value} selected${sourceTag(rg.source)}`);
                gatewayClicked = true;
              }
            }
          } else {
            console.log(`  ⚠️  Could not find "${rg.value}" radio by text`);
          }
        } catch (err: any) { console.log(`  ⚠️  Gateway selection failed: ${err?.message}`); }
        if (!gatewayClicked) console.log(`  ⚠️  Could not find "${rg.value}" option`);
      }
    }
    await delay(500);

    // ── Click "Continue" (payment gateway continue button) ──
    console.log('  ➡️  Clicking Continue...');
    {
      const rc = adminOr('payment', 'gatewayContinue', botOverrides, traveler, order, 'click');
      if (rc.source === 'manual') {
        console.log('  ⏸️  Continue marked manual — click in browser, press Enter...');
        await waitForEnter();
      } else if (rc.source === 'skip') {
        console.log('  ⏭️  Continue skipped by admin');
      } else {
        let contClicked = false;
        for (const sel of ['input[type="submit"][value="Continue"]', 'input[type="button"][value="Continue"]', 'input[value="Continue"]', 'button:has-text("Continue")']) {
          try {
            const btn = await page.$(sel);
            if (btn && await btn.isVisible()) {
              await btn.scrollIntoViewIfNeeded();
              await delay(300);
              const box = await btn.boundingBox();
              if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                console.log(`  ✅ Clicked Continue${sourceTag(rc.source)}`);
                contClicked = true;
                break;
              }
            }
          } catch {}
        }
        if (!contClicked) {
          const result = await page.evaluate(function() {
            var btns = document.querySelectorAll('input[type="submit"], input[type="button"], button');
            for (var i = 0; i < btns.length; i++) {
              var el = btns[i] as HTMLInputElement;
              var val = (el.value || el.textContent || '').trim().toLowerCase();
              if (val === 'continue') { el.click(); return val; }
            }
            return null;
          });
          if (result) { console.log(`  ✅ Clicked Continue via JS${sourceTag(rc.source)}`); contClicked = true; }
        }
        if (!contClicked) console.log('  ⚠️  Could not find Continue button');
      }
    }
    await delay(3000);

    // ══════════════════════════════════════════════════════════
    // SAVE BOT FLAGS
    // ══════════════════════════════════════════════════════════
    if (botFlags.length > 0) {
      console.log(`\n⚠️  ${botFlags.length} issue(s) flagged for manual attention:`);
      botFlags.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

      try {
        await prisma.order.update({
          where: { id: order.id },
          data: { botFlags: JSON.stringify(botFlags) },
        });
        console.log('  ✅ Bot flags saved to order');
      } catch (err: any) {
        console.log(`  ⚠️  Could not save bot flags: ${err?.message}`);
      }
    } else {
      console.log('\n✨ No issues flagged — all fields filled successfully!');
      // Clear any previous bot flags
      try {
        await prisma.order.update({ where: { id: order.id }, data: { botFlags: null } });
      } catch {}
    }

    // ══════════════════════════════════════════════════════════
    // DONE
    // ══════════════════════════════════════════════════════════
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Auto-fill complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    if (botFlags.length > 0) {
      console.log(`⚠️  ${botFlags.length} field(s) need manual attention — check flags in admin panel.`);
    }
    console.log('Please review all information, complete payment, and submit.');
    console.log('The browser will stay open. Close it when you\'re done.\n');

    // Auto-fill is done; mark the run completed NOW so the admin Bot Run
    // panel stops showing "Running". The bot then idles with the browser
    // open so the human can finish CAPTCHA/payment by hand.
    await botRunLog?.finish();

    // Keep browser open
    await page.waitForTimeout(999999999);

  } catch (error: any) {
    console.error('\n❌ Error:', error?.message || error);
    await botRunLog?.finish({ error: error?.message || String(error) });
  } finally {
    // Idempotent — if finish already ran above this is a no-op.
    await botRunLog?.finish();
    await prisma.$disconnect();
  }
}

// ── Wait for user input ──
// Returns 'redo' if user types redo, otherwise resolves normally
function waitForEnter(): Promise<string> {
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      const input = data.toString().trim().toLowerCase();
      resolve(input);
    });
  });
}

// Wait for Enter with redo support — returns true if user typed 'redo'
async function waitOrRedo(): Promise<boolean> {
  const input = await waitForEnter();
  return input === 'redo';
}

// ── Run ──

const orderArg = process.argv[2];
if (!orderArg) {
  console.error('Usage: npx tsx scripts/process-visa.ts <orderNumber>');
  console.error('Example: npx tsx scripts/process-visa.ts 00015');
  process.exit(1);
}

processVisa(orderArg);
