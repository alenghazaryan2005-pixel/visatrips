'use client';

/**
 * Aruba landing page — mirrors the structure of /india for visual
 * consistency across destinations. Reuses the same `india-*` CSS
 * classes from globals.css (hero, sections, cards, FAQ, CTA) since
 * the styling is destination-agnostic — the class prefix is just
 * historical (the India page came first). When we refactor towards
 * a shared landing-page layout, those classes should get renamed
 * to something country-neutral; for now reuse + content swap is the
 * right tradeoff.
 *
 * Hero images expected at /public:
 *   /aruba-oranjestad.jpg  — Oranjestad town square (colourful
 *                            Dutch-Caribbean architecture)
 *   /aruba-flamingo.jpg    — Renaissance Island flamingos
 *   /aruba-palm-beach.jpg  — Palm Beach aerial (hotels, palapas,
 *                            turquoise water)
 * Each <img> has an onError that hides itself, so the page falls back
 * to the hero background cleanly until the assets are added.
 */

import { useState, useEffect, useRef } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ChatWidget from '@/components/ChatWidget';
import { BookOpenCheck, FileText, PlaneTakeoff, Mail, type LucideIcon } from 'lucide-react';

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setInView(true); }, { threshold });
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function AnimatedSection({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className={className} style={{ opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(30px)', transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s` }}>
      {children}
    </div>
  );
}

const REQUIREMENTS: Array<{ Icon: LucideIcon; title: string; desc: string }> = [
  { Icon: BookOpenCheck, title: 'Valid Passport',    desc: 'Your passport must be valid for the entire duration of your stay. Some airlines also require 6 months of validity from your arrival date — check with your carrier.' },
  { Icon: FileText,      title: 'Passport Bio Page', desc: 'A clear photo or scan of your passport data page (the page with your photo, name, and passport number). JPEG, PNG, or HEIC, all four corners visible.' },
  { Icon: PlaneTakeoff,  title: 'Travel Details',    desc: 'Your arrival date, country of departure, airline, and flight number — plus the same for your return. You should also know where you\'ll be staying (hotel, Airbnb, family).' },
  { Icon: Mail,          title: 'Email Address',     desc: 'Your approved ED Card is delivered as a PDF to your inbox. Use an email you\'ll have access to during your trip in case immigration asks for the QR code.' },
];

const STEPS = [
  { n: '01', title: 'Fill Application', desc: 'Complete the ED Card form with your trip and personal details.' },
  { n: '02', title: 'Upload Passport',  desc: 'Submit a photo of your passport bio page through our secure portal.' },
  { n: '03', title: 'We Process It',    desc: 'Our team verifies your details and submits to the Aruba Tourism Authority.' },
  { n: '04', title: 'Receive ED Card',  desc: 'Your approved ED Card arrives in your inbox — present it on arrival.' },
];

const FAQS = [
  { q: 'Who needs an Aruba ED Card?',     a: 'Every visitor entering Aruba — by air or by sea — must complete an ED Card before arrival, regardless of nationality. It replaced the old paper landing card.' },
  { q: 'Is the ED Card the same as a visa?', a: 'No. The ED Card is an entry/disembarkation declaration required by the Aruba Tourism Authority. Visa requirements depend on your nationality — most travelers from the US, Canada, EU, and UK do not need a separate visa for short tourist stays.' },
  { q: 'How long does processing take?',  a: 'Most ED Cards are approved within minutes. Standard processing completes within 24 hours; rush options are available if you\'re travelling sooner.' },
  { q: 'When should I apply?',            a: 'Within 7 days of your arrival date. Applying earlier than that is not accepted by the Aruba ED Card system.' },
  { q: 'How long is the ED Card valid?',  a: 'It\'s tied to your specific trip — single entry, valid for the dates of your stay (up to 30 days). If you leave and return, you need a new ED Card for the new trip.' },
  { q: 'What if I make a mistake on the form?', a: 'Just reach out — our team can correct most details before submission. After approval, the ED Card is locked to your passport and trip dates, so accuracy matters.' },
];

const VISA_TYPES_INFO = [
  {
    name: 'Aruba ED Card',
    details: [
      { label: 'Purpose',          text: 'The Embarkation/Disembarkation (ED) Card is required by the Aruba Tourism Authority for every traveler entering Aruba by air or sea.' },
      { label: 'When to apply',    text: 'Within 7 days of your arrival date — applying earlier than 7 days isn\'t accepted by the ATA system.' },
      { label: 'Duration',         text: 'Tied to your trip dates. Single entry, valid for the duration of your stay up to a maximum of 30 days.' },
      { label: 'Entries',          text: 'Single entry per ED Card. If you leave and return, you need to apply for a new one for that trip.' },
      { label: 'Ports of entry',   text: 'Accepted at all official Aruba entry points — Queen Beatrix International Airport (AUA) and Aruba seaports.' },
      { label: 'Delivery format',  text: 'An approved ED Card is delivered as a PDF to your inbox. Print or save it on your phone — immigration may scan the QR code on arrival.' },
    ],
  },
];

export default function ArubaPage() {
  const [carouselIdx, setCarouselIdx] = useState(0);

  // Auto-rotate carousel every 5 seconds. 3 slots matches the India
  // page — one beach hero, one flamingo shot, one divi-divi tree.
  useEffect(() => {
    const timer = setInterval(() => setCarouselIdx(prev => (prev + 1) % 3), 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    // Legacy /aruba — original marketing landing at /aruba/legacy.
    // Pinned to the pre-2026 periwinkle palette (var(--blue) = #6C8AFF)
    // via the `.legacy-palette` scope in globals.css. The primary
    // /aruba route lives one directory up and uses the new landing DNA.
    <div className="legacy-palette">
      <Nav countryFlag="🇦🇼" />

      {/* `aruba-theme` scopes the blue hero / section overrides defined
          in globals.css ("ARUBA LANDING PAGE OVERRIDES") without
          touching the india-* layout classes shared with /india. */}
      <main className="aruba-theme">
        {/* ── HERO ── */}
        <section className="india-hero">
          <div className="india-hero-inner">
            <div className="india-hero-carousel">
              {[
                { src: '/aruba-oranjestad.jpg', alt: 'Oranjestad — colourful Dutch-Caribbean architecture and palm-shaded plaza' },
                { src: '/aruba-flamingo.jpg',   alt: 'Pink flamingos wading in turquoise water on Renaissance Island' },
                { src: '/aruba-palm-beach.jpg', alt: 'Aerial view of Palm Beach — hotels, palapa umbrellas, and turquoise water' },
              ].map((img, i) => (
                <img
                  key={img.src}
                  src={img.src}
                  alt={img.alt}
                  className={`india-carousel-img${carouselIdx === i ? ' active' : ''}`}
                />
              ))}
              <div className="india-carousel-dots">
                {[0, 1, 2].map(i => (
                  <button
                    key={i}
                    className={`india-carousel-dot${carouselIdx === i ? ' active' : ''}`}
                    onClick={() => setCarouselIdx(i)}
                  />
                ))}
              </div>
            </div>
            <div className="india-hero-content">
              <h1 className="india-hero-title">
                Apply for your<br />
                <em>Aruba ED Card</em> online
              </h1>
              <p className="india-hero-sub">
                Skip the paperwork. Get your Aruba ED Card approved in minutes.
                Required for every visitor entering One Happy Island by air or sea.
              </p>
              <div className="india-hero-actions">
                <a href="/apply?destination=ARUBA" className="india-cta-btn">Start Application</a>
                <a href="#visa-types" className="india-cta-ghost">Learn More</a>
              </div>
              <div className="india-hero-stats">
                <div className="india-stat"><span className="india-stat-n">100%</span><span className="india-stat-l">Approval Rate</span></div>
                <div className="india-stat"><span className="india-stat-n">Minutes</span><span className="india-stat-l">Avg. Processing</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* ── PROCESS ── */}
        <div className="process-bg">
          <section className="process" id="process">
            <div className="section-eyebrow">How It Works</div>
            <h2 className="section-title">Four steps to your ED Card.</h2>
            <div className="process-grid">
              {STEPS.map(s => (
                <div className="p-step" key={s.n}>
                  <div className="p-step-bar" />
                  <div className="p-step-n">{s.n}</div>
                  <div className="p-step-title">{s.title}</div>
                  <p className="p-step-desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── REQUIREMENTS ── */}
        <section className="india-section india-section-alt">
          <div className="india-section-inner">
            <div className="section-eyebrow">Requirements</div>
            <h2 className="india-section-title">What You&apos;ll Need!</h2>
            <div className="india-req-grid">
              {REQUIREMENTS.map(r => (
                <div key={r.title} className="india-req-card">
                  <span className="india-req-icon" aria-hidden>
                    <r.Icon size={28} strokeWidth={1.75} />
                  </span>
                  <h3 className="india-req-name">{r.title}</h3>
                  <p className="india-req-desc">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ABOUT THE ED CARD ──
         *  Single product, so no left-side tabber — the whole layout
         *  used to be a two-column nav/content split (mirrors India,
         *  which has 5 visa products to switch between). With only the
         *  ED Card to describe, the tabber adds noise; the content
         *  column is rendered standalone here. */}
        <section className="india-section" id="visa-types">
          <div className="india-section-inner">
            <AnimatedSection>
              <h2 className="india-section-title" style={{ textAlign: 'center', marginBottom: '2.5rem' }}>About the Aruba ED Card</h2>
            </AnimatedSection>
            <AnimatedSection delay={0.15}>
              <div className="india-visatypes-content" style={{ maxWidth: '720px', margin: '0 auto' }}>
                <h3 className="india-visatypes-title">{VISA_TYPES_INFO[0].name}</h3>
                {VISA_TYPES_INFO[0].details.map((d, i) => (
                  <p key={i} className="india-visatypes-detail">
                    <strong>{d.label}:</strong> {d.text}
                  </p>
                ))}
                <a href="/apply?destination=ARUBA" className="india-cta-btn" style={{ marginTop: '1.5rem', display: 'inline-block' }}>Apply now →</a>
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="india-section" style={{ textAlign: 'center' }}>
          <div className="india-section-inner">
            <AnimatedSection>
              <h2 className="india-section-title">Common questions</h2>
            </AnimatedSection>
            <div className="india-faq-list" style={{ textAlign: 'left' }}>
              {FAQS.map((f, i) => (
                <AnimatedSection key={i} delay={i * 0.08}>
                  <details className="india-faq">
                    <summary className="india-faq-q">{f.q}</summary>
                    <p className="india-faq-a">{f.a}</p>
                  </details>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="india-cta-section">
          <div className="india-cta-inner">
            <span className="india-cta-flag">🇦🇼</span>
            <h2 className="india-cta-title">Ready to visit Aruba?</h2>
            <p className="india-cta-sub">Start your ED Card application now. Most are approved within minutes.</p>
            <a href="/apply?destination=ARUBA" className="india-cta-btn" style={{ fontSize: '1.05rem', padding: '1rem 2.5rem' }}>Start My Application</a>
          </div>
        </section>

      </main>

      <Footer />
      <ChatWidget />
    </div>
  );
}
