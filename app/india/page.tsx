'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';

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
import Footer from '@/components/Footer';
import ChatWidget from '@/components/ChatWidget';

const VISA_OPTIONS = [
  { id: 'tourist-30',  label: 'Tourist eVisa – 30 days',  entries: 'Double entry',   price: 25, tag: 'Most Popular' },
  { id: 'tourist-1y',  label: 'Tourist eVisa – 1 year',   entries: 'Multiple entry', price: 40, tag: '' },
  { id: 'tourist-5y',  label: 'Tourist eVisa – 5 years',  entries: 'Multiple entry', price: 80, tag: '' },
  { id: 'business-1y', label: 'Business eVisa – 1 year',  entries: 'Multiple entry', price: 80, tag: '' },
  { id: 'medical-60',  label: 'Medical eVisa – 60 days',  entries: 'Triple entry',   price: 25, tag: '' },
];

const REQUIREMENTS = [
  { icon: '📘', title: 'Valid Passport', desc: 'Your passport must be valid for at least 6 months from the date of arrival in India, with at least 2 blank pages available for visa stamps. Damaged or expired passports will not be accepted.' },
  { icon: '📷', title: 'Digital Photo', desc: 'A recent front-facing photograph in JPEG format with a plain white or light background. Must be square dimensions (minimum 350x350px), with no glasses, hats, or shadows. Do not crop a passport photo.' },
  { icon: '📄', title: 'Passport Bio Page', desc: 'A clear, high-quality scan of your passport data page (the page with your photo, name, and passport number). Must be in JPEG or PDF format with all four corners visible and all text clearly readable.' },
  { icon: '✈️', title: 'Travel Details', desc: 'Your confirmed travel dates, port of arrival in India (airport or seaport), and expected departure port. You should also have your accommodation details and a reference contact in India ready.' },
];

const STEPS = [
  { n: '01', title: 'Fill Application', desc: 'Complete the online form with your personal and travel details.' },
  { n: '02', title: 'Upload Documents', desc: 'Submit your passport scan and photo through our secure portal.' },
  { n: '03', title: 'We Process It', desc: 'Our team reviews and submits your application to Indian authorities.' },
  { n: '04', title: 'Receive eVisa', desc: 'Your approved eVisa arrives in your inbox — print and travel.' },
];

const FAQS = [
  { q: 'Who needs an India eVisa?', a: 'Citizens of 150+ countries can apply for an India eVisa. Notable exceptions include Pakistani nationals, who must apply through an Indian embassy.' },
  { q: 'How long does processing take?', a: 'Standard processing takes 3-5 business days. Rush processing is available for 1-2 days, and Super Rush for urgent applications.' },
  { q: 'What is the validity of the Tourist eVisa?', a: 'The 30-day eVisa is valid for 30 days from arrival. The 1-year and 5-year eVisas allow multiple entries with stays up to 90 days per visit.' },
  { q: 'Can I extend my eVisa?', a: 'India eVisas cannot be extended. You would need to apply for a new visa if you wish to stay longer.' },
  { q: 'Which airports accept eVisa?', a: 'India eVisa is accepted at 28 designated airports and 5 seaports, including Delhi, Mumbai, Chennai, Kolkata, Bangalore, and Hyderabad.' },
];

const VISA_TYPES_INFO = [
  {
    name: 'India Tourist eVisa',
    details: [
      { label: 'Purpose', text: 'The India Tourist eVisa is for travelers visiting India for tourism activities like sightseeing, holidays, and visiting family.' },
      { label: 'When to apply', text: "It's recommended to apply at least a week in advance, as processing time is 3-5 working days." },
      { label: 'Duration and extensions', text: 'Depending on the type selected (30 days, 1 year, or 5 years), the visa allows stays of 30 or 90 days per visit and is generally non-extendable.' },
      { label: 'Entries', text: 'The visa is issued as a double entry (30-day visa) or multiple entry (1-year and 5-year visas).' },
      { label: 'Ports of entry', text: 'India e-Tourist visa holders can enter through 31 designated airports (including Delhi, Mumbai, Bengaluru, Chennai, Goa, Kolkata, Hyderabad, Cochin) and 5 major seaports.' },
      { label: 'Delivery format', text: 'An approved eVisa is electronically linked to your passport, but travelers are advised to carry a printed copy of the approval PDF when entering India.' },
    ],
  },
  {
    name: 'India e-Arrival Card',
    details: [
      { label: 'Purpose', text: 'The e-Arrival Card is an electronic version of the traditional arrival/departure card that passengers fill out before landing in India.' },
      { label: 'When to apply', text: 'Should be completed online before your flight to India to speed up immigration processing.' },
      { label: 'Who needs it', text: 'All international travelers arriving in India, regardless of visa type.' },
    ],
  },
  {
    name: 'India Business eVisa',
    details: [
      { label: 'Purpose', text: 'For business activities such as meetings, trade, conferences, recruitment, or establishing industrial/business ventures.' },
      { label: 'Duration', text: 'Valid for 1 year with multiple entries. Each stay cannot exceed 180 days continuously.' },
      { label: 'When to apply', text: 'Apply at least 1-2 weeks before your intended travel date.' },
      { label: 'Requirements', text: 'A letter from the Indian company or organization, along with standard passport and photo requirements.' },
    ],
  },
  {
    name: 'India Medical eVisa',
    details: [
      { label: 'Purpose', text: 'For travelers seeking medical treatment at recognized hospitals and medical centers in India.' },
      { label: 'Duration', text: 'Valid for 60 days from the date of arrival with triple entry.' },
      { label: 'Extensions', text: 'Can be extended for up to 6 months by the Foreigners Regional Registration Office (FRRO).' },
      { label: 'Requirements', text: 'A letter from the hospital in India confirming the medical treatment, along with standard documents.' },
    ],
  },
  {
    name: 'India e-Medical Attendant Visa',
    details: [
      { label: 'Purpose', text: 'For individuals accompanying a patient who holds a Medical eVisa to India. Limited to two attendants per patient.' },
      { label: 'Duration', text: 'Same validity as the associated Medical eVisa — 60 days with triple entry.' },
      { label: 'Requirements', text: "Must reference the patient's Medical eVisa application number." },
    ],
  },
];

