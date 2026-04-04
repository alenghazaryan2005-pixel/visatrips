'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check if already logged in
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
        body: JSON.stringify({ email: email.trim(), orderNumber: orderNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); setLoading(false); return; }
      router.push('/status');
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  if (checking) return <div style={{ paddingTop: '120px', textAlign: 'center' }}>Loading...</div>;

  const canSubmit = email.trim() && orderNumber.trim();

  return (
    <div className="customer-login-shell">
      {/* Left - Form */}
      <div className="customer-login-left">
        <div className="customer-login-card">
          <Link href="/" className="customer-login-logo">VisaTrips<sup>®</sup></Link>
          <h1 className="customer-login-title">Check Your Visa Status</h1>
          <p className="customer-login-subtitle">Log in with your billing email and order number</p>

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

      {/* Right - Marketing panel */}
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
    </div>
  );
}
