/**
 * Country configuration for the customer-facing apply flow.
 *
 * The /apply page (and the customer-facing finish page) used to be
 * entirely hardcoded for India. To support a second country (Aruba) we
 * extract every India-specific value into a per-country config object;
 * the apply page reads the URL's `?destination=` param, looks up the
 * config, and renders accordingly.
 *
 * Adding a new country:
 *   1. Add a new entry to COUNTRY_CONFIGS keyed by uppercase name.
 *   2. Decide its pricing-key prefix. India keeps the legacy un-prefixed
 *      keys (`pricing.visa.X`) so existing Setting rows survive — every
 *      other country gets `pricing.<CC>.visa.X` etc.
 *   3. Add a settings page at app/admin/settings/<slug>/page.tsx that
 *      writes the country-prefixed keys.
 *   4. Move the country from "coming-soon" to "live" in
 *      app/admin/settings/page.tsx.
 *
 * The flag, copy, and visa list live here because they're stable between
 * deploys. Pricing lives in the Settings table because admins tweak it
 * frequently (per-country pricing pages handle CRUD).
 */

export interface VisaProduct {
  /** URL/state slug — e.g. 'tourist-30', 'ed-card'. Lowercase, kebab-case. */
  id: string;
  /** Human-readable label shown in the apply Step-1 visa picker. */
  label: string;
  /** "Valid for" string in SummaryCard. Optional — single-product
   *  countries can omit. */
  validity?: string;
  /** "Number of entries" string. Optional. */
  entries?: string;
  /** "Max stay" string. Optional. */
  maxStay?: string;
  /** Hard-coded fallback price in USD. The live price comes from the
   *  Settings table; this fallback only shows if the API is unreachable. */
  price: number;
  /** Optional badge text shown on the visa card ("Most Popular" etc.). */
  tag?: string;
}

export interface CountryConfig {
  /** Two-letter code used in pricing key prefixes and admin URLs. */
  code: 'IN' | 'AW';
  /** Uppercase schema key — matches Setting key `application.schema.<KEY>`. */
  schemaKey: 'INDIA' | 'ARUBA';
  /** Display name (used as Order.destination DB value too). */
  destination: 'India' | 'Aruba';
  /** Admin-settings slug — `/admin/settings/<slug>`. */
  slug: 'india' | 'aruba';
  /** Flag emoji. */
  flag: string;
  /** Product family name shown in headers. */
  productLabel: string;
  /** Visa products for this country, in display order. */
  visaProducts: VisaProduct[];
  /** Visa product ids hidden from the apply page (admin / bot stay
   *  intact). India hides Business + Medical right now. */
  hiddenVisaIds: string[];
  /** Per-visa "purpose of visit" sub-options. Optional — keyed by visa id. */
  purposeOptions?: Record<string, string[]>;
  /** Settings-key prefix for pricing rows. India uses '' (legacy keys
   *  like `pricing.visa.TOURIST_30`); other countries get a country
   *  segment, e.g. 'AW.' (yielding `pricing.AW.visa.ED_CARD`). */
  pricingKeyPrefix: string;
  /** Visa id → uppercased Settings code, e.g. 'tourist-30' → 'TOURIST_30'. */
  visaIdToCode: Record<string, string>;
  /** Customer-facing copy bits that vary by country. */
  copy: {
    /** Step-1 page heading on apply. */
    applyHeader: string;
    /** Subtitle under the apply header. */
    applySubtitle: string;
    /** Hint below the email field on checkout. */
    emailHint: string;
    /** Optional passport-expiry warning shown when expiry is too close
     *  (India requires 6 months validity from arrival). */
    passportExpiryWarning?: string;
  };
}