export default function IndiaPage() {
  const [activeVisaType, setActiveVisaType] = useState(0);
  const [carouselIdx, setCarouselIdx] = useState(0);

  // Auto-rotate carousel every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => setCarouselIdx(prev => (prev + 1) % 3), 5000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <Nav countryFlag="🇮🇳" />

      <main>
        {/* ── HERO ── */}
        <section className="india-hero">
          <div className="india-hero-inner">
            <div className="india-hero-carousel">
              {[
                { src: '/india-temple.jpg', alt: 'Rishikesh — temples along the Ganges' },
                { src: '/india-taj-mahal.jpg', alt: 'Taj Mahal — Agra' },
                { src: '/india-ellora.jpg', alt: 'Ellora Caves — Maharashtra' },
              ].map((img, i) => (
                <img
                  key={i}
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
                <em>India eVisa</em> online
              </h1>
              <p className="india-hero-sub">
                Skip the embassy. Get your electronic visa approved in as little as 72 hours.
                Tourist, Business &amp; Medical visas available.
              </p>
              <div className="india-hero-actions">
                <a href="/apply" className="india-cta-btn">Start Application</a>
                <a href="#visa-types" className="india-cta-ghost">View Visa Types</a>
              </div>
              <div className="india-hero-stats">
                <div className="india-stat"><span className="india-stat-n">98.7%</span><span className="india-stat-l">Approval Rate</span></div>
                <div className="india-stat"><span className="india-stat-n">72hr</span><span className="india-stat-l">Avg. Processing</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* ── PROCESS ── */}
        <div className="process-bg">
          <section className="process" id="process">
            <div className="section-eyebrow">How It Works</div>
            <h2 className="section-title">Four steps of approval.</h2>
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
                  <span className="india-req-icon">{r.icon}</span>
                  <h3 className="india-req-name">{r.title}</h3>
                  <p className="india-req-desc">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── VISA TYPES ── */}
        <section className="india-section" id="visa-types">
          <div className="india-section-inner">
            <div className="section-eyebrow">Visa Types</div>
            <h2 className="india-section-title">Choose your India eVisa</h2>
            <div className="india-visa-grid">
              {VISA_OPTIONS.map(v => (
                <div key={v.id} className="india-visa-card">
                  {v.tag && <span className="india-visa-tag">{v.tag}</span>}
                  <h3 className="india-visa-name">{v.label}</h3>
                  <div className="india-visa-meta">
                    <span>{v.entries}</span>
                  </div>
                  <div className="india-visa-price">
                    <span className="india-visa-amount">${v.price}</span>
                    <span className="india-visa-per">per person</span>
                  </div>
                  <a href="/apply" className="india-visa-btn">Apply Now</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── VISA TYPES INFO ── */}
        <section className="india-section">
          <div className="india-section-inner">
            <AnimatedSection>
              <h2 className="india-section-title" style={{ textAlign: 'center', marginBottom: '2.5rem' }}>Visa types needed for India</h2>
            </AnimatedSection>
            <AnimatedSection delay={0.15}>
              <div className="india-visatypes-layout">
                <div className="india-visatypes-nav">
                  {VISA_TYPES_INFO.map((v, i) => (
                    <button
                      key={v.name}
                      className={`india-visatypes-btn${activeVisaType === i ? ' active' : ''}`}
                      onClick={() => setActiveVisaType(i)}
                    >
                      <span>{v.name}</span>
                      <span className="india-visatypes-chevron">›</span>
                    </button>
                  ))}
                </div>
                <div className="india-visatypes-content" key={activeVisaType}>
                  <h3 className="india-visatypes-title">{VISA_TYPES_INFO[activeVisaType].name}</h3>
                  {VISA_TYPES_INFO[activeVisaType].details.map((d, i) => (
                    <p key={i} className="india-visatypes-detail">
                      <strong>{d.label}:</strong> {d.text}
                    </p>
                  ))}
                  <a href="/apply" className="india-cta-btn" style={{ marginTop: '1.5rem', display: 'inline-block' }}>Apply now →</a>
                </div>
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
            <span className="india-cta-flag">🇮🇳</span>
            <h2 className="india-cta-title">Ready to visit India?</h2>
            <p className="india-cta-sub">Start your eVisa application now. Most applications are approved within 72 hours.</p>
            <a href="/apply" className="india-cta-btn" style={{ fontSize: '1.05rem', padding: '1rem 2.5rem' }}>Start My Application</a>
          </div>
        </section>

      </main>

      <Footer />
      <ChatWidget />
    </>
  );
}
