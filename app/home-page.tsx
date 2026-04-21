'use client';

import { useState } from 'react';
import Nav          from '@/components/Nav';
import Footer       from '@/components/Footer';
import LegalModal   from '@/components/LegalModal';
import VisaSelector from '@/components/VisaSelector';
import ChatWidget from '@/components/ChatWidget';

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
  // Popular
  { code: 'TR', flag: '🇹🇷', name: 'Turkey',         tag: 'Popular', region: 'Asia' },
  { code: 'TH', flag: '🇹🇭', name: 'Thailand',        tag: 'Popular', region: 'Asia' },
  { code: 'JP', flag: '🇯🇵', name: 'Japan',           tag: 'Popular', region: 'Asia' },
  { code: 'AE', flag: '🇦🇪', name: 'UAE',             tag: 'Popular', region: 'Middle East' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia',       tag: 'Popular', region: 'Oceania' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom',  tag: 'Popular', region: 'Europe' },
  // Asia
  { code: 'IN', flag: '🇮🇳', name: 'India',           tag: '',        region: 'Asia' },
  { code: 'VN', flag: '🇻🇳', name: 'Vietnam',         tag: '',        region: 'Asia' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore',       tag: '',        region: 'Asia' },
  { code: 'ID', flag: '🇮🇩', name: 'Indonesia',       tag: '',        region: 'Asia' },
  // Middle East
  { code: 'EG', flag: '🇪🇬', name: 'Egypt',           tag: '',        region: 'Middle East' },
  // Europe
  { code: 'DE', flag: '🇩🇪', name: 'Germany',         tag: '',        region: 'Europe' },
  { code: 'FR', flag: '🇫🇷', name: 'France',          tag: '',        region: 'Europe' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal',        tag: '',        region: 'Europe' },
  // Africa
  { code: 'KE', flag: '🇰🇪', name: 'Kenya',           tag: '',        region: 'Africa' },
  { code: 'MA', flag: '🇲🇦', name: 'Morocco',         tag: '',        region: 'Africa' },
  // Americas
  { code: 'CA', flag: '🇨🇦', name: 'Canada',          tag: '',        region: 'Americas' },
  { code: 'US', flag: '🇺🇸', name: 'United States',   tag: '',        region: 'Americas' },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil',          tag: '',        region: 'Americas' },
  // Oceania
  { code: 'NZ', flag: '🇳🇿', name: 'New Zealand',     tag: '',        region: 'Oceania' },
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
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [termsOpen,   setTermsOpen]   = useState(false);

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
            <h2 className="section-title">Four steps to <em>approved.</em></h2>
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
            <div className="cta-bg-text" aria-hidden="true">GO</div>
            <div className="cta-eyebrow">Ready to begin?</div>
            <h2>Your visa.<br /><em>Done right.</em></h2>
            <div className="cta-actions">
              <a href="/apply" className="btn-cta-main">Start My Application</a>
              <a href="#" className="btn-cta-ghost">Talk to Us</a>
            </div>
          </section>
        </div>

      </main>

      <Footer />
      <ChatWidget />

      {/* ── PRIVACY MODAL ── */}
      <LegalModal
        title="Privacy Policy"
        footer="Last updated: March 2026 · Questions? Contact privacy@visatrips.com"
        isOpen={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
      >
        <h4>1. Information We Collect</h4>
        <p>We collect personal information you provide when applying for a visa, including your full name, date of birth, passport details, nationality, contact information, and travel history. We may also collect technical data such as your IP address and browser type when you use our website.</p>
        <h4>2. How We Use Your Information</h4>
        <p>Your information is used solely to process your e-visa application, communicate updates regarding your application status, and comply with legal obligations. We do not use your data for marketing purposes without your explicit consent.</p>
        <h4>3. Data Sharing</h4>
        <p>We share your personal data only with the relevant immigration authorities and government bodies required to process your visa application. We do not sell, rent, or trade your personal information to third parties.</p>
        <h4>4. Data Security</h4>
        <p>All data is encrypted in transit using TLS and stored on secure, certified servers. We follow GDPR guidelines and industry best practices to ensure your information is protected at every stage of the process.</p>
        <h4>5. Data Retention</h4>
        <p>We retain your application data for up to 5 years in accordance with immigration record-keeping requirements. You may request deletion of your data at any time by contacting our support team, subject to legal constraints.</p>
        <h4>6. Your Rights</h4>
        <p>You have the right to access, correct, or delete your personal data. You may also request a copy of the data we hold about you. To exercise these rights, please contact us at privacy@visatrips.com.</p>
        <h4>7. Changes to This Policy</h4>
        <p>We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated revision date. Continued use of our services constitutes acceptance of the revised policy.</p>
      </LegalModal>

      {/* ── TERMS MODAL ── */}
      <LegalModal
        title="Terms of Service"
        footer="Last updated: March 2026 · Questions? Contact legal@visatrips.com"
        isOpen={termsOpen}
        onClose={() => setTermsOpen(false)}
      >
        <h4>1. Acceptance of Terms</h4>
        <p>By using VisaTrips&apos;s services, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our platform. We reserve the right to update these terms at any time with notice provided on this page.</p>
        <h4>2. Our Services</h4>
        <p>VisaTrips provides electronic visa application assistance services. We act as a processing intermediary and are not a government body. Visa approval is at the sole discretion of the relevant immigration authority. We do not guarantee approval of any application.</p>
        <h4>3. User Responsibilities</h4>
        <p>You are responsible for providing accurate, complete, and truthful information in your application. Submitting false or misleading information may result in rejection of your application and may constitute a violation of immigration law. VisaTrips is not liable for rejections resulting from inaccurate submissions.</p>
        <h4>4. Fees &amp; Refunds</h4>
        <p>Our service fees cover application preparation, review, and submission. These fees are non-refundable once your application has been submitted to the relevant authority. Government visa fees, where applicable, are separate and also non-refundable.</p>
        <h4>5. Processing Times</h4>
        <p>While we aim for a 72-hour average processing time, this is an estimate and not a guarantee. Processing times may vary based on government authority workloads, missing documentation, or other factors outside our control.</p>
        <h4>6. Limitation of Liability</h4>
        <p>VisaTrips&apos;s liability is limited to the service fees paid for the specific application in question. We are not responsible for travel costs, losses, or damages arising from visa delays, rejections, or errors outside our direct control.</p>
        <h4>7. Governing Law</h4>
        <p>These Terms of Service are governed by applicable law. Any disputes shall be resolved through binding arbitration or in the courts of the jurisdiction in which VisaTrips operates.</p>
      </LegalModal>
    </>
  );
}
