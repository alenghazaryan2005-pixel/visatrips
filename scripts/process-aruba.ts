/**
 * VisaTrips — Aruba ED Card Auto-Fill Bot
 *
 * Usage:  npx tsx scripts/process-aruba.ts <orderNumber>
 * Example: npx tsx scripts/process-aruba.ts 00037
 *
 * Schema-driven — unlike scripts/process-visa.ts (India), this bot has
 * no hardcoded site selectors. It reads the Aruba application schema
 * (built-in defaults from lib/applicationSchema.ts + admin overrides
 * from `application.schema.ARUBA`) and applies each field using the
 * `botSelector` + `botAction` admin set in /admin/settings/aruba.
 *
 * Why schema-driven:
 *   - Aruba's ED Card form changes occasionally (the ATA tweaks
 *     selectors). With everything driven by admin config, the on-call
 *     engineer can fix a broken bot via a settings page rather than a
 *     code deploy.
 *   - The same pattern can host a third + fourth country tomorrow
 *     without forking the bot script.
 *
 * What the bot does:
 *   1. Fetches the order + first traveler from the database
 *   2. Loads the Aruba schema (built-in + admin overrides)
 *   3. Loads admin bot-mapping overrides (`bot.mapping.ARUBA`)
 *   4. Opens the Aruba ED Card portal
 *   5. For every field with a configured `botSelector`, applies the
 *      matching action (fill / select / radio / check / upload / skip)
 *   6. Logs each field attempt to bot_runs for the admin run history
 *   7. PAUSES before final submit — the admin verifies the form
 *      visually and clicks Submit themselves
 *
 * What the bot does NOT do:
 *   - Does NOT submit the form. Final submission is always manual so
 *     a human eyeballs the ED Card before money/data leaves us.
 *   - Does NOT solve CAPTCHAs (the ED Card form doesn't currently use
 *     one; if that changes, we'd add a pause similar to India's bot).
 *   - Does NOT fill fields without a configured `botSelector` — they
 *     get logged as "skip" so admin can see what's missing config.
 */

// Side-effect import: populate process.env from .env.local + .env
// before anything below reads BOT_PAYMENT_ENC_KEY or other secrets.
// (Next.js auto-loads .env.local but raw tsx invocations don't.)
import '../lib/loadDotEnv';
import { chromium, Page } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { loadBotOverrides, createBotRunLogger, BotRunLogger } from '../lib/botRuntime';
import { getDecryptedCard, type DecryptedCard } from '../lib/cardVault';
import {
  parseDocumentRef,
  refForBlobPathname,
  orderIdFromBlobPathname,
  findNewestOrderDocument,
  resolveDocumentToLocalFile,
} from '../lib/documents';
import {
  defaultSchema,
  mergeWithDefaults,
  schemaSettingKey,
  type CustomField,
  type CustomSection,
} from '../lib/applicationSchema';

