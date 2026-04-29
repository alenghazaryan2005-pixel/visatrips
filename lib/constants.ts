export const formatOrderNum = (n: number) => {
  if (n <= 99999) return String(n).padStart(5, '0');
  return `${String(Math.floor(n / 100000)).padStart(5, '0')}-${String(n % 100000).padStart(5, '0')}`;
};

export const parseOrderNumber = (formatted: string): number => {
  if (formatted.includes('-')) {
    const [hi, lo] = formatted.split('-');
    return parseInt(hi, 10) * 100000 + parseInt(lo, 10);
  }
  return parseInt(formatted, 10);
};

/**
 * India eVisa religion dropdown — single source of truth.
 *
 * The values here are the EXACT labels the India gov site uses in its religion
 * <select>. Customer-facing UI shows the `label`, the stored value on traveler
 * data is the `value`, and the bot writes the `value` directly into the gov
 * select. This means the bot never has to guess at mappings.
 *
 * If the gov site adds/removes a religion, edit this list — the customer
 * dropdown, admin edit field, and bot all pick up the change automatically.
 */
export const INDIA_RELIGIONS: Array<{ value: string; label: string }> = [
  // `value` is the EXACT label used by the India eVisa gov site's <option text="...">.
  // `label` is what we show to the customer in the apply/finish + admin dropdowns.
  // Verified against the live form 2026-04 — see Bot Run History option dump.
  { value: 'BAHAI',       label: "Baha'i" },
  { value: 'BUDDHISM',    label: 'Buddhism' },
  { value: 'CHRISTIAN',   label: 'Christianity' },
  { value: 'HINDU',       label: 'Hinduism' },
  { value: 'ISLAM',       label: 'Islam' },
  { value: 'JAINISM',     label: 'Jainism' },
  { value: 'JUDAISM',     label: 'Judaism' },
  { value: 'PARSI',       label: 'Parsi' },
  { value: 'SIKH',        label: 'Sikhism' },
  { value: 'ZOROASTRIAN', label: 'Zoroastrian' },
  { value: 'OTHERS',      label: 'Other' },
];

/** Quick lookup: customer-displayed label → gov-site value. */
export const RELIGION_LABEL_TO_VALUE: Record<string, string> = Object.fromEntries(
  INDIA_RELIGIONS.map(r => [r.label, r.value]),
);

/**
 * Backward-compatible normaliser. Existing orders may have stored the *label*
 * (e.g. "Christianity") rather than the gov value (`CHRISTIANS`); legacy
 * orders may even have free-text variants like "Christian" or "Hindu".
 * Returns the gov-site value if recognisable, otherwise returns the input
 * uppercased so the bot's existing fuzzy matcher still gets a fair shot.
 */
export function normaliseReligion(input: string | null | undefined): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';
  // Already a valid gov-site value
  if (INDIA_RELIGIONS.some(r => r.value === trimmed.toUpperCase())) return trimmed.toUpperCase();
  // Customer-facing label
  const byLabel = RELIGION_LABEL_TO_VALUE[trimmed];
  if (byLabel) return byLabel;
  // Common synonyms / freeform inputs that pre-date the dropdown.
  //
  // Includes the OLD WRONG canonical values (CHRISTIANS, HINDUISM, PARSIS,
  // SIKHISM) too — we shipped a previous version with those before we
  // confirmed the gov site's actual labels, so any orders stored under the
  // old canonical need to map forward to the new one.
  const synonyms: Record<string, string> = {
    // Legacy (old wrong canonical) → new canonical
    'CHRISTIANS':     'CHRISTIAN',
    'HINDUISM':       'HINDU',
    'PARSIS':         'PARSI',
    'SIKHISM':        'SIKH',
    // Christian variants
    'CATHOLIC':       'CHRISTIAN',
    'PROTESTANT':     'CHRISTIAN',
    'CHRISTIANITY':   'CHRISTIAN',
    // Other faith synonyms
    'MUSLIM':         'ISLAM',
    'ISLAMIC':        'ISLAM',
    'BUDDHIST':       'BUDDHISM',
    'JAIN':           'JAINISM',
    'JEWISH':         'JUDAISM',
    'ZOROASTRIANISM': 'ZOROASTRIAN',
    'BAHAI':          'BAHAI',
    "BAHA'I":         'BAHAI',
    'BAHÁʼÍ':         'BAHAI',
    // Non-religious
    'NO RELIGION':    'OTHERS',
    'NONE':           'OTHERS',
    'ATHEIST':        'OTHERS',
    'AGNOSTIC':       'OTHERS',
    'OTHER':          'OTHERS',
  };
  return synonyms[trimmed.toUpperCase()] ?? trimmed.toUpperCase();
}

