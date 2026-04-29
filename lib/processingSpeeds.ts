/**
 * Processing-speed catalog. Used by:
 *   - apply/checkout to pick the initial speed
 *   - status page to show the upgrade card
 *   - admin orders list to render speed chips
 *   - /api/orders/[id]/upgrade-speed to validate and price upgrades
 *
 * `order` enforces the upgrade direction: standard → rush → super. Lower
 * index = slower. We never allow downgrades — once a customer has paid for
 * faster processing, they can't get the difference back via this endpoint
 * (admin can issue a refund if needed).
 */

export type ProcessingSpeed = 'standard' | 'rush' | 'super';

export const SPEED_ORDER: ProcessingSpeed[] = ['standard', 'rush', 'super'];

export const SPEED_LABELS: Record<ProcessingSpeed, string> = {
  standard: 'Standard',
  rush:     'Rush',
  super:    'Super Rush',
};

/** Default surcharges if no admin overrides exist in settings. */
export const DEFAULT_SURCHARGES: Record<ProcessingSpeed, number> = {
  standard: 0,
  rush:     20,
  super:    60,
};

/** Default tax/transaction-fee percent if not set in settings. */
export const DEFAULT_TX_PCT = 8;

/** Returns true if `target` is faster than `current` (an upgrade). */
export function isUpgrade(current: ProcessingSpeed, target: ProcessingSpeed): boolean {
  return SPEED_ORDER.indexOf(target) > SPEED_ORDER.indexOf(current);
}

/**
 * Compute the price difference for upgrading from `current` to `target`.
 * Mirrors the apply-checkout breakdown so the customer pays the same per-
 * traveler surcharge bump they'd have paid at checkout if they had picked
 * the faster speed up front.
 *
 *   subtotal_diff = (target.surcharge - current.surcharge) × travelers
 *   tx_diff       = subtotal_diff × (txPct / 100)
 *   total_diff    = subtotal_diff + tx_diff
 *
 * Returns 0 if `target` isn't faster than `current` (no negative diffs).
 */
export function computeUpgradeDiff(opts: {
  current:    ProcessingSpeed;
  target:     ProcessingSpeed;
  surcharges: Partial<Record<ProcessingSpeed, number>>;
  travelers:  number;
  txPct?:     number;
}): { perTravelerDiff: number; subtotalDiff: number; txDiff: number; total: number } {
  if (!isUpgrade(opts.current, opts.target)) {
    return { perTravelerDiff: 0, subtotalDiff: 0, txDiff: 0, total: 0 };
  }
  const fromS = opts.surcharges[opts.current] ?? DEFAULT_SURCHARGES[opts.current];
  const toS   = opts.surcharges[opts.target]  ?? DEFAULT_SURCHARGES[opts.target];
  const perTravelerDiff = toS - fromS;
  const subtotalDiff    = perTravelerDiff * Math.max(1, opts.travelers);
  const txPct           = opts.txPct ?? DEFAULT_TX_PCT;
  const txDiff          = +(subtotalDiff * (txPct / 100)).toFixed(2);
  const total           = +(subtotalDiff + txDiff).toFixed(2);
  return { perTravelerDiff, subtotalDiff, txDiff, total };
}

/**
 * Read the per-speed surcharge map and the tx fee percent from a generic
 * settings dictionary (the same one /api/settings returns). Tolerant to
 * missing keys.
 */
export function extractPricingFromSettings(settings: Record<string, unknown>): {
  surcharges: Record<ProcessingSpeed, number>;
  txPct: number;
} {
  const surcharges: Record<ProcessingSpeed, number> = { ...DEFAULT_SURCHARGES };
  for (const speed of SPEED_ORDER) {
    const v = settings[`pricing.processing.${speed}`];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) surcharges[speed] = v;
  }
  const txRaw = settings['pricing.fees.transactionPercent'];
  const txPct = typeof txRaw === 'number' && Number.isFinite(txRaw) && txRaw >= 0
    ? txRaw
    : DEFAULT_TX_PCT;
  return { surcharges, txPct };
}
