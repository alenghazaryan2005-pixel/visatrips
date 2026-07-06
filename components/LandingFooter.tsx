'use client';

/**
 * Navy trust section + navy footer combo, used by the landing page
 * and the top-level customer flows (/apply, /apply/finish).
 *
 * The trust section flows straight into the footer so the bottom of
 * every customer-facing page reads as one continuous edge-to-edge
 * dark region, mirroring the LandingNav's navy strip at the top.
 *
 * The outer container for the footer is a <div>, not <footer>. There
 * is a bare `footer { max-width: 1440px; mx-auto; display: flex }`
 * rule in globals.css (leftover from the /legacy landing) that would
 * otherwise constrain the element to 1440px with auto margins,
 * leaving white gutters on wide viewports. The inner <footer> keeps
 * the semantic role.
 */

import Link from 'next/link';
import { ShieldCheck, Clock, Globe2, BadgeCheck, type LucideIcon } from 'lucide-react';

const TRUST: Array<{ Icon: LucideIcon; title: string; desc: string }> = [
  { Icon: ShieldCheck, title: 'Bank-Grade Encryption', desc: 'Every document you upload is encrypted in transit and at rest.' },
  { Icon: BadgeCheck,  title: 'Verified Specialists',  desc: 'Applications reviewed by trained visa specialists before submission.' },
  { Icon: Clock,       title: 'Same-Day Processing',   desc: 'Rush-tier applications processed within one business day of upload.' },
  { Icon: Globe2,      title: '80+ Countries Served',  desc: 'Wide coverage across Asia, Europe, the Americas, and the Middle East.' },
];

/**
 * @param showTrust — whether to render the "Why VisaTrips / Built
 *   for Confidence" strip above the footer proper. Default true
 *   (landing page). Set false on the /apply flow — customers who
 *   are actively filling out an application don't need marketing
 *   reassurance in the middle of the checkout, just the standard
 *   sitewide footer links.
 */
export default function LandingFooter({ showTrust = true }: { showTrust?: boolean } = {}) {
  return (
    <>
      {/* ── Why VisaTrips (trust strip) ── */}
      {showTrust && (
      <section className="bg-[#0B2447] text-white">
        <div className="max-w-[1280px] mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <div className="text-[0.72rem] uppercase tracking-[0.16em] font-semibold text-[#60A5FA] mb-2">
              Why VisaTrips
            </div>
            <h2 className="text-[1.75rem] md:text-[2.25rem] font-bold tracking-tight text-white">
              Built for Confidence
            </h2>
            <p className="mt-3 text-[0.9rem] text-white/70 max-w-[560px] mx-auto">
              Every application handled by a real specialist, submitted on
              encrypted infrastructure, and tracked from filing to approval.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">
            {TRUST.map(t => (
              <div key={t.title} className="flex flex-col items-start">
                <div className="w-12 h-12 rounded-md bg-white/10 border border-white/15 flex items-center justify-center mb-5">
                  <t.Icon size={24} strokeWidth={1.85} className="text-[#60A5FA]" />
                </div>
                <div className="text-[0.98rem] font-bold text-white mb-2">{t.title}</div>
                <p className="text-[0.82rem] leading-6 text-white/70">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ── Footer ── */}
      <div className="bg-[#0B2447] text-white mt-auto">
        <footer className="max-w-[1280px] mx-auto px-6 py-14 block">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="text-[1.3rem] font-extrabold tracking-tight text-white">VisaTrips</span>
                <sup className="text-[0.7rem] text-[#3B82F6] font-bold">®</sup>
              </div>
              <p className="text-[0.78rem] leading-6 text-white/70 max-w-[240px]">
                A private e-Visa courier service. Designed to save you time and simplify
                the visa application process.
              </p>
            </div>

            <div>
              <div className="text-[0.72rem] uppercase tracking-[0.14em] font-semibold text-white/60 mb-4">Visa Types</div>
              <ul className="list-none p-0 space-y-2 text-[0.82rem]">
                <li><Link href="/apply?type=tourist"  className="text-white/85 hover:text-white no-underline">Tourist Visa</Link></li>
                <li><Link href="/apply?type=business" className="text-white/85 hover:text-white no-underline">Business Visa</Link></li>
                <li><Link href="/apply?type=student"  className="text-white/85 hover:text-white no-underline">Student Visa</Link></li>
                <li><Link href="/apply?type=work"     className="text-white/85 hover:text-white no-underline">Work Visa</Link></li>
              </ul>
            </div>

            <div>
              <div className="text-[0.72rem] uppercase tracking-[0.14em] font-semibold text-white/60 mb-4">Information</div>
              <ul className="list-none p-0 space-y-2 text-[0.82rem]">
                <li><Link href="/#how-it-works" className="text-white/85 hover:text-white no-underline">How It Works</Link></li>
                <li><Link href="/status"        className="text-white/85 hover:text-white no-underline">Check Status</Link></li>
                <li><Link href="/contact"       className="text-white/85 hover:text-white no-underline">Contact Us</Link></li>
              </ul>
            </div>

            <div>
              <div className="text-[0.72rem] uppercase tracking-[0.14em] font-semibold text-white/60 mb-4">Legal</div>
              <ul className="list-none p-0 space-y-2 text-[0.82rem]">
                <li><Link href="/privacy" className="text-white/85 hover:text-white no-underline">Privacy Policy</Link></li>
                <li><Link href="/terms"   className="text-white/85 hover:text-white no-underline">Terms of Service</Link></li>
                <li><Link href="/refund"  className="text-white/85 hover:text-white no-underline">Refund Policy</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-[0.72rem] text-white/60">
            <div>© {new Date().getFullYear()} VisaTrips. All rights reserved.</div>
            <div className="max-w-[560px] md:text-right leading-6">
              VisaTrips is a private, non-government service. We are not affiliated with any
              government agency. For direct government processing, visit your destination
              country&apos;s official visa portal.
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
