import { describe, it, expect } from 'vitest';
import {
  formatOrderNum,
  parseOrderNumber,
  VISA_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_FILTER_ORDER,
  INDIA_RELIGIONS,
  RELIGION_LABEL_TO_VALUE,
  normaliseReligion,
} from '@/lib/constants';

describe('formatOrderNum', () => {
  it('pads 1–5 digit numbers to 5 digits', () => {
    expect(formatOrderNum(1)).toBe('00001');
    expect(formatOrderNum(42)).toBe('00042');
    expect(formatOrderNum(99999)).toBe('99999');
  });

  it('splits 6+ digit numbers across a dash', () => {
    expect(formatOrderNum(100000)).toBe('00001-00000');
    expect(formatOrderNum(100001)).toBe('00001-00001');
    expect(formatOrderNum(123456789)).toBe('01234-56789');
  });
});

describe('parseOrderNumber', () => {
  it('parses short form', () => {
    expect(parseOrderNumber('00001')).toBe(1);
    expect(parseOrderNumber('42')).toBe(42);
    expect(parseOrderNumber('99999')).toBe(99999);
  });

  it('parses dashed form', () => {
    expect(parseOrderNumber('00001-00000')).toBe(100000);
    expect(parseOrderNumber('01234-56789')).toBe(123456789);
  });

  it('is inverse of formatOrderNum on sample values', () => {
    for (const n of [1, 42, 99_999, 100_000, 123_456_789]) {
      expect(parseOrderNumber(formatOrderNum(n))).toBe(n);
    }
  });
});

describe('INDIA_RELIGIONS', () => {
  it('every entry has a label and an uppercase gov-site value', () => {
    for (const r of INDIA_RELIGIONS) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.value).toBe(r.value.toUpperCase());
    }
  });

  it('values are unique', () => {
    const values = INDIA_RELIGIONS.map(r => r.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('contains the 11 canonical India eVisa religions (verified against live form)', () => {
    const values = INDIA_RELIGIONS.map(r => r.value);
    for (const v of ['BAHAI', 'BUDDHISM', 'CHRISTIAN', 'HINDU', 'ISLAM', 'JAINISM', 'JUDAISM', 'PARSI', 'SIKH', 'ZOROASTRIAN', 'OTHERS']) {
      expect(values).toContain(v);
    }
    expect(values).toHaveLength(11);
  });

  it('RELIGION_LABEL_TO_VALUE matches every entry', () => {
    for (const r of INDIA_RELIGIONS) {
      expect(RELIGION_LABEL_TO_VALUE[r.label]).toBe(r.value);
    }
  });
});

describe('normaliseReligion', () => {
  it('returns "" for empty/null/undefined', () => {
    expect(normaliseReligion('')).toBe('');
    expect(normaliseReligion('   ')).toBe('');
    expect(normaliseReligion(null)).toBe('');
    expect(normaliseReligion(undefined)).toBe('');
  });

  it('passes through canonical gov-site values', () => {
    for (const r of INDIA_RELIGIONS) {
      expect(normaliseReligion(r.value)).toBe(r.value);
      expect(normaliseReligion(r.value.toLowerCase())).toBe(r.value); // case-insensitive
    }
  });

  it('maps customer-displayed labels to gov values', () => {
    // Customer dropdown labels stay friendly; bot needs the gov-site value.
    expect(normaliseReligion('Christianity')).toBe('CHRISTIAN');
    expect(normaliseReligion('Hinduism')).toBe('HINDU');
    expect(normaliseReligion('Sikhism')).toBe('SIKH');
    expect(normaliseReligion("Baha'i")).toBe('BAHAI');
    expect(normaliseReligion('Other')).toBe('OTHERS');
    expect(normaliseReligion('Jainism')).toBe('JAINISM');
    expect(normaliseReligion('Parsi')).toBe('PARSI');
    expect(normaliseReligion('Zoroastrian')).toBe('ZOROASTRIAN');
  });

  it('maps common synonyms typed by legacy customers', () => {
    // Christian denominations
    expect(normaliseReligion('Christian')).toBe('CHRISTIAN');     // canonical
    expect(normaliseReligion('Catholic')).toBe('CHRISTIAN');
    expect(normaliseReligion('Protestant')).toBe('CHRISTIAN');
    // Singular-form synonyms (now canonical themselves)
    expect(normaliseReligion('Hindu')).toBe('HINDU');
    expect(normaliseReligion('Sikh')).toBe('SIKH');
    expect(normaliseReligion('Parsi')).toBe('PARSI');
    // Faith synonyms
    expect(normaliseReligion('Muslim')).toBe('ISLAM');
    expect(normaliseReligion('Islamic')).toBe('ISLAM');
    expect(normaliseReligion('Buddhist')).toBe('BUDDHISM');
    expect(normaliseReligion('Jain')).toBe('JAINISM');
    expect(normaliseReligion('Jewish')).toBe('JUDAISM');
    expect(normaliseReligion('Zoroastrianism')).toBe('ZOROASTRIAN');
  });

  it('forward-migrates orders saved under the OLD wrong canonical', () => {
    // We shipped CHRISTIANS / HINDUISM / PARSIS / SIKHISM as canonical for a
    // few hours before the gov dump corrected us. Any orders stored under
    // those values need to keep working.
    expect(normaliseReligion('CHRISTIANS')).toBe('CHRISTIAN');
    expect(normaliseReligion('HINDUISM')).toBe('HINDU');
    expect(normaliseReligion('PARSIS')).toBe('PARSI');
    expect(normaliseReligion('SIKHISM')).toBe('SIKH');
  });

  it('maps non-religious values to OTHERS', () => {
    expect(normaliseReligion('No religion')).toBe('OTHERS');
    expect(normaliseReligion('none')).toBe('OTHERS');
    expect(normaliseReligion('atheist')).toBe('OTHERS');
    expect(normaliseReligion('Agnostic')).toBe('OTHERS');
  });

  it('returns uppercased input as a fallback for unknown values', () => {
    // Bot's fillSelect runs a fuzzy text match — by uppercasing we give it a
    // fair shot at finding the option even when we have no explicit mapping.
    expect(normaliseReligion('Pagan')).toBe('PAGAN');
    expect(normaliseReligion('Zen')).toBe('ZEN');
  });

  it('trims whitespace', () => {
    expect(normaliseReligion('  Christianity  ')).toBe('CHRISTIAN');
  });
});

describe('label/color maps', () => {
  it('VISA_LABELS covers every active visa code', () => {
    for (const k of ['TOURIST_30', 'TOURIST_1Y', 'TOURIST_5Y', 'BUSINESS_1Y', 'MEDICAL_60']) {
      expect(VISA_LABELS[k]).toBeTruthy();
    }
  });

  it('every status in STATUS_FILTER_ORDER (except ALL) has a color + label', () => {
    for (const s of STATUS_FILTER_ORDER) {
      if (s === 'ALL') continue;
      expect(STATUS_COLORS[s], `missing color for ${s}`).toBeTruthy();
      expect(STATUS_LABELS[s], `missing label for ${s}`).toBeTruthy();
    }
  });
});
