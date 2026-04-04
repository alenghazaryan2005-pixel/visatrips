'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';

const SECTIONS = [
  {
    id: 'intro',
    title: '1. Introduction',
    body: `VisaTrips ("we," "our," or "us") is committed to protecting your privacy and handling your personal information with care, transparency, and respect. This Privacy Policy explains in detail what personal data we collect, why we collect it, how we use and protect it, who we share it with, and what rights you have over your information.

This policy applies to all personal data we process in connection with your use of the VisaTrips website, mobile interfaces, and visa facilitation services. It applies whether you are a first-time visitor, a registered user, or a paying customer who has submitted a visa application through our platform.

By using our services or providing your personal information to us, you acknowledge that you have read and understood this Privacy Policy. If you do not agree with our practices, please discontinue your use of our platform. If you have questions at any point, you can reach our privacy team at privacy@visatrips.com.`,
  },
  {
    id: 'collect',
    title: '2. Information We Collect',
    body: `We collect personal information in several ways depending on how you interact with our platform.

Information You Provide Directly:
When you create an account, submit a visa application, or contact our support team, you may provide us with: your full legal name, date of birth, gender, nationality and country of residence, passport number and expiration date, email address and phone number, travel dates and destination country, billing name and payment details, and supporting documentation such as photos, travel itineraries, or proof of accommodation.

Information We Collect Automatically:
When you use our website, we may automatically collect certain technical information, including: your IP address and approximate geographic location, browser type and version, operating system, pages visited and time spent on each, referring URLs, device identifiers, and session and interaction data via cookies and similar technologies.

Information From Third Parties:
In some cases, we may receive information about you from third parties, such as identity verification providers, payment processors, or government immigration systems, to the extent necessary to process your application or verify your identity.`,
  },
  {
    id: 'use',
    title: '3. How We Use Your Information',
    body: `We use the personal information we collect for the following specific purposes:

Visa Application Processing: The primary purpose for which we collect your data is to prepare, review, and submit your visa application to the relevant immigration authority. This includes organizing your documents, completing application forms accurately, and communicating with you throughout the process.

Account Management: If you have created an account, we use your information to manage your account, authenticate your identity when you log in, and allow you to view your application history.

Communication: We use your email address to send you application status updates, confirmation of payments, notifications about document issues or requests for additional information, and responses to your support inquiries.

Payment Processing: We use your billing information solely to process payments for our services. This is handled by a PCI-DSS compliant third-party payment processor; we do not store your full card details on our servers.

Service Improvement: We analyze aggregated, anonymized usage data to understand how our platform is being used, identify technical issues, and continuously improve our services. This analysis does not involve your personally identifiable information.

Legal Compliance: We may use or disclose your information as required to comply with applicable laws, regulations, legal proceedings, court orders, or requests from government authorities.

Fraud Prevention: We use certain data points to detect and prevent fraudulent activity, unauthorized access, and other harmful conduct on our platform.

We do not use your personal data for targeted advertising, and we do not sell your data to any third party for marketing purposes.`,
  },
  {
    id: 'legal-basis',
    title: '4. Legal Basis for Processing',
    body: `Where applicable data protection laws (such as the GDPR) require us to identify a legal basis for processing your personal data, we rely on the following:

Contractual Necessity: Much of the personal data we process is necessary to fulfill the contract between you and VisaTrips — specifically, to provide you with the visa facilitation services you have purchased. Without this data, we cannot perform the service.

Legal Obligation: In some cases, we are required by law to process your data — for example, maintaining records for tax compliance, responding to lawful government requests, or complying with anti-money-laundering regulations.

Legitimate Interests: We process some data on the basis of our legitimate interests, such as improving our platform, preventing fraud, and ensuring the security of our systems, provided that these interests are not overridden by your rights and interests.

Consent: For optional processing activities such as sending you promotional communications or using non-essential cookies, we rely on your explicit consent, which you may withdraw at any time.`,
  },
  {
    id: 'sharing',
    title: '5. How We Share Your Information',
    body: `We share your personal information only in the following limited circumstances:

Government Immigration Authorities: We share your personal data with the official immigration authority of the destination country for the sole purpose of processing your visa application. This sharing is fundamental to the service we provide and cannot be avoided.

Third-Party Service Providers: We work with carefully selected third-party vendors who provide services on our behalf, including payment processing, cloud infrastructure and data storage, email and communication services, identity verification, and customer support tools. These providers are bound by strict contractual obligations to protect your data and use it only for the purposes we specify.

Legal and Regulatory Disclosures: We may disclose your information if required to do so by law, regulation, court order, or governmental authority, or if we believe in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others.

Business Transfers: In the event of a merger, acquisition, sale of assets, or restructuring of our business, your information may be transferred to the acquiring entity. We will notify you and provide choices in such circumstances to the extent required by applicable law.

We never sell, rent, lease, or otherwise monetize your personal data to third parties for their own marketing or business purposes.`,
  },
  {
    id: 'security',
    title: '6. Data Security',
    body: `We take the security of your personal information very seriously and have implemented comprehensive technical and organizational measures to protect it against unauthorized access, loss, alteration, or destruction.

Technical Safeguards:
All data transmitted between your browser and our servers is encrypted using TLS (Transport Layer Security) with a minimum of 128-bit encryption. Data stored on our servers is encrypted at rest using AES-256 encryption. Access to personal data is restricted to authorized employees and contractors on a strict need-to-know basis. All access is logged and monitored.

Organizational Safeguards:
Our employees and contractors who handle personal data receive regular training on data protection and privacy best practices. We conduct periodic security audits and vulnerability assessments. We have incident response procedures in place to address any security breaches promptly and effectively.

Payment Security:
We do not store complete credit card numbers on our servers. All payment transactions are processed through a PCI-DSS Level 1 certified payment processor. We receive only a tokenized reference to your payment method.

Limitations:
While we implement industry-leading security practices, no method of electronic storage or transmission over the internet is completely secure. We cannot guarantee absolute security, but we are committed to promptly notifying you and the relevant authorities in the event of any confirmed data breach that affects your personal information, as required by applicable law.`,
  },
  {
    id: 'retention',
    title: '7. Data Retention',
    body: `We retain your personal information only for as long as is necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law.

Specifically:

Application Data: Information related to your visa application — including your personal details, passport information, and application documents — is retained for a minimum of 5 years following the date of application. This retention period is based on immigration record-keeping requirements and potential legal claims.

Account Data: If you have a registered account, your account information is retained for as long as your account is active. If you delete your account, we will remove your personal data within 30 days, except where retention is required for legal or regulatory purposes.

Payment Records: Transaction records are retained for 7 years in accordance with financial record-keeping obligations.

Communication Records: Records of support interactions and communications are retained for 2 years following the last contact.

Anonymized Data: We may retain anonymized and aggregated data indefinitely for analytical and statistical purposes, as this data does not identify you personally.

When personal data is no longer required, we securely delete or anonymize it in accordance with our data disposal procedures.`,
  },
  {
    id: 'cookies',
    title: '8. Cookies and Tracking Technologies',
    body: `We use cookies and similar tracking technologies on our website to provide a better user experience and to understand how our platform is being used.

Types of Cookies We Use:

Essential Cookies: These are necessary for the website to function properly. They enable core features such as session management, authentication, and security. You cannot opt out of essential cookies without disabling the website's basic functionality.

Functional Cookies: These cookies remember your preferences and settings, such as your language preference or the country you previously selected, to provide a more personalized experience.

Analytical Cookies: We use tools such as anonymized analytics services to understand how visitors navigate our site, which pages are most visited, and where users encounter difficulties. This helps us improve our platform. All analytical data is aggregated and anonymized.

You can control and manage cookie settings through your browser preferences. Most browsers allow you to refuse all cookies, accept only certain types, or delete existing cookies. Please note that disabling certain cookies may affect the functionality of our website. Instructions for managing cookies are available in your browser's help documentation.

We do not use cookies for cross-site behavioral tracking or third-party advertising purposes.`,
  },
  {
    id: 'rights',
    title: '9. Your Privacy Rights',
    body: `Depending on your location and applicable data protection laws, you may have the following rights with respect to your personal data:

Right of Access: You have the right to request a copy of the personal data we hold about you, along with information about how it is processed.

Right to Rectification: If any personal data we hold about you is inaccurate or incomplete, you have the right to request that we correct it.

Right to Erasure ("Right to Be Forgotten"): You may request that we delete your personal data where there is no compelling reason for us to continue processing it, subject to certain exceptions including our legal obligations.

Right to Restriction: You may request that we restrict the processing of your personal data in certain circumstances, for example while a dispute about its accuracy is being resolved.

Right to Data Portability: Where processing is based on your consent or on a contract, you have the right to receive your data in a structured, machine-readable format and to have it transferred to another controller where technically feasible.

Right to Object: You have the right to object to processing based on legitimate interests or for direct marketing purposes.

Right to Withdraw Consent: Where we process your data based on your consent, you may withdraw that consent at any time without affecting the lawfulness of processing based on consent before withdrawal.

To exercise any of these rights, please contact our privacy team at privacy@visatrips.com with your full name, email address, and a description of your request. We will respond within 30 days. We may need to verify your identity before fulfilling your request.`,
  },
  {
    id: 'transfers',
    title: '10. International Data Transfers',
    body: `VisaTrips operates globally and may transfer your personal data to countries outside your country of residence, including countries that may have different data protection standards than your own.

In particular, your data will necessarily be transmitted to the immigration authority of the destination country for which you are applying, regardless of where that country is located. We have no control over how those authorities handle your data once received, though we provide only the information required by law for visa processing.

For other international transfers to our service providers or affiliates, we take appropriate safeguards to ensure your data remains protected. These safeguards may include standard contractual clauses approved by relevant data protection authorities, binding corporate rules, or other lawful transfer mechanisms.

By submitting your visa application, you acknowledge that your personal data will be transferred internationally as described above, and you consent to such transfers.`,
  },
  {
    id: 'children',
    title: "11. Children's Privacy",
    body: `VisaTrips's services are intended for use by adults aged 18 and over. We do not knowingly solicit or collect personal information from individuals under the age of 18 without the consent of a parent or legal guardian.

If a parent or guardian wishes to submit a visa application on behalf of a minor, they must do so from their own account and accept full responsibility for the accuracy of the minor's information and compliance with these Terms.

If we become aware that we have inadvertently collected personal data from a minor without appropriate parental consent, we will take prompt steps to delete that information from our systems.

If you believe that a child has provided us with personal information without parental consent, please contact us immediately at privacy@visatrips.com and we will investigate and respond within 48 hours.`,
  },
  {
    id: 'changes',
    title: '12. Changes to This Privacy Policy',
    body: `We may update this Privacy Policy from time to time to reflect changes in our data practices, updates to applicable laws, or improvements to our services. When we make material changes, we will notify you by posting a prominent notice on our website, updating the "Last updated" date at the top of this page, and, where we have your email address, sending you a notification by email.

We encourage you to review this Privacy Policy periodically to stay informed about how we are protecting your information. Your continued use of our services after the effective date of any update constitutes your acceptance of the revised policy.

If you disagree with any changes to this policy, you should stop using our services and may request deletion of your personal data as described in Section 9.`,
  },
  {
    id: 'contact',
    title: '13. Contact and Data Controller',
    body: `VisaTrips is the data controller responsible for your personal information. If you have any questions, concerns, or requests regarding this Privacy Policy or the way we handle your data, please contact our privacy team:

Privacy Team Email: privacy@visatrips.com
Response time: Within 5 business days

For urgent data breach notifications or security concerns:
Email: security@visatrips.com
Response time: Within 24 hours

For general support questions:
Email: support@visatrips.com
Response time: Within 24 hours

When contacting us about a privacy matter, please provide your full name, email address used to register or apply, and a clear description of your concern or request. This will allow us to locate your records and respond as quickly as possible.

We take all privacy concerns seriously and are committed to handling your inquiry fairly, transparently, and in accordance with applicable data protection laws.`,
  },
];

export default function PrivacyPage() {
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
          <span>Privacy Policy</span>
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
              <div className="legal-sidebar-title">Privacy concerns?</div>
              <p>Contact our privacy team for any questions or data requests.</p>
              <a href="/contact" className="legal-contact-btn">Contact Us</a>
            </div>
          </aside>

          <div className="legal-main">
            <div className="legal-header">
              <div className="legal-eyebrow">Legal</div>
              <h1 className="legal-title">Privacy Policy</h1>
              <p className="legal-meta">Last updated: March 21, 2026 · Effective immediately</p>
              <p className="legal-intro">
                At VisaTrips, your privacy is a priority. This policy explains exactly what personal data we collect,
                how we use it, who we share it with, and what rights you have over your information.
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
