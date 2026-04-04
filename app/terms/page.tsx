'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';

const SECTIONS = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    body: `By accessing, browsing, or using any part of the VisaTrips website or services — including submitting a visa application, creating an account, or making a payment — you confirm that you have read, fully understood, and agree to be legally bound by these Terms of Service, along with our Privacy Policy and any additional terms referenced herein.

These Terms apply to all users of the platform, including visitors, registered users, and paying customers. If you are using our services on behalf of a company or other legal entity, you represent that you have the authority to bind that entity to these Terms, and the term "you" shall refer to that entity.

If you do not agree with any part of these Terms, you must immediately discontinue your use of our services. We reserve the right to update, modify, or replace any part of these Terms at any time without prior notice. Changes become effective immediately upon posting. Your continued use of the platform after any changes have been posted constitutes your binding acceptance of the revised Terms. We encourage you to review this page periodically.`,
  },
  {
    id: 'services',
    title: '2. Description of Services',
    body: `VisaTrips is a private third-party visa facilitation service. We assist individuals in preparing, reviewing, and submitting electronic visa (eVisa) applications to the relevant government immigration authorities on their behalf. Our services include, but are not limited to:

• Application preparation and review — We help ensure that your application form is correctly completed and that your documents are organized and formatted as required by the destination country's immigration authority.

• Document verification — Our team reviews submitted documents for completeness and accuracy before submission. This review is advisory and does not constitute a legal opinion or guarantee of visa approval.

• Application submission — We submit completed applications to the appropriate government portals or authorities on your behalf.

• Status tracking — We monitor the progress of your application and notify you of updates as they become available.

• Customer support — Our team is available to answer questions throughout the application process.

VisaTrips is not a government agency, embassy, consulate, or official immigration authority. We have no influence over visa approval decisions, which are made exclusively by the destination country's immigration authority. Our role is strictly that of a facilitation and preparation service. Any references to processing times or approval rates on our website are based on historical data and do not constitute a guarantee.`,
  },
  {
    id: 'eligibility',
    title: '3. Eligibility and Account Registration',
    body: `To use VisaTrips's services, you must be at least 18 years of age. If you are under 18, you may only use the service under the supervision of a parent or legal guardian who agrees to be bound by these Terms on your behalf.

When creating an account or submitting an application, you agree to:

• Provide accurate, current, and complete information about yourself and any co-travelers.
• Maintain and promptly update your information to keep it accurate and complete.
• Keep your login credentials confidential and not share them with any third party.
• Notify us immediately at support@visatrips.com if you suspect any unauthorized use of your account.

You are fully responsible for all activities that occur under your account. VisaTrips reserves the right to suspend or terminate accounts that provide false information, violate these Terms, or engage in any activity that we determine, in our sole discretion, to be harmful to other users, third parties, or our platform.`,
  },
  {
    id: 'responsibilities',
    title: '4. User Responsibilities and Conduct',
    body: `You are solely and entirely responsible for the accuracy and completeness of all information submitted through our platform. This includes all personal details, passport information, travel dates, and supporting documentation.

By using our services, you expressly agree to:

• Submit only truthful, accurate, and complete information. Submitting false, forged, altered, or misleading documents is illegal and may result in immediate rejection of your visa application, a permanent ban from the destination country, criminal prosecution under applicable immigration laws, and termination of your VisaTrips account without refund.

• Ensure that your passport and any other travel documents are valid for the required period beyond your intended travel dates, as required by the destination country.

• Review all application materials carefully before authorizing submission. Once submitted, applications cannot be recalled or amended.

• Comply with all applicable laws and regulations of both your home country and the destination country.

• Use the platform only for lawful purposes and not to facilitate immigration fraud, human trafficking, or any other illegal activity.

VisaTrips reserves the right to refuse service to any user at any time, with or without cause.`,
  },
  {
    id: 'fees',
    title: '5. Fees, Pricing, and Payments',
    body: `VisaTrips charges a service fee for the preparation, review, and submission of visa applications. This fee is separate from any government-mandated visa fees, which may be charged directly by the immigration authority or included in your total depending on the destination country.

All prices are displayed in US Dollars (USD) unless otherwise stated. Prices are subject to change at any time, but changes will not affect applications that have already been paid for and submitted.

By providing your payment information, you authorize VisaTrips to charge the full service fee to your nominated payment method at the time of checkout. Payments are processed securely by our third-party payment processor using industry-standard encryption.

If a payment is declined, you may be asked to provide an alternative payment method. We are not responsible for any fees, charges, or penalties imposed by your bank or card issuer in connection with payments made to us.

In the event of a pricing error on our website, we reserve the right to cancel an order placed at an incorrect price and issue a full refund, even after the payment has been processed.`,
  },
  {
    id: 'refunds',
    title: '6. Refund and Cancellation Policy',
    body: `Due to the nature of visa application services, our refund policy is as follows:

Before Submission: If you request a cancellation before your application has been submitted to the immigration authority, you are entitled to a full refund of the VisaTrips service fee. Government visa fees, if already collected, may not be refundable depending on the destination country's policy. To request a pre-submission cancellation, contact our support team at support@visatrips.com immediately.

After Submission: Once your application has been submitted to the relevant immigration authority, the VisaTrips service fee is non-refundable. This applies regardless of whether your visa is approved, rejected, or still pending. Government fees are non-refundable in all cases.

Technical Errors: In the rare event of a confirmed technical error on our part that prevents the successful submission of your application, we will either resubmit the application at no additional charge or issue a full refund at your discretion. Such errors must be reported within 48 hours of the expected submission time.

Refund Processing: Approved refunds will be processed within 5–10 business days to the original payment method.

VisaTrips does not offer refunds for user errors, change of travel plans, or visa rejections caused by incomplete or inaccurate information provided by the applicant.`,
  },
  {
    id: 'processing',
    title: '7. Processing Times and Delivery',
    body: `VisaTrips targets a standard processing time of approximately 72 hours for most applications. This represents the time from when we receive all required information and documents to when we submit your completed application to the immigration authority. It does not include the time the government authority takes to process and issue the visa.

Processing times may be extended due to:

• High volume of applications during peak travel seasons.
• Incomplete or unclear documentation requiring follow-up with the applicant.
• Delays on the part of the government immigration authority.
• Public holidays in the destination country or in our processing centers.
• Additional security checks or requests for supplementary information from the authority.

Once your visa has been approved and issued by the immigration authority, it will be delivered to the email address you provided at the time of application. It is your responsibility to ensure your email address is correct and that your inbox is accessible. VisaTrips is not responsible for non-delivery caused by incorrect email addresses, spam filters, or full inboxes.

VisaTrips is not liable for any financial loss, missed travel, or other damages resulting from processing delays, whether caused by us or by the immigration authority.`,
  },
  {
    id: 'liability',
    title: '8. Disclaimers and Limitation of Liability',
    body: `VisaTrips provides its services on an "as is" and "as available" basis without any warranties of any kind, either express or implied. We do not warrant that our services will be uninterrupted, error-free, or free from viruses or other harmful components.

To the fullest extent permitted by applicable law:

• VisaTrips does not guarantee that any visa application submitted through our platform will be approved. Visa approval is exclusively at the discretion of the relevant immigration authority.

• VisaTrips is not responsible for any loss, damage, or injury arising from a visa rejection, regardless of the reason for rejection.

• VisaTrips's total cumulative liability to you for all claims arising from or related to your use of our services shall not exceed the total service fees you paid for the specific application in question.

• In no event shall VisaTrips be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, including but not limited to loss of profits, loss of data, loss of goodwill, business interruption, or any other intangible losses.

Some jurisdictions do not allow the exclusion or limitation of certain warranties or liability. In such jurisdictions, our liability is limited to the maximum extent permitted by law.`,
  },
  {
    id: 'ip',
    title: '9. Intellectual Property',
    body: `All content on the VisaTrips platform — including but not limited to text, graphics, logos, icons, images, audio clips, digital downloads, data compilations, and software — is the exclusive property of VisaTrips or its content suppliers and is protected by applicable copyright, trademark, and intellectual property laws.

You are granted a limited, non-exclusive, non-transferable, revocable license to access and use our platform solely for personal, non-commercial purposes in connection with our services. This license does not include the right to:

• Reproduce, duplicate, copy, sell, resell, or exploit any portion of our platform.
• Use data mining, robots, scraping, or similar data gathering and extraction tools.
• Frame or mirror any part of our platform without our prior written consent.
• Use our trademarks, service marks, or logos without our express written permission.

Any unauthorized use of our intellectual property is strictly prohibited and may result in legal action. If you believe your intellectual property has been infringed upon by content on our platform, please contact us at legal@visatrips.com.`,
  },
  {
    id: 'privacy',
    title: '10. Privacy and Data Protection',
    body: `Your privacy is important to us. The collection, use, and protection of your personal information is governed by our Privacy Policy, which is incorporated into these Terms of Service by this reference. By using our services, you consent to the collection and use of your personal information as described in our Privacy Policy.

We collect personal information such as your name, passport details, date of birth, email address, and payment information solely for the purpose of providing our visa facilitation services. This information may be shared with relevant government immigration authorities as required to process your visa application.

We do not sell, rent, or trade your personal information to third parties for marketing purposes. We implement industry-standard technical and organizational security measures to protect your data from unauthorized access, disclosure, or destruction.

You have the right to access, correct, or request deletion of your personal data at any time, subject to legal obligations. Please refer to our full Privacy Policy for detailed information about your rights and how to exercise them.`,
  },
  {
    id: 'thirdparty',
    title: '11. Third-Party Services and Links',
    body: `Our platform may contain links to third-party websites, applications, or services that are not owned or controlled by VisaTrips. These links are provided for your convenience only. We have no control over, and assume no responsibility for, the content, privacy policies, or practices of any third-party websites or services.

We strongly advise you to read the terms of service and privacy policy of any third-party site you visit. Our inclusion of a link to a third-party site does not imply any endorsement, sponsorship, or recommendation of that site or its operators.

We use third-party service providers for specific functions including payment processing, cloud storage, email delivery, and customer support tools. These providers are bound by confidentiality agreements and are only permitted to use your data to the extent necessary to perform their contracted services.`,
  },
  {
    id: 'termination',
    title: '12. Termination',
    body: `VisaTrips reserves the right, in its sole discretion, to suspend or permanently terminate your access to our platform and services at any time, with or without notice, for any reason, including but not limited to:

• Violation of any provision of these Terms of Service.
• Submission of fraudulent, forged, or misrepresenting information.
• Engaging in conduct that is harmful, threatening, or abusive toward other users or our staff.
• Attempting to gain unauthorized access to any part of our systems.
• Any activity that we believe, in our sole judgment, violates applicable laws or regulations.

Upon termination, your right to use the platform immediately ceases. Any outstanding applications that have already been submitted to the immigration authority will continue to be processed, but no refunds will be issued for the service fee unless the termination was caused by our error.

Provisions of these Terms that by their nature should survive termination — including ownership provisions, warranty disclaimers, indemnity obligations, and limitations of liability — shall remain in full force and effect.`,
  },
  {
    id: 'law',
    title: '13. Governing Law and Dispute Resolution',
    body: `These Terms of Service and any disputes arising from them shall be governed by and construed in accordance with applicable law, without regard to conflict of law principles.

In the event of any dispute, claim, or controversy arising out of or relating to these Terms or the use of our services, the parties agree to first attempt to resolve the matter through good-faith negotiation for a period of at least 30 days before pursuing formal proceedings.

If a dispute cannot be resolved through negotiation, it shall be submitted to binding arbitration in accordance with applicable arbitration rules. The arbitration shall be conducted on a confidential basis. You agree to waive any right to a jury trial, and you agree to participate in arbitration only in your individual capacity, not as a plaintiff or class member in any class action or representative proceeding.

Nothing in this section prevents either party from seeking injunctive or other equitable relief from a court of competent jurisdiction to prevent the actual or threatened infringement, misappropriation, or violation of intellectual property rights or confidential information.`,
  },
  {
    id: 'contact',
    title: '14. Contact Information',
    body: `If you have any questions, concerns, or requests relating to these Terms of Service, please contact our legal team:

Email: legal@visatrips.com
Response time: Within 2 business days

For general customer support inquiries:
Email: support@visatrips.com
Response time: Within 24 hours

For privacy-related concerns:
Email: privacy@visatrips.com
Response time: Within 5 business days

We are committed to addressing your concerns promptly and transparently. When contacting us, please include your full name, application reference number (if applicable), and a clear description of your inquiry so that we can assist you as efficiently as possible.`,
  },
];

export default function TermsPage() {
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
    <>
      <Nav />
      <div className="legal-page">
        <div className="legal-breadcrumb">
          <Link href="/" className="legal-breadcrumb-link">Home</Link>
          <span className="legal-breadcrumb-sep">›</span>
          <span>Terms of Service</span>
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
              <div className="legal-sidebar-title">Questions?</div>
              <p>Our legal team is happy to clarify anything in these terms.</p>
              <a href="/contact" className="legal-contact-btn">Contact Us</a>
            </div>
          </aside>

          <div className="legal-main">
            <div className="legal-header">
              <div className="legal-eyebrow">Legal</div>
              <h1 className="legal-title">Terms of Service</h1>
              <p className="legal-meta">Last updated: March 21, 2026 · Effective immediately</p>
              <p className="legal-intro">
                These Terms of Service govern your use of VisaTrips's visa facilitation platform and services.
                Please read them carefully. By using our services, you agree to be bound by these terms in their entirety.
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
    </>
  );
}
