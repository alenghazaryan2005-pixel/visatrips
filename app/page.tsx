'use client';

/**
 * VisaTrips landing page — v2 (usapassports.com-inspired).
 *
 * Design DNA:
 *   - Navy (#0B2447) + trust-green (#3B82F6) + pale-blue-gray (#EEF2F9)
 *   - DM Sans throughout, no serif italic accents (in contrast to
 *     /legacy which uses DM Serif Display with editorial italic).
 *   - Government-adjacent formality: top disclaimer strip, plain
 *     nav, form-first hero, service-card grid, numbered how-it-works.
 *   - VisaSelector kept as the hero widget (customer's proven
 *     conversion path); everything around it restyled to match the
 *     new formality.
 *
 * The previous, marketing-tone landing lives at /legacy and shares
 * globals.css. This page uses only inline Tailwind so /legacy's
 * styling stays untouched.
 */

import Link from 'next/link';
import VisaSelector from '@/components/VisaSelector';
import LandingNav from '@/components/LandingNav';
import LandingFooter from '@/components/LandingFooter';
import {
  Plane, Briefcase, GraduationCap, HardHat,
  ShieldCheck, Clock, BadgeCheck,
  ArrowRight,
} from 'lucide-react';

/* ── Country data (same shape the old landing used — VisaSelector
 *    still expects these props) ────────────────────────────────── */

const PASSPORT_COUNTRIES = [
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: 'CN', flag: '🇨🇳', name: 'China' },
  { code: 'IN', flag: '🇮🇳', name: 'India' },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria' },
  { code: 'ZA', flag: '🇿🇦', name: 'South Africa' },
  { code: 'AE', flag: '🇦🇪', name: 'UAE' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore' },
  { code: 'KR', flag: '🇰🇷', name: 'Republic of Korea' },
  { code: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: 'TR', flag: '🇹🇷', name: 'Turkey' },
];

const DESTINATIONS = [
  { code: 'IN', flag: '🇮🇳', name: 'India', tag: 'Popular', region: 'Asia'     },
  { code: 'AW', flag: '🇦🇼', name: 'Aruba', tag: 'New',     region: 'Caribbean' },
];

/* ── Service cards ─────────────────────────────────────────────── */

const SERVICES = [
  {
    code: 'B-1',
    Icon: Plane,
    name: 'Tourist Visa',
    bullets: [
      'Leisure travel or holiday visits',
      'Vacations, family reunions, and cultural tourism',
      'Typically 30–180 days validity depending on destination',
    ],
    href: '/apply?type=tourist',
  },
  {
    code: 'B-2',
    Icon: Briefcase,
    name: 'Business Visa',
    bullets: [
      'Meetings, conferences, or contract signings',
      'Non-employment business activities',
      'Multi-entry options available for frequent travelers',
    ],
    href: '/apply?type=business',
  },
  {
    code: 'F-1',
    Icon: GraduationCap,
    name: 'Student Visa',
    bullets: [
      'Accepted enrollment at an accredited institution',
      'Full-time academic programs or approved training',
      'Duration matches the length of your program',
    ],
    href: '/apply?type=student',
  },
  {
    code: 'H-1',
    Icon: HardHat,
    name: 'Work Visa',
    bullets: [
      'Confirmed job offer or employer sponsorship',
      'Employment authorization for a specific role',
      'Renewable in most jurisdictions with continued employment',
    ],
    href: '/apply?type=work',
  },
];

/* ── How it works steps ────────────────────────────────────────── */

const STEPS = [
  { n: 1, title: 'Pick your visa type',    desc: 'Tell us your passport country and destination — we identify the correct visa category.', when: '~1 min' },
  { n: 2, title: 'Complete the application', desc: 'We build the right form for your country. No government-site confusion.', when: '~10 min' },
  { n: 3, title: 'Upload your documents',   desc: 'Submit photos and passport pages through our encrypted portal.', when: '~5 min' },
  { n: 4, title: 'We review & submit',      desc: 'Our team verifies every field, then files with the relevant authority.', when: '1–2 days' },
  { n: 5, title: 'Receive your e-Visa',     desc: 'Approved e-Visa lands in your inbox — ready to travel, no office visit required.', when: '3–10 days' },
];

