import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SURCHARGES,
  DEFAULT_TX_PCT,
  SPEED_LABELS,
  SPEED_ORDER,
  computeUpgradeDiff,
  extractPricingFromSettings,
  isUpgrade,
} from '@/lib/processingSpeeds';

describe('SPEED_ORDER + SPEED_LABELS', () => {
  it('lists exactly 3 speeds in slowest-to-fastest order', () => {
    expect(SPEED_ORDER).toEqual(['standard', 'rush', 'super']);
  });
  it('has a label for every speed', () => {
    for (const s of SPEED_ORDER) expect(SPEED_LABELS[s]).toBeTruthy();
  });
});

describe('isUpgrade', () => {
  it('detects upward moves', () => {
    expect(isUpgrade('standard', 'rush')).toBe(true);
    expect(isUpgrade('standard', 'super')).toBe(true);
    expect(isUpgrade('rush', 'super')).toBe(true);
  });
  it('rejects same-speed', () => {
    for (const s of SPEED_ORDER) expect(isUpgrade(s, s)).toBe(false);
  });
  it('rejects downgrades', () => {
    expect(isUpgrade('rush', 'standard')).toBe(false);
    expect(isUpgrade('super', 'rush')).toBe(false);
    expect(isUpgrade('super', 'standard')).toBe(false);
  });
});

describe('computeUpgradeDiff', () => {
  const surcharges = { standard: 0, rush: 20, super: 60 };

  it('matches the apply-checkout per-traveler math (standard → rush, 1 traveler, 8% tx)', () => {
    const r = computeUpgradeDiff({ current: 'standard', target: 'rush', surcharges, travelers: 1, txPct: 8 });
    expect(r.perTravelerDiff).toBe(20);
    expect(r.subtotalDiff).toBe(20);
    expect(r.txDiff).toBeCloseTo(1.6, 2);
    expect(r.total).toBeCloseTo(21.6, 2);
  });

  it('multiplies per-traveler diff by traveler count', () => {
    const r = computeUpgradeDiff({ current: 'standard', target: 'super', surcharges, travelers: 3, txPct: 8 });
    expect(r.perTravelerDiff).toBe(60);
    expect(r.subtotalDiff).toBe(180);
    expect(r.txDiff).toBeCloseTo(14.4, 2);
    expect(r.total).toBeCloseTo(194.4, 2);
  });

  it('returns zeros on a non-upgrade direction (no negative diffs)', () => {
    const r = computeUpgradeDiff({ current: 'super', target: 'standard', surcharges, travelers: 5, txPct: 8 });
    expect(r).toEqual({ perTravelerDiff: 0, subtotalDiff: 0, txDiff: 0, total: 0 });
  });

  it('uses defaults when a surcharge is missing from input', () => {
    const r = computeUpgradeDiff({
      current: 'standard',
      target: 'super',
      surcharges: { /* nothing */ },
      travelers: 1,
      txPct: 8,
    });
    expect(r.perTravelerDiff).toBe(DEFAULT_SURCHARGES.super - DEFAULT_SURCHARGES.standard);
  });

  it('uses DEFAULT_TX_PCT when txPct is omitted', () => {
    const r = computeUpgradeDiff({ current: 'standard', target: 'rush', surcharges, travelers: 1 });
    const expected = +(20 * (DEFAULT_TX_PCT / 100)).toFixed(2);
    expect(r.txDiff).toBeCloseTo(expected, 2);
  });

  it('clamps traveler count to 1 when 0 or negative is passed', () => {
    const r = computeUpgradeDiff({ current: 'standard', target: 'rush', surcharges, travelers: 0, txPct: 8 });
    expect(r.subtotalDiff).toBe(20); // not 0
  });

  it('rush → super only charges the 40 delta, not the full super surcharge', () => {
    const r = computeUpgradeDiff({ current: 'rush', target: 'super', surcharges, travelers: 2, txPct: 0 });
    expect(r.perTravelerDiff).toBe(40);
    expect(r.subtotalDiff).toBe(80);
    expect(r.total).toBe(80);
  });
});

describe('extractPricingFromSettings', () => {
  it('reads pricing.processing.* keys + tx percent', () => {
    const out = extractPricingFromSettings({
      'pricing.processing.standard': 0,
      'pricing.processing.rush':     25,
      'pricing.processing.super':    75,
      'pricing.fees.transactionPercent': 9.5,
      'unrelated.key': 'ignored',
    });
    expect(out.surcharges.rush).toBe(25);
    expect(out.surcharges.super).toBe(75);
    expect(out.txPct).toBe(9.5);
  });

  it('falls back to defaults when keys are missing or wrong type', () => {
    const out = extractPricingFromSettings({
      'pricing.processing.rush': 'twenty', // wrong type
      // standard, super, txPct missing
    });
    expect(out.surcharges).toEqual(DEFAULT_SURCHARGES);
    expect(out.txPct).toBe(DEFAULT_TX_PCT);
  });

  it('rejects negative surcharges (treated as missing → falls to default)', () => {
    const out = extractPricingFromSettings({
      'pricing.processing.rush': -10,
    });
    expect(out.surcharges.rush).toBe(DEFAULT_SURCHARGES.rush);
  });
});
