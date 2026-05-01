'use client';

import { useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { Mail, Zap, Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', order: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const update = (f: keyof typeof form, v: string) => setForm(p => ({ ...p, [f]: v }));
  const canSubmit = form.name && form.email && form.message;

  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, message: form.message, orderNumber: form.order || undefined }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Nav />
      <div className="contact-page">
        <div className="legal-breadcrumb">
          <Link href="/" className="legal-breadcrumb-link">Home</Link>
          <span className="legal-breadcrumb-sep">›</span>
          <span>Contact Us</span>
        </div>

        <div className="contact-layout">

          {/* Left — Info */}
          <div className="contact-info">
            <div className="legal-eyebrow">Support</div>
            <h1 className="contact-title">Get in touch</h1>
            <p className="contact-subtitle">
              Have a question about your application, need help with a document, or just want to reach out?
              We're here to help — fill out the form and we'll get back to you within 24 hours.
            </p>

            <div className="contact-details">
              <div className="contact-detail-item">
                <span className="contact-detail-icon" aria-hidden>
                  <Mail size={22} strokeWidth={1.75} />
                </span>
                <div>
                  <div className="contact-detail-label">Email</div>
                  <a href="mailto:support@visatrips.com" className="contact-detail-value">support@visatrips.com</a>
                </div>
              </div>
              <div className="contact-detail-item">
                <span className="contact-detail-icon" aria-hidden>
                  <Zap size={22} strokeWidth={1.75} />
                </span>
                <div>
                  <div className="contact-detail-label">Response time</div>
                  <div className="contact-detail-value">Within 24 hours</div>
                </div>
              </div>
              <div className="contact-detail-item">
                <span className="contact-detail-icon" aria-hidden>
                  <Clock size={22} strokeWidth={1.75} />
                </span>
                <div>
                  <div className="contact-detail-label">Support hours</div>
                  <div className="contact-detail-value">Mon – Fri, 9am – 6pm EST</div>
                </div>
              </div>
              <div className="contact-detail-item">
                <span className="contact-detail-icon" aria-hidden>
                  <ShieldCheck size={22} strokeWidth={1.75} />
                </span>
                <div>
                  <div className="contact-detail-label">Privacy</div>
                  <div className="contact-detail-value">Your message is secure and confidential</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right — Form */}
          <div className="contact-form-wrap">
            {submitted ? (
              <div className="contact-success">
                <div className="contact-success-icon" aria-hidden>
                  <CheckCircle2 size={56} strokeWidth={1.5} />
                </div>
                <h2 className="contact-success-title">Message sent!</h2>
                <p className="contact-success-sub">
                  Thanks for reaching out, {form.name.split(' ')[0]}. We've received your message and will reply to <strong>{form.email}</strong> within 24 hours.
                </p>
                <Link href="/" className="apply-submit active" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
                  Back to Home
                </Link>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit}>
                <div className="contact-form-title">Send us a message</div>

                <div className="contact-form-row">
                  <div className="ap-field">
                    <label className="ap-field-label">Full name <span className="contact-required">*</span></label>
                    <input
                      className="ap-input"
                      placeholder="John Smith"
                      value={form.name}
                      onChange={e => update('name', e.target.value)}
                      required
                    />
                  </div>
                  <div className="ap-field">
                    <label className="ap-field-label">Order number <span className="contact-optional">(if available)</span></label>
                    <input
                      className="ap-input"
                      placeholder="e.g. ABC123"
                      value={form.order}
                      onChange={e => update('order', e.target.value)}
                    />
                  </div>
                </div>

                <div className="ap-field">
                  <label className="ap-field-label">Email address <span className="contact-required">*</span></label>
                  <input
                    className="ap-input"
                    type="email"
                    placeholder="johnsmith@gmail.com"
                    value={form.email}
                    onChange={e => update('email', e.target.value)}
                    required
                  />
                </div>

                <div className="ap-field">
                  <label className="ap-field-label">Message <span className="contact-required">*</span></label>
                  <textarea
                    className="ap-input contact-textarea"
                    placeholder="Tell us how we can help you..."
                    value={form.message}
                    onChange={e => update('message', e.target.value)}
                    required
                    rows={6}
                  />
                </div>

                {error && (
                  <div style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className={`apply-submit${canSubmit ? ' active' : ''}`}
                  disabled={!canSubmit || loading}
                >
                  {loading ? 'Sending...' : canSubmit ? 'Send Message →' : 'Fill in required fields'}
                </button>

                <p className="contact-disclaimer">
                  By submitting this form, you agree to our{' '}
                  <Link href="/privacy" className="checkout-link">Privacy Policy</Link>.
                  We'll only use your information to respond to your inquiry.
                </p>
              </form>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
