'use client';

/**
 * Bot Payment Card settings.
 *
 * The bot's Playwright script reads this card at run-time and types it
 * into the payment step of gov visa forms (Aruba ED Card, India eVisa).
 *
 * Security model:
 *   - Card number + CVV are AES-256-GCM encrypted server-side before
 *     hitting the database. Key lives in env var BOT_PAYMENT_ENC_KEY.
 *   - GET returns ONLY masked digits (`•••• •••• •••• 1234`). The
 *     full PAN is never exposed via any HTTP route — bot scripts
 *     read it through a server-only helper.
 *   - Owner-role only. Employees can't see or modify.
 *
 * Edit flow:
 *   - First time: enter all fields, save.
 *   - Editing: only the cardholder name + expiry are pre-filled.
 *     PAN + CVV fields stay blank and require re-entry on each save
 *     (a save with blank PAN is rejected by the API — we never want
 *     a "partial update" that silently keeps the encrypted blob from
 *     last time but updates the masked last4 to look different).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminSidebar } from '@/components/AdminSidebar';

interface MaskedCard {
  cardholderName: string;
  maskedNumber: string;
  last4: string;
  expirationMonth: string;
  expirationYear: string;
  updatedAt: string;
  note?: string;
}

const MONTHS = [
  ['01', 'January'], ['02', 'February'], ['03', 'March'],   ['04', 'April'],
  ['05', 'May'],     ['06', 'June'],     ['07', 'July'],    ['08', 'August'],
  ['09', 'September'],['10', 'October'], ['11', 'November'], ['12', 'December'],
];

const YEARS = (() => {
  const out: string[] = [];
  const now = new Date().getFullYear();
  for (let y = now; y <= now + 20; y++) out.push(String(y));
  return out;
})();

export default function PaymentSettingsPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  const [card, setCard] = useState<MaskedCard | null>(null);
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/session', { cache: 'no-store' });
        if (res.status === 401) { router.push('/admin'); return; }
        const data = await res.json();
        setAuthed(true);
        setIsOwner(data.role === 'owner');
      } catch {} finally { setLoading(false); }
    })();
  }, [router]);

  // Load the existing masked card so the admin sees what's saved.
  useEffect(() => {
    if (!authed || !isOwner) return;
    (async () => {
      try {
        const res = await fetch('/api/admin/settings/payment', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.card) {
          setCard(data.card);
          setCardholderName(data.card.cardholderName || '');
          setExpMonth(data.card.expirationMonth || '');
          setExpYear(data.card.expirationYear || '');
          setNote(data.card.note || '');
        }
      } catch {}
    })();
  }, [authed, isOwner]);

  const handleSave = async () => {
    setError(''); setSuccess('');
    if (!cardNumber.trim() || !cvv.trim()) {
      setError('Card number and CVV are required on every save — re-enter both even when only changing the cardholder name or expiry.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardholderName,
          cardNumber:       cardNumber.replace(/\s+/g, ''),
          expirationMonth:  expMonth,
          expirationYear:   expYear,
          cvv,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setCard(data.card);
      setCardNumber(''); setCvv('');
      setSuccess('Card saved. Encrypted blob is in the database; plaintext only exists in memory during a bot run.');
    } catch (err: any) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete the saved card? The bot will fail when it reaches the payment step until you save a new one.')) return;
    setError(''); setSuccess('');
    try {
      const res = await fetch('/api/admin/settings/payment', { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Delete failed');
      }
      setCard(null);
      setCardholderName(''); setExpMonth(''); setExpYear(''); setNote('');
      setSuccess('Card deleted.');
    } catch (err: any) {
      setError(err?.message || 'Delete failed');
    }
  };

  if (loading || !authed) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading…</div>;
  }
  if (!isOwner) {
    return (
      <div className="admin-shell">
        <AdminSidebar active="settings" />
        <div className="admin-main" style={{ maxWidth: '100%' }}>
          <div style={{ padding: '4rem 1.5rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔒</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>Owner access required</h1>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Payment-card settings are restricted to owner accounts.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <AdminSidebar active="settings" />
      <div className="admin-main" style={{ maxWidth: '100%' }}>
        <div style={{ padding: '1.5rem', maxWidth: '700px', margin: '0 auto', width: '100%' }}>
          <Link href="/admin/settings" style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: '0.85rem' }}>← Back to Settings</Link>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.75rem', marginBottom: '0.5rem' }}>💳 Bot Payment Card</h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            The credit card the bot uses to pay for visa applications on gov sites. Stored AES-256-GCM encrypted; only the last four digits are visible after save.
          </p>

          {/* Currently saved */}
          <div style={{
            background: card ? '#f0fdf4' : '#fef3c7',
            border: '1px solid ' + (card ? '#86efac' : '#fbbf24'),
            borderRadius: '0.6rem',
            padding: '1rem 1.1rem',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
          }}>
            {card ? (
              <>
                <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Currently saved</div>
                <div style={{ fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '0.05em' }}>{card.maskedNumber}</div>
                <div style={{ color: '#374151', marginTop: '0.3rem' }}>
                  {card.cardholderName || '(no cardholder name)'} · exp {card.expirationMonth}/{card.expirationYear}
                </div>
                {card.note && <div style={{ color: '#6b7280', marginTop: '0.2rem', fontSize: '0.82rem' }}>{card.note}</div>}
                <div style={{ color: '#9ca3af', fontSize: '0.78rem', marginTop: '0.4rem' }}>Last updated {new Date(card.updatedAt).toLocaleString()}</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>No card saved yet</div>
                <div style={{ color: '#6b5512' }}>The bot will fail when it reaches the payment step until you save one.</div>
              </>
            )}
          </div>

          {/* Edit form */}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', padding: '1.25rem' }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.85rem' }}>{card ? 'Replace card' : 'Save card'}</div>

            <Field label="Cardholder name">
              <input
                value={cardholderName}
                onChange={e => setCardholderName(e.target.value)}
                placeholder="Express Visa LLC"
                style={fieldStyle}
              />
            </Field>

            <Field label="Card number">
              <input
                value={cardNumber}
                onChange={e => setCardNumber(e.target.value.replace(/[^\d ]/g, '').slice(0, 23))}
                placeholder="•••• •••• •••• ••••"
                inputMode="numeric"
                autoComplete="off"
                style={{ ...fieldStyle, fontFamily: 'monospace', letterSpacing: '0.05em' }}
              />
              <Hint>Re-enter every time you save — even for a non-PAN change.</Hint>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              <Field label="Exp month">
                <select value={expMonth} onChange={e => setExpMonth(e.target.value)} style={fieldStyle}>
                  <option value="">—</option>
                  {MONTHS.map(([v, l]) => <option key={v} value={v}>{v} · {l}</option>)}
                </select>
              </Field>
              <Field label="Exp year">
                <select value={expYear} onChange={e => setExpYear(e.target.value)} style={fieldStyle}>
                  <option value="">—</option>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </Field>
              <Field label="CVV">
                <input
                  value={cvv}
                  onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="•••"
                  inputMode="numeric"
                  autoComplete="off"
                  style={{ ...fieldStyle, fontFamily: 'monospace' }}
                />
              </Field>
            </div>

            <Field label="Internal note (optional)">
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder='e.g. "Amex business card"'
                style={fieldStyle}
              />
            </Field>

            {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.6rem 0.8rem', borderRadius: '0.4rem', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</div>}
            {success && <div style={{ background: '#dcfce7', color: '#166534', padding: '0.6rem 0.8rem', borderRadius: '0.4rem', fontSize: '0.85rem', marginTop: '0.5rem' }}>{success}</div>}

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', justifyContent: 'space-between' }}>
              {card ? (
                <button
                  onClick={handleDelete}
                  style={{ background: 'white', color: '#991b1b', border: '1px solid #fca5a5', padding: '0.55rem 1rem', borderRadius: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}
                >Delete card</button>
              ) : <span/>}
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ background: 'var(--blue, #2563eb)', color: 'white', border: 0, padding: '0.55rem 1.25rem', borderRadius: '0.4rem', fontSize: '0.9rem', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}
              >{saving ? 'Saving…' : (card ? 'Replace card' : 'Save card')}</button>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', padding: '0.85rem 1rem', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 }}>
            <strong style={{ color: '#374151' }}>Compliance note.</strong> PCI-DSS does not permit storing CVVs even encrypted. This vault is intended only for automating your own company card — not for processing customer cards. If that ever changes, replace this storage with a tokenised vault (Stripe / Adyen / Spreedly). The encryption key lives in env var <code style={{ background: '#f3f4f6', padding: '0 0.25rem' }}>BOT_PAYMENT_ENC_KEY</code> and must be 32 bytes (hex or base64).
          </div>
        </div>
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  fontSize: '0.9rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.4rem',
  background: 'white',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>{label}</label>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.2rem' }}>{children}</div>;
}
