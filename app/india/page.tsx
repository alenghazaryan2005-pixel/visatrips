'use client';

/**
 * India destination landing — v2, modeled on the main / landing.
 *
 * Design DNA (matches app/page.tsx):
 *   Navy #0B2447 + accent blue #3B82F6 + pale-blue-gray #EEF2F9
 *   LandingNav on top, LandingFooter on the bottom
 *   No hero imagery — content-first, formal presentation
 *
 * The original marketing landing (long-form hero with imagery
 * carousel, animated sections, /legacy-palette periwinkle palette)
 * is preserved at /india/legacy as the archive.
 */

import Link from 'next/link';
import LandingNav from '@/components/LandingNav';
import LandingFooter from '@/components/LandingFooter';
import {
  BookOpenCheck, Camera, FileText, PlaneTakeoff,
  BadgeCheck, ShieldCheck, Clock, ArrowRight,
  type LucideIcon,
} from 'lucide-react';

/* ── India visa options — starting prices for each tier. Kept in sync
 *    with app/india/legacy/page.tsx and the apply-page pricing. */
const VISA_TIERS = [
  {
    id: 'tourist-30',
    name: 'Tourist eVisa · 30 days',
    entries: 'Double entry',
    price: 25,
    tag: 'Most Popular',
    bullets: [
      'Stay up to 30 days from arrival',
      'Two entries within the validity window',
      'Ideal for short leisure trips and family visits',
    ],
  },
  {
    id: 'tourist-1y',
    name: 'Tourist eVisa · 1 year',
    entries: 'Multiple entry',
    price: 40,
    tag: '',
    bullets: [
      'Valid for 365 days from issue',
      'Multiple entries, up to 90 days per stay',
      'Best for travelers with repeat trips planned',
    ],
  },
  {
    id: 'tourist-5y',
    name: 'Tourist eVisa · 5 years',
    entries: 'Multiple entry',
    price: 80,
    tag: 'Best Value',
    bullets: [
      'Valid for 5 years — longest tourist tier available',
      'Multiple entries, up to 90 days per stay',
      'Skip re-applying every trip; ideal for frequent visitors',
    ],
  },
];

const REQUIREMENTS: Array<{ Icon: LucideIcon; title: string; desc: string }> = [
  { Icon: BookOpenCheck, title: 'Valid Passport',    desc: 'At least 6 months of validity from arrival, with 2 blank pages for visa stamps.' },
  { Icon: Camera,        title: 'Digital Photo',     desc: 'Front-facing, plain white background, square (min 350×350). No glasses or headwear.' },
  { Icon: FileText,      title: 'Passport Bio Page', desc: 'High-quality scan or photo of the data page. JPEG or PDF, all four corners visible.' },
  { Icon: PlaneTakeoff,  title: 'Travel Details',    desc: 'Confirmed arrival date, port of entry, and accommodation or reference contact in India.' },
];

const STEPS = [
  { n: 1, title: 'Pick your visa tier',   desc: 'Choose the tourist eVisa duration that fits your trip.', when: '~1 min' },
  { n: 2, title: 'Complete the form',     desc: 'We build the exact form the Indian government requires — no portal navigation on your end.', when: '~10 min' },
  { n: 3, title: 'Upload your documents', desc: 'Passport bio page and photo through our encrypted portal.', when: '~5 min' },
  { n: 4, title: 'We review & submit',    desc: 'Our team verifies every field before filing with Indian authorities.', when: '1 day' },
  { n: 5, title: 'Receive your eVisa',    desc: 'Approved eVisa arrives by email — print it and travel.', when: '3–5 days' },
];

const FAQS = [
  { q: 'Who needs an India eVisa?', a: 'Citizens of 150+ countries can apply. Notable exceptions include Pakistani nationals, who must apply through an Indian embassy in person.' },
  { q: 'How long does processing take?', a: 'Standard processing is 3–5 business days. Rush processing is available for 1–2 days, and Super Rush for urgent applications.' },
  { q: 'What is the validity of the Tourist eVisa?', a: 'The 30-day eVisa is valid for 30 days from arrival. The 1-year and 5-year eVisas allow multiple entries with stays up to 90 days per visit.' },
  { q: 'Can I extend my eVisa?', a: 'India eVisas cannot be extended. If you need to stay longer, you must apply for a new visa.' },
  { q: 'Which airports accept the eVisa?', a: 'The India eVisa is accepted at 28 designated airports and 5 seaports, including Delhi, Mumbai, Chennai, Kolkata, Bangalore, and Hyderabad.' },
];