/* ── Page ──────────────────────────────────────────────────────── */

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-white font-[var(--font-jakarta),sans-serif] text-[#0B2447]">
      {/*
        Scoped style override — the VisaSelector's CTA button uses
        `var(--blue)` (`#6C8AFF`) from globals.css, which reads as
        purple/periwinkle here. We can't change --blue globally
        without touching /legacy, so we scope a dark-gray override
        to a `.landing-selector` wrapper around the widget on
        this page only.
      */}
      <style>{`
        .landing-selector .vs-cta {
          background: #374151 !important;
          border-top-color: #374151 !important;
        }
        .landing-selector .vs-cta--on { background: #374151 !important; }
        .landing-selector .vs-cta--on:hover { background: #1F2937 !important; }
      `}</style>

      {/* ── Nav ── */}
      <LandingNav />

      {/* ── Hero ── */}
      <section className="bg-[#EEF2F9] border-b border-[#dbe3f0]">
        <div className="max-w-[1280px] mx-auto px-6 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-block text-[0.7rem] uppercase tracking-[0.16em] font-semibold text-[#3B82F6] mb-4">
              Nationwide e-Visa Service
            </div>
            <h1 className="text-[2.2rem] md:text-[3rem] font-bold leading-[1.1] tracking-tight text-[#0B2447]">
              Get Your Travel Visa,<br/>
              <span className="text-[#0B2447]">The Simple Way</span>
            </h1>
            <p className="mt-5 text-[0.95rem] leading-7 text-[#3B4A6B] max-w-[440px]">
              VisaTrips handles your entire electronic visa application — document review,
              submission, and tracking. Designed to save you time and get your visa
              quickly &amp; efficiently.
            </p>

            {/* Selector widget — kept from the previous design.
                `landing-selector` wrapper scopes the dark-gray CTA
                override (see <style> at the top of this file) so
                /legacy's selector keeps its brand-blue button. */}
            <div className="landing-selector mt-8 max-w-[540px]">
              <VisaSelector
                passportCountries={PASSPORT_COUNTRIES}
                destinationCountries={DESTINATIONS}
              />
            </div>

            <div className="mt-6 flex items-center gap-4 text-[0.78rem] text-[#3B4A6B]">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={14} strokeWidth={2.25} className="text-[#3B82F6]" />
                Encrypted &amp; secure
              </span>
              <span className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck size={14} strokeWidth={2.25} className="text-[#3B82F6]" />
                98.7% approval rate
              </span>
              <span className="opacity-40 hidden sm:inline">·</span>
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <Clock size={14} strokeWidth={2.25} className="text-[#3B82F6]" />
                Rush available
              </span>
            </div>
          </div>

          {/* Right column — hero imagery panel. Keeping the existing
             /man-with-luggage.png as the imagery but presenting it in
             a formal framed card (not the bleed-to-edge treatment). */}
          <div className="hidden md:block">
            <div className="relative bg-white border border-[#dbe3f0] rounded-lg shadow-[0_6px_24px_rgba(11,36,71,0.06)] p-8">
              <div className="flex items-center gap-3 mb-6 pb-5 border-b border-[#EEF2F9]">
                <div className="w-11 h-11 rounded-md bg-[#EEF2F9] flex items-center justify-center">
                  <BadgeCheck size={20} strokeWidth={2} className="text-[#3B82F6]" />
                </div>
                <div>
                  <div className="text-[0.9rem] font-semibold text-[#0B2447]">Trusted by 50,000+ travelers</div>
                  <div className="text-[0.78rem] text-[#3B4A6B]">Since 2019 · Across 80+ countries</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { n: '50K+',  l: 'Visas Processed' },
                  { n: '98.7%', l: 'Approval Rate'   },
                  { n: '72hr',  l: 'Avg. Processing' },
                  { n: '80+',   l: 'Countries Served'},
                ].map(s => (
                  <div key={s.l} className="bg-[#F7F9FD] rounded-md p-4">
                    <div className="text-[1.4rem] font-bold text-[#0B2447] leading-none">{s.n}</div>
                    <div className="text-[0.75rem] mt-1.5 text-[#3B4A6B] font-medium">{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-5 border-t border-[#EEF2F9] text-[0.78rem] text-[#3B4A6B] leading-6">
                &ldquo;Everything happened over email — no confusion, no wasted trips. Got my India
                e-Visa in three days.&rdquo;
                <div className="mt-2 font-semibold text-[#0B2447]">— Amelia R., traveler</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Choose visa type ── */}
      <section id="services" className="bg-white border-b border-[#EEF2F9]">
        <div className="max-w-[1280px] mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <div className="text-[0.72rem] uppercase tracking-[0.16em] font-semibold text-[#3B82F6] mb-2">
              Visa Categories
            </div>
            <h2 className="text-[1.75rem] md:text-[2.25rem] font-bold tracking-tight text-[#0B2447]">
              Choose Your Visa Type
            </h2>
            <p className="mt-3 text-[0.9rem] text-[#3B4A6B] max-w-[560px] mx-auto">
              Every VisaTrips application is built around the exact form your
              destination requires. Pick the category that fits your travel.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {SERVICES.map(s => (
              <div key={s.name} className="bg-white border border-[#dbe3f0] rounded-lg p-6 flex flex-col hover:border-[#0B2447] transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[0.68rem] font-bold uppercase tracking-wide text-[#3B82F6] bg-[#DBEAFE] px-2 py-1 rounded">
                    {s.code}
                  </span>
                  <s.Icon size={22} strokeWidth={1.75} className="text-[#0B2447]" />
                </div>
                <h3 className="text-[1.05rem] font-bold text-[#0B2447] mb-3">{s.name}</h3>
                <ul className="space-y-2 mb-6 flex-1 list-none p-0">
                  {s.bullets.map(b => (
                    <li key={b} className="text-[0.82rem] leading-6 text-[#3B4A6B] flex items-start gap-2">
                      <span className="mt-2 w-1 h-1 rounded-full bg-[#3B82F6] shrink-0" aria-hidden />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={s.href}
                  className="inline-flex items-center gap-1 text-[0.82rem] font-semibold text-[#0B2447] hover:text-[#3B82F6] no-underline transition-colors mt-auto"
                >
                  Apply for {s.name} <ArrowRight size={14} strokeWidth={2.5} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="bg-[#EEF2F9] border-b border-[#dbe3f0]">
        <div className="max-w-[1280px] mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <div className="text-[0.72rem] uppercase tracking-[0.16em] font-semibold text-[#3B82F6] mb-2">
              Our Process
            </div>
            <h2 className="text-[1.75rem] md:text-[2.25rem] font-bold tracking-tight text-[#0B2447]">
              How It Works
            </h2>
            <p className="mt-3 text-[0.9rem] text-[#3B4A6B] max-w-[600px] mx-auto">
              From application to visa in hand — every step, how long it takes,
              and what we do for you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {STEPS.map(s => (
              <div key={s.n} className="bg-white border border-[#dbe3f0] rounded-lg p-6 relative">
                <div className="w-9 h-9 rounded-full bg-[#0B2447] text-white text-[0.9rem] font-bold flex items-center justify-center mb-4">
                  {s.n}
                </div>
                <h3 className="text-[0.95rem] font-bold text-[#0B2447] mb-2">{s.title}</h3>
                <p className="text-[0.82rem] text-[#3B4A6B] leading-6 mb-3">{s.desc}</p>
                <div className="text-[0.7rem] uppercase tracking-wide font-semibold text-[#3B82F6]">{s.when}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <Link
              href="/apply"
              className="inline-flex items-center gap-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white no-underline text-[0.85rem] font-semibold tracking-wide uppercase px-7 py-3.5 rounded-md transition-colors"
            >
              Apply Now <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trust strip + Footer ── */}
      <LandingFooter />
    </div>
  );
}
