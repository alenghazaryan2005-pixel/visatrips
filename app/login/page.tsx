'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [loginMode, setLoginMode] = useState<'pin' | 'order'>('pin');
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
        body: JSON.stringify(loginMode === 'pin'
          ? { email: email.trim(), pin: pin.trim() }
          : { email: email.trim(), orderNumber: orderNumber.trim() }
        ),
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

  if (checking) return <div style={{ paddingTop: '120px', textAlign: 'center' }}>Loading...</div>;

  const canSubmit = email.trim() && (loginMode === 'pin' ? pin.trim().length === 6 : orderNumber.trim().length > 0);

  return (
    <div className="customer-login-shell">
      <div className="customer-login-left">
        <div className="customer-login-card">
          <Link href="/" className="customer-login-logo">VisaTrips<sup>®</sup></Link>
          <h1 className="customer-login-title">Check Your Visa Status</h1>
          <p className="customer-login-subtitle">Log in with your email and {loginMode === 'pin' ? '6-digit PIN' : 'order number'}</p>

          <form onSubmit={handleSubmit} className="customer-login-form">
            <div className="customer-login-field">
              <label className="customer-login-label">Email address</label>
              <input
                className="customer-login-input"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
              />
            </div>

            {loginMode === 'pin' ? (
              <div className="customer-login-field">
                <label className="customer-login-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  PIN
                  <button type="button" onClick={() => { setShowLostPin(true); setRecoverEmail(email); setRecoverSuccess(false); setRecoverError(''); }} style={{ background: 'none', border: 'none', color: 'var(--blue, #6C8AFF)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500 }}>
                    Lost PIN?
                  </button>
                </label>
                <input
                  className="customer-login-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit PIN"
                  value={pin}
                  maxLength={6}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ letterSpacing: '4px', fontSize: '1.2rem', fontWeight: 700, textAlign: 'center' }}
                />
                <p style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '0.35rem' }}>
                  Your PIN was sent to your email when you placed your order.
                </p>
              </div>
            ) : (
              <div className="customer-login-field">
                <label className="customer-login-label">Order number</label>
                <input
                  className="customer-login-input"
                  type="text"
                  placeholder="e.g. 00123"
                  value={orderNumber}
                  onChange={e => setOrderNumber(e.target.value)}
                />
              </div>
            )}

            <button type="button" onClick={() => { setLoginMode(m => m === 'pin' ? 'order' : 'pin'); setError(''); }} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.78rem', textAlign: 'center', width: '100%', marginBottom: '0.5rem' }}>
              {loginMode === 'pin' ? 'Use order number instead' : 'Use PIN instead'}
            </button>

            {error && <div className="customer-login-error">{error}</div>}

            <button
              type="submit"
              className={`customer-login-btn${canSubmit ? ' active' : ''}`}
              disabled={!canSubmit || loading}
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </form>

          <p className="customer-login-back">
            <Link href="/">← Back to VisaTrips</Link>
          </p>
        </div>
      </div>

      <div className="customer-login-right">
        <div className="customer-login-right-content">
          <h2 className="customer-login-headline">
            Check the status<br/>of your Visa<br/>by logging in!
          </h2>
          <p className="customer-login-right-sub">
            Track your application progress, view your details, and finish your application — all in one place.
          </p>
        </div>
      </div>

      {/* Lost PIN Modal */}
      {showLostPin && (
        <div className="lost-pin-overlay" onClick={() => setShowLostPin(false)}>
          <div className="lost-pin-modal" onClick={e => e.stopPropagation()}>
            <button className="lost-pin-close" onClick={() => setShowLostPin(false)}>✕</button>

            {recoverSuccess ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✉️</div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1E293B' }}>Check Your Email</h2>
                <p style={{ color: '#94A3B8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  If an account exists with <strong>{recoverEmail}</strong>, we&apos;ve sent your PIN to that address.
                </p>
                <button className="customer-login-btn active" onClick={() => setShowLostPin(false)} style={{ width: '100%' }}>
                  Back to Login
                </button>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem', color: '#1E293B' }}>Recover Your PIN</h2>
                <p style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  Enter your email address and we&apos;ll send you your PIN.
                </p>

                <div className="customer-login-field">
                  <label className="customer-login-label">Email address</label>
                  <input
                    className="customer-login-input"
                    type="email"
                    placeholder="you@email.com"
                    value={recoverEmail}
                    onChange={e => setRecoverEmail(e.target.value)}
                    autoFocus
                  />
                </div>

                {recoverError && <div className="customer-login-error">{recoverError}</div>}

                <button
                  className={`customer-login-btn${recoverEmail.trim() ? ' active' : ''}`}
                  disabled={!recoverEmail.trim() || recovering}
                  onClick={handleRecover}
                  style={{ width: '100%', marginTop: '0.75rem' }}
                >
                  {recovering ? 'Sending...' : 'Send My PIN'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