export default function IndiaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white font-[var(--font-jakarta),sans-serif] text-[#0B2447]">
      <LandingNav />

      {/* ── Hero ── */}
      <section className="bg-[#EEF2F9] border-b border-[#dbe3f0]">
        <div className="max-w-[1280px] mx-auto px-6 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.16em] font-semibold text-[#3B82F6] mb-4">
              <span aria-hidden>🇮🇳</span> India · e-Visa Service
            </div>
            <h1 className="text-[2.2rem] md:text-[3rem] font-bold leading-[1.1] tracking-tight text-[#0B2447]">
              Apply for Your<br />
              <span className="text-[#0B2447]">India eVisa</span>
            </h1>
            <p className="mt-5 text-[0.95rem] leading-7 text-[#3B4A6B] max-w-[440px]">
              VisaTrips handles your entire India eVisa application — document review,
              submission to the Indian government portal, and delivery. Approved
              e-visas arrive by email in 3–5 business days.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Link
                href="/apply?destination=INDIA"
                className="inline-flex items-center gap-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white no-underline text-[0.85rem] font-semibold tracking-wide uppercase px-7 py-3.5 rounded-md transition-colors"
              >
                Start Application <ArrowRight size={16} strokeWidth={2.5} />
              </Link>
              <span className="text-[0.8rem] text-[#3B4A6B]">
                Starting at <span className="font-bold text-[#0B2447]">$25</span> · Rush available
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
                3–5 day standard
              </span>
            </div>
          </div>

          {/* Right column — India facts card. Same framed treatment as the
              homepage stats card so /india and / feel like siblings. */}
          <div className="hidden md:block">
            <div className="relative bg-white border border-[#dbe3f0] rounded-lg shadow-[0_6px_24px_rgba(11,36,71,0.06)] p-8">
              <div className="flex items-center gap-3 mb-6 pb-5 border-b border-[#EEF2F9]">
                <div className="w-11 h-11 rounded-md bg-[#EEF2F9] flex items-center justify-center text-[1.4rem]">
                  🇮🇳
                </div>
                <div>
                  <div className="text-[0.9rem] font-semibold text-[#0B2447]">India Tourist eVisa</div>
                  <div className="text-[0.78rem] text-[#3B4A6B]">Government-authorized digital visa</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { n: '3–5d',  l: 'Processing Time' },
                  { n: '$25+',  l: 'Starting Price'  },
                  { n: '150+',  l: 'Eligible Nations'},
                  { n: '30–1825d', l: 'Stay Options' },
                ].map(s => (
                  <div key={s.l} className="bg-[#F7F9FD] rounded-md p-4">
                    <div className="text-[1.4rem] font-bold text-[#0B2447] leading-none">{s.n}</div>
                    <div className="text-[0.75rem] mt-1.5 text-[#3B4A6B] font-medium">{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-5 border-t border-[#EEF2F9] text-[0.78rem] text-[#3B4A6B] leading-6">
                &ldquo;Everything happened over email — no confusion, no wasted trips.
                Got my India e-Visa in three days.&rdquo;
                <div className="mt-2 font-semibold text-[#0B2447]">— Amelia R., traveler</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Visa tiers ── */}
      <section id="tiers" className="bg-white border-b border-[#EEF2F9]">
        <div className="max-w-[1280px] mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <div className="text-[0.72rem] uppercase tracking-[0.16em] font-semibold text-[#3B82F6] mb-2">
              Available Tiers
            </div>
            <h2 className="text-[1.75rem] md:text-[2.25rem] font-bold tracking-tight text-[#0B2447]">
              Choose Your eVisa Duration
            </h2>
            <p className="mt-3 text-[0.9rem] text-[#3B4A6B] max-w-[560px] mx-auto">
              Three tourist tiers, priced by duration and entries. Pick the one
              that matches your travel plans.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {VISA_TIERS.map(v => (
              <div
                key={v.id}
                className="bg-white border border-[#dbe3f0] rounded-lg p-6 flex flex-col hover:border-[#0B2447] transition-colors relative"
              >
                {v.tag && (
                  <span className="absolute top-4 right-4 text-[0.62rem] font-bold uppercase tracking-wide text-[#3B82F6] bg-[#DBEAFE] px-2 py-1 rounded">
                    {v.tag}
                  </span>
                )}
                <div className="text-[0.72rem] uppercase tracking-wide font-semibold text-[#3B82F6] mb-2">
                  {v.entries}
                </div>
                <h3 className="text-[1.1rem] font-bold text-[#0B2447] mb-2">{v.name}</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-[1.6rem] font-bold text-[#0B2447]">${v.price}</span>
                  <span className="text-[0.78rem] text-[#3B4A6B]">starting fee</span>
                </div>
                <ul className="space-y-2 mb-6 flex-1 list-none p-0">
                  {v.bullets.map(b => (
                    <li key={b} className="text-[0.82rem] leading-6 text-[#3B4A6B] flex items-start gap-2">
                      <span className="mt-2 w-1 h-1 rounded-full bg-[#3B82F6] shrink-0" aria-hidden />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/apply?destination=INDIA&visaType=${v.id}`}
                  className="inline-flex items-center gap-1 text-[0.82rem] font-semibold text-[#0B2447] hover:text-[#3B82F6] no-underline transition-colors mt-auto"
                >
                  Apply for this tier <ArrowRight size={14} strokeWidth={2.5} />
                </Link>
              </div>
            ))}
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
              Gather these four items before you start — most applications complete
              in under 15 minutes.
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
              From application to visa in hand — every step and how long it takes.
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
              href="/apply?destination=INDIA"
              className="inline-flex items-center gap-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white no-underline text-[0.85rem] font-semibold tracking-wide uppercase px-7 py-3.5 rounded-md transition-colors"
            >
              Start My India eVisa <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="bg-[#EEF2F9] border-b border-[#dbe3f0]">
        <div className="max-w-[900px] mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <div className="text-[0.72rem] uppercase tracking-[0.16em] font-semibold text-[#3B82F6] mb-2">
              Common Questions
            </div>
            <h2 className="text-[1.75rem] md:text-[2.25rem] font-bold tracking-tight text-[#0B2447]">
              India eVisa FAQ
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