export const VISA_LABELS: Record<string, string> = {
  TOURIST_30:  'Tourist – 30 days',
  TOURIST_1Y:  'Tourist – 1 year',
  TOURIST_5Y:  'Tourist – 5 years',
  BUSINESS_1Y: 'Business – 1 year',
  MEDICAL_60:  'Medical – 60 days',
  'tourist-30':  'Tourist – 30 days',
  'tourist-1y':  'Tourist – 1 year',
  'tourist-5y':  'Tourist – 5 years',
  'business-1y': 'Business – 1 year',
  'medical-60':  'Medical – 60 days',
};

export const STATUS_COLORS: Record<string, string> = {
  // New statuses
  UNFINISHED:       'status-pending',      // customer hasn't completed finish page
  PROCESSING:       'status-review',       // we review before submitting
  SUBMITTED:        'status-submitted',    // submitted to gov, got app ID
  COMPLETED:        'status-approved',     // visa delivered or auto-closed
  NEEDS_CORRECTION: 'status-correction',
  ON_HOLD:          'status-onhold',
  REJECTED:         'status-rejected',
  REFUNDED:         'status-refunded',
  // Legacy (fallback so old orders still render if any remain)
  PENDING:          'status-pending',
  UNDER_REVIEW:     'status-review',
  APPROVED:         'status-approved',
};

export const STATUS_LABELS: Record<string, string> = {
  UNFINISHED:       'Unfinished',
  PROCESSING:       'Processing',
  SUBMITTED:        'Submitted',
  COMPLETED:        'Completed',
  NEEDS_CORRECTION: 'Needs Correction',
  ON_HOLD:          'On Hold',
  REJECTED:         'Rejected',
  REFUNDED:         'Refunded',
  PENDING:          'Unfinished',
  UNDER_REVIEW:     'Processing',
  APPROVED:         'Completed',
};

// Statuses visible in admin filter tabs (order matters)
export const STATUS_FILTER_ORDER = [
  'ALL',
  'UNFINISHED',
  'PROCESSING',
  'NEEDS_CORRECTION',
  'SUBMITTED',
  'COMPLETED',
  'ON_HOLD',
  'REJECTED',
  'REFUNDED',
] as const;

export const VISA_COLORS: Record<string, string> = {
  TOURIST_30:    'visa-tourist',
  TOURIST_1Y:    'visa-tourist',
  TOURIST_5Y:    'visa-tourist',
  'tourist-30':  'visa-tourist',
  'tourist-1y':  'visa-tourist',
  'tourist-5y':  'visa-tourist',
  BUSINESS_1Y:   'visa-business',
  'business-1y': 'visa-business',
  MEDICAL_60:    'visa-medical',
  'medical-60':  'visa-medical',
};

export const COUNTRY_FLAGS: Record<string, string> = {
  'India':          '🇮🇳',
  'Brazil':         '🇧🇷',
  'United States':  '🇺🇸',
  'United Kingdom': '🇬🇧',
  'Canada':         '🇨🇦',
  'Australia':      '🇦🇺',
  'Germany':        '🇩🇪',
  'France':         '🇫🇷',
  'Japan':          '🇯🇵',
  'China':          '🇨🇳',
  'Republic of Korea': '🇰🇷',
  'Thailand':       '🇹🇭',
  'UAE':            '🇦🇪',
  'Saudi Arabia':   '🇸🇦',
  'Turkey':         '🇹🇷',
  'Mexico':         '🇲🇽',
  'Singapore':      '🇸🇬',
  'Indonesia':      '🇮🇩',
  'Malaysia':       '🇲🇾',
  'Vietnam':        '🇻🇳',
};
