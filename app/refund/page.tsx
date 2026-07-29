'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import LandingNav from '@/components/LandingNav';
import LandingFooter from '@/components/LandingFooter';

/**
 * Refund Policy — mirrors the structure of `/privacy` and `/terms`
 * (sticky sidebar TOC on the left, prose sections on the right).
 *
 * The substance here was previously buried inside `/terms` §5
 * ("Refunds"); this page lifts it out into a standalone document so
 * customers who land directly on `/refund` (from the footer link, an
 * email footer, or a chargeback dispute) get the full picture without
 * having to scroll through the whole ToS. The terms page continues to
 * reference the same policy inline, so this stays authoritative — if
 * you edit refund terms, update both places (or delete the /terms
 * copy and link here instead).
 */
const SECTIONS = [
  {
    id: 'overview',
    title: '1. Overview',
    body: `VisaTrips is a visa facilitation service. Because much of what you pay for is time-boxed processing work performed the moment your application is submitted to the destination government, our refund policy is stricter than that of a typical online purchase. This page explains, in plain terms, exactly when a refund is available, when it is not, and how to request one.

This Refund Policy is a binding part of our Terms of Service. If any provision here conflicts with our Terms of Service, the more specific provision in this Refund Policy governs. By placing an order on VisaTrips, you confirm that you have read and accepted these refund terms.`,
  },
  {
    id: 'service-fee',
    title: '2. VisaTrips Service Fee vs. Government Fee',
    body: `Every order is composed of two separate charges, and each has its own refund treatment:

VisaTrips Service Fee: The amount VisaTrips charges to prepare, review, and submit your application on your behalf. This is what we retain for our work.

Government Visa Fee: The fee charged by the destination country's immigration authority. VisaTrips collects this on your behalf and remits it to the government. Once remitted, it is under the government's control, not ours, and its refund treatment is set by that government — not by VisaTrips.

Every rule below applies to the VisaTrips service fee unless we say otherwise. Government fees follow the destination country's rules, which we have no ability to override.`,
  },
  {
    id: 'before-submission',
    title: '3. Cancellations Before Submission',
    body: `If you request a cancellation before your application has been submitted to the immigration authority, you are entitled to a full refund of the VisaTrips service fee.

Government visa fees, if we have already collected them from you, may or may not be refundable depending on the destination country's own policy. We will do our best to secure any refund available under that country's rules and pass it back to you, but we cannot guarantee a refund of government fees that have already been remitted.

To request a pre-submission cancellation, contact our support team at support@visatrips.com immediately, quoting your order number. Time is critical here — once the application enters the submission queue and is transmitted to the government portal, the pre-submission window closes.`,
  },
  {
    id: 'after-submission',
    title: '4. After Submission',
    body: `Once your application has been submitted to the relevant immigration authority, the VisaTrips service fee is non-refundable. This applies regardless of the eventual outcome of your application — approval, rejection, delay, or an indefinite pending status.

The reason is straightforward: at that point the work you paid for has been completed. Our specialists have reviewed your documents, compiled the application, and delivered it to the government. Whether the government grants the visa is a decision entirely outside our control and is not something we can guarantee, refund, or reverse.

Government visa fees are non-refundable in all cases after submission. This is a fixed rule of every destination government we work with, not a VisaTrips policy.`,
  },
  {
    id: 'technical-errors',
    title: '5. Technical Errors on Our Side',
    body: `In the rare event of a confirmed technical error on our part that prevents the successful submission of your application — for example, a bug in our submission pipeline that causes the government portal to reject a valid application, or a document upload that our system corrupted — we will make you whole.

At your discretion, we will either:
• Resubmit the application at no additional charge as soon as the issue is resolved, or
• Issue a full refund of the VisaTrips service fee (and, where possible, the government fee).

To be eligible, the error must be attributable to VisaTrips (not to incorrect information you provided, a document you uploaded incorrectly, or a government-side outage), and you must report it within 48 hours of the expected submission time. Errors reported outside that window may still be reviewed on a case-by-case basis, but the 48-hour window is what we guarantee.`,
  },
  {
    id: 'not-refundable',
    title: '6. Situations That Are Not Eligible for a Refund',
    body: `To avoid disappointment, the following situations do not qualify for a refund of the VisaTrips service fee:

Change of travel plans: If you cancel your trip, change destinations, or no longer need the visa, the service fee is non-refundable once we have begun working on your application.

User-side errors: Misspelled names, wrong passport numbers, incorrect travel dates, uploaded documents that turn out to be for the wrong person, or any other inaccuracy provided by the applicant.

Visa rejections due to incomplete or inaccurate information: We prepare and submit what you provide. If the government rejects the application because of something you got wrong, we cannot refund the fee we already earned reviewing and submitting the application.

Failure to meet the destination country's own visa requirements: Nationality, criminal history, prior travel history, and similar eligibility factors are set by the destination government. Being ineligible is not grounds for a refund.

Change of mind after submission: Buyer's remorse, discovery of a cheaper competitor, or any similar reason is not grounds for a refund once we have submitted the application.

Chargebacks initiated without first contacting us: If you dispute a charge with your card issuer without first raising the issue with VisaTrips support, we reserve the right to contest the chargeback and to suspend or terminate your account.`,
  },
  {
    id: 'pricing-errors',
    title: '7. Pricing Errors on Our Site',
    body: `In the event of a pricing error on our website — for example, a visa listed at $0 or an obviously incorrect price — we reserve the right to cancel the affected order and issue a full refund of any amount charged, even after payment has been processed. In such cases we will notify you promptly and give you the option to re-place the order at the correct price.

This clause protects both parties from good-faith mistakes; it is not a mechanism we use to change prices arbitrarily on orders that were priced correctly at the time of purchase.`,
  },
  {
    id: 'processing',
    title: '8. How Refunds Are Processed',
    body: `Approved refunds are processed within 5 to 10 business days from the date of approval. Refunds are always returned to the original payment method used at checkout — we cannot redirect a refund to a different card, bank account, or wallet, for anti-fraud and reconciliation reasons.

The time it takes for the refund to actually appear in your account depends on your card issuer or bank, and can range from a few business days to a full billing cycle. If more than 15 business days have passed since we notified you of an approved refund and you still do not see it, contact your card issuer first; if they confirm they have no record of the refund, contact us at support@visatrips.com and we will investigate.

For government fee refunds, timing depends on the destination country's treasury system and is entirely outside our control. Some countries process government-fee refunds in weeks; others take months; some do not refund government fees at all.`,
  },
  {
    id: 'how-to-request',
    title: '9. How to Request a Refund',
    body: `To request a refund, email support@visatrips.com with the following:

• Your order number (visible on your confirmation email and on the /status page)
• The full name on the order
• The email address you used at checkout
• A short description of why you are requesting a refund

We respond to refund requests within one business day. If your request qualifies under this policy, we will confirm and initiate the refund on the same call or email. If it does not qualify, we will explain why in writing and, where possible, point you to any alternative we can offer (for example, resubmission credit toward a future application).

Please do not open a chargeback with your card issuer before contacting us. We will always attempt to resolve a legitimate refund request directly, and doing so avoids unnecessary friction on both sides.`,
  },
  {
    id: 'changes',
    title: '10. Changes to This Refund Policy',
    body: `We may update this Refund Policy from time to time to reflect changes in our services, destination-government requirements, or applicable law. When we make material changes, we will update the "Last updated" date at the top of this page and, for changes that affect existing orders, notify affected customers by email.

The version of this policy in effect at the time you placed your order governs that order. Later changes do not retroactively affect refund eligibility for orders that were already paid for under a prior version.`,
  },
  {
    id: 'contact',
    title: '11. Contact',
    body: `For any question about this Refund Policy, or to request a refund, contact our support team:

Support Email: support@visatrips.com
Response time: Within one business day

Please include your order number and the email address used at checkout so we can locate your record quickly. We take refund requests seriously and aim to resolve every case fairly and in accordance with this policy.`,
  },
];

