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
    // ══════════════════════════════════════════════════════════
    // STEP 1 — INITIAL REGISTRATION
    // ══════════════════════════════════════════════════════════
    console.log('📝 STEP 1 — Initial Registration');
    console.log('────────────────────────────────────────────\n');

    console.log('  ⏳ Opening the Indian eVisa site...');

    try {
      await page.goto('https://indianvisaonline.gov.in/evisa/Registration', { timeout: 180000 });
    } catch {
      console.log('  ⚠️  Auto-navigation timed out. Please navigate manually and press Enter.');
      await waitForEnter();
    }
    await delay(3000);

    // Tab 42 times past the popup to "Apply Here for E-Visa", then Enter
    console.log('  ⏭️  Tabbing to "Apply Here for E-Visa" (39 tabs)...');
    for (let i = 0; i < 39; i++) {
      await page.keyboard.press('Tab');
      await delay(50);
    }
    await page.keyboard.press('Enter');
    console.log('  ✅ Pressed Enter on "Apply Here for E-Visa"');
    await delay(5000);

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

    // Visa Service — checkbox with class evisa_service_checkbox_{typeId}
    const visaTypeValue = VISA_TYPE_MAP[order.visaType];
    if (visaTypeValue) {
      try {
        await page.click(`.evisa_service_checkbox_${visaTypeValue}`);
        console.log(`  ✅ Visa Service: ${order.visaType} (checkbox ${visaTypeValue})`);
        await delay(500);
        // Select first purpose radio for this visa type
        try {
          await page.click(`input[name="evisa_purpose_${visaTypeValue}"]:first-of-type`);
          console.log(`  ✅ Purpose of Visit: first option selected`);
        } catch {
          console.log('  ⚠️  Could not auto-select purpose — please select manually');
        }
      } catch {
        console.log(`  ⚠️  Could not select visa type checkbox`);
      }
      await delay(500);
    }

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

    // CAPTCHA — auto-focus the input, user just types and presses Enter
    console.log('\n  🔒 CAPTCHA — auto-focusing input...');
    try {
      await page.focus('#captcha');
      console.log('  ✅ CAPTCHA field focused — type the CAPTCHA in the browser');
    } catch {
      console.log('  ⚠️  Could not focus CAPTCHA field');
    }
    console.log('  ⏸️  Type the CAPTCHA, then press Enter here to submit...\n');
    await waitForEnter();

    // Click Continue button
    try {
      await page.click('input.btn-primary[value="Continue"]');
      console.log('  ✅ Clicked Continue');
    } catch {
      console.log('  ⚠️  Could not click Continue — please click it manually');
    }
    await delay(3000);

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
    console.log('\n📝 STEP 2 — Applicant Details');
    console.log('────────────────────────────────────────────\n');

    // Wait for Step 2 to actually load
    console.log('  ⏳ Waiting for Step 2 to load...');
    console.log('  ⏸️  Press Enter once you see the Step 2 form...\n');
    await waitForEnter();
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

    // Lived 2+ years — just tell the user to fix it manually during review
    console.log('  ⚠️  "Lived 2+ years" — please select YES manually during review');
    await delay(300);
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

    // Wait for user review before submitting
    console.log('\n  ⏸️  Review Step 2. Fix anything needed, then press Enter to Save and Continue...\n');
    await waitForEnter();

    // Click "Save and Continue" via Tab + Enter
    console.log('  ⏸️  Clicking Save and Continue...');
    await page.keyboard.press('Tab');
    await delay(100);
    await page.keyboard.press('Enter');
    console.log('  ✅ Submitted Step 2');
    await delay(5000);

    // ══════════════════════════════════════════════════════════
    // STEP 3 — ADDRESS & FAMILY DETAILS
    // ══════════════════════════════════════════════════════════
    console.log('\n📝 STEP 3 — Address & Family Details');
    console.log('────────────────────────────────────────────\n');
    await delay(2000);

    // Present Address
    if (traveler.address) {
      await fillField(page, '#houseNo, [name="houseNo"]', traveler.address, 'Street Address');
    }
    if (traveler.city) {
      await fillField(page, '#city, [name="city"]', traveler.city, 'City');
    }
    if (traveler.residenceCountry || traveler.countryOfBirth) {
      await selectField(page, '#country, [name="country"]', (traveler.residenceCountry || traveler.countryOfBirth).toUpperCase(), 'Country');
    }
    if (traveler.state) {
      await fillField(page, '#state, [name="state"]', traveler.state, 'State');
    }
    if (traveler.zip) {
      await fillField(page, '#postalCode, [name="postalCode"]', traveler.zip, 'Postal Code');
    }
    if (traveler.phoneNumber) {
      await fillField(page, '#phoneNo, [name="phoneNo"]', traveler.phoneNumber, 'Phone No');
    }

    // Father's Details
    console.log('\n  👨 Father\'s Details');
    if (traveler.fatherName) {
      await fillField(page, '#fatherName, [name="fatherName"]', traveler.fatherName, 'Father Name');
    }
    if (traveler.fatherNationality) {
      await selectField(page, '#fatherNationality, [name="fatherNationality"]', traveler.fatherNationality.toUpperCase(), 'Father Nationality');
    }
    if (traveler.fatherPlaceOfBirth) {
      await fillField(page, '#fatherBirthPlace, [name="fatherBirthPlace"]', traveler.fatherPlaceOfBirth, 'Father Birth Place');
    }
    if (traveler.fatherCountryOfBirth) {
      await selectField(page, '#fatherBirthCountry, [name="fatherBirthCountry"]', traveler.fatherCountryOfBirth.toUpperCase(), 'Father Birth Country');
    }

    // Mother's Details
    console.log('\n  👩 Mother\'s Details');
    if (traveler.motherName) {
      await fillField(page, '#motherName, [name="motherName"]', traveler.motherName, 'Mother Name');
    }
    if (traveler.motherNationality) {
      await selectField(page, '#motherNationality, [name="motherNationality"]', traveler.motherNationality.toUpperCase(), 'Mother Nationality');
    }
    if (traveler.motherPlaceOfBirth) {
      await fillField(page, '#motherBirthPlace, [name="motherBirthPlace"]', traveler.motherPlaceOfBirth, 'Mother Birth Place');
    }
    if (traveler.motherCountryOfBirth) {
      await selectField(page, '#motherBirthCountry, [name="motherBirthCountry"]', traveler.motherCountryOfBirth.toUpperCase(), 'Mother Birth Country');
    }

    // Marital Status
    if (traveler.maritalStatus) {
      await selectField(page, '#maritalStatus, [name="maritalStatus"]', traveler.maritalStatus.toUpperCase(), 'Marital Status');
      await delay(500);

      if (traveler.maritalStatus === 'Married' && traveler.spouseName) {
        await fillField(page, '#spouseName, [name="spouseName"]', traveler.spouseName, 'Spouse Name');
        if (traveler.spouseNationality) {
          await selectField(page, '#spouseNationality, [name="spouseNationality"]', traveler.spouseNationality.toUpperCase(), 'Spouse Nationality');
        }
        if (traveler.spousePlaceOfBirth) {
          await fillField(page, '#spouseBirthPlace, [name="spouseBirthPlace"]', traveler.spousePlaceOfBirth, 'Spouse Birth Place');
        }
        if (traveler.spouseCountryOfBirth) {
          await selectField(page, '#spouseBirthCountry, [name="spouseBirthCountry"]', traveler.spouseCountryOfBirth.toUpperCase(), 'Spouse Birth Country');
        }
      }
    }

    // Pakistan parents question
    if (traveler.parentsFromPakistan) {
      const pakValue = traveler.parentsFromPakistan === 'yes' ? 'Y' : 'N';
      try { await page.click(`input[name="pakistanParents"][value="${pakValue}"]`); } catch {}
    }

    // Profession
    if (traveler.employmentStatus) {
      const occMap: Record<string, string> = {
        'Employed': 'PRIVATE SERVICE', 'Unemployed': 'UN-EMPLOYED', 'Student': 'STUDENT', 'Retired': 'RETIRED',
      };
      await selectField(page, '#occupation, [name="occupation"]', occMap[traveler.employmentStatus] || traveler.employmentStatus.toUpperCase(), 'Occupation');
      await delay(500);

      if (traveler.employerName) {
        await fillField(page, '#employerName, [name="employerName"]', traveler.employerName, 'Employer Name');
      }
      if (traveler.employerAddress) {
        await fillField(page, '#employerAddress, [name="employerAddress"]', traveler.employerAddress, 'Employer Address');
      }
      if (traveler.employerPhone || traveler.phoneNumber) {
        await fillField(page, '#employerPhone, [name="employerPhone"]', traveler.employerPhone || traveler.phoneNumber, 'Employer Phone');
      }
    }

    // Military/police
    if (traveler.servedMilitary) {
      const milValue = traveler.servedMilitary === 'yes' ? 'Y' : 'N';
      try { await page.click(`input[name="prevMilitary"][value="${milValue}"]`); } catch {}
    }

    console.log('\n  ⏸️  Please review Step 3, then click Continue. Press Enter here when ready...\n');
    await waitForEnter();

    // ══════════════════════════════════════════════════════════
    // STEP 4 — VISA DETAILS
    // ══════════════════════════════════════════════════════════
    console.log('\n📝 STEP 4 — Visa Details');
    console.log('────────────────────────────────────────────\n');
    await delay(2000);

    // Places to visit
    if (traveler.placesToVisit) {
      await fillField(page, '#placesToVisit, [name="placesToVisit"]', traveler.placesToVisit, 'Places to Visit');
    }

    // Hotel booked
    if (traveler.bookedHotel === 'yes') {
      try { await page.click('input[name="hotelBooked"][value="Y"]'); } catch {}
      await delay(500);
      if (traveler.hotelName) {
        await fillField(page, '#hotelName, [name="hotelName"]', traveler.hotelName, 'Hotel Name');
      }
      if (traveler.hotelPlace) {
        await fillField(page, '#hotelPlace, [name="hotelPlace"]', traveler.hotelPlace, 'Hotel Place');
      }
      if (traveler.tourOperatorName) {
        await fillField(page, '#tourOperator, [name="tourOperator"]', traveler.tourOperatorName, 'Tour Operator');
      }
      if (traveler.tourOperatorAddress) {
        await fillField(page, '#tourOperatorAddress, [name="tourOperatorAddress"]', traveler.tourOperatorAddress, 'Tour Operator Address');
      }
    } else {
      try { await page.click('input[name="hotelBooked"][value="N"]'); } catch {}
    }

    // Exit port
    if (traveler.exitPort) {
      const exitCode = PORT_MAP[traveler.exitPort];
      if (exitCode) {
        await selectField(page, '#exitPort, [name="exitPort"]', exitCode, 'Exit Port');
      } else {
        await selectField(page, '#exitPort, [name="exitPort"]', traveler.exitPort.split(' (')[0].toUpperCase(), 'Exit Port');
      }
    }

    // Visited India before
    if (traveler.visitedIndiaBefore) {
      const visited = traveler.visitedIndiaBefore === 'yes' ? 'Y' : 'N';
      try { await page.click(`input[name="visitedBefore"][value="${visited}"]`); } catch {}
      await delay(500);

      if (traveler.visitedIndiaBefore === 'yes') {
        if (traveler.prevIndiaAddress) {
          await fillField(page, '#prevAddress, [name="prevAddress"]', traveler.prevIndiaAddress, 'Previous Address');
        }
        if (traveler.prevIndiaCities) {
          await fillField(page, '#prevCities, [name="prevCities"]', traveler.prevIndiaCities, 'Previous Cities');
        }
        if (traveler.prevIndiaVisaNo) {
          await fillField(page, '#lastVisaNo, [name="lastVisaNo"]', traveler.prevIndiaVisaNo, 'Last Visa No');
        }
        if (traveler.prevIndiaVisaType) {
          await selectField(page, '#lastVisaType, [name="lastVisaType"]', traveler.prevIndiaVisaType.toUpperCase(), 'Last Visa Type');
        }
      }
    }

    // Visa refused
    if (traveler.visaRefusedBefore) {
      const refused = traveler.visaRefusedBefore === 'yes' ? 'Y' : 'N';
      try { await page.click(`input[name="visaRefused"][value="${refused}"]`); } catch {}
    }

    // Reference in India
    console.log('\n  🇮🇳 Reference in India');
    if (traveler.refNameIndia) {
      await fillField(page, '#refName, [name="refName"]', traveler.refNameIndia, 'Reference Name');
    }
    if (traveler.refAddressIndia) {
      await fillField(page, '#refAddress, [name="refAddress"]', traveler.refAddressIndia, 'Reference Address');
    }
    if (traveler.refPhoneIndia) {
      await fillField(page, '#refPhone, [name="refPhone"]', traveler.refPhoneIndia, 'Reference Phone');
    }

    // Reference in Home Country
    console.log('\n  🏠 Reference in Home Country');
    if (traveler.refAddressHome) {
      await fillField(page, '#refNameHome, [name="refNameHome"]', traveler.firstName + ' ' + traveler.lastName, 'Home Ref Name');
      await fillField(page, '#refAddressHome, [name="refAddressHome"]', traveler.refAddressHome, 'Home Ref Address');
    }
    if (traveler.refPhoneHome) {
      await fillField(page, '#refPhoneHome, [name="refPhoneHome"]', traveler.refPhoneHome, 'Home Ref Phone');
    }

    console.log('\n  ⏸️  Please review Step 4, then click Continue. Press Enter here when ready...\n');
    await waitForEnter();

    // ══════════════════════════════════════════════════════════
    // STEP 5 — SECURITY QUESTIONS
    // ══════════════════════════════════════════════════════════
    console.log('\n📝 STEP 5 — Security Questions');
    console.log('────────────────────────────────────────────\n');
    await delay(2000);

    // Default all to "No"
    const securityQuestions = [
      { name: 'arrested', value: traveler.everArrested || 'no' },
      { name: 'refused', value: traveler.everRefusedEntry || 'no' },
      { name: 'trafficking', value: 'no' },
      { name: 'terrorism', value: 'no' },
      { name: 'glorify', value: 'no' },
      { name: 'asylum', value: traveler.soughtAsylum || 'no' },
    ];

    for (const q of securityQuestions) {
      const val = q.value === 'yes' ? 'Y' : 'N';
      try { await page.click(`input[name="${q.name}"][value="${val}"]`); } catch {}
    }
    console.log('  ✅ Security questions filled (defaulting to No)');

    console.log('\n  ⏸️  Please review Step 5, then click Continue. Press Enter here when ready...\n');
    await waitForEnter();

    // ══════════════════════════════════════════════════════════
    // STEP 6 — PHOTO UPLOAD
    // ══════════════════════════════════════════════════════════
    console.log('\n📝 STEP 6 — Photo Upload');
    console.log('────────────────────────────────────────────\n');

    if (traveler.photoUrl) {
      console.log(`  📷 Photo available at: ${traveler.photoUrl}`);
      console.log('  ⏸️  Please upload the photo manually and press Enter...\n');
    } else {
      console.log('  ⚠️  No photo uploaded by customer.');
      console.log('  ⏸️  Please upload a photo manually and press Enter...\n');
    }
    await waitForEnter();

    // ══════════════════════════════════════════════════════════
    // DONE
    // ══════════════════════════════════════════════════════════
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Auto-fill complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Please review all information, complete payment, and submit.');
    console.log('The browser will stay open. Close it when you\'re done.\n');

    // Keep browser open
    await page.waitForTimeout(999999999);

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// ── Wait for user input ──

function waitForEnter(): Promise<void> {
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

// ── Run ──

const orderArg = process.argv[2];
if (!orderArg) {
  console.error('Usage: npx tsx scripts/process-visa.ts <orderNumber>');
  console.error('Example: npx tsx scripts/process-visa.ts 00015');
  process.exit(1);
}

processVisa(orderArg);
