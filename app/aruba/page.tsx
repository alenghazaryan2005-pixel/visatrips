'use client';

/**
 * Aruba destination landing — v2, modeled on the main / landing.
 *
 * Design DNA (matches app/page.tsx and app/india/page.tsx):
 *   Navy #0B2447 + accent blue #3B82F6 + pale-blue-gray #EEF2F9
 *   LandingNav on top, LandingFooter on the bottom
 *   No hero imagery — content-first, formal presentation
 *
 * The original imagery-heavy marketing landing is preserved at
 * /aruba/legacy as the archive.
 *
 * Aruba's single product is the ED Card (Embarkation/Disembarkation
 * card) required by the Aruba Tourism Authority — one tier, not
 * three like India — so the "Visa tiers" section on this page is
 * a single-column highlight rather than a 3-card grid.
 */

import Link from 'next/link';
import LandingNav from '@/components/LandingNav';
import LandingFooter from '@/components/LandingFooter';
import CountryFlag from '@/components/CountryFlag';
import {
  BookOpenCheck, FileText, PlaneTakeoff, Mail,
  BadgeCheck, ShieldCheck, Clock, ArrowRight,
  type LucideIcon,
} from 'lucide-react';

const ED_CARD = {
  name: 'Aruba ED Card',
  entries: 'Single entry per trip',
  price: 20,
  bullets: [
    'Required for every visitor entering Aruba by air or sea',
    'Valid for your trip dates (up to 30 days)',
    'Most approvals in minutes; standard within 24 hours',
    'Delivered as a PDF with QR code for immigration',
  ],
};

const REQUIREMENTS: Array<{ Icon: LucideIcon; title: string; desc: string }> = [
  { Icon: BookOpenCheck, title: 'Valid Passport',    desc: 'Valid for the entire duration of your stay. Some airlines also require 6 months of validity from arrival — check with your carrier.' },
  { Icon: FileText,      title: 'Passport Bio Page', desc: 'A clear photo or scan of your passport data page. JPEG, PNG, or HEIC, all four corners visible.' },
  { Icon: PlaneTakeoff,  title: 'Travel Details',    desc: 'Arrival date, country of departure, airline, flight number, and where you\'ll be staying (hotel, Airbnb, family).' },
  { Icon: Mail,          title: 'Email Address',     desc: 'Your approved ED Card is delivered as a PDF. Use an email you\'ll have access to during your trip.' },
];

const STEPS = [
  { n: 1, title: 'Fill the ED Card form', desc: 'Enter your trip and personal details — takes about 5 minutes.', when: '~5 min' },
  { n: 2, title: 'Upload your passport',  desc: 'A single photo of your bio page through our encrypted portal.', when: '~2 min' },
  { n: 3, title: 'We review & submit',    desc: 'Our team verifies your details and submits to the Aruba Tourism Authority.', when: 'Minutes to 24h' },
  { n: 4, title: 'Receive your ED Card',  desc: 'PDF with QR code delivered by email — present it on arrival.', when: 'Same day' },
];

const FAQS = [
  { q: 'Who needs an Aruba ED Card?', a: 'Every visitor entering Aruba — by air or by sea — must complete an ED Card before arrival, regardless of nationality. It replaced the old paper landing card.' },
  { q: 'Is the ED Card the same as a visa?', a: 'No. The ED Card is an entry/disembarkation declaration required by the Aruba Tourism Authority. Visa requirements depend on your nationality — most travelers from the US, Canada, EU, and UK do not need a separate visa for short tourist stays.' },
  { q: 'How long does processing take?', a: 'Most ED Cards are approved within minutes. Standard processing completes within 24 hours; rush options are available if you\'re travelling sooner.' },
  { q: 'When should I apply?', a: 'Within 7 days of your arrival date. Applying earlier than that is not accepted by the Aruba ED Card system.' },
  { q: 'How long is the ED Card valid?', a: 'It\'s tied to your specific trip — single entry, valid for the dates of your stay (up to 30 days). If you leave and return, you need a new ED Card.' },
  { q: 'What if I make a mistake on the form?', a: 'Just reach out — our team can correct most details before submission. After approval, the ED Card is locked to your passport and trip dates, so accuracy matters.' },
];