export default function RefundPage() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );
    Object.values(sectionRefs.current).forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = sectionRefs.current[id];
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNav />
      <div className="legal-page">
        <div className="legal-breadcrumb">
          <Link href="/" className="legal-breadcrumb-link">Home</Link>
          <span className="legal-breadcrumb-sep">›</span>
          <span>Refund Policy</span>
        </div>
        <div className="legal-layout">
          <aside className="legal-sidebar">
            <div className="legal-sidebar-card">
              <div className="legal-sidebar-title">On this page</div>
              <ul className="legal-sidebar-list">
                {SECTIONS.map(s => (
                  <li key={s.id}>
                    <button className={`legal-sidebar-btn${activeId === s.id ? ' active' : ''}`} onClick={() => scrollTo(s.id)}>
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="legal-sidebar-card legal-sidebar-contact">
              <div className="legal-sidebar-title">Need a refund?</div>
              <p>Email support with your order number and we&apos;ll respond within one business day.</p>
              <a href="/contact" className="legal-contact-btn">Contact Support</a>
            </div>
          </aside>

          <div className="legal-main">
            <div className="legal-header">
              <div className="legal-eyebrow">Legal</div>
              <h1 className="legal-title">Refund Policy</h1>
              <p className="legal-meta">Last updated: July 7, 2026 · Effective immediately</p>
              <p className="legal-intro">
                Because visa facilitation is a time-boxed service, our refund policy differs from typical
                online purchases. This page explains exactly when a refund is available, when it is not,
                and how to request one.
              </p>
            </div>
            <div className="legal-sections">
              {SECTIONS.map(s => (
                <div key={s.id} id={s.id} className="legal-section" ref={el => { sectionRefs.current[s.id] = el; }}>
                  <h2 className="legal-section-title">{s.title}</h2>
                  {s.body.split('\n\n').map((para, i) => (
                    <p key={i} className="legal-section-body" style={{ marginBottom: '1rem' }}>{para}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <LandingFooter showTrust={false} />
    </div>
  );
}
