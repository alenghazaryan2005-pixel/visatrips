'use client';

import Nav          from '@/components/Nav';
import Footer       from '@/components/Footer';
import VisaSelector from '@/components/VisaSelector';

/* ── Country data ─────────────────────────────────────────────────────────── */

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
  { code: 'KR', flag: '🇰🇷', name: 'South Korea' },
  { code: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: 'TR', flag: '🇹🇷', name: 'Turkey' },
];

const DESTINATIONS = [
  { code: 'IN', flag: '🇮🇳', name: 'India',  tag: 'Popular', region: 'Asia'     },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil', tag: '',        region: 'Americas' },
];

/* ── Static data ─────────────────────────────────────────────────────────── */

const SERVICES = [
  {
    idx:  '01',
    name: 'Tourist Visa',
    desc: 'Explore the world without paperwork stress. We manage all entry requirements and documentation for leisure travel, worldwide.',
    chip: 'Travel & Leisure',
  },
  {
    idx:  '02',
    name: 'Business Visa',
    desc: 'Meetings, conferences, deals — we make sure you arrive on time and in compliance. Zero delays, full preparation.',
    chip: 'Corporate',
  },
  {
    idx:  '03',
    name: 'Student Visa',
    desc: 'Begin your academic chapter abroad. Our specialists walk students through every permit requirement, step by step.',
    chip: 'Education',
  },
  {
    idx:  '04',
    name: 'Work Visa',
    desc: 'Secure your employment authorization abroad with properly verified documents and full regulatory compliance.',
    chip: 'Employment',
  },
];

const STEPS = [
  { n: '01', title: 'Pick Your Visa',      desc: "Select the correct visa category. We guide you through eligibility so there's no confusion upfront." },
  { n: '02', title: 'Upload Documents',    desc: 'Submit your files through our encrypted portal. Our team reviews everything for accuracy before we proceed.' },
  { n: '03', title: 'We Submit & Track',   desc: 'We send your application to the relevant authorities and monitor its status in real time on your behalf.' },
  { n: '04', title: 'Receive Your Visa',   desc: 'Your approved e-visa lands directly in your inbox — ready to travel, no office visit required.' },
];

const TRUST_CELLS = [
  { icon: '🔒', title: 'Bank-Grade Security',     desc: 'Your documents are encrypted in transit and at rest. Full GDPR compliance.' },
  { icon: '📋', title: 'Regulatory Compliance',   desc: "We stay current with every country's visa requirements so you don't have to." },
  { icon: '🌐', title: '80+ Countries',            desc: 'Wide coverage across Europe, Asia, Americas, and the Middle East.' },
  { icon: '🕐', title: '24/7 Support',             desc: 'Real humans available around the clock for urgent questions and updates.' },
];

const STATS = [
  { n: '50K+',  l: 'Visas Processed' },
  { n: '98.7%', l: 'Approval Rate'   },
  { n: '72hr',  l: 'Avg. Processing' },
  { n: '80+',   l: 'Countries Served'},
];

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Home() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Nav />

      <main id="main-content">

        {/* ── HERO ── */}
        <section className="hero">
          <div className="hero-image-wrap">
            <img
              src="/man-with-luggage.png"
              alt="Traveller with luggage"
              className="hero-image"
            />
          </div>
          <div className="hero-right">
            <div className="hero-tag">Official E-Visa Service</div>
            <h1 className="hero-headline">
              Travel further.<br />
              Wait <em>less.</em><br />
              Worry never.
            </h1>
            <p className="hero-sub">
              VisaTrips handles your entire electronic visa application — document checks,
              submission, and tracking — so you just show up.
            </p>

            <VisaSelector
              passportCountries={PASSPORT_COUNTRIES}
              destinationCountries={DESTINATIONS}
            />

          </div>
        </section>

        {/* ── TRUST ── */}
        <section className="trust">
          <div className="trust-left">
            <div className="section-eyebrow">Why VisaTrips</div>
            <h2 className="section-title">
              Built for people<br />who can&apos;t afford<br /><em>to wait.</em>
            </h2>
            <p>
              We combine strict compliance standards with an experience designed around your
              time. No chasing, no confusion, no guesswork.
            </p>
          </div>
          <div className="trust-right">
            {TRUST_CELLS.map((c) => (
              <div className="trust-cell" key={c.title}>
                <div className="trust-icon">{c.icon}</div>
                <div className="trust-cell-title">{c.title}</div>
                <p className="trust-cell-desc">{c.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── SERVICES ── */}
        <section className="services" id="services">
          <div className="section-header">
            <div>
              <div className="section-eyebrow">What We Offer</div>
              <h2 className="section-title">
                Four visa types.<br /><em>One smooth process.</em>
              </h2>
            </div>
          </div>

          <div>
            {SERVICES.map((s) => (
              <div className="svc-row" key={s.idx}>
                <div className="svc-idx">{s.idx}</div>
                <div className="svc-name">{s.name}</div>
                <div className="svc-desc">{s.desc}</div>
                <div className="svc-chip">{s.chip}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── STATS ── */}
        <div className="hero-bottom">
          <div className="hero-bottom-inner">
            {STATS.map((s) => (
              <div className="h-stat" key={s.l}>
                <div className="h-stat-n">{s.n}</div>
                <div className="h-stat-l">{s.l}</div>
              </div>
            ))}
          </div>
        </div>


        {/* ── PROCESS ── */}
        <div className="process-bg">
          <section className="process" id="process">
            <div className="section-eyebrow">How It Works</div>
            <h2 className="section-title">Four steps of approval.</h2>
            <div className="process-grid">
              {STEPS.map((s) => (
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

        {/* ── CTA ── */}
        <div className="cta-bg">
          <section className="cta" id="apply">
            <div className="cta-eyebrow">Ready to begin?</div>
            <h2>Your visa.<br /><em>Done right.</em></h2>
            <div className="cta-actions">
              <a href="/apply" className="btn-cta-main">Start My Application</a>
              <a href="/contact" className="btn-cta-ghost">Talk to Us</a>
            </div>
          </section>
        </div>

      </main>

      <Footer />
    </>
  );
}
