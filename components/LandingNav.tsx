'use client';

/**
 * Navy header nav used by the new landing page and every top-level
 * customer flow (`/`, `/apply`, `/apply/finish`).
 *
 * Notes:
 *  - Uses Tailwind arbitrary hex values instead of var(--blue) etc.
 *    so it renders correctly even inside pages wrapped in
 *    `.legacy-palette` (India/Aruba/Legacy) — those pages import
 *    the old marketing Nav (components/Nav.tsx) and don't render
 *    this one anyway, but pinning colors here also makes the
 *    component safe to drop into any future page without
 *    thinking about scope.
 *  - Section anchor links point at `/#services` / `/#how-it-works`
 *    rather than just `#services`. When the customer is on
 *    `/apply` and clicks "How It Works", we want them to land on
 *    the homepage section, not scroll to a non-existent anchor.
 */

import Link from 'next/link';
import CountryFlag from '@/components/CountryFlag';

/**
 * @param countryFlag — optional CountryFlag slug ("india" / "aruba").
 *   When set, renders the country's SVG flag next to the logo with
 *   a subtle vertical separator, so destination landings (/india,
 *   /aruba) communicate their scope right in the chrome instead of
 *   relying on a flag emoji in the hero eyebrow.
 */
export default function LandingNav({ countryFlag }: { countryFlag?: string } = {}) {
  return (
    <header className="bg-[#0B2447] border-b border-[#0B2447]">
      <nav className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-baseline gap-1.5 no-underline">
            <span className="text-[1.4rem] font-extrabold tracking-tight text-white">VisaTrips</span>
            <sup className="text-[0.7rem] text-[#3B82F6] font-bold">®</sup>
          </Link>
          {countryFlag && (
            <span className="pl-3 border-l border-white/20 flex items-center">
              <CountryFlag slug={countryFlag} size="1.3em" />
            </span>
          )}
        </div>
        {/* Nav links pushed to the right — the Get Started CTA
            button previously sat here to the right of the links,
            but every top-level customer flow (`/`, `/apply`,
            `/apply/finish`, `/contact`) has its own primary CTA in
            the body (VisaSelector on the landing, the form itself
            on /apply, etc.), so the nav CTA was redundant and
            competed with them. Removing it also gives the links
            more room without crowding the button. */}
        <ul className="hidden md:flex items-center gap-9 list-none text-[0.9rem] font-medium ml-auto">
          <li><Link href="/#services"     className="text-white/85 hover:text-white no-underline transition-colors">Visa Types</Link></li>
          <li><Link href="/#how-it-works" className="text-white/85 hover:text-white no-underline transition-colors">How It Works</Link></li>
          <li><Link href="/status"        className="text-white/85 hover:text-white no-underline transition-colors">Check Status</Link></li>
          <li><Link href="/contact"       className="text-white/85 hover:text-white no-underline transition-colors">Contact</Link></li>
        </ul>
      </nav>
    </header>
  );
}