/* ── INDIA ──────────────────────────────────────────────────────────────── */
const INDIA: CountryConfig = {
  code: 'IN',
  schemaKey: 'INDIA',
  destination: 'India',
  slug: 'india',
  flag: '🇮🇳',
  productLabel: 'India eVisa',
  visaProducts: [
    { id: 'tourist-30',  label: 'India Tourist eVisa – 30 days, Double entry',   validity: '30 days after arrival',  entries: 'Double entry',   maxStay: '30 days in total',   price: 25, tag: 'Most Popular' },
    { id: 'tourist-1y',  label: 'India Tourist eVisa – 1 year, Multiple entry',  validity: '1 year after arrival',   entries: 'Multiple entry', maxStay: '90 days per visit',  price: 40 },
    { id: 'tourist-5y',  label: 'India Tourist eVisa – 5 years, Multiple entry', validity: '5 years after arrival',  entries: 'Multiple entry', maxStay: '90 days per visit',  price: 80 },
    { id: 'business-1y', label: 'India Business eVisa – 1 year, Multiple entry', validity: '1 year after arrival',   entries: 'Multiple entry', maxStay: '180 days per visit', price: 80 },
    { id: 'medical-60',  label: 'India Medical eVisa – 60 days, Triple entry',   validity: '60 days after arrival',  entries: 'Triple entry',   maxStay: '60 days in total',   price: 25 },
  ],
  hiddenVisaIds: ['business-1y', 'medical-60'],
  purposeOptions: {
    'business-1y': [
      'Set Up Industrial/Business Venture',
      'Sale/Purchase/Trade',
      'Attend Technical/Business Meetings',
      'Recruit Manpower',
      'Participation in Exhibitions/Trade Fairs',
      'Expert/Specialist for Ongoing Project',
      'Conducting Tours',
      'Deliver Lectures (GIAN)',
      'Sports Related Activity',
      'Join Vessel',
    ],
  },
  pricingKeyPrefix: '', // legacy un-prefixed keys for back-compat
  visaIdToCode: {
    'tourist-30':  'TOURIST_30',
    'tourist-1y':  'TOURIST_1Y',
    'tourist-5y':  'TOURIST_5Y',
    'business-1y': 'BUSINESS_1Y',
    'medical-60':  'MEDICAL_60',
  },
  copy: {
    applyHeader: 'Apply now for your',
    applySubtitle: 'The India eVisa is mandatory for most foreign passport holders traveling to India.',
    emailHint: 'Your India eVisa will be sent to this email.',
    passportExpiryWarning: 'India will reject applications if your passport expires within 6 months of arrival.',
  },
};

/* ── ARUBA ──────────────────────────────────────────────────────────────── */
const ARUBA: CountryConfig = {
  code: 'AW',
  schemaKey: 'ARUBA',
  destination: 'Aruba',
  slug: 'aruba',
  flag: '🇦🇼',
  productLabel: 'Aruba ED Card',
  visaProducts: [
    {
      id: 'ed-card',
      label: 'Aruba ED Card',
      validity: 'Valid for the dates of your stay',
      entries: 'Single entry',
      maxStay: 'Up to 30 days',
      price: 0, // placeholder; real price set in /admin/settings/aruba
    },
  ],
  hiddenVisaIds: [],
  // Apply-page sub-purposes — kept here (instead of in the finish form)
  // so customers pick "why are you visiting" while choosing the product,
  // matching India's flow. Options come from the published Aruba ATA list.
  purposeOptions: {
    'ed-card': [
      'Vacation', 'Business', 'Incentive', 'Wedding', 'Honeymoon',
      'Board Cruiseship', 'Event', 'One Happy Workspace', 'Medical treatment',
    ],
  },
  pricingKeyPrefix: 'AW.',
  visaIdToCode: {
    'ed-card': 'ED_CARD',
  },
  copy: {
    applyHeader: 'Apply now for your',
    applySubtitle: 'The Aruba ED Card is required for all visitors entering Aruba by air or sea.',
    emailHint: 'Your Aruba ED Card confirmation will be sent to this email.',
    // Aruba has no specific passport-validity warning (most countries
    // require 6 months from arrival but it's not as strictly enforced).
  },
};

/* ── Registry ───────────────────────────────────────────────────────────── */

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  INDIA: INDIA,
  ARUBA: ARUBA,
  // Aliases by code so getCountryConfig accepts 'IN' / 'AW' / 'india' /
  // 'India' / 'INDIA' interchangeably.
  IN: INDIA,
  AW: ARUBA,
};

const SUPPORTED_DESTINATIONS = ['INDIA', 'ARUBA'] as const;

/** Look up a country config by any of: schema key, code, slug, or display
 *  name. Case-insensitive. Falls back to India for an unrecognized value
 *  so the apply page never crashes — invalid `?destination=` just gets
 *  the default product. */
export function getCountryConfig(input?: string | null): CountryConfig {
  if (!input) return INDIA;
  const upper = input.toUpperCase();
  if (upper in COUNTRY_CONFIGS) return COUNTRY_CONFIGS[upper];
  // Match by display name ('India', 'Aruba') if the input was the DB value.
  for (const c of [INDIA, ARUBA]) {
    if (c.destination.toUpperCase() === upper) return c;
    if (c.slug.toUpperCase() === upper) return c;
  }
  return INDIA;
}

/** Construct a Settings-table key with the country's pricing prefix.
 *  India: pricingKey('INDIA', 'visa.TOURIST_30') → 'pricing.visa.TOURIST_30'
 *  Aruba: pricingKey('ARUBA', 'visa.ED_CARD')    → 'pricing.AW.visa.ED_CARD'
 */
export function pricingKey(country: CountryConfig | string, suffix: string): string {
  const cfg = typeof country === 'string' ? getCountryConfig(country) : country;
  return `pricing.${cfg.pricingKeyPrefix}${suffix}`;
}

/** True if the destination string maps to a country we currently sell. */
export function isSupportedDestination(input?: string | null): boolean {
  if (!input) return false;
  const cfg = getCountryConfig(input);
  return (SUPPORTED_DESTINATIONS as readonly string[]).includes(cfg.schemaKey);
}
