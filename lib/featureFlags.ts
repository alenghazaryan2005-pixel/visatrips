/**
 * Feature flags — admin-controlled site-wide toggles.
 *
 * Stored in the existing Setting table under key `features.<id>` with a
 * JSON-serialized boolean value. The catalog below is the single source of
 * truth for what flags exist, their human-readable label/description, and
 * their default value. To add a new flag:
 *
 *   1. Add an entry to FEATURE_FLAGS below
 *   2. Wire `useFeatureFlag('your-id')` (or server-side `isFeatureOn`) into
 *      whichever components/routes should respect it
 *
 * Defaults to `false` if the Setting row doesn't exist (or fails to parse).
 */

export interface FeatureFlag {
  /** Stable identifier — used as the suffix in the Setting key. */
  id: string;
  /** Display name shown on /admin/features. */
  label: string;
  /** One-line summary shown next to the toggle. */
  description: string;
  /** Longer body — rendered as paragraph text below the toggle. Optional. */
  details?: string[];
  /** Default value when no Setting row exists yet. */
  defaultValue: boolean;
}

export const FEATURE_FLAGS: FeatureFlag[] = [
  {
    id: 'orderTags',
    label: 'Order Tags',
    description: 'Free-form admin labels you can apply to orders for organization.',
    details: [
      'Lets you create your own tags (e.g. "VIP", "Photos Edited", "Customer Replied") and apply them to orders.',
      'When ON, adds a tag picker on each order\'s detail page, tag chips next to each row in the orders list, and tag filter chips in the orders filter row.',
      'When OFF, the tag UI disappears everywhere but the underlying catalog and any tags already applied are preserved — flipping back ON restores them exactly.',
    ],
    defaultValue: false,
  },
];

export const FLAG_BY_ID: Record<string, FeatureFlag> = Object.fromEntries(
  FEATURE_FLAGS.map(f => [f.id, f]),
);

/** Build the Setting row key for a flag id. */
export function flagSettingKey(id: string): string {
  return `features.${id}`;
}

/** Coerce a stored Setting value to a boolean. Anything else falls back to default. */
export function parseFlagValue(rawJson: string | null | undefined, defaultValue: boolean): boolean {
  if (rawJson == null) return defaultValue;
  try {
    const v = JSON.parse(rawJson);
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return defaultValue;
  } catch {
    return defaultValue;
  }
}
