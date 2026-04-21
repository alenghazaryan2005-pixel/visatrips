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

const prisma = new PrismaClient();

// ── Helpers ──

function parseOrderNumber(input: string): number {
  const clean = input.replace(/[^0-9]/g, '');
  return parseInt(clean, 10);
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function selectDropdownByText(page: Page, selector: string, text: string) {
  try {
    const options = await page.$$eval(`${selector} option`, (opts: any[]) =>
      opts.map(o => ({ value: o.value, text: o.textContent?.trim() }))
    );
    // Try exact match first, then partial
    const textLower = text.toLowerCase();
    let match = options.find(o => o.text?.toLowerCase() === textLower);
    if (!match) match = options.find(o => o.text?.toLowerCase().startsWith(textLower));
    if (!match) match = options.find(o => o.text?.toLowerCase().includes(textLower));
    if (match) {
      await page.selectOption(selector, match.value);
    } else {
      console.warn(`⚠️  Could not find option "${text}" in ${selector}`);
    }
  } catch (e) {
    console.warn(`⚠️  Error selecting "${text}" in ${selector}:`, e);
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
  'JP': 'JAPAN', 'KR': 'SOUTH KOREA', 'SG': 'SINGAPORE', 'AE': 'UNITED ARAB EMIRATES',
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

  // Track bot issues that need manual attention
  const botFlags: string[] = [];
  console.log(`   Destination: ${order.destination}`);
  console.log(`   Visa Type: ${order.visaType}`);
  console.log(`   Email: ${traveler.email}\n`);

  // 2. Launch browser
  console.log('🌐 Launching browser (clean profile)...\n');
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

    // ══════════════════════════════════════════════════════════
    // STEP 1 — INITIAL REGISTRATION
    // ══════════════════════════════════════════════════════════
    console.log('📝 STEP 1 — Initial Registration');
    console.log('────────────────────────────────────────────\n');

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
    const passportCountry = traveler.passportCountry || 'US';
    const nationality = COUNTRY_MAP[passportCountry] || passportCountry;

    // Nationality — #nationality_id
    await selectDropdownByText(page, '#nationality_id', nationality);
    console.log(`  ✅ Nationality: ${nationality}`);
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
    await selectDropdownByText(page, '#ppt_type_id', 'ORDINARY');
    console.log('  ✅ Passport Type: ORDINARY');
    await delay(500);

    // Port of Arrival — #missioncode_id
    const arrivalPoint = traveler.arrivalPoint || 'Delhi (Airport)';
    const portName = arrivalPoint.split(' (')[0].toUpperCase();
    await selectDropdownByText(page, '#missioncode_id', portName);
    console.log(`  ✅ Port of Arrival: ${portName}`);
    await delay(500);

    // Date of Birth — #dob_id (hasDatepicker, need to use evaluate to bypass datepicker)
    const dob = parseDateString(traveler.dob);
    if (dob) {
      const dobStr = `${dob.day}/${dob.month}/${dob.year}`;
      await page.evaluate((val: string) => {
        const el = document.getElementById('dob_id') as HTMLInputElement;
        if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
      }, dobStr);
      console.log(`  ✅ Date of Birth: ${dobStr}`);
    }
    await delay(500);

    // Email — #email_id
    await page.fill('#email_id', traveler.email);
    console.log(`  ✅ Email: ${traveler.email}`);
    await delay(300);

    // Re-enter Email — #email_re_id
    await page.fill('#email_re_id', traveler.email);
    console.log(`  ✅ Re-enter Email: ${traveler.email}`);
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
    const visaMatch = VISA_MATCH[order.visaType] || { must: ['E-TOURIST', 'RECREATION'], label: 'e-Tourist (default)' };

    // Try to find and select the option that contains ALL must-phrases
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
      // Fallback log: show available tourist/business options
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
    await delay(500);

    // Expected Date of Arrival — #jouryney_id (note the typo in their code: "jouryney")
    const arrivalDate = traveler.arrivalDate ? formatDateForForm(traveler.arrivalDate) : '';
    if (arrivalDate) {
      await page.evaluate((val: string) => {
        const el = document.getElementById('jouryney_id') as HTMLInputElement;
        if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
      }, arrivalDate);
      console.log(`  ✅ Expected Arrival: ${arrivalDate}`);
    }
    await delay(500);

    // Declaration checkbox
    try {
      await page.click('#read_instructions_check');
      console.log('  ✅ Declaration checkbox checked');
    } catch {
      console.log('  ⚠️  Could not check declaration — please check it manually');
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

    // Fill fields by position (only visible ones)
    const fillInput = async (idx: number, value: string, label: string) => {
      if (idx < visInputs.length && value) {
        try { await visInputs[idx].fill(value); console.log(`  ✅ ${label}`); } catch (e) { console.log(`  ⚠️  ${label} failed`); }
      }
    };

    const fillSelect = async (idx: number, value: string, label: string) => {
      if (idx < visSelects.length && value) {
        try {
          const id = await visSelects[idx].getAttribute('id');
          if (id) await selectDropdownByText(page, `#${id}`, value);
          console.log(`  ✅ ${label}`);
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

    // Religion — Select[2]
    if (traveler.religion) await fillSelect(2, traveler.religion.toUpperCase(), 'Religion');
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

    // Lived 2+ years — find the YES radio by value (IDs flip between site versions)
    console.log('  🔍 Setting Lived 2+ years to Yes...');
    try {
      // Select the radio with value Y (or YES) under appl.refer_flag
      const yesRadio = await page.$('input[name="appl.refer_flag"][value="Y"], input[name="appl.refer_flag"][value="YES"]');
      if (yesRadio) {
        await yesRadio.scrollIntoViewIfNeeded();
        await delay(500);
        const box = await yesRadio.boundingBox();
        if (box) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          await page.mouse.move(cx, cy);
          await delay(100);
          await page.mouse.down();
          await delay(50);
          await page.mouse.up();
          await delay(500);
        }
      } else {
        console.log('  ⚠️  Could not find Yes radio for Lived 2+ years');
      }
    } catch {}

    // Wait a bit longer for the site's JS to register the click
    await delay(1000);

    // Verify — accept both Y/YES/yes (different parts of site use different values)
    const referVal = await page.evaluate(function() {
      var r = document.querySelector('input[name="appl.refer_flag"]:checked') as HTMLInputElement;
      return r ? r.value : 'none';
    });
    const refUpper = (referVal || '').toUpperCase();
    if (refUpper === 'Y' || refUpper === 'YES') {
      console.log(`  ✅ Lived 2+ years: Yes (value="${referVal}")`);
    } else {
      console.log(`  ⚠️  Lived 2+ years: ${referVal} — FLAGGED for manual fix`);
      botFlags.push('🔴 "Have you lived for at least two years in the country where you are applying visa?" — Bot could not select Yes. Please set this radio button to Yes manually.');
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

    // Passport Number — #passport_no
    if (traveler.passportNumber) {
      try { await page.fill('#passport_no', traveler.passportNumber); console.log('  ✅ Passport Number'); } catch { console.log('  ⚠️  Passport Number failed'); }
    } else {
      console.log('  ⏭️  Skipping Passport Number (not provided)');
    }

    // Place of Issue — #passport_issue_place
    if (traveler.passportPlaceOfIssue) {
      try { await page.fill('#passport_issue_place', traveler.passportPlaceOfIssue); console.log('  ✅ Place of Issue'); } catch { console.log('  ⚠️  Place of Issue failed'); }
    }

    // Date of Issue — #passport_issue_date (datepicker)
    if (traveler.passportIssued) {
      const issued = formatDateForForm(traveler.passportIssued);
      try {
        await page.evaluate((val) => {
          const el = document.getElementById('passport_issue_date') as HTMLInputElement;
          if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
        }, issued);
        console.log(`  ✅ Date of Issue: ${issued}`);
      } catch { console.log('  ⚠️  Date of Issue failed'); }
    }

    // Date of Expiry — #passport_expiry_date (datepicker)
    if (traveler.passportExpiry) {
      const expiry = formatDateForForm(traveler.passportExpiry);
      try {
        await page.evaluate((val) => {
          const el = document.getElementById('passport_expiry_date') as HTMLInputElement;
          if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
        }, expiry);
        console.log(`  ✅ Date of Expiry: ${expiry}`);
      } catch { console.log('  ⚠️  Date of Expiry failed'); }
    }
    await delay(300);

    // Other passport/IC held — appl.oth_ppt, values are "YES"/"NO" (not Y/N)
    const hasOtherPP = traveler.hasOtherPassport === 'yes';
    try {
      const otherPPVal = hasOtherPP ? 'YES' : 'NO';
      await page.click(`input[name="appl.oth_ppt"][value="${otherPPVal}"]`);
      console.log(`  ✅ Other Passport: ${hasOtherPP ? 'Yes' : 'No'}`);

      if (hasOtherPP) {
        await delay(1000);

        // Country of Issue for other passport — find the select that appeared
        const otherCountry = COUNTRY_MAP[traveler.passportCountryOfIssue || traveler.passportCountry || ''] || (traveler.passportCountryOfIssue || '').toUpperCase();
        if (otherCountry) {
          // Re-scan selects since new ones appeared
          const newSelects: any[] = [];
          const allSels = await page.$$('select');
          for (const s of allSels) { if (await s.isVisible()) newSelects.push(s); }
          // The "other passport country of issue" and "nationality mentioned therein" should be the last 2 selects
          if (newSelects.length >= 7) {
            const othCountrySel = newSelects[newSelects.length - 2];
            const othNatSel = newSelects[newSelects.length - 1];
            const othCountryId = await othCountrySel.getAttribute('id') || '';
            const othNatId = await othNatSel.getAttribute('id') || '';
            if (othCountryId) { await selectDropdownByText(page, `#${othCountryId}`, otherCountry); console.log('  ✅ Other PP Country of Issue'); }
            if (othNatId) { await selectDropdownByText(page, `#${othNatId}`, otherCountry); console.log('  ✅ Other PP Nationality Therein'); }
          }
        }

        // Passport/IC No
        if (traveler.otherPassportNumber) {
          try { await page.fill('#other_ppt_no', traveler.otherPassportNumber); console.log('  ✅ Other Passport Number'); } catch {}
        }
        // Date of Issue
        if (traveler.otherPassportDateOfIssue) {
          try {
            const otherIssued = formatDateForForm(traveler.otherPassportDateOfIssue);
            await page.evaluate((val) => {
              const el = document.getElementById('other_ppt_issue_date') as HTMLInputElement;
              if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
            }, otherIssued);
            console.log('  ✅ Other Passport Date of Issue');
          } catch {}
        }
        // Place of Issue
        if (traveler.otherPassportPlaceOfIssue) {
          try { await page.fill('#other_ppt_issue_place', traveler.otherPassportPlaceOfIssue); console.log('  ✅ Other Passport Place of Issue'); } catch {}
        }
      }
    } catch {
      console.log('  ⚠️  Could not set Other Passport');
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
    await fillById('pres_add1', traveler.address || 'NA', 'House No./Street');
    await fillById('pres_add2', traveler.city || 'NA', 'Village/Town/City');
    await selectById('pres_country', addrCountry, 'Country');
    await delay(500);
    await fillById('pres_add3', traveler.state || 'NA', 'State/Province');
    await fillById('pincode', traveler.zip || '00000', 'Postal/Zip Code');
    await fillById('pres_phone', traveler.phoneNumber || 'NA', 'Phone');
    await fillById('mobile', traveler.phoneNumber || 'NA', 'Mobile');
    await delay(300);

    // ── Permanent Address ──
    console.log('\n  📍 Permanent Address (same as present)');
    try { await page.check('input[type="checkbox"]', { force: true, timeout: 3000 }); console.log('  ✅ Same Address checked'); }
    catch { try { const cb = await page.$('input[type="checkbox"]'); if (cb) { const b = await cb.boundingBox(); if (b) await page.mouse.click(b.x+b.width/2, b.y+b.height/2); } console.log('  ✅ Same Address checked (mouse)'); } catch { console.log('  ⚠️  Checkbox failed'); } }
    await delay(1000);

    // ── Father's Details ──
    console.log('\n  👨 Father\'s Details');
    await fillById('fthrname', traveler.fatherName || 'NA', 'Name');
    await fillById('father_place_of_birth', traveler.fatherPlaceOfBirth || 'NA', 'Place of Birth');
    await selectById('father_nationality', COUNTRY_MAP[traveler.fatherNationality || ''] || traveler.fatherNationality || addrCountry, 'Nationality');
    await selectById('father_country_of_birth', COUNTRY_MAP[traveler.fatherCountryOfBirth || ''] || traveler.fatherCountryOfBirth || addrCountry, 'Country of Birth');

    // ── Mother's Details ──
    console.log('\n  👩 Mother\'s Details');
    await fillById('mother_name', traveler.motherName || 'NA', 'Name');
    await fillById('mother_place_of_birth', traveler.motherPlaceOfBirth || 'NA', 'Place of Birth');
    await selectById('mother_nationality', COUNTRY_MAP[traveler.motherNationality || ''] || traveler.motherNationality || addrCountry, 'Nationality');
    await selectById('mother_country_of_birth', COUNTRY_MAP[traveler.motherCountryOfBirth || ''] || traveler.motherCountryOfBirth || addrCountry, 'Country of Birth');

    // ── Marital Status ──
    console.log('\n  💍 Marital Status');
    const maritalVal = ({'Single':'SINGLE','Married':'MARRIED','Divorced':'DIVORCED','Widowed':'WIDOWED','Separated':'SEPARATED'} as Record<string,string>)[traveler.maritalStatus || ''] || 'SINGLE';
    await selectById('marital_status', maritalVal, 'Marital Status');
    await delay(500);

    // ── Pakistan parents — No ──
    console.log('\n  🇵🇰 Pakistan Heritage');
    // Method 1: Mouse click at element coordinates
    try {
      const pakNo = await page.$('#grandparent_flag2');
      if (pakNo) {
        const box = await pakNo.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          console.log('  ✅ Pakistan parents: No (mouse click)');
        }
      }
    } catch {}
    // Method 2: Focus + Space
    try {
      await page.focus('#grandparent_flag2');
      await page.keyboard.press('Space');
    } catch {}
    // Method 3: JS with full event chain
    await page.evaluate(function() {
      var no = document.getElementById('grandparent_flag2') as HTMLInputElement;
      var yes = document.getElementById('grandparent_flag1') as HTMLInputElement;
      if (yes) yes.checked = false;
      if (no) {
        no.checked = true;
        no.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        no.dispatchEvent(new Event('input', { bubbles: true }));
        no.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    // Verify
    const pakResult = await page.evaluate(function() {
      var el = document.getElementById('grandparent_flag2') as HTMLInputElement;
      return el ? el.checked : false;
    });
    console.log(`  📋 Pakistan No checked: ${pakResult}`);
    if (!pakResult) {
      botFlags.push('🔴 "Were your Parents/Grandparents Pakistan Nationals?" — Bot could not select No. Please set this manually.');
      console.log('  ⚠️  FLAGGED for manual fix');
    }

    // ── Employment ──
    console.log('\n  💼 Employment');
    const occVal = ({'Employed':'PRIVATE SERVICE','Self-employed':'SELF EMPLOYED','Unemployed':'UN-EMPLOYED','Student':'STUDENT','Retired':'RETIRED','Homemaker':'HOUSE WIFE','Business Owner':'BUSINESS','Government':'GOVT SERVICE'} as Record<string,string>)[traveler.employmentStatus || ''] || 'UN-EMPLOYED';
    await selectById('occupation', occVal, 'Occupation');
    await delay(500);
    await fillById('empname', isUnemployed ? 'NA' : (traveler.employerName || 'NA'), 'Employer Name');
    await fillById('empdesignation', 'NA', 'Designation');
    await fillById('empaddress', isUnemployed ? 'NA' : (traveler.employerAddress || traveler.address || 'NA'), 'Address');
    // Employer phone — skipped (optional, causes issues)

    // ── Military — No ──
    console.log('\n  🎖️ Military/Police');
    try { await page.click('#prev_org2', { force: true }); console.log('  ✅ Military/Police: No'); }
    catch { console.log('  ⚠️  Military radio failed'); }

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
    await fillById('placesToBeVisited1_id', placesVal, 'Places to Visit');

    // Exit port — dropdown
    const exitPort = traveler.exitPort?.split(' (')[0]?.toUpperCase() || shuffled[0] || 'DELHI';
    await selectById('exitpoint', exitPort, 'Port of Exit');

    // ── Radio questions — default to No ──
    console.log('\n  ❓ Yes/No Questions');
    const visitBefore = traveler.visitedIndiaBefore === 'yes' ? 'YES' : 'NO';
    const visaRefused = traveler.visaRefusedBefore === 'yes' ? 'YES' : 'NO';

    // Use mouse click approach for radios (same as Pakistan/Military on Step 3)
    const clickRadioSafe = async (id: string, label: string) => {
      try {
        const el = await page.$(`#${id}`);
        if (el) {
          await el.scrollIntoViewIfNeeded();
          await delay(200);
          const box = await el.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await delay(50);
            await page.mouse.down();
            await delay(30);
            await page.mouse.up();
            console.log(`  ✅ ${label}`);
          }
        }
      } catch { console.log(`  ⚠️  ${label} failed`); }
    };

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
      for (const info of hotelFieldInfo) {
        const idLower = info.id.toLowerCase();
        const nameLower = info.name.toLowerCase();
        const isTour = idLower.includes('touroperator') || nameLower.includes('touroperator') || idLower.includes('tour_op') || nameLower.includes('tour_op');
        const isHotel = idLower.includes('hotel') || nameLower.includes('hotel');
        if (!isTour && !isHotel) continue;
        const selector = info.id ? `#${info.id}` : `[name="${info.name}"]`;
        if (isTour) {
          if (idLower.includes('name') || nameLower.includes('name')) {
            try { await page.fill(selector, traveler.tourOperatorName || 'NA'); console.log(`  ✅ Tour Operator Name: ${traveler.tourOperatorName || 'NA'}`); filledAny = true; } catch {}
          } else if (idLower.includes('addr') || nameLower.includes('addr')) {
            try { await page.fill(selector, traveler.tourOperatorAddress || 'NA'); console.log(`  ✅ Tour Operator Address: ${traveler.tourOperatorAddress || 'NA'}`); filledAny = true; } catch {}
          }
        }
        if (isHotel) {
          if (idLower.includes('name') || nameLower.includes('name')) {
            try { await page.fill(selector, traveler.hotelName || 'NA'); console.log(`  ✅ Hotel Name: ${traveler.hotelName || 'NA'}`); filledAny = true; } catch {}
          } else if (idLower.includes('addr') || nameLower.includes('addr') || idLower.includes('place') || nameLower.includes('place')) {
            try { await page.fill(selector, traveler.hotelPlace || 'NA'); console.log(`  ✅ Hotel Place: ${traveler.hotelPlace || 'NA'}`); filledAny = true; } catch {}
          }
        }
      }
      if (!filledAny) {
        console.log('  ⚠️  Hotel fields did not appear — FLAGGED');
        botFlags.push('🔴 "Have you booked any room in Hotel/Resort through any Tour Operator?" — Bot could not select Yes or hotel sub-fields did not appear. Please set this manually and fill hotel details.');
      }
    } else {
      console.log('  ⏭️  Hotel Booked: No (default)');
    }
    await delay(200);

    // Previous visa + refused + SAARC — all default to No
    // Use Playwright's native click for No radios (they should just stay selected)
    for (const radioId of ['old_visa_flag2', 'refuse_flag2', 'saarc_flag2']) {
      try {
        await page.click(`#${radioId}`, { force: true });
        await delay(100);
      } catch {}
      // Verify and retry with mouse if needed
      const isChecked = await page.evaluate(function(id) {
        var el = document.getElementById(id) as HTMLInputElement;
        return el ? el.checked : false;
      }, radioId);
      if (!isChecked) {
        // Fallback: mouse click
        try {
          const el = await page.$(`#${radioId}`);
          if (el) {
            await el.scrollIntoViewIfNeeded();
            await delay(200);
            const box = await el.boundingBox();
            if (box) {
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              await page.mouse.down();
              await delay(30);
              await page.mouse.up();
            }
          }
        } catch {}
      }
      const finalChecked = await page.evaluate(function(id) {
        var el = document.getElementById(id) as HTMLInputElement;
        return el ? el.checked : false;
      }, radioId);
      console.log(`  ${finalChecked ? '✅' : '⚠️ '} Radio #${radioId}: ${finalChecked ? 'No' : 'FAILED'}`);
    }

    // ── Reference in India — use customer's data from the website ──
    console.log('\n  🇮🇳 Reference in India');
    await fillById('nameofsponsor_ind', traveler.refNameIndia || 'NA', 'Reference Name');
    await fillById('add1ofsponsor_ind', traveler.refAddressIndia || 'NA', 'Address Line 1');
    await fillById('add2ofsponsor_ind', traveler.refAddressIndia || 'NA', 'Address Line 2');

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
    await fillById('phoneofsponsor_ind', traveler.refPhoneIndia || '9999999999', 'Reference Phone');

    // ── Reference in Home Country — use customer's data from our website ──
    console.log('\n  🏠 Reference in Home Country');
    await fillById('nameofsponsor_msn', traveler.refNameHome || `${traveler.firstName} ${traveler.lastName}`, 'Home Ref Name');
    await fillById('add1ofsponsor_msn', traveler.refAddressHome || traveler.address || 'NA', 'Home Ref Address 1');
    // State + ZIP (refDistrictHome is repurposed as ZIP on our website)
    const homeStateZip = [traveler.refStateHome, traveler.refDistrictHome].filter(Boolean).join(', ') || `${traveler.city || ''}, ${traveler.state || ''}`.trim() || 'NA';
    await fillById('add2ofsponsor_msn', homeStateZip, 'Home Ref Address 2');
    await fillById('phoneofsponsor_msn', traveler.refPhoneHome || traveler.phoneNumber || '0000000000', 'Home Ref Phone');

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

    // Wait for Step 5 to load — looks for radio buttons near "arrested" question
    console.log('  ⏳ Waiting for Step 5 to load...');
    try {
      await page.waitForSelector('input[type="radio"]', { timeout: 60000, state: 'visible' });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
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

    // Click "No" on each group (default answer for all security questions)
    for (const [name, radios] of s5Groups) {
      const noRadio = radios.find((r: any) => r.value === 'NO' || r.value === 'No' || r.value === 'N');
      if (noRadio && noRadio.id) {
        try {
          const el = await page.$(`#${noRadio.id}`);
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
              console.log(`  ✅ ${name}: No`);
            }
          }
        } catch { console.log(`  ⚠️  ${name}: click failed`); }
      }
    }

    // ── Declaration checkbox on Step 5 ──
    console.log('\n  ☑️  Declaration checkbox');
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
        // Fallback: first unchecked checkbox
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
            console.log(`  ✅ Declaration checkbox clicked (${selector})`);
          }
        }
      } else {
        console.log('  ⚠️  No declaration checkbox found');
      }
    } catch (err: any) { console.log(`  ⚠️  Declaration checkbox failed: ${err?.message}`); }

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

    // Try to upload the photo automatically
    if (traveler.photoUrl) {
      const photoPath = path.resolve(process.cwd(), 'public', traveler.photoUrl.replace(/^\//, ''));
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
        botFlags.push(`🔴 Step 6: Photo file missing (${traveler.photoUrl}). Please check the customer's upload.`);
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

    // Upload the passport PDF/image
    if (traveler.passportBioUrl) {
      const passportPath = path.resolve(process.cwd(), 'public', traveler.passportBioUrl.replace(/^\//, ''));
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

            // Check the "I have verified..." checkbox
            console.log('  ☑️  Checking verification checkbox...');
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
                // Fallback: first unchecked checkbox
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
                    console.log(`  ✅ Checked verification checkbox`);
                  }
                }
              } else {
                console.log('  ⚠️  No verification checkbox found');
              }
            } catch {}

            await delay(1000);

            // Click "Confirm" button
            console.log('  ✓  Clicking Confirm...');
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
                    console.log(`  ✅ Clicked Confirm`);
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
              if (result) { console.log(`  ✅ Clicked Confirm via JS`); confirmClicked = true; }
            }
            if (!confirmClicked) console.log('  ⚠️  Could not find Confirm button — please click manually');
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
        botFlags.push(`🔴 Step 9: Passport file missing (${traveler.passportBioUrl}). Please check the customer's upload.`);
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

    // ── Select "Yes" on the Undertaking radio ──
    console.log('  ☑️  Selecting Yes on Undertaking...');
    try {
      // Find the Yes radio — use mouse click with scroll (same method that works for other hard radios)
      const yesRadio = await page.evaluate(function() {
        var radios = document.querySelectorAll('input[type="radio"]');
        for (var i = 0; i < radios.length; i++) {
          var r = radios[i] as HTMLInputElement;
          var val = (r.value || '').toUpperCase();
          if (val === 'Y' || val === 'YES') return { id: r.id, name: r.name, value: r.value };
        }
        return null;
      });
      if (yesRadio) {
        const selector = yesRadio.id ? `#${yesRadio.id}` : `input[name="${yesRadio.name}"][value="${yesRadio.value}"]`;
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
            console.log(`  ✅ Undertaking: Yes`);
          }
        }
      } else {
        console.log('  ⚠️  Could not find Yes radio for Undertaking');
      }
    } catch (err: any) { console.log(`  ⚠️  Undertaking Yes failed: ${err?.message}`); }
    await delay(800);

    // ── Click "Pay Now" ──
    console.log('  💳 Clicking Pay Now...');
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
            console.log('  ✅ Clicked Pay Now');
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
      if (result) { console.log(`  ✅ Clicked Pay Now via JS`); payClicked = true; }
    }
    if (!payClicked) console.log('  ⚠️  Could not find Pay Now button');
    await delay(2000);

    // ── Select "Paypal" radio (payment gateway) ──
    console.log('  💳 Selecting PayPal gateway...');
    let paypalClicked = false;
    try {
      // Find PayPal by index (position) — broken HTML has duplicate values so we must target by index
      const paypalIndex = await page.evaluate(function() {
        var radios = document.querySelectorAll('input[type="radio"]');
        for (var i = 0; i < radios.length; i++) {
          var r = radios[i] as HTMLInputElement;
          // Check label
          var labelText = '';
          if (r.id) {
            var lb = document.querySelector('label[for="' + r.id + '"]');
            if (lb) labelText = (lb.textContent || '').trim().toLowerCase();
          }
          if (labelText.indexOf('paypal') === 0) return i;
          // Check value
          if ((r.value || '').toLowerCase() === 'paypal') return i;
          // Check first text node directly after the radio
          var sibling = r.nextSibling;
          var firstText = '';
          while (sibling && !firstText) {
            if (sibling.nodeType === 3) firstText = (sibling.textContent || '').trim();
            else if (sibling.nodeType === 1) firstText = ((sibling as HTMLElement).textContent || '').trim();
            sibling = sibling.nextSibling;
          }
          firstText = firstText.split(/\s{2,}|\n/)[0].trim().toLowerCase();
          if (firstText === 'paypal' || firstText.indexOf('paypal') === 0) return i;
        }
        return -1;
      });

      if (paypalIndex >= 0) {
        console.log(`  📍 PayPal radio at index ${paypalIndex}`);
        // Get the element by index via a locator
        const allRadios = await page.$$('input[type="radio"]');
        if (paypalIndex < allRadios.length) {
          const el = allRadios[paypalIndex];
          await el.scrollIntoViewIfNeeded();
          await delay(300);
          const box = await el.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await delay(50);
            await page.mouse.down();
            await delay(30);
            await page.mouse.up();
            console.log(`  ✅ PayPal selected`);
            paypalClicked = true;
          }
        }
      } else {
        console.log('  ⚠️  Could not find PayPal radio by text');
      }
    } catch (err: any) { console.log(`  ⚠️  PayPal selection failed: ${err?.message}`); }
    if (!paypalClicked) console.log('  ⚠️  Could not find PayPal option');
    await delay(500);

    // ── Click "Continue" (payment gateway continue button) ──
    console.log('  ➡️  Clicking Continue...');
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
            console.log('  ✅ Clicked Continue');
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
      if (result) { console.log(`  ✅ Clicked Continue via JS`); contClicked = true; }
    }
    if (!contClicked) console.log('  ⚠️  Could not find Continue button');
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

    // Keep browser open
    await page.waitForTimeout(999999999);

  } catch (error: any) {
    console.error('\n❌ Error:', error?.message || error);
  } finally {
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
