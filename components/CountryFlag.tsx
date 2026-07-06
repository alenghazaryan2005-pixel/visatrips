'use client';

/**
 * Renders a country's flag as a proper SVG (via country-flag-icons)
 * instead of the OS's emoji rendering. Used across the customer
 * flow (/apply, /apply/finish) so the destination badge on the
 * summary card and the checkout label render the same clean
 * vector on every platform — emojis of flags render inconsistently
 * across macOS / Windows / Android / iOS and feel out of place
 * next to Lucide icons in a formal service UI.
 *
 * Only the destinations we actually sell today are wired: India (IN)
 * and Aruba (AW). Adding a new destination = add its config here.
 * Passport-picker dropdowns still use flag emojis for now — those
 * cover 20+ countries and would balloon the bundle if we imported
 * every SVG. Revisit if the customer feedback is that the passport
 * dropdown emojis look out of place too.
 */

import IN from 'country-flag-icons/react/3x2/IN';
import AW from 'country-flag-icons/react/3x2/AW';
import type { CSSProperties } from 'react';

type DestinationSlug = 'india' | 'aruba';

const FLAGS: Record<DestinationSlug, React.ComponentType<{ title?: string; style?: CSSProperties; className?: string }>> = {
  india: IN,
  aruba: AW,
};

const NAMES: Record<DestinationSlug, string> = {
  india: 'India',
  aruba: 'Aruba',
};

interface CountryFlagProps {
  /** Country slug — matches `CountryConfig.slug` from lib/countryConfig.ts. */
  slug: string;
  /** Rendered width (default 1.4em so it sits at cap-height next to text). */
  size?: string | number;
  /** Overrides `title` (else uses the country name from NAMES). */
  title?: string;
  className?: string;
  /** Extra style — merged over defaults. */
  style?: CSSProperties;
}

export default function CountryFlag({ slug, size = '1.4em', title, className, style }: CountryFlagProps) {
  const key = slug.toLowerCase() as DestinationSlug;
  const Flag = FLAGS[key];
  if (!Flag) return null;
  return (
    <Flag
      title={title ?? NAMES[key]}
      className={className}
      style={{
        width: typeof size === 'number' ? `${size}px` : size,
        height: 'auto',
        borderRadius: '2px',
        display: 'inline-block',
        verticalAlign: '-0.2em',
        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.05)',
        ...(style || {}),
      }}
    />
  );
}