export default function ArubaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white font-[var(--font-jakarta),sans-serif] text-[#0B2447]">
      <LandingNav countryFlag="aruba" />

      {/* ── Hero ── */}
      <section className="bg-[#EEF2F9] border-b border-[#dbe3f0]">
        <div className="max-w-[1280px] mx-auto px-6 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.16em] font-semibold text-[#3B82F6] mb-4">
              Aruba · ED Card Service
            </div>
            <h1 className="text-[2.2rem] md:text-[3rem] font-bold leading-[1.1] tracking-tight text-[#0B2447]">
              Apply for Your<br />
              <span className="text-[#0B2447]">Aruba ED Card</span>
            </h1>
            <p className="mt-5 text-[0.95rem] leading-7 text-[#3B4A6B] max-w-[440px]">
              VisaTrips handles your entire Aruba Embarkation/Disembarkation
              application — form review, submission to the Aruba Tourism Authority,
              and delivery. Most ED Cards arrive by email within minutes.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Link
                href="/apply?destination=ARUBA"
                className="inline-flex items-center gap-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white no-underline text-[0.85rem] font-semibold tracking-wide uppercase px-7 py-3.5 rounded-md transition-colors"
              >
                Start Application <ArrowRight size={16} strokeWidth={2.5} />
              </Link>
              <span className="text-[0.8rem] text-[#3B4A6B]">
                Starting at <span className="font-bold text-[#0B2447]">${ED_CARD.price}</span> · Same-day processing
              </span>
            </div>

            <div className="mt-6 flex items-center gap-4 text-[0.78rem] text-[#3B4A6B]">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={14} strokeWidth={2.25} className="text-[#3B82F6]" />
                Encrypted &amp; secure
              </span>
              <span className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck size={14} strokeWidth={2.25} className="text-[#3B82F6]" />
                Verified specialists
              </span>
              <span className="opacity-40 hidden sm:inline">·</span>
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <Clock size={14} strokeWidth={2.25} className="text-[#3B82F6]" />
                Minutes to 24h
              </span>
            </div>
          </div>

          {/* Right column — Aruba facts card. Sibling of the / and /india
              stats cards for visual consistency across landings. */}
          <div className="hidden md:block">
            <div className="relative bg-white border border-[#dbe3f0] rounded-lg shadow-[0_6px_24px_rgba(11,36,71,0.06)] p-8">
              <div className="flex items-center gap-3 mb-6 pb-5 border-b border-[#EEF2F9]">
                <div className="w-11 h-11 rounded-md bg-[#EEF2F9] flex items-center justify-center">
                  <CountryFlag slug="aruba" size="1.6em" />
                </div>
                <div>
                  <div className="text-[0.9rem] font-semibold text-[#0B2447]">Aruba ED Card</div>
                  <div className="text-[0.78rem] text-[#3B4A6B]">Required by the Aruba Tourism Authority</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { n: 'Minutes', l: 'Fastest Turnaround' },
                  { n: '24h',     l: 'Standard SLA'       },
                  { n: '$20+',    l: 'Starting Price'     },
                  { n: '30d',     l: 'Max Stay'           },
                ].map(s => (
                  <div key={s.l} className="bg-[#F7F9FD] rounded-md p-4">
                    <div className="text-[1.4rem] font-bold text-[#0B2447] leading-none">{s.n}</div>
                    <div className="text-[0.75rem] mt-1.5 text-[#3B4A6B] font-medium">{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-5 border-t border-[#EEF2F9] text-[0.78rem] text-[#3B4A6B] leading-6">
                &ldquo;Filled it out in the taxi to the airport, had the ED Card
                by the time we landed. Zero hassle.&rdquo;
                <div className="mt-2 font-semibold text-[#0B2447]">— Marcus L., traveler</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="bg-white border-b border-[#EEF2F9]">
        <div className="max-w-[1280px] mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <div className="text-[0.72rem] uppercase tracking-[0.16em] font-semibold text-[#3B82F6] mb-2">
              Our Process
            </div>
            <h2 className="text-[1.75rem] md:text-[2.25rem] font-bold tracking-tight text-[#0B2447]">
              How It Works
            </h2>
            <p className="mt-3 text-[0.9rem] text-[#3B4A6B] max-w-[600px] mx-auto">
              Four steps from form to ED Card in hand — most travelers complete
              the whole flow inside an hour.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              href="/apply?destination=ARUBA"
              className="inline-flex items-center gap-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white no-underline text-[0.85rem] font-semibold tracking-wide uppercase px-7 py-3.5 rounded-md transition-colors"
            >
              Start My Aruba ED Card <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Requirements ── */}
      <section id="requirements" className="bg-[#EEF2F9] border-b border-[#dbe3f0]">
        <div className="max-w-[1280px] mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <div className="text-[0.72rem] uppercase tracking-[0.16em] font-semibold text-[#3B82F6] mb-2">
              What You&apos;ll Need
            </div>
            <h2 className="text-[1.75rem] md:text-[2.25rem] font-bold tracking-tight text-[#0B2447]">
              Application Requirements
            </h2>
            <p className="mt-3 text-[0.9rem] text-[#3B4A6B] max-w-[560px] mx-auto">
              Have these four items ready — most applications complete in under
              10 minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {REQUIREMENTS.map(r => (
              <div key={r.title} className="bg-white border border-[#dbe3f0] rounded-lg p-6">
                <div className="w-11 h-11 rounded-md bg-[#EEF2F9] flex items-center justify-center mb-4">
                  <r.Icon size={22} strokeWidth={1.85} className="text-[#3B82F6]" />
                </div>
                <h3 className="text-[1rem] font-bold text-[#0B2447] mb-2">{r.title}</h3>
                <p className="text-[0.82rem] leading-6 text-[#3B4A6B]">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="bg-white border-b border-[#EEF2F9]">
        <div className="max-w-[900px] mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <div className="text-[0.72rem] uppercase tracking-[0.16em] font-semibold text-[#3B82F6] mb-2">
              Common Questions
            </div>
            <h2 className="text-[1.75rem] md:text-[2.25rem] font-bold tracking-tight text-[#0B2447]">
              Aruba ED Card FAQ
            </h2>
          </div>

          <div className="space-y-3">
            {FAQS.map(f => (
              <details
                key={f.q}
                className="group bg-white border border-[#dbe3f0] rounded-lg p-5 open:shadow-[0_4px_16px_rgba(11,36,71,0.06)] transition-shadow"
              >
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-[0.95rem] font-bold text-[#0B2447]">
                  <span>{f.q}</span>
                  <span className="text-[#3B82F6] group-open:rotate-45 transition-transform text-[1.4rem] leading-none" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-[0.85rem] leading-7 text-[#3B4A6B]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