const MONTH_NAMES = [
  '','January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const prisma = new PrismaClient();

// Aruba ED Card portal. Override via env if the URL changes — saves a
// code deploy. Default is the official ATA portal at edcardaruba.aw.
const ARUBA_URL = process.env.ARUBA_BOT_URL || 'https://edcardaruba.aw/welcome';

// The /welcome landing page shows a Start button that has to be
// clicked before the actual form renders. Playwright's text-selector
// matches the button by visible label — we try a few common phrasings
// so a UX copy tweak ("Start" → "Begin") doesn't immediately break us.
// Override with ARUBA_START_BUTTON_SELECTOR if the markup changes
// substantially (e.g. an icon-only button).
const ARUBA_START_SELECTOR =
  process.env.ARUBA_START_BUTTON_SELECTOR ||
  'button:has-text("Start"), button:has-text("Begin"), a:has-text("Start"), a:has-text("Begin")';

// Between schema sections (Trip → Personal → Home Address → ...) the
// form is paginated. After every section we click whatever button
// advances to the next step. Cast a wide net — text-match for English
// + Spanish + Dutch (Aruba's official languages), the common arrow
// glyphs, and aria-labels. Override the whole thing via env if the
// site uses something exotic (e.g. an icon-only button identified by
// a data-testid).
const ARUBA_NEXT_SELECTOR =
  process.env.ARUBA_NEXT_BUTTON_SELECTOR ||
  [
    // English copy
    'button:has-text("Next")',
    'button:has-text("Continue")',
    'button:has-text("Proceed")',
    'button:has-text("Save and continue")',
    'button:has-text("Save & continue")',
    // Spanish / Dutch (Aruba is multi-lingual; site may localise)
    'button:has-text("Siguiente")',
    'button:has-text("Continuar")',
    'button:has-text("Volgende")',
    'button:has-text("Doorgaan")',
    'button:has-text("Verder")',
    // Arrow / icon-only fallbacks
    'button:has-text("→")',
    'button:has-text("▶")',
    'button[aria-label*="next" i]',
    'button[aria-label*="continue" i]',
    // Generic submit-style
    'button[type="submit"]',
  ].join(', ');

// ── Helpers ─────────────────────────────────────────────────────────

function parseOrderNumber(input: string): number {
  const clean = input.replace(/[^0-9]/g, '');
  return parseInt(clean, 10);
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert our stored "Month D, YYYY" date format (e.g. "May 8, 2026")
 * into both ISO ("2026-05-08") and mm/dd/yyyy ("05/08/2026") so we can
 * try whichever format the form's date widget accepts. Also tolerates
 * already-ISO inputs in case future code paths drop the friendly form.
 *
 * Returns null if the value isn't recognisable as a date — the caller
 * should fall through to a plain string fill in that case.
 */
function buildDateCandidates(value: string): string[] | null {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // "May 8, 2026" — friendly format used everywhere on the customer side
  const friendly = value.match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (friendly) {
    const m = months.indexOf(friendly[1]);
    if (m >= 0) {
      const iso = `${friendly[3]}-${String(m + 1).padStart(2, '0')}-${friendly[2].padStart(2, '0')}`;
      const us = `${String(m + 1).padStart(2, '0')}/${friendly[2].padStart(2, '0')}/${friendly[3]}`;
      return [iso, us];
    }
  }

  // Already ISO ("2026-05-08") — keep, plus a derived mm/dd/yyyy.
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return [value, `${iso[2]}/${iso[3]}/${iso[1]}`];
  }

  return null;
}

/**
 * Map a schema field type → the right Playwright action when admin
 * hasn't set an explicit `botAction`. The defaults reflect HTML form
 * semantics: text-ish fields get `fill`, select / radio dropdowns get
 * `select`, checkboxes get `check`, files get `upload`. Without this
 * mapping the bot would try to "fill" a radio button (typing text into
 * a radio is meaningless) and fail every yes/no question on the form.
 */
function defaultActionFor(field: CustomField): string {
  switch (field.type) {
    case 'select':
    case 'radio':
      return 'select';
    case 'checkbox':
      return 'check';
    case 'file':
      return 'upload';
    case 'text':
    case 'email':
    case 'tel':
    case 'number':
    case 'date':
    case 'textarea':
    default:
      return 'fill';
  }
}

/**
 * Resolve the actual selector(s) the bot should try for a given field.
 * Order:
 *   1. Admin-configured `botSelector` from the schema (if set) — wins
 *   2. Heuristic fallbacks derived from the field key — covers the
 *      common patterns most forms use without admin having to wire
 *      up every field by hand:
 *         #arrivalDate
 *         input[name="arrivalDate"]
 *         select[name="arrivalDate"]
 *         textarea[name="arrivalDate"]
 *         [data-field="arrivalDate"]
 *         #arrival_date / [name="arrival_date"]      (snake_case)
 *         #arrival-date / [name="arrival-date"]      (kebab-case)
 *
 * Comma-separated CSS selectors mean "match any" — Playwright picks
 * the first node found, which is what we want.
 */
/**
 * Split a customer-entered single-line address into the three pieces
 * Aruba's gov form requires: street, building number, unit suffix.
 *
 * The customer types something like "123 Main Street Apt 4B" in one
 * box; the gov form has THREE inputs (`address`, `residenceNumber`,
 * `residenceSuffix`). This parser produces values for each.
 *
 * Heuristics, in order:
 *   1. Leading digits → building number ("123 Main St" → 123 + "Main St").
 *   2. Else trailing digits → building number ("Main Street 123" → 123 +
 *      "Main Street"). Common in Dutch / European addresses.
 *   3. Apt / Suite / Unit / # / No marker on what's left → unit suffix.
 *      The matched marker word is stripped; only the identifier (4B,
 *      203, etc.) remains.
 *
 * No match for any piece returns an empty string — caller decides
 * whether that's a hard fail or just "skip this field".
 */
function parseStreetAddress(full: string): { number: string; street: string; suffix: string } {
  const input = (full || '').trim();
  if (!input) return { number: '', street: '', suffix: '' };

  let number = '';
  let street = input;
  let suffix = '';

  // 1. Leading digits ("123 Main Street" → number=123, rest="Main Street").
  const leading = street.match(/^(\d+)\s+(.+)$/);
  if (leading) {
    number = leading[1];
    street = leading[2];
  } else {
    // 2. Trailing digits ("Main Street 123" → number=123, rest="Main Street").
    const trailing = street.match(/^(.+?)\s+(\d+)$/);
    if (trailing) {
      number = trailing[2];
      street = trailing[1];
    }
  }

  // 3. Unit / apartment marker on whatever remains.
  //    Matches: "Main St Apt 4B", "Main St Suite 203", "Main St #4B",
  //    "Main St Unit 12", "Main St No. 5". Suffix is whatever's
  //    after the marker word.
  const unit = street.match(/^(.+?)\s+(?:Apt\.?|Apartment|Suite|Ste\.?|Unit|#|No\.?)\s*(.+?)$/i);
  if (unit) {
    street = unit[1];
    suffix = unit[2];
  }

  return {
    number: number.trim(),
    street: street.trim(),
    suffix: suffix.trim(),
  };
}

function selectorsFor(field: CustomField): string {
  if (field.botSelector) return field.botSelector;
  const k = field.key;
  // Strip a leading `arrival` / `departure` prefix and lowercase the
  // first letter that's left, since the gov form scopes those fields
  // by accordion section instead of name. Examples:
  //   arrivalAirline       → airline      (id on Arrival accordion)
  //   arrivalFlightNumber  → flightNumber
  //   arrivalTravelMode    → travelMode
  //   departureOperatorName → operatorName
  //
  // We try BOTH the prefixed and stripped variants — Aruba's form
  // sometimes keeps the prefix (departureAirline, departureFlightNumber
  // on Step 4) and sometimes drops it (operatorName, vesselName which
  // are inside the same accordion). Trying both is cheap.
  const stripped = /^(arrival|departure)[A-Z]/.test(k)
    ? k.replace(/^(arrival|departure)/, '').replace(/^([A-Z])/, m => m.toLowerCase())
    : null;
  const baseKeys = stripped ? [k, stripped] : [k];

  const snake = (key: string) => key.replace(/([A-Z])/g, '_$1').toLowerCase();
  const kebab = (key: string) => key.replace(/([A-Z])/g, '-$1').toLowerCase();
  const variants = Array.from(new Set(baseKeys.flatMap(key => [key, snake(key), kebab(key)])));
  // Per-key selector candidates. Includes:
  //   - exact id          (#countryOfBirth)
  //   - name attribute     ([name="countryOfBirth"])
  //   - data-field         ([data-field="countryOfBirth"])
  //   - formcontrolname    ([formcontrolname="countryOfBirth"])
  //     ↑ Angular reactive-forms attribute. Aruba's whole form is
  //     built on @angular/forms, so EVERY input/select/radio carries
  //     a `formcontrolname` — often when no `name` attribute exists
  //     at all (Angular doesn't auto-set `name`). Without this we
  //     miss ~half the fields on the gov form.
  //   - PREFIXED id        ([id^="countryOfBirth"])
  //     ↑ Catches Angular form arrays that index traveler fields
  //     with a `-0` / `-1` suffix (e.g. id="countryOfBirth-0",
  //     "passportNumber-0", "passportExpiration-0"). Without this,
  //     the bot misses every form-array field on Aruba's site.
  //   - prefixed name       ([name^="countryOfBirth"])
  const base = variants.flatMap(v => [
    `#${v}`,
    `[name="${v}"]`,
    `[data-field="${v}"]`,
    `[formcontrolname="${v}"]`,
    `[id^="${v}-"]`,
    `[name^="${v}-"]`,
  ]);

  // File fields have additional fallback patterns. Aruba's form uses
  // ids like `passportUpload-0` (key + "Upload" + traveler index) so
  // pure-key matches miss. We add:
  //   - any input[type=file] whose id starts with the key
  //   - any input[type=file] whose id contains a recognisable
  //     fragment ("passport" / "photo" / etc.)
  //   - last resort: any input[type=file] on the page
  // Keeps the bot self-driving for file fields without admin having
  // to hand-write a selector.
  if (field.type === 'file') {
    const lowerKey = k.toLowerCase();
    const fragments: string[] = [];
    if (lowerKey.includes('passport')) fragments.push('passport');
    if (lowerKey.includes('photo'))    fragments.push('photo');
    if (lowerKey.includes('selfie'))   fragments.push('selfie');
    if (lowerKey.includes('upload'))   fragments.push('upload');
    const fileFallbacks = [
      ...variants.flatMap(v => [`input[type="file"][id^="${v}"]`]),
      ...fragments.flatMap(f => [`input[type="file"][id*="${f}" i]`]),
      'input[type="file"]',
    ];
    return [...base, ...fileFallbacks].join(', ');
  }
  return base.join(', ');
}

/**
 * Best-effort dropdown select scoped to the FIRST VISIBLE element
 * matching the selector. Critical for forms like Aruba's where the
 * same form-control name (`airline`, `flightNumber`) appears in
 * multiple accordion sections — only the actively-expanded section's
 * elements are visible, and we want to target that one.
 *
 * Reads options off the resolved single element, then `selectOption`s
 * on the same element so Playwright never gets a multi-match strict
 * error.
 */
async function selectByText(page: Page, selector: string, text: string): Promise<{ ok: boolean; options: string[] }> {
  try {
    // Resolve the broad comma-separated selector down to ONE visible
    // <select>. Without this, $$eval below combines options from the
    // arrival AND departure airline selects, picks a value that
    // exists only in one of them, and then selectOption can't tell
    // which select to apply it to.
    const sel = page.locator(selector).locator('visible=true').first();
    const opts: Array<{ value: string; text: string }> = await sel.evaluate((el: any) => {
      if (!el || el.tagName !== 'SELECT') return [];
      return Array.from(el.options).map((o: any) => ({
        value: o.value,
        text: (o.textContent || '').trim(),
      }));
    }).catch(() => [] as Array<{ value: string; text: string }>);

    const lower = text.toLowerCase();
    const match =
      opts.find(o => o.text.toLowerCase() === lower) ||
      opts.find(o => o.text.toLowerCase().startsWith(lower)) ||
      opts.find(o => o.text.toLowerCase().includes(lower));
    if (match) {
      await sel.selectOption(match.value);
      return { ok: true, options: opts.map(o => o.text) };
    }
    return { ok: false, options: opts.map(o => o.text) };
  } catch {
    return { ok: false, options: [] };
  }
}

/**
 * Apply a single schema field to the page. The action is taken from
 * the field's `botAction` — defaulting to `fill` for free-text fields,
 * `select` for select/radio (since the gov form may render either as
 * a <select>), `check` for booleans.
 *
 * Returns the log payload so the caller can write it to bot_runs.
 */
async function applyField(opts: {
  page: Page;
  field: CustomField;
  selector: string;
  action: string;
  value: unknown;
}): Promise<{ success: boolean; errorMsg?: string; resolvedValue?: string }> {
  const { page, field } = opts;
  let selector = opts.selector;
  let action = opts.action;
  // Normalise the value before the bot uses it. Field-key heuristics:
  //   - flightNumber  → strip non-digits. Aruba's dropdown only has
  //     the numeric portion (e.g. "1234"), and legacy traveller data
  //     may carry leading `+` / airline code prefixes that'd break
  //     the type-ahead search.
  //   - Other keys keep their value as-is.
  const rawValueStr = opts.value == null ? '' : String(opts.value);
  const valueStr = /flightnumber/i.test(field.key)
    ? rawValueStr.replace(/\D/g, '')
    : rawValueStr;

  if (!valueStr && action !== 'click' && action !== 'check') {
    return { success: false, errorMsg: 'No value on traveler' };
  }

  // Element-type sniff — adapt the action to what's ACTUALLY on the
  // page, not just what the schema says. The customer-facing schema
  // declares a logical type (e.g. "text"), but the gov form may render
  // the same logical field as a <select> (Aruba's Flight Number),
  // radio group (Travel Mode), or readonly auto-fill (passport
  // fields). One inspection at the top → right strategy first try,
  // instead of guessing and retrying via the fallback re-dispatches.
  //
  // Skip the sniff for 'skip' (no element interaction) and 'upload'
  // (file inputs are usually `hidden` and would mis-classify).
  //
  // ALSO — if the ID/name-based selector misses entirely, fall back
  // to finding the element by its visible LABEL text. Aruba renders
  // forms as `<label>Operator Name <input ...></label>` style, so
  // matching by label catches fields whose IDs we'd have to guess.
  // The discovered label-based selector replaces `selector` for the
  // rest of this function — that way all downstream strategies
  // (fill, selectByText, type-ahead, click) target the right element.
  if (action !== 'skip' && action !== 'upload') {
    // First try the regular selector. If nothing visible matches,
    // resolve via getByLabel — the form's accessible name graph
    // walks <label for=>, aria-labelledby, and adjacent text labels.
    const existing = await page.locator(selector).locator('visible=true').first().count().catch(() => 0);
    if (!existing) {
      // Try multiple label variants because our schema labels often
      // don't match the gov form verbatim (we say "Street Number" /
      // "State / Region" / "ZIP Code", Aruba shows "Number" / "State"
      // / "ZIP Code"). Variants are tried in descending specificity:
      //   1. The full schema label
      //   2. The portion before any "/" delimiter ("State / Region" → "State")
      //   3. The portion after "/" ("State / Region" → "Region")
      //   4. The last word ("Street Number" → "Number")
      //   5. The first word ("Street Number" → "Street")
      // First non-empty unique variant that resolves wins.
      const baseLabel = (field.label || '').trim();
      const labelVariants: string[] = [];
      const pushUnique = (s: string) => {
        const v = s.trim();
        if (v && !labelVariants.includes(v)) labelVariants.push(v);
      };
      pushUnique(baseLabel);
      if (baseLabel.includes('/')) {
        const parts = baseLabel.split('/').map(p => p.trim());
        parts.forEach(pushUnique);
      }
      // Single-word fallbacks ONLY for exactly 2-word labels.
      // For 3+ word labels (e.g. "Departure Date from Aruba"), the
      // last word "Aruba" is too generic and would false-match
      // dozens of unrelated elements on the page. The 2-word case
      // covers the common "Street Number" → "Number" pattern
      // without the long-label trap.
      const words = baseLabel.split(/\s+/).filter(Boolean);
      if (words.length === 2) {
        pushUnique(words[1]); // last word
        pushUnique(words[0]); // first word
      }

      for (let i = 0; i < labelVariants.length; i++) {
        const variant = labelVariants[i];
        const isFullLabel = i === 0;
        try {
          const matches = page.getByLabel(variant, { exact: false }).locator('visible=true');
          const count = await matches.count().catch(() => 0);
          // Full label: accept any positive count (label is specific
          // by design). Derived variants: require a UNIQUE match —
          // tagging the wrong element when multiple "Number" / "Date"
          // labels are visible is worse than failing to tag at all.
          const acceptable = isFullLabel ? count >= 1 : count === 1;
          if (acceptable) {
            const byLabel = matches.first();
            // Clear stale tags from previous applyField calls, then
            // tag this run's target so all downstream strategies in
            // this function can locate it by a stable attribute.
            await page.evaluate(() => {
              document.querySelectorAll('[data-aruba-bot-target]').forEach(el => el.removeAttribute('data-aruba-bot-target'));
            }).catch(() => {});
            await byLabel.evaluate((el: any) => { el.setAttribute('data-aruba-bot-target', '1'); }).catch(() => {});
            selector = '[data-aruba-bot-target="1"]';
            const matchNote = isFullLabel ? `label "${variant}"` : `label variant "${variant}" (schema label was "${baseLabel}")`;
            console.log(`     ↻  ${field.label}: matched element by ${matchNote} (id-based selectors didn't resolve).`);
            break;
          }
        } catch {}
      }
    }

    try {
      const info = await page.locator(selector).locator('visible=true').first().evaluate((el: any) => ({
        tag: (el?.tagName || '').toUpperCase(),
        type: (el?.type || '').toLowerCase(),
        readonly: el?.readOnly === true || el?.hasAttribute?.('readonly'),
      }));
      if (info) {
        // Readonly inputs are OCR-populated by the form (passport
        // fields after upload). Don't try to fill — treat as success.
        if (info.readonly) {
          return { success: true, resolvedValue: `${valueStr} (auto-filled — input is readonly)` };
        }
        let inferred: string | null = null;
        if (info.tag === 'SELECT')          inferred = 'select';
        else if (info.tag === 'TEXTAREA')   inferred = 'fill';
        else if (info.tag === 'INPUT') {
          switch (info.type) {
            case 'radio':    inferred = 'select'; break;
            case 'checkbox': inferred = 'check';  break;
            case 'file':     inferred = 'upload'; break;
            default:         inferred = 'fill';   break; // text/email/tel/date/number/etc.
          }
        }
        if (inferred && inferred !== action) {
          console.log(`     ↻  ${field.label} is a <${info.tag.toLowerCase()}${info.type ? ` type="${info.type}"` : ''}> on the site — using ${inferred} action instead of ${action}.`);
          action = inferred;
        }
      }
    } catch {
      // Element not found on page. Let the existing action-specific
      // path handle the "not found" case — we don't want to bail
      // here just because the sniff failed.
    }
  }

  // For select/radio actions we don't fail-fast on waitForSelector —
  // the schema's `selector` is a list of generic field-key matches,
  // but a radio group's individual options live at
  // `[name="X"][value="Yes"]` or as buttons with text. Those targets
  // are computed inside the case body. So we only require the base
  // selector to exist for fill/click/check/upload, where it IS the
  // exact target.
  if (action === 'fill' || action === 'click' || action === 'check') {
    try {
      // 700ms — on a paginated form most "missing" fields are
      // simply not on the current step (collapsed in a later
      // accordion). Failing fast lets the loop reach the Next
      // button instead of waiting on N×timeout for absent fields.
      await page.waitForSelector(selector, { timeout: 700 });
    } catch {
      return { success: false, errorMsg: `Selector not found: ${selector}` };
    }
  } else if (action === 'upload') {
    // File inputs are commonly `hidden` (the visible UI is a styled
    // button that triggers the input behind the scenes). Default
    // waitForSelector waits for 'visible' — useless here. Just check
    // the element is attached to the DOM; setInputFiles works fine on
    // hidden inputs.
    try {
      await page.waitForSelector(selector, { timeout: 700, state: 'attached' });
    } catch {
      return { success: false, errorMsg: `Selector not found: ${selector}` };
    }
  }

  try {
    switch (action) {
      case 'fill': {
        // (Readonly + element-type-mismatch checks moved to the
        // top-level element-type sniff so they run regardless of
        // the schema-declared action.)

        // Date fields: stored as "Month D, YYYY" (the customer-facing
        // format) but most form widgets want ISO or mm/dd/yyyy. Try
        // each candidate in order — first one that takes wins.
        if (field.type === 'date') {
          const candidates = buildDateCandidates(valueStr);
          if (candidates) {
            for (const cand of candidates) {
              try {
                await page.fill(selector, cand);
                // Some date widgets eat the value silently if the
                // browser doesn't recognise the format. Read it back
                // to confirm the field actually holds something.
                const readBack = await page.inputValue(selector).catch(() => '');
                if (readBack) return { success: true, resolvedValue: cand };
              } catch {}
            }
            return { success: false, errorMsg: `Date widget rejected all formats (${candidates.join(' / ')})` };
          }
        }
        await page.fill(selector, valueStr);
        return { success: true, resolvedValue: valueStr };
      }
      case 'select': {
        // The same schema action drives three different DOM patterns:
        //   1. <select> + <option>          — classic dropdown
        //   2. <input type="radio" name="X" value="Yes/No">
        //                                   — gov-form-style radios
        //   3. <button>Yes</button> / <button>No</button>
        //                                   — modern React toggles
        //                                     (this is what edcardaruba.aw uses
        //                                     for the "Resident of Aruba?"
        //                                     question among others)
        //
        // We try in order, returning success on the first hit. Each
        // strategy is wrapped so the next one still runs if the DOM
        // target doesn't exist. After any "successful" click we
        // verify visually — a click can throw `strict-mode violation`
        // when multiple matches exist (e.g. two "Yes" buttons), but
        // the click still landed on the first match. Doing a
        // visual-state readback means we don't lie in the terminal
        // when the form actually ended up correct.

        const snake = field.key.replace(/([A-Z])/g, '_$1').toLowerCase();
        const kebab = field.key.replace(/([A-Z])/g, '-$1').toLowerCase();
        const nameVariants = Array.from(new Set([field.key, snake, kebab]));

        // Helper: did the value actually stick? Multiple strategies
        // because forms are wildly inconsistent in how they track
        // radio/toggle state:
        //   1. Any radio input with EXACTLY value=valueStr is :checked
        //      (regardless of name — covers cases where the form's
        //      `name` doesn't match our heuristic case-conversion).
        //   2. The field-key-named radio group's checked input has
        //      a value matching valueStr (case-insensitive, or
        //      truthy/false synonyms like "true" ↔ "Yes").
        //   3. A button near the field's label has aria-pressed,
        //      aria-checked, .selected, or .active set.
        //
        // Returning true on the first hit. Used after every click
        // strategy in the select cascade, so the bot reports success
        // any time the form ended up correct — even if the click
        // call itself threw a strict-mode violation or other Playwright
        // error (which the user observes as "the radio IS selected
        // but the terminal says it didn't work").
        // Wider net than just :checked — covers custom-widget toggles
        // that use aria-pressed / aria-checked / .selected / .active
        // class names without ever flipping a real `<input>` to
        // `:checked`. Returns true on the FIRST signal so a Yes/No
        // that was pre-rendered as selected (a common React form
        // default) reports as already-stuck.
        const readBackValueStuck = async (): Promise<boolean> => {
          const wantLower = valueStr.toLowerCase();
          // 1 + 2: any radio anywhere with this value, OR our
          // name-variant radios in :checked state. ALSO check the
          // surrounding <label> text — Angular forms often have
          // value-less radios where the only signal of "this one is
          // selected" is which <label>'s associated input is :checked.
          try {
            const radioInfo = await page.$$eval(
              'input[type="radio"]:checked, input[type="checkbox"]:checked',
              (els: any[]) => els.map(el => {
                // Find the label text wrapping the input — climb up
                // looking for a <label>, otherwise look for the
                // closest <label for=el.id>.
                let parent = el.parentElement;
                let labelText = '';
                while (parent && parent.tagName !== 'BODY') {
                  if (parent.tagName === 'LABEL') {
                    labelText = (parent.innerText || parent.textContent || '').trim();
                    break;
                  }
                  parent = parent.parentElement;
                }
                if (!labelText && el.id) {
                  const ext = document.querySelector(`label[for="${el.id}"]`);
                  if (ext) labelText = (ext as any).innerText || ext.textContent || '';
                }
                return {
                  name:  el.name || '',
                  value: el.value || '',
                  id:    el.id || '',
                  labelText: labelText.trim(),
                };
              }),
            );
            for (const r of radioInfo) {
              if (r.value && r.value.toLowerCase() === wantLower) return true;
              // Boolean synonyms — yes/no question stored as true/false.
              if ((wantLower === 'yes' || wantLower === 'true') && (r.value === 'true' || r.value === '1')) return true;
              if ((wantLower === 'no'  || wantLower === 'false') && (r.value === 'false' || r.value === '0')) return true;
              // Name-variant match falls through to confirm.
              if (nameVariants.includes(r.name)) return true;
              // Label-text match — Angular forms with value-less
              // radios; the only signal is which option's label is
              // wrapping the :checked input.
              if (r.labelText && r.labelText.toLowerCase().includes(wantLower)) return true;
            }
          } catch {}
          // 3: button-state readback near the label
          try {
            const labelled = page.getByLabel(field.label, { exact: false });
            const pressed = await labelled
              .locator(
                `button:has-text("${valueStr}")[aria-pressed="true"], ` +
                `button:has-text("${valueStr}")[aria-checked="true"], ` +
                `button:has-text("${valueStr}").selected, ` +
                `button:has-text("${valueStr}").active, ` +
                `[role="button"]:has-text("${valueStr}")[aria-pressed="true"], ` +
                `[role="button"]:has-text("${valueStr}")[aria-checked="true"]`,
              )
              .first()
              .count();
            if (pressed > 0) return true;
          } catch {}
          return false;
        };

        // 0. Pre-check — many forms render with a default value
        //    pre-selected (e.g. "No" highlighted on a Yes/No
        //    question). If the readback already shows the desired
        //    value, declare success without clicking anything. Saves
        //    time AND avoids accidentally toggling away from the
        //    right answer.
        if (await readBackValueStuck()) {
          return { success: true, resolvedValue: `${valueStr} (already set)` };
        }

        // 1. <select> by visible option text. Pass `label` (the
        //    visible text) when we have a match — Playwright then
        //    handles native-select selection, even if the option's
        //    `value` is a code (e.g. "AFG" for "AFGHANISTAN").
        try {
          await page.waitForSelector(selector, { timeout: 600 });
          const sel = await selectByText(page, selector, valueStr);
          if (sel.ok) return { success: true, resolvedValue: valueStr };
        } catch {}

        // 1a. Closest-match fallback for flight number selects.
        //     Aruba's Flight Number dropdown is filtered by airline +
        //     arrival date, so the options the gov site actually
        //     shows almost never line up exactly with what the
        //     customer typed. We pick the best available match
        //     instead of giving up.
        //
        //     Scoring is longest common prefix on the digit-stripped
        //     forms (customer value already had non-digits stripped
        //     by `valueStr` above; we do the same to the option text).
        //     LCP is a decent metric for flight numbers because they
        //     usually share an airline prefix — "989879" vs ["1374",
        //     "9898", "1234"] correctly picks "9898" (4-char prefix).
        //
        //     If every option scores 0 (no overlap at all) we still
        //     fall back to picking option[0] — the customer's value
        //     is wrong by definition (gov dropdown is the source of
        //     truth) so any pick is better than a hard failure.
        //
        //     Only triggers for flight number — picking the lone
        //     option for, say, Country would be a real bug.
        if (/flightnumber/i.test(field.key)) {
          try {
            // Same `visible=true` scoping as selectByText so we read
            // options from the currently-active accordion section's
            // flight number select, not the other one.
            const sel = page.locator(selector).locator('visible=true').first();
            const opts = await sel.evaluate((el: any) =>
              Array.from(el.options || [])
                .filter((o: any) => !o.disabled && o.value !== '')
                .map((o: any) => ({ value: o.value, text: (o.textContent || '').trim() })),
            ).catch(() => [] as Array<{ value: string; text: string }>);
            if (opts.length === 1) {
              await sel.selectOption(opts[0].value);
              return { success: true, resolvedValue: `${opts[0].text} (only option available)` };
            }
            if (opts.length > 1 && valueStr) {
              // Longest common prefix between customer value and
              // the digit-stripped option text. Case-insensitive so
              // "KL643" matches "kl643".
              const scoreByPrefix = (a: string, b: string): number => {
                const x = a.toLowerCase();
                const y = b.toLowerCase();
                let i = 0;
                while (i < x.length && i < y.length && x[i] === y[i]) i++;
                return i;
              };
              // Score by both raw text and digit-stripped text — pick
              // the higher of the two so "KL 643" against "643" still
              // scores 3 instead of 0.
              const scored = opts.map((o) => {
                const optDigits = o.text.replace(/\D/g, '');
                const sRaw = scoreByPrefix(valueStr, o.text);
                const sDigits = scoreByPrefix(valueStr, optDigits);
                return { opt: o, score: Math.max(sRaw, sDigits) };
              });
              scored.sort((a, b) => b.score - a.score);
              const best = scored[0];
              await sel.selectOption(best.opt.value);
              const note = best.score > 0
                ? `closest match for "${valueStr}", LCP=${best.score}`
                : `no overlap — fell back to first option`;
              return { success: true, resolvedValue: `${best.opt.text} (${note})` };
            }
          } catch {}
        }

        // (Strategy 1b uses the same visible-first selEl as 1+1a so
        // we never type into an off-screen / collapsed select.)
        // 1b. Type-ahead fallback for native <select> elements.
        //    Real keyboards navigate selects by typing the first
        //    letters of the option — focusing the select and
        //    pressing letters jumps to matching options. Useful when
        //    the option list is long (e.g. Aruba's country dropdown
        //    has 100+ entries) and selectByText hit a strict-mode
        //    issue or option-text encoding quirk we didn't expect.
        try {
          const selEl = page.locator(selector).locator('visible=true').first();
          // Verify it's actually a SELECT — typing into a non-select
          // would just move focus around the page randomly.
          const tag = await selEl.evaluate((el: any) => el.tagName).catch(() => '');
          if (tag === 'SELECT') {
            await selEl.focus();
            // Type the value letter-by-letter. Most browsers jump
            // to the option whose visible text starts with the typed
            // prefix; pause between keystrokes so the buffer fills.
            for (const ch of valueStr.slice(0, 4)) {
              await page.keyboard.press(ch);
              await delay(120);
            }
            // Commit the selection by tabbing off the element.
            await page.keyboard.press('Tab');
            await delay(150);
            // Readback — did we land on the right option?
            const currentText = await selEl.evaluate((el: any) => {
              const opt = el.options[el.selectedIndex];
              return opt ? (opt.textContent || '').trim() : '';
            }).catch(() => '');
            if (currentText && currentText.toLowerCase().includes(valueStr.toLowerCase().slice(0, 3))) {
              return { success: true, resolvedValue: `${valueStr} (typed)` };
            }
          }
        } catch {}

        // 2. radio: input with the right name + value
        const radioTargets = nameVariants
          .flatMap(n => [
            `input[name="${n}"][value="${valueStr}"]`,
            `input[name="${n}"][value="${valueStr.toLowerCase()}"]`,
            `input[name="${n}"][value="${valueStr.toUpperCase()}"]`,
          ])
          .join(', ');
        let radioClickThrew = false;
        try {
          await page.click(radioTargets, { timeout: 600 });
        } catch { radioClickThrew = true; }
        if (await readBackValueStuck()) return { success: true, resolvedValue: valueStr };

        // 3. Click a <label> whose visible text is the value. Common
        //    Angular / Material / Bootstrap pattern: the radio input
        //    is inside a <label> that wraps both the <input> and a
        //    <span> with the visible Yes/No text. Clicking the label
        //    toggles the radio without needing a direct
        //    [name][value] match on the input itself. This is what
        //    edcardaruba.aw uses (formcontrolname + <span>Yes/No</span>).
        let toggleClickThrew = false;
        try {
          await page.click(
            `label:has-text("${valueStr}"), button:has-text("${valueStr}"), [role="button"]:has-text("${valueStr}")`,
            { timeout: 600 },
          );
        } catch { toggleClickThrew = true; }
        if (await readBackValueStuck()) return { success: true, resolvedValue: valueStr };

        // 4. Last resort: ANY button with that exact text. Only
        //    triggers when nothing scoped worked — fuzzy enough that
        //    a wrong click is possible, so we still verify after.
        try {
          await page.click(`button:has-text("${valueStr}")`, { timeout: 500 });
        } catch {}
        if (await readBackValueStuck()) return { success: true, resolvedValue: valueStr };

        // Dump the surrounding markup so the next bot run shows the
        // admin EXACTLY what's on the page near the field. Cheaper
        // than DevTools-inspecting by hand and turns "FAIL" into
        // actionable info — the right selector usually pops out
        // looking at the markup.
        //
        // Strategy: text-based search inside the page, walking up
        // the tree from any node containing the field's label. This
        // is more tolerant than getByLabel (which requires a proper
        // <label> binding) and handles forms where the label is
        // just a styled <div> or <span>.
        let nearbyHtml = '';
        try {
          nearbyHtml = await page.evaluate(({ label, valueStr }) => {
            const all = document.querySelectorAll<HTMLElement>('body *');
            // Find the smallest element whose direct text contains
            // the label (avoids returning <body>).
            let target: HTMLElement | null = null;
            for (const el of all) {
              const own = (el as any).innerText || el.textContent || '';
              if (own.includes(label) && own.length < 200) {
                target = el;
                break;
              }
            }
            if (!target) {
              // Fallback: any element containing the value text.
              for (const el of all) {
                const own = (el as any).innerText || el.textContent || '';
                if (own.includes(valueStr) && own.length < 80) {
                  target = el;
                  break;
                }
              }
            }
            if (!target) return '';
            // Climb to a reasonable container (3 levels up or until
            // we hit something with form-ish children).
            let parent: HTMLElement | null = target;
            for (let i = 0; i < 3; i++) {
              if (!parent?.parentElement) break;
              parent = parent.parentElement;
            }
            return (parent?.outerHTML || '').replace(/\s+/g, ' ').slice(0, 1500);
          }, { label: field.label, valueStr });
        } catch {}

        // ALSO save the full page HTML to disk on first failure of a
        // run. Easier to grep through one ~50KB file than chase per-
        // field snippets when heuristics are wrong.
        try {
          const fs = await import('fs/promises');
          const path = await import('path');
          const dir = path.resolve(__dirname, '..', '.bot-debug');
          await fs.mkdir(dir, { recursive: true });
          const outPath = path.join(dir, `aruba-${field.key}-${Date.now()}.html`);
          await fs.writeFile(outPath, await page.content());
          console.log(`     📄 Saved page HTML for inspection: ${outPath}`);
        } catch {}

        return {
          success: false,
          errorMsg:
            `Could not select "${valueStr}" — tried <select>, radio inputs (${nameVariants.join(' / ')}), ` +
            `and toggle buttons${radioClickThrew || toggleClickThrew ? ' (some matched but didn\'t stick)' : ''}.` +
            (nearbyHtml ? `\n\nMarkup near "${field.label}":\n${nearbyHtml}` : '') +
            `\n\nMap an explicit selector for this field in /admin/settings/aruba.`,
        };
      }
      case 'click': {
        await page.click(selector);
        return { success: true };
      }
      case 'check': {
        // Toggle a checkbox to match `truthy` semantics. Falsy values
        // (false, '', 'no', 'No', '0') leave it unchecked.
        const truthy = valueStr === 'true' || valueStr === 'yes' || valueStr === 'Yes' || valueStr === '1';
        if (truthy) await page.check(selector);
        else await page.uncheck(selector);
        return { success: true, resolvedValue: truthy ? 'checked' : 'unchecked' };
      }
      case 'upload': {
        // Resolves the file to upload by scanning the order's upload
        // directory for the NEWEST image file (by mtime). The URL on
        // the traveler record is only used to identify which directory
        // to scan — the actual filename comes from disk.
        //
        // Why: customers can re-upload (via the customer finish form
        // OR the admin's "Replace" button on the order page), and the
        // two paths write to different traveler fields
        // (`passportFile` vs `passportBioUrl`) plus India vs Aruba
        // semantics. Trusting the filesystem timestamps means the bot
        // always uploads the most-recently-touched file, regardless
        // of which field the URL ended up on.
        //
        // setInputFiles works on hidden file inputs (Aruba's
        // #passportUpload-0 has `hidden=""`) — Playwright bypasses
        // the click-to-open-file-picker flow.
        if (!valueStr) {
          return { success: false, errorMsg: 'No file URL on traveler' };
        }
        const path = await import('path');
        const fs = await import('fs/promises');
        const projectRoot = path.resolve(__dirname, '..');

        // Aruba's form accepts only image formats — no PDFs, even though
        // /api/upload allows them.
        const ARUBA_ACCEPTS_EXT = ['jpg', 'jpeg', 'png', 'heic', 'gif'];

        // Shared tail for both storage backends: hand the local file to the
        // form's file input. Find the FIRST matching input — the selector is
        // a comma-list of heuristic patterns and `.first()` picks whichever
        // resolves. setInputFiles on a hidden input is fine; Playwright
        // doesn't require visibility for file inputs.
        const uploadLocalFile = async (localPath: string) => {
          try {
            await page.locator(selector).first().setInputFiles(localPath, { timeout: 3_000 });
            // Wait for Aruba's OCR to read the passport image and
            // auto-populate the surrounding readonly fields. Without this,
            // the next field (Country of Birth) might be attempted before
            // the form has settled, so the bot's look-ahead check would
            // miss it. 3s is empirically enough for the OCR endpoint.
            await delay(3_000);
            return { success: true, resolvedValue: path.basename(localPath) };
          } catch (e: any) {
            return { success: false, errorMsg: `setInputFiles failed: ${e?.message || e}` };
          }
        };

        // ── Blob-stored documents ──────────────────────────────────────
        // Documents now live in private Blob storage, so there's no local
        // directory to scan. findNewestOrderDocument reproduces the same
        // "newest acceptable image for this order" heuristic against the
        // blob prefix, then we download it to a temp file for
        // setInputFiles. Legacy /uploads refs fall through to the
        // directory scan below unchanged.
        {
          const parsed = parseDocumentRef(valueStr);
          if (parsed.kind === 'blob') {
            const orderRef = orderIdFromBlobPathname(parsed.pathname);
            const newest = orderRef
              ? await findNewestOrderDocument(orderRef, ARUBA_ACCEPTS_EXT)
              : null;
            const chosen = newest ?? parsed.pathname;
            if (newest && newest !== parsed.pathname) {
              console.log(`     ↻  Stored ref points to "${parsed.pathname}" — using newer image "${newest}".`);
            }
            const localFromBlob = await resolveDocumentToLocalFile(refForBlobPathname(chosen), { projectRoot });
            if (!localFromBlob) {
              return { success: false, errorMsg: `Could not download document ${chosen} from Blob storage` };
            }
            const extOk = ARUBA_ACCEPTS_EXT.includes((chosen.split('.').pop() || '').toLowerCase());
            if (!extOk) {
              return { success: false, errorMsg: `No image file for this order (Aruba needs jpg/png/heic/gif; found ${chosen})` };
            }
            return await uploadLocalFile(localFromBlob);
          }
        }

        // ── Legacy on-disk documents ───────────────────────────────────
        // The URL gives us the upload DIRECTORY for this order; we'll
        // scan it for the newest image. Filename in the URL may be
        // stale (older re-upload), so we don't trust it.
        const initialPath = valueStr.startsWith('/uploads/')
          ? path.join(projectRoot, 'public', valueStr)
          : valueStr;
        const uploadDir = path.dirname(initialPath);

        // Aruba's form accepts only image formats — no PDFs even
        // though our /api/upload allows them. Scan the upload dir
        // for ALL accepted images and pick whichever has the latest
        // mtime. This handles three real cases at once:
        //   1. Re-upload via customer side updated `passportFile`.
        //   2. Re-upload via admin updated `passportBioUrl` (India
        //      field name) but not `passportFile` — bot picks the
        //      newer file regardless.
        //   3. Customer uploaded a PDF first, then re-uploaded an
        //      image — bot uses the image, not the PDF.
        const ARUBA_ACCEPTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.gif']);
        let localPath: string;
        try {
          const entries = await fs.readdir(uploadDir);
          const candidates = await Promise.all(
            entries
              .filter(n => ARUBA_ACCEPTS.has(path.extname(n).toLowerCase()))
              .map(async n => ({
                name:  n,
                mtime: (await fs.stat(path.join(uploadDir, n))).mtimeMs,
              })),
          );
          if (candidates.length === 0) {
            return { success: false, errorMsg: `No image files in ${uploadDir} (Aruba needs jpg/png/heic/gif)` };
          }
          candidates.sort((a, b) => b.mtime - a.mtime);
          localPath = path.join(uploadDir, candidates[0].name);
          if (path.basename(initialPath) !== candidates[0].name) {
            console.log(`     ↻  Stored URL points to "${path.basename(initialPath)}" — using newer image "${candidates[0].name}" from same directory.`);
          }
        } catch {
          return { success: false, errorMsg: `Could not read upload directory ${uploadDir}` };
        }

        return await uploadLocalFile(localPath);
      }
      case 'skip':
        // Explicit "the bot should not touch this field" — common for
        // questions the form pre-fills with the right default (e.g.
        // Aruba's "Are you a resident?" defaults to No, which is what
        // 99% of our customers want). Return success so the field
        // doesn't count as a failure or block the form's advance.
        return { success: true, resolvedValue: '(skipped — bot configured to leave this field at its default)' };
      default:
        return { success: false, errorMsg: `Unknown action "${action}"` };
    }
  } catch (e: any) {
    return { success: false, errorMsg: e?.message || 'Action failed' };
  }
}

/**
 * Detect whether Aruba's passport-OCR step failed.
 *
 * After we upload a passport image, Aruba's API either:
 *   (success) auto-populates the Passport Number / Names / DOB /
 *             Gender / Nationality / Expiry fields as readonly,
 *             then displays nothing extra.
 *   (failure) shows a pink banner: "Passport upload unsuccessful.
 *             Try taking or uploading a different picture of your
 *             passport, or fill out the form manually." plus the
 *             sub-line "Manual entry of passport information is
 *             enabled." Those same identity fields are now
 *             editable inputs (not readonly).
 *
 * We probe for either piece of failure text — matching either is
 * a strong signal we're in manual-entry mode. Returns true on
 * match, false otherwise (including any unexpected error — we'd
 * rather assume OCR worked and skip the redundant manual fill
 * than spuriously type into readonly inputs).
 */
/**
 * Probe the page for the OCR step's resolution state. Returns:
 *   'failed'   — the "Passport upload unsuccessful" banner is in
 *                the DOM. Bot should switch identity fields to
 *                manual fill.
 *   'success'  — the `firstNames-0` input has the readonly
 *                attribute set. Aruba does this only when OCR
 *                populated the fields; in manual mode the same
 *                input is editable.
 *   'pending'  — neither signal is present yet. OCR endpoint is
 *                still working — keep polling.
 *
 * Direct DOM access via page.evaluate sidesteps Playwright's
 * visible= filter, which rejected the banner even when it was
 * clearly on the page (Angular's nested ng-content wrappers).
 */
/**
 * Per the gov-form behaviour, when OCR fails Aruba renders the
 * exact sentence: "Passport upload unsuccessful. Try taking or
 * uploading a different picture of your passport, or fill out
 * the form manually." Playwright's getByText + filter(visible)
 * is the most reliable detector — it does a real
 * box-intersects-viewport visibility check (NOT just CSS
 * display:none), which is what we want here: the text element
 * exists in the DOM at all times but is hidden until failure.
 */
const OCR_FAILURE_TEXT = 'Passport upload unsuccessful. Try taking or uploading a different picture of your passport, or fill out the form manually.';

/**
 * Per-traveler OCR state probe. Same logic as detectOcrState but
 * scoped to ONE traveler's row — needed for multi-traveler runs
 * where traveler 0's failure banner is still visible when we
 * upload for traveler 1, and a non-scoped check would think
 * traveler 1 also failed before its OCR has even run.
 *
 * We anchor on the indexed `firstNames-N` input: walk up to the
 * traveler's container, then look for the failure text WITHIN
 * that container only.
 *
 * Success signal stays per-input: `input[id="firstNames-N"][readonly]`.
 */
async function detectOcrStateForTraveler(page: Page, idx: number): Promise<'failed' | 'success' | 'pending'> {
  try {
    return await page.evaluate(({ failureText, index }) => {
      const firstNames = document.getElementById(`firstNames-${index}`) as HTMLInputElement | null;
      if (!firstNames) return 'pending' as const;

      // Walk up to the traveler-card container — Aruba wraps each
      // traveler's identity inputs + their banner inside the same
      // ng-container. The h3.traveler-header anchor sits inside
      // this container. If we can't find a card-shaped ancestor,
      // fall back to checking siblings of the upload input.
      let container: HTMLElement | null = firstNames;
      for (let i = 0; i < 12 && container; i++) {
        if (container.querySelector(`#passportUpload-${index}`)) break;
        container = container.parentElement;
      }
      if (!container) container = firstNames.parentElement;
      if (!container) return 'pending' as const;

      const text = container.textContent || '';
      if (text.includes(failureText)) return 'failed' as const;

      // readonly = OCR success for THIS traveler.
      if (firstNames.readOnly) return 'success' as const;

      return 'pending' as const;
    }, { failureText: OCR_FAILURE_TEXT, index: idx });
  } catch {
    return 'pending';
  }
}

async function detectOcrState(page: Page): Promise<'failed' | 'success' | 'pending'> {
  // Failure check first — visible match of the exact failure
  // sentence. Trim the period in case Aruba renders trailing
  // whitespace differently than our literal; `exact: false`
  // tolerates extra wrapper whitespace.
  try {
    const visible = await page.getByText(OCR_FAILURE_TEXT, { exact: false })
      .filter({ visible: true })
      .count()
      .catch(() => 0);
    if (visible > 0) return 'failed';
  } catch {}

  // Success check — Aruba flips firstNames-N to readonly only
  // after OCR populates the identity fields. Same visibility
  // requirement: the form may render firstNames hidden during
  // initial layout before any upload happens.
  try {
    const readonlyVisible = await page.locator('input[id^="firstNames-"][readonly]')
      .filter({ visible: true })
      .count()
      .catch(() => 0);
    if (readonlyVisible > 0) return 'success';
  } catch {}

  return 'pending';
}

/**
 * Manually fill Aruba's identity fields for the given traveler
 * index when OCR has failed. Has to run WHILE the form is still
 * on Step 2 (Passport Details accordion) — those fields are
 * required to advance, and if we wait for our schema's `personal`
 * section to iterate them, the form is already past Step 2 (or
 * stuck because Next is disabled) and the selectors won't
 * resolve.
 *
 * Field IDs use Aruba's per-traveler index suffix:
 *   firstNames-N, lastNames-N (note plural id with singular
 *   formcontrolname), dateOfBirth-N, nationality-N,
 *   passportNumber-N, passportExpiration-N, gender-{male|female|other}-N.
 *
 * Value sources:
 *   firstName / lastName / passportNumber → traveler key directly.
 *   dob → traveler.dob (handed to buildDateCandidates which copes
 *       with the "January 15, 1990" storage format).
 *   nationality → traveler.nationality, falling back to
 *       traveler.passportCountry (the /apply step writes the latter).
 *   passportExpiryDate → traveler.passportExpiryDate, falling
 *       back to traveler.passportExpiry.
 *   gender → mapped to one of male/female/other, case-insensitive.
 *
 * Returns nothing. Each missing/failed sub-fill is logged but
 * doesn't abort the rest — partial fills still let the form move
 * forward once enough required fields are satisfied.
 */
async function fillOcrFallbackIdentityFields(opts: {
  page: Page;
  traveler: any;
  travelerIndex: number;
}): Promise<void> {
  const { page, traveler, travelerIndex: idx } = opts;
  console.log(`     ↻  OCR failed — filling identity fields manually for traveler #${idx + 1} (id suffix -${idx}).`);

  const fillText = async (idPrefix: string, value: any, label: string) => {
    const v = String(value ?? '').trim();
    if (!v) return;
    try {
      await page.locator(`#${idPrefix}-${idx}, [id^="${idPrefix}-${idx}"]`)
        .locator('visible=true').first()
        .fill(v, { timeout: 2_500 });
      console.log(`        ✓ ${label}: ${v}`);
    } catch (e: any) {
      console.warn(`        ⚠️  ${label}: ${e?.message || e}`);
    }
  };

  const fillDate = async (idPrefix: string, value: any, label: string) => {
    const raw = String(value ?? '').trim();
    if (!raw) return;
    const candidates = buildDateCandidates(raw) || [raw];
    const loc = page.locator(`#${idPrefix}-${idx}, [id^="${idPrefix}-${idx}"]`)
      .locator('visible=true').first();
    for (const cand of candidates) {
      // First try .fill — fastest. If readback is empty
      // (the date widget silently rejected the format),
      // fall through to .pressSequentially which simulates
      // real keystrokes so Aruba's date validator + ngModel
      // see the change events they need.
      try {
        await loc.fill(cand, { timeout: 2_000 });
        const readback = await loc.inputValue().catch(() => '');
        if (readback) {
          console.log(`        ✓ ${label}: ${cand}`);
          return;
        }
      } catch {}
      try {
        await loc.click({ timeout: 1_500 });
        await loc.fill('', { timeout: 1_500 }).catch(() => {});
        await loc.pressSequentially(cand, { delay: 30, timeout: 3_000 });
        const readback = await loc.inputValue().catch(() => '');
        if (readback) {
          console.log(`        ✓ ${label}: ${cand} (typed)`);
          return;
        }
      } catch {}
    }
    console.warn(`        ⚠️  ${label}: all date formats rejected (${candidates.join(' / ')})`);
  };

  const selectByValue = async (idPrefix: string, value: any, label: string) => {
    const v = String(value ?? '').trim();
    if (!v) return;
    try {
      const selector = `#${idPrefix}-${idx}, [id^="${idPrefix}-${idx}"]`;
      const res = await selectByText(page, selector, v);
      if (res.ok) console.log(`        ✓ ${label}: ${v}`);
      else console.warn(`        ⚠️  ${label}: "${v}" not in dropdown options`);
    } catch (e: any) {
      console.warn(`        ⚠️  ${label}: ${e?.message || e}`);
    }
  };

  const clickGender = async (value: any) => {
    const v = String(value ?? '').toLowerCase().trim();
    if (!v) return;
    // Map common variants to Aruba's three id suffixes.
    let bucket = '';
    if (v.startsWith('m')) bucket = 'male';
    else if (v.startsWith('f')) bucket = 'female';
    else bucket = 'other';
    try {
      // Click the LABEL — the radio input itself is hidden behind
      // an Angular-styled label/span pair (same pattern as
      // residence radios), and clicking the input directly often
      // fails to toggle the ngModel.
      await page.locator(`label[for="gender-${bucket}-${idx}"]`)
        .locator('visible=true').first()
        .click({ timeout: 2_000 });
      console.log(`        ✓ Gender: ${bucket}`);
    } catch (e: any) {
      console.warn(`        ⚠️  Gender (${bucket}): ${e?.message || e}`);
    }
  };

  await fillText('firstNames',         traveler?.firstName,        'First Name(s)');
  await fillText('lastNames',          traveler?.lastName,         'Last Name(s)');
  await fillDate('dateOfBirth',        traveler?.dob,              'Date of Birth');
  await clickGender(traveler?.gender);
  await selectByValue('nationality',   traveler?.nationality ?? traveler?.passportCountry, 'Nationality');
  await fillText('passportNumber',     traveler?.passportNumber,   'Passport Number');
  await fillDate('passportExpiration', traveler?.passportExpiryDate ?? traveler?.passportExpiry, 'Passport Expiration');
}

/**
 * Add and fill one additional traveler on Aruba's Passport Details
 * step. Called from the main loop AFTER traveler 0 has filled
 * passport upload + country of birth and BEFORE the Step 2 → Step 3
 * Next click.
 *
 * Steps:
 *   1. Click "Add Family Member" — Aruba renders a fresh set of
 *      indexed inputs (passportUpload-N, countryOfBirth-N, etc.).
 *   2. Upload the passport image. The file path is resolved the
 *      same way as the main `upload` action: take the traveler's
 *      `passportFile` URL, derive its directory, pick the newest
 *      Aruba-accepted image in that directory (handles re-uploads).
 *   3. Wait for Aruba's OCR to populate the readonly fields.
 *   4. Select country of birth on the indexed dropdown.
 *
 * Returns { ok, errors } so the caller can decide whether to surface
 * a failure to the run log. Never throws — partial failures still
 * let the rest of the form proceed (e.g. uploading 2 of 3 travelers
 * is better than aborting the whole run).
 */
async function addTraveler(opts: {
  page: Page;
  index: number;            // 1, 2, 3, ... (additional traveler index)
  traveler: any;
}): Promise<{ ok: boolean; errors: string[] }> {
  const { page, index, traveler } = opts;
  const errors: string[] = [];
  const labelName = `${traveler?.firstName ?? '?'} ${traveler?.lastName ?? '?'}`.trim();
  console.log(`\n  👤 Adding traveler #${index + 1} (${labelName})…`);

  // 1. Click "Add Family Member" — pick whichever copy is visible
  //    (Aruba may render the button multiple times as travelers
  //    accumulate; we want the active one at the bottom of the
  //    current set).
  try {
    const btn = page.locator(
      'button:has-text("Add Family Member"), button:has-text("Add Traveler"), button:has-text("Add family member")',
    ).locator('visible=true').first();
    await btn.waitFor({ state: 'visible', timeout: 4_000 });
    await btn.click({ timeout: 3_000 });
    console.log('     ✓ Clicked "Add Family Member"');
    // Give Angular a moment to render the new indexed input set
    // before we try to target #passportUpload-N.
    await delay(800);
  } catch (e: any) {
    const msg = `Couldn't click "Add Family Member" for traveler #${index + 1}: ${e?.message || e}`;
    console.warn(`     ⚠️  ${msg}`);
    errors.push(msg);
    return { ok: false, errors };
  }

  // 2. Resolve and upload this traveler's passport. Same logic as
  //    the main upload action: URL → dir → newest accepted image.
  const passportUrl: string = String(traveler?.passportFile || traveler?.passportBioUrl || '').trim();
  if (!passportUrl) {
    const msg = `Traveler #${index + 1} has no passportFile / passportBioUrl URL — skipping upload.`;
    console.warn(`     ⚠️  ${msg}`);
    errors.push(msg);
  } else {
    try {
      const pathMod = await import('path');
      const fs = await import('fs/promises');
      const projectRoot = pathMod.resolve(__dirname, '..');
      const initialPath = passportUrl.startsWith('/uploads/')
        ? pathMod.join(projectRoot, 'public', passportUrl)
        : passportUrl;
      const uploadDir = pathMod.dirname(initialPath);
      const ARUBA_ACCEPTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.gif']);

      // Prefer the file the URL points to if it still exists; only
      // fall back to "newest in dir" if it doesn't. With multiple
      // travelers in one upload dir, "newest" would race — exact
      // filename is safer.
      let localPath: string;
      try { await fs.access(initialPath); localPath = initialPath; }
      catch {
        const entries = await fs.readdir(uploadDir);
        const candidates = await Promise.all(
          entries.filter(n => ARUBA_ACCEPTS.has(pathMod.extname(n).toLowerCase()))
            .map(async n => ({ name: n, mtime: (await fs.stat(pathMod.join(uploadDir, n))).mtimeMs })),
        );
        if (candidates.length === 0) throw new Error(`No accepted images in ${uploadDir}`);
        candidates.sort((a, b) => b.mtime - a.mtime);
        localPath = pathMod.join(uploadDir, candidates[0].name);
        console.log(`     ↻  ${pathMod.basename(initialPath)} missing — using newest "${candidates[0].name}".`);
      }

      const uploadSelector = `#passportUpload-${index}, input[type="file"][id^="passportUpload-${index}"]`;
      await page.locator(uploadSelector).first().setInputFiles(localPath, { timeout: 4_000 });
      // OCR wait — same 3s as single-traveler path.
      await delay(3_000);
      console.log(`     ✓ Uploaded ${pathMod.basename(localPath)} → #passportUpload-${index}`);

      // OCR-failure check for THIS traveler. Same polling logic
      // as the primary traveler path but scoped to this index.
      // We poll up to 20s for either resolution state (failed /
      // success / pending). If failed, the identity fields for
      // THIS traveler — firstNames-N, lastNames-N, dateOfBirth-N,
      // gender-{male|female|other}-N, nationality-N,
      // passportNumber-N, passportExpiration-N — need to be
      // typed in manually. We use the same helper as the
      // primary path; the index suffix in every selector means
      // it targets the right traveler's row without picking
      // up neighbour rows.
      let outcome: 'failed' | 'success' | 'pending' = 'pending';
      const probeStart = Date.now();
      const PROBE_MAX_MS = 20_000;
      while (Date.now() - probeStart < PROBE_MAX_MS) {
        outcome = await detectOcrStateForTraveler(page, index);
        if (outcome !== 'pending') break;
        await delay(700);
      }
      const elapsedSec = ((Date.now() - probeStart) / 1000).toFixed(1);
      if (outcome === 'failed') {
        console.log(`     ⚠️  OCR failed for traveler #${index + 1} after ${elapsedSec}s — filling identity fields manually.`);
        await delay(1_500);
        await fillOcrFallbackIdentityFields({ page, traveler, travelerIndex: index });
      } else if (outcome === 'success') {
        console.log(`     ✓ OCR success for traveler #${index + 1} after ${elapsedSec}s — readonly fields auto-populated.`);
      } else {
        console.log(`     ?  OCR state unresolved for traveler #${index + 1} after ${elapsedSec}s — proceeding.`);
      }
    } catch (e: any) {
      const msg = `Upload for traveler #${index + 1} failed: ${e?.message || e}`;
      console.warn(`     ⚠️  ${msg}`);
      errors.push(msg);
    }
  }

  // 3. Country of birth on the indexed select. Aruba uses
  //    `id="countryOfBirth-N"` — heuristic-strip falls back to
  //    `formcontrolname="countryOfBirth"` but that's not unique
  //    across traveler instances, so pin the ID directly.
  const cob = String(traveler?.countryOfBirth || '').trim();
  if (!cob) {
    const msg = `Traveler #${index + 1} has no countryOfBirth — leaving blank.`;
    console.warn(`     ⚠️  ${msg}`);
    errors.push(msg);
  } else {
    try {
      const cobSelector = `#countryOfBirth-${index}`;
      const res = await selectByText(page, cobSelector, cob);
      if (res.ok) {
        console.log(`     ✓ Country of Birth #${index}: ${cob}`);
      } else {
        const msg = `selectByText didn't resolve "${cob}" on #countryOfBirth-${index}`;
        console.warn(`     ⚠️  ${msg}`);
        errors.push(msg);
      }
    } catch (e: any) {
      const msg = `Country of Birth #${index} failed: ${e?.message || e}`;
      console.warn(`     ⚠️  ${msg}`);
      errors.push(msg);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npx tsx scripts/process-aruba.ts <orderNumber>');
    process.exit(1);
  }
  const orderNumber = parseOrderNumber(arg);
  if (!orderNumber || isNaN(orderNumber)) {
    console.error(`Invalid order number: ${arg}`);
    process.exit(1);
  }

  console.log(`\n🇦🇼 Aruba ED Card bot — order #${arg}\n`);

  // ── 1. Fetch order + traveler ────────────────────────────────────
  const order = await prisma.order.findFirst({ where: { orderNumber } });
  if (!order) {
    console.error(`Order #${orderNumber} not found.`);
    process.exit(1);
  }
  if ((order.destination || '').toLowerCase() !== 'aruba') {
    console.error(`Order #${orderNumber} is for ${order.destination}, not Aruba. Use the right script.`);
    process.exit(1);
  }
  let travelers: any[] = [];
  try { travelers = JSON.parse(order.travelers || '[]'); } catch {}
  const traveler = travelers[0];
  if (!traveler) {
    console.error(`Order #${orderNumber} has no traveler data — has the customer finished the application?`);
    process.exit(1);
  }

  // Multi-traveler note. Aruba indexes additional travelers as
  // `-1`, `-2`, etc. on the field ids (passportUpload-1,
  // countryOfBirth-1, passportNumber-1, ...). After the bot fills
  // traveler 0's passport upload + country of birth, we loop over
  // any additional travelers, click "Add Family Member" once each,
  // and fill their passport + country of birth at the indexed
  // selectors. The OCR auto-populates the rest of each traveler's
  // passport fields.
  //
  // The rest of the schema (Trip details, Personal Info, Address,
  // Additional, Contact, Payment) is still single-shot per ORDER —
  // those sections are shared across travelers on the gov form, or
  // bot-only (Contact / Payment).
  if (travelers.length > 1) {
    console.log(`👨‍👩‍👧 Order has ${travelers.length} travelers — additional travelers will be added on Aruba's Passport Details step via "Add Family Member".`);
  }
  console.log(`Order:    #${arg} (${order.destination} ${order.visaType})`);
  console.log(`Traveler: ${traveler.firstName ?? '?'} ${traveler.lastName ?? '?'}\n`);

  // ── 2. Load schema (built-in + admin overrides) ──────────────────
  const storedRow = await prisma.setting.findUnique({ where: { key: schemaSettingKey('ARUBA') } });
  let stored: any = null;
  if (storedRow) {
    try { stored = JSON.parse(storedRow.value); } catch {}
  }
  const schema = mergeWithDefaults(stored, 'ARUBA') ?? defaultSchema('ARUBA');
  const sections = schema.sections.filter(s => !s.hidden && s.fields.length > 0);

  // ── 2.5. Load the bot payment card (decrypted in-memory) ─────────
  // Stored encrypted in Setting `bot.payment.creditCard` and managed
  // via /admin/settings/payment. We load once per run so the card
  // is in scope when the payment section iterates — without making
  // a DB hit per field. Decryption requires BOT_PAYMENT_ENC_KEY in
  // env; missing/invalid key → null here and payment fields will
  // fail with a clear error rather than the bot pretending all is
  // well.
  let paymentCard: DecryptedCard | null = null;
  try {
    paymentCard = await getDecryptedCard();
    if (paymentCard) {
      console.log(`💳 Payment card loaded — ending in ${paymentCard.last4} (exp ${paymentCard.expirationMonth}/${paymentCard.expirationYear}).`);
    } else {
      console.warn('⚠️  No bot payment card stored. Payment section will fail until one is saved at /admin/settings/payment.');
    }
  } catch (e: any) {
    console.error(`⚠️  Could not decrypt payment card: ${e?.message || e}. Set BOT_PAYMENT_ENC_KEY in env and re-save the card.`);
  }

  // ── 3. Load bot-mapping overrides ────────────────────────────────
  // The mapping table doesn't carry selectors — those live on the
  // schema's botSelector field. It carries SOURCE overrides (i.e.
  // "for this field, pull the value from a different traveler key
  // than the schema field key"). We keep it loaded for parity with
  // India's bot; sourced values are resolved per-field below.
  const overrides = await loadBotOverrides(prisma, 'ARUBA');

  // ── 4. Spawn the bot run logger ──────────────────────────────────
  const logger: BotRunLogger = await createBotRunLogger(prisma, {
    orderId: order.id,
    country: 'ARUBA',
  });
  console.log(`Bot run logged with id ${logger.runId}\n`);

  // ── 5. Launch browser + navigate ─────────────────────────────────
  // Window opens at a sensible desktop size instead of maximized —
  // matches normal-Chrome behaviour and leaves screen space for the
  // bot terminal next to it. Override via env if you'd rather see
  // the form full-width.
  const winW = parseInt(process.env.ARUBA_BOT_WIDTH  || '1280', 10);
  const winH = parseInt(process.env.ARUBA_BOT_HEIGHT || '900',  10);
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: [`--window-size=${winW},${winH}`, '--window-position=80,40'],
  });

  // Cleanup on signals — ensures bot-server's killCurrentBot can
  // terminate us cleanly without leaving a Chrome instance behind.
  let cancelled = false;
  const onSignal = async () => {
    if (cancelled) return;
    cancelled = true;
    console.log('\n⛔ Cancelled — closing browser…');
    try { await browser.close(); } catch {}
    await logger.finish({ cancelled: true });
    process.exit(0);
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

  // viewport: null lets the page use the actual window size set by
  // the launch flags above, instead of Playwright's default 1280×720
  // viewport snapping the renderer back to a smaller box.
  const ctx = await browser.newContext({ viewport: null });
  const page = await ctx.newPage();

  try {
    console.log(`Opening ${ARUBA_URL}…`);
    await page.goto(ARUBA_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await delay(1_500);

    // ── 5b. Click "Start" on the welcome page ──────────────────────
    // /welcome is a landing page with a Start button — the actual
    // application form is one click further. Without this, every
    // field selector below would fail because the form isn't in the
    // DOM yet.
    //
    // Logged as its own step so the run history shows whether the
    // welcome screen was traversed cleanly.
    try {
      await page.waitForSelector(ARUBA_START_SELECTOR, { timeout: 8_000, state: 'visible' });
      await page.click(ARUBA_START_SELECTOR);
      console.log('  ✅ Clicked Start');
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      await delay(1_000);
      await logger.log({
        stepKey: 'welcome',
        fieldKey: 'start',
        label: 'Welcome page — Start button',
        action: 'click',
        source: 'default',
        success: true,
        selector: ARUBA_START_SELECTOR,
      });
    } catch (e: any) {
      // Don't abort — the page might already be past /welcome (some
      // sessions land on the form directly). Log + continue.
      console.warn(`  ⚠️  Start button not found on welcome page: ${e?.message || e}`);
      await logger.log({
        stepKey: 'welcome',
        fieldKey: 'start',
        label: 'Welcome page — Start button',
        action: 'click',
        source: 'default',
        success: false,
        errorMsg: e?.message || 'Start button not found',
        selector: ARUBA_START_SELECTOR,
      });
    }

    // ── 6. Walk schema sections + apply fields ─────────────────────
    let filled = 0;
    let skipped = 0;
    let failed = 0;

    // Track, per traveler index, whether Aruba's passport OCR
    // failed on that traveler. Set true when the failure banner
    // is detected after upload — also triggers an immediate
    // inline fill of the identity fields (see the detection
    // block right after the passportFile success path). Kept
    // around the run for downstream code that might want to
    // log "OCR-fallback was used" alongside the bot run.
    const ocrFailedForTraveler: Record<number, boolean> = {};

    /**
     * Click whatever Next-button-equivalent exists on the current
     * step. Returns true if a click was made (and the page advanced).
     * Used both at our schema's section boundaries AND opportunistically
     * inside the field loop — when a field's selector doesn't match,
     * it might be because the form has paginated past the current step,
     * so we try Next + retry the field once before giving up.
     *
     * Throwing is suppressed so the caller can decide whether failure
     * to advance is a problem (it's fatal at the end of the run, fine
     * mid-loop). Visible buttons get dumped to the terminal so admin
     * can override `ARUBA_NEXT_BUTTON_SELECTOR` if heuristics miss.
     */
    const tryClickNext = async (): Promise<boolean> => {
      try {
        // Aruba's form is one big accordion — every step has its
        // own Next button in the DOM at once. Most are hidden inside
        // collapsed sections; only the currently-active step's button
        // is actually visible to a user. `.first()` in document order
        // grabs Step 1's button (now hidden because we advanced past
        // it), which is why earlier attempts silently no-op'd.
        //
        // The `:visible` pseudo-selector filters down to elements
        // Playwright considers visible (non-zero box, not display:none,
        // not visibility:hidden). Chaining `.first()` then grabs the
        // first VISIBLE match — the active step's Next button.
        const btn = page.locator(ARUBA_NEXT_SELECTOR).locator('visible=true').first();
        await btn.waitFor({ state: 'visible', timeout: 2_000 });
        await btn.click({ timeout: 2_000 });
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
        await delay(800);

        // After clicking Next, Aruba sometimes shows a confirmation
        // modal (e.g. "Make sure your details are correct" type
        // popups). Try to find + click a Confirm-style button. Most
        // forms label these "Confirm" / "OK" / "Yes" / "Continue".
        // Scoped to visible only so we don't accidentally click a
        // hidden modal button on a different step.
        try {
          const confirmBtn = page.locator(
            [
              'button:has-text("Confirm")',
              'button:has-text("OK")',
              'button:has-text("Yes")',
              'button:has-text("Continue")',
              'button:has-text("Accept")',
              '[role="button"]:has-text("Confirm")',
            ].join(', '),
          ).locator('visible=true').first();
          // Short timeout — most steps DON'T show a modal; we don't
          // want to wait around for one that never appears.
          await confirmBtn.waitFor({ state: 'visible', timeout: 1_200 });
          await confirmBtn.click({ timeout: 1_500 });
          console.log('  ✓  Clicked Confirm on popup');
          await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => {});
          await delay(500);
        } catch {
          // No popup — fine, this is the common case.
        }

        return true;
      } catch {
        return false;
      }
    };

    for (let secIdx = 0; secIdx < sections.length; secIdx++) {
      const section = sections[secIdx] as CustomSection;
      const isLastSection = secIdx === sections.length - 1;
      console.log(`\n── ${section.title} ──`);

      // Human-gate: pause before iterating this section's fields
      // until the human has clicked Next on a previous gov-form
      // step (e.g. Aruba's Review accordion). We poll the first
      // bot-fillable field's selector for visibility and resume
      // once it shows up. Timeout is intentionally generous (10
      // min) — the admin might step away to answer a question
      // before clicking Next.
      if (section.botWaitForHuman) {
        // Pick the first non-skip, non-hidden-without-whitelist
        // field as the "section is live" signal. For payment that's
        // the credit card number input.
        const probeField = section.fields.find(f => {
          const a = f.botAction || defaultActionFor(f);
          if (a === 'skip') return false;
          return true;
        });
        if (probeField) {
          const probeSelector = selectorsFor(probeField);
          console.log(`  ⏸  Waiting for you to advance the form to "${section.title}"…`);
          console.log(`     (Click Next on the Review accordion when you're ready. Bot resumes once "${probeField.label}" becomes visible.)`);
          const start = Date.now();
          const HUMAN_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
          let visible = false;
          while (Date.now() - start < HUMAN_WAIT_TIMEOUT_MS) {
            try {
              const count = await page.locator(probeSelector).locator('visible=true').first().count().catch(() => 0);
              if (count > 0) { visible = true; break; }
            } catch {}
            await delay(750);
          }
          if (!visible) {
            console.warn(`  ⚠️  Timed out waiting for "${probeField.label}" after ${HUMAN_WAIT_TIMEOUT_MS / 60_000} min — proceeding anyway; fields may fail.`);
          } else {
            console.log(`  ▶️  Detected "${probeField.label}" — resuming.`);
          }
        }
      }

      for (const field of section.fields) {
        // `hidden` normally means "don't render for customer AND don't
        // automate" — but a few fields live in the schema with
        // hidden:true precisely so the bot can fill them on the gov
        // form without re-asking the customer. Whitelist those here
        // so the loop still processes them.
        //   - `purposeOfVisit` (Aruba): collected on /apply (stored as
        //     order.purposeOfVisit), filled by bot on Step 3.
        //   - `streetNumber` / `addressSuffix` (Aruba): customer types
        //     a single-line address ("123 Main St Apt 4B"); the bot
        //     parses out the number / suffix and fills Aruba's
        //     separate gov-form inputs.
        //   - `email` / `emailConfirmation` (Aruba Contact step): already
        //     captured on /apply as `order.billingEmail`; the bot copies
        //     it into both gov-form inputs without re-asking the
        //     customer.
        //   - `creditCardNumber` / `expirationMonth` / `expirationYear` /
        //     `securityCode` (Aruba Payment step): source from the
        //     encrypted card vault. All four fields are bot-only and
        //     never rendered for the customer.
        const BOT_FILL_HIDDEN_KEYS = new Set([
          'purposeOfVisit',
          'streetNumber', 'addressSuffix',
          'email', 'emailConfirmation',
          'creditCardNumber', 'expirationMonth', 'expirationYear', 'securityCode',
        ]);
        if (field.hidden && !BOT_FILL_HIDDEN_KEYS.has(field.key)) continue;

        // Resolve value. Default is `traveler[field.key]`. Admins can
        // override per-field via the bot-mapping settings:
        //   - `{ type: 'schema', fieldKey: 'X' }` → pull from
        //     traveler[X] instead of traveler[field.key]
        //   - `{ type: 'hardcoded', value: 'X' }` → use the literal X
        //   - `{ type: 'skip' }` → don't fill at all
        //   - `{ type: 'manual' }` → leave for the human (CAPTCHA etc.)
        // The mapping overrides are keyed by `<sectionKey>.<fieldKey>`
        // to disambiguate same-named fields across sections.
        const overrideKey = `${section.key}.${field.key}`;
        const override = overrides[overrideKey];
        let value: unknown = (traveler as any)[field.key];

        // Source-of-truth lookups for fields that don't live on the
        // traveler record. purposeOfVisit is stored at the order
        // level (picked on /apply, same as visaType) — so traveler
        // never has it. Pull from `order.purposeOfVisit` instead.
        if (field.key === 'purposeOfVisit' && (value == null || value === '')) {
          value = (order as any).purposeOfVisit;
        }

        // Contact step: email + emailConfirmation come from the
        // order's billing email. We prefer the traveler's own
        // value if present (multi-traveler edge case — secondary
        // travelers might have their own email), and only fall
        // back to billingEmail when the traveler doesn't have one.
        if ((field.key === 'email' || field.key === 'emailConfirmation') && (value == null || value === '')) {
          value = (order as any).billingEmail;
        }

        // Payment step: source from the encrypted bot card. We
        // always override traveler-side values for these — payment
        // fields are bot-only and never appear in traveler JSON.
        // expirationMonth is stored as "01"–"12" but Aruba's gov
        // dropdown shows month NAMES, so we translate here so the
        // bot's selectByText finds the option directly.
        if (field.key === 'creditCardNumber' && paymentCard) {
          value = paymentCard.cardNumber;
        }
        if (field.key === 'expirationMonth' && paymentCard) {
          const idx = parseInt(paymentCard.expirationMonth, 10);
          value = (idx >= 1 && idx <= 12) ? MONTH_NAMES[idx] : paymentCard.expirationMonth;
        }
        if (field.key === 'expirationYear' && paymentCard) {
          value = paymentCard.expirationYear;
        }
        if (field.key === 'securityCode' && paymentCard) {
          value = paymentCard.cvv;
        }
        // No card stored → leave value empty; applyField will fail
        // with "No value on traveler" and the run log will surface
        // the missing-card warning we printed at startup.

        // Address-split derivation. The customer-facing form now
        // collects ONE combined address line; Aruba's gov form needs
        // it split into three. parseStreetAddress turns
        //   "123 Main St Apt 4B"
        // into { number: "123", street: "Main St", suffix: "4B" }.
        //
        // For each field we prefer the traveler's own value if it's
        // there (backward compat — early Aruba orders stored these
        // as separate inputs), and only fall back to the parsed
        // version when blank.
        //
        // For `address` itself we always re-parse and use the street
        // portion so we don't end up typing "123 Main St Apt 4B"
        // into Aruba's plain "street name" input (the number /
        // suffix go in their own inputs). Old orders that already
        // had the number split out still have `traveler.address`
        // set to the bare street; parseStreetAddress leaves a
        // number-less input alone.
        if (field.key === 'streetNumber' && (value == null || value === '')) {
          const parsed = parseStreetAddress(String((traveler as any).address || ''));
          value = parsed.number;
        }
        if (field.key === 'addressSuffix' && (value == null || value === '')) {
          const parsed = parseStreetAddress(String((traveler as any).address || ''));
          value = parsed.suffix;
        }
        if (field.key === 'address') {
          const parsed = parseStreetAddress(String((traveler as any).address || ''));
          if (parsed.street) value = parsed.street;
        }
        let skipReason: string | null = null;
        if (override) {
          if (override.type === 'schema') value = (traveler as any)[override.fieldKey];
          else if (override.type === 'hardcoded') value = override.value;
          else if (override.type === 'skip') skipReason = 'Admin marked this field as skip';
          else if (override.type === 'manual') skipReason = 'Admin marked this field as manual';
        }

        // Adaptive value for departureAirline. Aruba's form is
        // bipolar here:
        //   Mode A — the dropdown lists real commercial airlines (same
        //            as arrival). Pick the customer's actual airline,
        //            then the next field is a Flight Number dropdown.
        //   Mode B — the dropdown lists flight TYPES (Ambulance, Cargo,
        //            Other, Private, etc.). Pick "Other", then the
        //            next field is a free-text Operator Name input
        //            (id="customDepartureFlightNumber").
        //
        // We sniff the dropdown's options at runtime: if the customer's
        // airline text is in there → Mode A. Otherwise → Mode B and we
        // fall back to "Other". This lets the bot handle whichever
        // mode Aruba happens to render today, no manual intervention.
        if (field.key === 'departureAirline') {
          const customerAirline = String((traveler as any).departureAirline || '').trim();
          let pick: string = 'Others'; // safe Mode-B default — matches Aruba's plural label
          if (customerAirline) {
            try {
              const sel = page.locator(selectorsFor(field)).locator('visible=true').first();
              const opts = await sel.evaluate((el: any) => {
                if (!el || el.tagName !== 'SELECT') return [] as string[];
                return Array.from(el.options).map((o: any) => (o.textContent || '').trim());
              }).catch(() => [] as string[]);
              const wanted = customerAirline.toLowerCase();
              const hasReal = opts.some((o: string) =>
                o && (o.toLowerCase().includes(wanted) || wanted.includes(o.toLowerCase().split(/\s+/)[0])),
              );
              if (hasReal) {
                pick = customerAirline;
                console.log(`     ↻  Departure airline dropdown looks like a real-airline list — using "${customerAirline}" instead of "Other".`);
              }
            } catch {}
          }
          value = pick;
        }

        // Fall back: if the customer didn't fill `departureOperatorName`
        // (the field was added later — legacy orders won't have it),
        // use their `departureAirline` value. That's where the real
        // airline name lives on our side; since we override the bot's
        // departureAirline to "Other", that customer-entered name is
        // free to use as the actual operator on the gov form.
        if (field.key === 'departureOperatorName' && (value == null || value === '')) {
          value = (traveler as any).departureAirline;
        }
        if (skipReason) {
          skipped++;
          console.log(`  ⏭️  ${field.label} — ${skipReason}`);
          await logger.log({
            stepKey: section.key,
            fieldKey: field.key,
            label: field.label,
            action: override?.type === 'manual' ? 'manual' : 'skip',
            source: 'admin',
            value: null,
            success: false,
            errorMsg: skipReason,
          });
          continue;
        }

        const action = field.botAction || defaultActionFor(field);
        // Resolve selector — admin override if present, otherwise a
        // heuristic guess based on the field key. Falls through to
        // applyField which records what was actually tried.
        const selector = selectorsFor(field);

        // Look-ahead: is the field actually visible on the current
        // accordion step? The ED Card form is paginated — fields for
        // later steps exist in the DOM (collapsed) but aren't
        // interactable. If the field isn't visible, click Next until
        // either (a) it becomes visible, (b) Next button disappears,
        // or (c) we've clicked Next too many times.
        //
        // File inputs check existence not visibility — they're often
        // `hidden` by design (the form shows a styled button that
        // triggers the input behind the scenes), so isVisible would
        // never return true. setInputFiles works fine on hidden
        // inputs, so we just need the element to be in the DOM.
        //
        // Skip the look-ahead for action='skip' — those fields are
        // already "done" by definition; no point advancing for them.
        if (action !== 'skip') {
          // Detect "is this field on the current gov-form page?"
          //
          // Two strategies, in order of confidence:
          //   1. Heuristic / explicit-pinned selector matches a
          //      visible element.
          //   2. The FULL schema label matches exactly one visible
          //      element via getByLabel. Restricted to the full
          //      label (no single-word derivatives) and a UNIQUE
          //      visible match — generic single-word variants like
          //      "Aruba" or "Date" would otherwise false-match
          //      dozens of unrelated labels on the page, causing
          //      the look-ahead to mistakenly think we're already
          //      on the right page and never click Next. The full
          //      label is specific by design; uniqueness rules out
          //      cases where Aruba has the same label on multiple
          //      accordion sections that happen to all be visible.
          //
          // applyField's getByLabel fallback (which DOES try
          // derived variants) handles the trickier filling step
          // once we're confirmed on the right page.
          const baseLabel = (field.label || '').trim();

          const isFieldPresent = async (): Promise<boolean> => {
            // 1. Heuristic / explicit-pinned selector.
            const bySelector = action === 'upload'
              ? await page.locator(selector).first().count().then(c => c > 0).catch(() => false)
              : await page.locator(selector).locator('visible=true').first().count().then(c => c > 0).catch(() => false);
            if (bySelector) return true;
            // 2. Full label only, with UNIQUE visible match.
            //    Skip for single-word labels (too generic on
            //    multi-section forms).
            if (baseLabel && baseLabel.split(/\s+/).length >= 2) {
              try {
                const count = await page.getByLabel(baseLabel, { exact: false })
                  .locator('visible=true')
                  .count()
                  .catch(() => 0);
                if (count === 1) return true;
              } catch {}
            }
            return false;
          };

          let advanced = 0;
          const MAX_ADVANCE_PER_FIELD = 6;
          while (advanced < MAX_ADVANCE_PER_FIELD) {
            if (await isFieldPresent()) break;
            const didNext = await tryClickNext();
            if (!didNext) break;
            advanced++;
            console.log(`  ➡️  Clicked Next (looking for ${field.label})`);
          }
        }

        const result = await applyField({ page, field, selector, action, value });

        if (result.success) {
          filled++;
          console.log(`  ✅ ${field.label}: ${result.resolvedValue ?? '(applied)'}`);

          // OCR-failure detection. Aruba's passport endpoint either
          // populates the readonly identity fields (success) or
          // shows "Passport upload unsuccessful" + opens up
          // editable inputs. The 3-second wait inside the upload
          // action covers the local API request; we poll here for
          // a TERMINAL state (either success or failure signal).
          // The previous "poll for failure only" approach was
          // unreliable because the OCR endpoint occasionally takes
          // 10+ seconds, and a fixed wait would always either be
          // too short for slow runs or too long for fast ones.
          // 20-second cap covers the slowest runs we've seen; if
          // neither signal shows up we treat it as success (the
          // bot's next field-fill will surface any real problem).
          if (field.key === 'passportFile') {
            const probeStart = Date.now();
            const PROBE_MAX_MS = 20_000;
            let outcome: 'failed' | 'success' | 'pending' = 'pending';
            while (Date.now() - probeStart < PROBE_MAX_MS) {
              outcome = await detectOcrState(page);
              if (outcome !== 'pending') break;
              await delay(700);
            }
            const elapsedSec = ((Date.now() - probeStart) / 1000).toFixed(1);
            if (outcome === 'failed') {
              ocrFailedForTraveler[0] = true;
              console.log(`  ⚠️  Aruba reported "Passport upload unsuccessful" after ${elapsedSec}s — filling identity fields manually.`);
              // Settle delay: detecting the banner is one tick
              // ahead of Aruba's "manual mode" finishing its
              // input wiring. Without this pause every fill
              // call timed out waiting for the inputs to become
              // visible — Angular swaps the readonly display for
              // editable inputs in a separate change-detection
              // pass right after rendering the banner.
              await delay(1_500);
              await fillOcrFallbackIdentityFields({ page, traveler, travelerIndex: 0 });
            } else if (outcome === 'success') {
              console.log(`  ✓  OCR success after ${elapsedSec}s — readonly identity fields auto-populated.`);
            } else {
              console.log(`  ?  OCR state unresolved after ${elapsedSec}s — proceeding as if success; later field fills will surface any real problem.`);
            }
          }

          // Step-2-done signal. After Country of Birth fills, every
          // form-required input on the Passport Details step is set
          // (the rest were auto-populated by the passport OCR). The
          // look-ahead for the next field (countryOfDeparture, on
          // Step 3) sometimes mis-detects visibility because Angular's
          // ngb-accordion collapses with computed styles Playwright
          // can't tell from a real visible element. So we click Next
          // explicitly here — known good signal, no ambiguity.
          //
          // Brief wait first: Angular forms run validation async after
          // a programmatic value change. The Next button stays
          // disabled until validation passes, so clicking too fast
          // results in a no-op. 1.5s is enough for ngForm's
          // statusChanges to fire.
          if (field.key === 'countryOfBirth') {
            // Late OCR-state check. If Aruba's OCR endpoint took
            // longer than our initial 20s probe window
            // (`?  OCR state unresolved …`), the failure banner
            // may have arrived AFTER we moved on. We re-check
            // here — right before clicking Next — and run the
            // inline identity fill if the banner showed up. This
            // is the last chance: Aruba's Next button is disabled
            // until the identity fields are populated, so
            // skipping this check leaves the bot stuck on Step 2
            // for the rest of the run.
            if (!ocrFailedForTraveler[0]) {
              const lateState = await detectOcrState(page);
              if (lateState === 'failed') {
                ocrFailedForTraveler[0] = true;
                console.log(`  ⚠️  Late OCR-failure detection — banner appeared after initial probe window. Filling identity fields now.`);
                await fillOcrFallbackIdentityFields({ page, traveler, travelerIndex: 0 });
              }
            }

            // Multi-traveler: for each additional traveler in the
            // order, click "Add Family Member" + upload their
            // passport + fill country of birth. Aruba renders all
            // travelers as siblings inside the Passport Details
            // accordion, so we do this BEFORE advancing past Step 2.
            if (travelers.length > 1) {
              for (let i = 1; i < travelers.length; i++) {
                const extra = travelers[i];
                if (!extra) continue;
                const res = await addTraveler({ page, index: i, traveler: extra });
                for (const errMsg of res.errors) {
                  await logger.log({
                    stepKey: 'trip',
                    fieldKey: `traveler-${i + 1}`,
                    label: `Add traveler #${i + 1} (${extra.firstName ?? '?'} ${extra.lastName ?? '?'})`,
                    action: 'click',
                    source: 'default',
                    value: null,
                    success: false,
                    errorMsg: errMsg,
                  });
                }
                if (res.ok) {
                  filled++;
                  await logger.log({
                    stepKey: 'trip',
                    fieldKey: `traveler-${i + 1}`,
                    label: `Add traveler #${i + 1} (${extra.firstName ?? '?'} ${extra.lastName ?? '?'})`,
                    action: 'click',
                    source: 'default',
                    value: null,
                    success: true,
                  });
                } else {
                  failed++;
                }
              }
            }

            await delay(1_500);
            const advanced = await tryClickNext();
            if (advanced) {
              console.log('  ➡️  Clicked Next (Step 2 → Step 3 after Country of Birth)');
            } else {
              console.log('  ⚠️  Tried to click Next after Country of Birth, but no visible Next button matched. Form may need manual advance.');
            }
          }
        } else {
          failed++;
          console.log(`  ⚠️  ${field.label}: ${result.errorMsg}`);
          // Save the page state to disk on every failure (not just
          // select-cascade failures). Selector-not-found from `fill`
          // / `upload` actions previously went undumped because the
          // dump call only lived inside the select case. Without
          // the HTML it's impossible to see what's actually on the
          // page when a heuristic misses.
          try {
            const fs = await import('fs/promises');
            const pathMod = await import('path');
            const dir = pathMod.resolve(__dirname, '..', '.bot-debug');
            await fs.mkdir(dir, { recursive: true });
            const outPath = pathMod.join(dir, `aruba-${field.key}-${Date.now()}.html`);
            await fs.writeFile(outPath, await page.content());
            console.log(`     📄 Saved page HTML for inspection: ${outPath}`);
          } catch {}
        }

        await logger.log({
          stepKey: section.key,
          fieldKey: field.key,
          label: field.label,
          action,
          source: override ? 'admin' : 'default',
          value: value == null ? null : String(value),
          success: result.success,
          errorMsg: result.errorMsg,
          selector,
        });
      }

      // After the section's fields are filled, advance to the next
      // page in the form. Mostly redundant with the per-field "click
      // Next when a selector misses" logic above (fields beyond this
      // section will pull the form forward automatically), but kept
      // as a safety net for the case where every field in a section
      // succeeded — the form might already be on the next site step
      // anyway, in which case tryClickNext is a no-op.
      //
      // Skip when:
      //   - LAST section (payment): the very next button after
      //     payment fields is "Submit" / "Pay", which would commit
      //     the order. The human verifies the typed card details
      //     and clicks Submit themselves.
      //   - section.botSkipNext: explicit "this section shares a
      //     gov-form page with the next section" hint. Set on Aruba's
      //     `personal` section so the bot continues into `address`
      //     fields on the same panel instead of clicking Next early.
      if (!isLastSection && !section.botSkipNext) {
        const advanced = await tryClickNext();
        await logger.log({
          stepKey: section.key,
          fieldKey: '__next',
          label: `Advance from ${section.title}`,
          action: 'click',
          source: 'default',
          success: advanced,
          errorMsg: advanced ? undefined : 'Next button not found / form did not advance',
          selector: ARUBA_NEXT_SELECTOR,
        });
        if (advanced) console.log('  ➡️  Clicked Next');
      } else if (section.botSkipNext) {
        console.log('  ⏸  Skipping Next click (section shares gov-form page with next section)');
      }
    }

    console.log(
      `\n✅ Schema walk complete — ${filled} filled, ${skipped} skipped (no selector), ${failed} failed.\n` +
      `Browser is left open. Verify the form, then submit manually.`,
    );

    // ── 7. Pause for human verification ────────────────────────────
    // Final submit is intentionally manual. Block here until the
    // admin closes the browser or kills the bot.
    await new Promise<void>(resolve => {
      browser.on('disconnected', () => resolve());
    });
    await logger.finish();
  } catch (err: any) {
    console.error('Bot failed:', err?.message || err);
    await logger.finish({ error: err?.message || 'unknown' });
    try { await browser.close(); } catch {}
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch(async err => {
  console.error('Fatal:', err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
