'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Mail, KeyRound, ArrowRight, MailCheck, X as XIcon,
  Loader2, ShieldCheck, ChevronLeft,
} from 'lucide-react';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Lost PIN modal
  const [showLostPin, setShowLostPin] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [recoverSuccess, setRecoverSuccess] = useState(false);
  const [recoverError, setRecoverError] = useState('');

  useEffect(() => {
    fetch('/api/customer/session')
      .then(r => r.json())
      .then(d => { if (d.authenticated) router.replace('/status'); else setChecking(false); })
      .catch(() => setChecking(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), pin: pin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); setLoading(false); return; }
      router.push('/status');
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleRecover = async () => {
    if (!recoverEmail.trim()) return;
    setRecovering(true);
    setRecoverError('');
    try {
      const res = await fetch('/api/customer/recover-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoverEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setRecoverSuccess(true);
      } else {
        setRecoverError(data.error || 'Something went wrong.');
      }
    } catch {
      setRecoverError('Something went wrong. Please try again.');
    } finally { setRecovering(false); }
  };

  if (checking) {
    return (
      <div className="customer-login-checking">
        <Loader2 className="customer-login-spinner" size={28} strokeWidth={2.25} aria-hidden />
        <span>Checking your session…</span>
      </div>
    );
  }

  const canSubmit = email.trim() && pin.trim().length === 6;

  return (
    <div className="customer-login-shell">
      {/* ── LEFT: form ─────────────────────────────────────────────── */}
      <div className="customer-login-left">
        <div className="customer-login-card">
          <Link href="/" className="customer-login-logo">
            VisaTrips<sup>®</sup>
          </Link>

          <span className="customer-login-eyebrow">Status lookup</span>
          <h1 className="customer-login-title">Welcome back.</h1>
          <p className="customer-login-subtitle">
            Enter your email and PIN to pick up where you left off.
          </p>

          <form onSubmit={handleSubmit} className="customer-login-form">
            {/* Email */}
            <div className="customer-login-field">
              <label className="customer-login-label" htmlFor="cl-email">Email</label>
              <div className="customer-login-input-wrap">
                <Mail size={16} strokeWidth={1.85} className="customer-login-input-icon" aria-hidden />
                <input
                  id="cl-email"
                  className="customer-login-input customer-login-input-with-icon"
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* PIN */}
            <div className="customer-login-field">
              <div className="customer-login-label-row">
                <label className="customer-login-label" htmlFor="cl-pin">6-digit PIN</label>
                <button
                  type="button"
                  onClick={() => {
                    setShowLostPin(true);
                    setRecoverEmail(email);
                    setRecoverSuccess(false);
                    setRecoverError('');
                  }}
                  className="customer-login-helper-link"
                >
                  Lost your PIN?
                </button>
              </div>
              <div className="customer-login-input-wrap">
                <KeyRound size={16} strokeWidth={1.85} className="customer-login-input-icon" aria-hidden />
                <input
                  id="cl-pin"
                  className="customer-login-input customer-login-input-with-icon customer-login-pin"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  value={pin}
                  maxLength={6}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>
              <p className="customer-login-hint">
                Sent to your email when you placed your order.
              </p>
            </div>

            {/* Error band */}
            {error && (
              <div className="customer-login-error" role="alert">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className={`customer-login-btn${canSubmit ? ' active' : ''}`}
              disabled={!canSubmit || loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} strokeWidth={2} className="customer-login-spinner" aria-hidden />
                  Checking…
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight size={16} strokeWidth={2} aria-hidden />
                </>
              )}
            </button>
          </form>

          <p className="customer-login-back">
            <Link href="/">
              <ChevronLeft size={14} strokeWidth={2} aria-hidden />
              Back to VisaTrips
            </Link>
          </p>
        </div>
      </div>

      {/* ── RIGHT: hero ────────────────────────────────────────────── */}
      <div className="customer-login-right">
        {/* Decorative dot grid — subtle background texture so the dark
            panel reads as designed rather than just a flat block. */}
        <div className="customer-login-right-pattern" aria-hidden />

        <div className="customer-login-right-content">
          <span className="customer-login-right-badge">
            <ShieldCheck size={14} strokeWidth={2} aria-hidden />
            Encrypted &amp; private
          </span>
          <h2 className="customer-login-headline">
            Your visa,<br />
            <em>at a glance.</em>
          </h2>
          <p className="customer-login-right-sub">
            Track every step from submission to approval — view documents,
            download your eVisa, and finish anything we still need.
          </p>

          {/* Three quick reassurance points */}
          <ul className="customer-login-points">
            <li><span className="customer-login-points-dot" /> Live status updates as your application moves</li>
            <li><span className="customer-login-points-dot" /> One-click download of your approved eVisa</li>
            <li><span className="customer-login-points-dot" /> Re-upload documents if anything needs fixing</li>
          </ul>
        </div>
      </div>

      {/* ── Lost PIN modal ────────────────────────────────────────── */}
      {showLostPin && (
        <div className="lost-pin-overlay" onClick={() => setShowLostPin(false)}>
          <div className="lost-pin-modal" onClick={e => e.stopPropagation()}>
            <button
              className="lost-pin-close"
              onClick={() => setShowLostPin(false)}
              aria-label="Close"
            >
              <XIcon size={16} strokeWidth={2.25} />
            </button>

            {recoverSuccess ? (
              <div className="lost-pin-success">
                <span className="lost-pin-success-icon" aria-hidden>
                  <MailCheck size={32} strokeWidth={1.75} />
                </span>
                <h2 className="lost-pin-modal-title">Check your email</h2>
                <p className="lost-pin-modal-sub">
                  If an account exists with <strong>{recoverEmail}</strong>, your PIN is on its way.
                </p>
                <button
                  className="customer-login-btn active"
                  onClick={() => setShowLostPin(false)}
                >
                  Back to login
                </button>
              </div>
            ) : (
              <>
                <span className="lost-pin-modal-eyebrow">Recover access</span>
                <h2 className="lost-pin-modal-title">Send my PIN</h2>
                <p className="lost-pin-modal-sub">
                  Enter your email and we&apos;ll re-send the 6-digit PIN we issued when you placed your order.
                </p>

                <div className="customer-login-field">
                  <label className="customer-login-label" htmlFor="cl-recover-email">Email</label>
                  <div className="customer-login-input-wrap">
                    <Mail size={16} strokeWidth={1.85} className="customer-login-input-icon" aria-hidden />
                    <input
                      id="cl-recover-email"
                      className="customer-login-input customer-login-input-with-icon"
                      type="email"
                      placeholder="you@email.com"
                      value={recoverEmail}
                      onChange={e => setRecoverEmail(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>

                {recoverError && (
                  <div className="customer-login-error" role="alert">{recoverError}</div>
                )}

                <button
                  className={`customer-login-btn${recoverEmail.trim() ? ' active' : ''}`}
                  disabled={!recoverEmail.trim() || recovering}
                  onClick={handleRecover}
                >
                  {recovering ? (
                    <>
                      <Loader2 size={16} strokeWidth={2} className="customer-login-spinner" aria-hidden />
                      Sending…
                    </>
                  ) : (
                    <>Send PIN<ArrowRight size={16} strokeWidth={2} aria-hidden /></>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
