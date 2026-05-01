'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { formatOrderNum, VISA_LABELS, STATUS_COLORS } from '@/lib/constants';
import {
  SPEED_ORDER,
  computeUpgradeDiff,
  extractPricingFromSettings,
  isUpgrade,
  type ProcessingSpeed,
} from '@/lib/processingSpeeds';
// Lucide icons — same vocabulary as the admin panel (see app/admin/orders/[id]/page.tsx)
// so the customer-facing status page reads as part of the same product family.
import {
  AlertTriangle, Upload, FileText, CheckCircle, Shield, Zap, Download,
} from 'lucide-react';

interface Order {
  id: string;
  orderNumber: number;
  createdAt: string;
  updatedAt: string;
  destination: string;
  visaType: string;
  totalUSD: number;
  status: string;
  billingEmail: string;
  cardLast4: string | null;
  processingSpeed: string;
  travelers: string;
  evisaUrl: string | null;
  flaggedFields: string | null;
  specialistNotes: string | null;
  rejectionProtection: boolean;
}

interface Traveler {
  firstName?: string;
  lastName?: string;
  email?: string;
  month?: string;
  day?: string;
  year?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  passportCountry?: string;
  passportNumber?: string;
  passportIssMonth?: string;
  passportIssDay?: string;
  passportIssYear?: string;
  passportExpMonth?: string;
  passportExpDay?: string;
  passportExpYear?: string;
  isEmployed?: string;
  hasConviction?: string;
  hasTravelPlans?: string;
  arrivalMonth?: string;
  arrivalDay?: string;
  arrivalYear?: string;
  // Extended finish data
  arrivalDate?: string;
  arrivalPoint?: string;
  visitedCountries?: string[];
  parentsFromPakistan?: string;
  gender?: string;
  countryOfBirth?: string;
  holdAnotherNationality?: string;
  otherNationality?: string;
  maritalStatus?: string;
  residenceCountry?: string;
  employmentStatus?: string;
  employerName?: string;
  employerAddress?: string;
  employerCity?: string;
  employerState?: string;
  employerCountry?: string;
  employerZip?: string;
  studentProvider?: string;
  servedMilitary?: string;
  knowParents?: string;
  fatherName?: string;
  fatherNationality?: string;
  fatherPlaceOfBirth?: string;
  motherName?: string;
  motherNationality?: string;
  motherPlaceOfBirth?: string;
  spouseName?: string;
  spouseNationality?: string;
  spouseCountryOfBirth?: string;
  finishStep?: string;
}

const SPEED_LABELS: Record<string, string> = {
  standard: 'Standard',
  rush: 'Rush',
  super: 'Super Rush',
};

const SPEED_BLURBS: Record<string, string> = {
  standard:  'Processed in 3–5 business days.',
  rush:      'Processed in 1–2 business days.',
  super:     'Processed within 24 hours when possible.',
};

/** Status codes where the customer can self-serve an upgrade. SUBMITTED is
 *  included because a customer who realises they need it faster can pay the
 *  difference and the admin team can still prioritise / follow up with the
 *  Indian government on their behalf — even though the application is no
 *  longer in our queue. */
const UPGRADABLE_STATUSES = new Set([
  'UNFINISHED', 'PENDING', 'PROCESSING', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'SUBMITTED',
]);

interface OrderSummary {
  id: string;
  orderNumber: number;
  status: string;
  destination: string;
  visaType: string;
  totalUSD: number;
  createdAt: string;
}

export default function StatusPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/customer/session')
      .then(r => r.json())
      .then(async (session) => {
        if (!session.authenticated) { router.replace('/login'); return; }
        setEmail(session.email);
        setOrders(session.orders || []);

        // If only one order, auto-select it
        if (session.orders?.length === 1) {
          await loadOrder(session.orders[0].id);
        }
        setLoading(false);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const loadOrder = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}`);
    const data = await res.json();
    if (!data.error) {
      setOrder(data);
      setSelectedOrderId(orderId);
      try { setTravelers(JSON.parse(data.travelers)); } catch { setTravelers([]); }
    }
  };

  const backToList = () => {
    setOrder(null);
    setSelectedOrderId(null);
    setTravelers([]);
  };

  const [reuploadingDoc, setReuploadingDoc] = useState('');

  /* ── Speed-upgrade flow ───────────────────────────────────────────────
   * `pricing` is fetched once on mount from /api/settings — same source
   * the apply-checkout uses, so the customer is quoted the same surcharge
   * they'd have paid if they'd picked the faster speed up front. */
  const [pricing, setPricing] = useState<{ surcharges: Record<ProcessingSpeed, number>; txPct: number } | null>(null);
  const [upgrading, setUpgrading] = useState<ProcessingSpeed | ''>('');
  const [upgradeError, setUpgradeError] = useState('');

  /* ── Rejection-protection opt-in ──────────────────────────────────────
   * Customer can add the protection plan after the fact if they declined
   * at checkout. Mirrors the speed-upgrade UX — same status gating, same
   * inline error band, same "live price from settings" approach. */
  const [protectionPrice, setProtectionPrice] = useState<number>(50);
  const [addingProtection, setAddingProtection] = useState(false);
  const [protectionError, setProtectionError] = useState('');

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      const s = d.settings || {};
      setPricing(extractPricingFromSettings(s));
      if (s['pricing.addons.rejectionProtection'] != null) {
        setProtectionPrice(Number(s['pricing.addons.rejectionProtection']));
      }
    }).catch(() => setPricing({ surcharges: { standard: 0, rush: 20, super: 60 }, txPct: 8 }));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/customer/logout', { method: 'POST' });
    router.push('/login');
  };

  /** Build the upgrade options visible for the order (only faster speeds). */
  const upgradeOptions = (() => {
    if (!order || !pricing) return [];
    const current = (order.processingSpeed ?? 'standard') as ProcessingSpeed;
    if (!UPGRADABLE_STATUSES.has(order.status)) return [];
    if (order.evisaUrl) return [];
    return SPEED_ORDER
      .filter(s => isUpgrade(current, s))
      .map(target => {
        const diff = computeUpgradeDiff({
          current, target,
          surcharges: pricing.surcharges,
          travelers: travelers.length || 1,
          txPct: pricing.txPct,
        });
        return { target, diff };
      });
  })();

  const handleUpgrade = async (target: ProcessingSpeed) => {
    if (!order || upgrading) return;
    if (!confirm(`Upgrade to ${target === 'rush' ? 'Rush' : 'Super Rush'} processing? This will add to your order total.`)) return;
    setUpgrading(target);
    setUpgradeError('');
    try {
      const res = await fetch(`/api/orders/${order.id}/upgrade-speed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSpeed: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUpgradeError(data.error || 'Upgrade failed.');
        return;
      }
      // Apply server-truth values; reload travelers in case anything else changed.
      setOrder(data.order);
      try { setTravelers(JSON.parse(data.order.travelers)); } catch {}
    } catch (err: any) {
      setUpgradeError(err?.message || 'Upgrade failed.');
    } finally {
      setUpgrading('');
    }
  };

  const handleAddRejectionProtection = async () => {
    if (!order || addingProtection) return;
    if (!confirm(`Add Rejection Protection Plan for $${protectionPrice.toFixed(2)}? This will be added to your order total.`)) return;
    setAddingProtection(true);
    setProtectionError('');
    try {
      const res = await fetch(`/api/orders/${order.id}/add-rejection-protection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setProtectionError(data.error || 'Failed to add protection.');
        return;
      }
      setOrder(data.order);
      try { setTravelers(JSON.parse(data.order.travelers)); } catch {}
    } catch (err: any) {
      setProtectionError(err?.message || 'Failed to add protection.');
    } finally {
      setAddingProtection(false);
    }
  };

  // Parse flagged fields to check for document flags
  const flaggedFields: string[] = (() => {
    try { return order?.flaggedFields ? JSON.parse(order.flaggedFields) : []; } catch { return []; }
  })();
  const flaggedDocs = flaggedFields.filter(f => f === 'photoUrl' || f === 'passportBioUrl');

  const handleDocReupload = async (e: React.ChangeEvent<HTMLInputElement>, type: string, fieldName: string) => {
    const file = e.target.files?.[0];
    if (!file || !order) return;
    setReuploadingDoc(type);
    try {
      // Upload file
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orderId', formatOrderNum(order.orderNumber));
      fd.append('type', type);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
      const uploadData = await uploadRes.json();
      if (uploadData.url) {
        // Update traveler data with new URL and remove flag
        const updatedTravelers = travelers.map((t: any, i: number) => {
          if (i !== 0) return t;
          return { ...t, [fieldName]: uploadData.url };
        });
        const updatedFlags = flaggedFields.filter(f => f !== fieldName);
        await fetch(`/api/orders/${order.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            travelers: JSON.stringify(updatedTravelers),
            flaggedFields: JSON.stringify(updatedFlags),
            ...(updatedFlags.length === 0 ? { status: 'PROCESSING', specialistNotes: '' } : {}),
          }),
        });
        // Refresh page
        window.location.reload();
      }
    } catch (err) { console.error('Reupload error:', err); }
    finally { setReuploadingDoc(''); }
  };

  if (loading) return <div style={{ paddingTop: '120px', textAlign: 'center' }}>Loading...</div>;

  // No orders found
  if (orders.length === 0) {
    return (
      <>
        <Nav />
        <div className="customer-status-page">
          <div className="customer-status-header">
            <div>
              <h1 className="customer-status-title">Welcome to VisaTrips!</h1>
            </div>
            <button className="customer-status-logout" onClick={handleLogout}>Log Out</button>
          </div>

          <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🌍</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1E293B', marginBottom: '0.5rem' }}>No Orders Found</h2>
            <p style={{ color: '#94A3B8', fontSize: '1rem', maxWidth: '420px', margin: '0 auto 2rem' }}>
              But that&apos;s okay! You can begin your journey with VisaTrips, today!
            </p>
            <Link href="/apply" style={{ display: 'inline-block', padding: '14px 32px', background: '#6C8AFF', color: 'white', textDecoration: 'none', borderRadius: '12px', fontWeight: 600, fontSize: '1rem' }}>
              Start Your Application →
            </Link>
          </div>
        </div>
      </>
    );
  }

  // Order list view (when multiple orders and none selected)
  if (!order && orders.length > 1) {
    return (
      <>
        <Nav />
        <div className="customer-status-page">
          <div className="customer-status-header">
            <div>
              <h1 className="customer-status-title">Your Applications</h1>
              <p style={{ color: 'var(--slate)', fontSize: '0.9rem' }}>{email}</p>
            </div>
            <button className="customer-status-logout" onClick={handleLogout}>Log Out</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {orders.map(o => {
              const ss = STATUS_COLORS[o.status] || '';
              return (
                <div key={o.id} className="customer-order-card" onClick={() => loadOrder(o.id)}>
                  <div className="customer-order-card-left">
                    <span className="customer-order-card-num">#{formatOrderNum(o.orderNumber)}</span>
                    <span className="customer-order-card-dest">{(o as any).travelerName ? `${(o as any).travelerName} · ` : ''}{o.destination} — {VISA_LABELS[o.visaType] ?? o.visaType}</span>
                  </div>
                  <div className="customer-order-card-right">
                    <span className={`admin-status ${ss}`}>{o.status.replace('_', ' ')}</span>
                    <span className="customer-order-card-price">${o.totalUSD}</span>
                    <span className="customer-order-card-date">{new Date(o.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  if (!order) return null;

  const createdDate = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <>
      <Nav />
      <div className="customer-status-page">
        <div className="customer-status-header">
          <div>
            {orders.length > 1 && (
              <button onClick={backToList} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, padding: 0, marginBottom: '0.5rem', display: 'block' }}>
                ← Back to All Orders
              </button>
            )}
            <h1 className="customer-status-title">Your Visa Application</h1>
            <p className="customer-status-order-num">Order #{formatOrderNum(order.orderNumber)}</p>
          </div>
          <button className="customer-status-logout" onClick={handleLogout}>Log Out</button>
        </div>

        {/* Needs Correction Banner */}
        {order.status === 'NEEDS_CORRECTION' && (
          <div className="customer-correction-banner">
            <div className="customer-correction-header">
              <span className="customer-correction-icon" aria-hidden>
                <AlertTriangle size={22} strokeWidth={1.85} />
              </span>
              <h3 className="customer-correction-title">There are errors on your application. Please double-check your info.</h3>
            </div>
            {order.specialistNotes && (
              <div className="customer-correction-note">
                <strong>Specialist&apos;s Note:</strong> {order.specialistNotes}
              </div>
            )}
            {flaggedFields.length > flaggedDocs.length && (
              <Link href={`/apply/finish?id=${formatOrderNum(order.orderNumber)}&fix=true`} className="customer-correction-btn">
                Fix Your Application →
              </Link>
            )}
          </div>
        )}

        {/* Document Re-upload */}
        {flaggedDocs.length > 0 && order.status === 'NEEDS_CORRECTION' && (
          <div className="customer-reupload-section">
            <h3 className="customer-reupload-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={18} strokeWidth={1.85} aria-hidden />
              Please re-upload the following documents
            </h3>
            {flaggedDocs.includes('photoUrl') && (
              <div className="customer-reupload-item">
                <div className="customer-reupload-label">Traveler&apos;s Photo</div>
                <p className="customer-reupload-hint">Upload a clear, front-facing photo. No passport photos.</p>
                <input id="reupload-photo" type="file" accept="image/*" style={{display:'none'}} onChange={e => handleDocReupload(e, 'photo', 'photoUrl')} />
                <button
                  className="customer-reupload-btn"
                  onClick={() => document.getElementById('reupload-photo')?.click()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  {reuploadingDoc === 'photo' ? 'Uploading...' : (
                    <>
                      <Upload size={16} strokeWidth={1.85} aria-hidden />
                      Upload New Photo
                    </>
                  )}
                </button>
              </div>
            )}
            {flaggedDocs.includes('passportBioUrl') && (
              <div className="customer-reupload-item">
                <div className="customer-reupload-label">Passport Bio Page</div>
                <p className="customer-reupload-hint">Upload a clear scan of your passport data page.</p>
                <input id="reupload-passport" type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={e => handleDocReupload(e, 'passport', 'passportBioUrl')} />
                <button
                  className="customer-reupload-btn"
                  onClick={() => document.getElementById('reupload-passport')?.click()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  {reuploadingDoc === 'passport' ? 'Uploading...' : (
                    <>
                      <Upload size={16} strokeWidth={1.85} aria-hidden />
                      Upload New Passport Scan
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* eVisa Document — shown when approved and uploaded */}
        {order.evisaUrl && (
          <div className="customer-evisa-card">
            <div className="customer-evisa-header">
              <span className="customer-evisa-icon" aria-hidden>
                <CheckCircle size={28} strokeWidth={1.85} />
              </span>
              <div>
                <h3 className="customer-evisa-title">Your E-Visa is Ready!</h3>
                <p className="customer-evisa-sub">Your electronic visa has been approved. Download it below and print a copy for your trip.</p>
              </div>
            </div>
            <div className="customer-evisa-content">
              {order.evisaUrl.endsWith('.pdf') ? (
                <div className="customer-evisa-pdf" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={20} strokeWidth={1.85} aria-hidden />
                  E-Visa Document (PDF)
                </div>
              ) : (
                <img src={order.evisaUrl} alt="Your E-Visa" className="customer-evisa-img" />
              )}
              <div className="customer-evisa-actions">
                <a href={order.evisaUrl} target="_blank" rel="noopener noreferrer" className="customer-evisa-view">View E-Visa</a>
                <a
                  href={order.evisaUrl}
                  download
                  className="customer-evisa-download"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Download size={16} strokeWidth={1.85} aria-hidden />
                  Download E-Visa
                </a>
              </div>
            </div>
          </div>
        )}

        {/* CTA — three distinct states (each gets its own message + colour):
            • NEEDS_CORRECTION → handled above by the red banner; nothing here
            • evisaUrl set     → handled above by the eVisa card; nothing here
            • SUBMITTED        → blue "Awaiting your eVisa" — the application
                                 is at the Indian government, no upgrade card
                                 below since it's already in their queue
            • PROCESSING / UNDER_REVIEW / COMPLETED / APPROVED → green
                                 "Application is Processing!" — we're still
                                 doing pre-submission work; upgrade card
                                 appears below this one
            • Anything else (UNFINISHED, etc.) → blue "Continue your
                                 application" with a Finish button */}
        {(() => {
          if (order.evisaUrl) return null;
          if (order.status === 'NEEDS_CORRECTION') return null;

          if (order.status === 'SUBMITTED') {
            return (
              <div className="customer-status-cta" style={{ background: '#2563eb' }}>
                <div>
                  <h3 className="customer-status-cta-title">📬 We&apos;re waiting for your eVisa to arrive!</h3>
                  <p className="customer-status-cta-text">Your application has been submitted to the Indian government. eVisas typically arrive within 1–3 business days — we&apos;ll email you the moment yours is approved.</p>
                </div>
              </div>
            );
          }

          const isProcessing = order.status === 'PROCESSING'
            || order.status === 'UNDER_REVIEW'
            || order.status === 'COMPLETED'
            || order.status === 'APPROVED'
            || travelers.some(t => t.finishStep === 'complete');
          if (isProcessing) {
            return (
              <div className="customer-status-cta" style={{ background: '#16a34a' }}>
                <div>
                  <h3 className="customer-status-cta-title">Your Application is Processing!</h3>
                  <p className="customer-status-cta-text">We are reviewing your visa application. You will be notified of any updates.</p>
                </div>
              </div>
            );
          }

          return (
            <div className="customer-status-cta">
              <div>
                <h3 className="customer-status-cta-title">Continue your application</h3>
                <p className="customer-status-cta-text">Complete the remaining steps to finalize your visa application.</p>
              </div>
              <Link href={`/apply/finish?id=${formatOrderNum(order.orderNumber)}`} className="customer-status-cta-btn">
                Finish Your Application →
              </Link>
            </div>
          );
        })()}

        {/* Rejection Protection Plan opt-in — only when the order doesn't
            already have it and is still in the active-processing window. */}
        {order && !order.rejectionProtection && !order.evisaUrl
          && order.status !== 'SUBMITTED'
          && UPGRADABLE_STATUSES.has(order.status) && (
          <div className="customer-status-card customer-upgrade-card">
            <h2 className="customer-status-section-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={20} strokeWidth={1.85} aria-hidden />
              Rejection Protection Plan
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--slate)', marginBottom: '1rem' }}>
              You didn't add this at checkout. If you change your mind, you can opt in
              now — if your visa application is rejected for reasons within our
              control, we'll refund what you paid for the visa.
            </p>
            {protectionError && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem',
                padding: '0.6rem 0.85rem', marginBottom: '0.75rem',
                color: '#991b1b', fontSize: '0.85rem',
                display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
              }}>
                <AlertTriangle size={16} strokeWidth={1.85} aria-hidden />
                {protectionError}
              </div>
            )}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '1rem', flexWrap: 'wrap',
              padding: '0.75rem 0.95rem',
              border: '1px solid var(--cloud)', borderRadius: '0.65rem',
              background: 'white',
            }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ink)' }}>
                  Add to my order
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginTop: '0.15rem' }}>
                  One-time fee, applied once per order — not per traveler.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--blue)' }}>
                    +${protectionPrice.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--slate)' }}>flat fee</div>
                </div>
                <button
                  type="button"
                  onClick={handleAddRejectionProtection}
                  disabled={addingProtection}
                  style={{
                    background: addingProtection ? '#94a3b8' : 'var(--blue)',
                    color: 'white', border: 'none', borderRadius: '0.5rem',
                    padding: '0.55rem 1.1rem', fontSize: '0.9rem', fontWeight: 600,
                    cursor: addingProtection ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {addingProtection ? 'Adding…' : 'Add protection →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* "Already protected" confirmation row — shown when the order has
            rejectionProtection enabled, so the customer can see that the
            add-on is in effect and there's nothing to do. */}
        {order?.rejectionProtection && (
          <div className="customer-status-card" style={{
            background: 'rgba(108,138,255,0.05)',
            border: '1px solid var(--blue2, #c7d2fe)',
          }}>
            <h2 className="customer-status-section-title" style={{
              marginBottom: '0.4rem',
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <Shield size={20} strokeWidth={1.85} aria-hidden />
              Rejection Protection Plan
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--slate)', margin: 0 }}>
              You're protected. If your application is rejected for reasons within
              our control, we'll refund what you paid for the visa.
            </p>
          </div>
        )}

        {/* Upgrade Processing Speed */}
        {upgradeOptions.length > 0 && (
          <div className="customer-status-card customer-upgrade-card">
            <h2 className="customer-status-section-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={20} strokeWidth={1.85} aria-hidden />
              Need it faster?
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--slate)', marginBottom: '1rem' }}>
              You picked <strong>{SPEED_LABELS[order.processingSpeed] ?? order.processingSpeed}</strong> at checkout.
              {' '}{SPEED_BLURBS[order.processingSpeed] ?? ''}{' '}
              You can upgrade to a faster service below — the difference will be added to your order.
            </p>
            {upgradeError && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem',
                padding: '0.6rem 0.85rem', marginBottom: '0.75rem',
                color: '#991b1b', fontSize: '0.85rem',
                display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
              }}>
                <AlertTriangle size={16} strokeWidth={1.85} aria-hidden />
                {upgradeError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {upgradeOptions.map(({ target, diff }) => (
                <div key={target} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: '1rem', flexWrap: 'wrap',
                  padding: '0.75rem 0.95rem',
                  border: '1px solid var(--cloud)', borderRadius: '0.65rem',
                  background: 'white',
                }}>
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ink)' }}>
                      {SPEED_LABELS[target]}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginTop: '0.15rem' }}>
                      {SPEED_BLURBS[target]}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--blue)' }}>
                        +${diff.total.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--slate)' }}>
                        {travelers.length} traveler{travelers.length === 1 ? '' : 's'} · incl. fees
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUpgrade(target)}
                      disabled={upgrading !== ''}
                      style={{
                        background: upgrading === target ? '#94a3b8' : 'var(--blue)',
                        color: 'white', border: 'none', borderRadius: '0.5rem',
                        padding: '0.55rem 1.1rem', fontSize: '0.9rem', fontWeight: 600,
                        cursor: upgrading ? 'wait' : 'pointer',
                        opacity: upgrading && upgrading !== target ? 0.5 : 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {upgrading === target ? 'Upgrading…' : `Upgrade →`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order Summary */}
        <div className="customer-status-card">
          <h2 className="customer-status-section-title">Order Summary</h2>
          <div className="customer-status-grid">
            <div className="customer-status-row">
              <span className="customer-status-label">Status</span>
              <span className={`admin-status ${STATUS_COLORS[order.status] ?? ''}`}>{order.status.replace('_', ' ')}</span>
            </div>
            <div className="customer-status-row">
              <span className="customer-status-label">Destination</span>
              <span className="customer-status-value">{order.destination}</span>
            </div>
            <div className="customer-status-row">
              <span className="customer-status-label">Visa type</span>
              <span className="customer-status-value">{VISA_LABELS[order.visaType] ?? order.visaType}</span>
            </div>
            <div className="customer-status-row">
              <span className="customer-status-label">Processing speed</span>
              <span className="customer-status-value">{SPEED_LABELS[order.processingSpeed] ?? order.processingSpeed}</span>
            </div>
            <div className="customer-status-row">
              <span className="customer-status-label">Total paid</span>
              <span className="customer-status-value">${order.totalUSD} USD</span>
            </div>
            <div className="customer-status-row">
              <span className="customer-status-label">Billing email</span>
              <span className="customer-status-value">{order.billingEmail}</span>
            </div>
            {order.cardLast4 && (
              <div className="customer-status-row">
                <span className="customer-status-label">Card</span>
                <span className="customer-status-value">XXXX-XXXX-XXXX-{order.cardLast4}</span>
              </div>
            )}
            <div className="customer-status-row">
              <span className="customer-status-label">Date submitted</span>
              <span className="customer-status-value">{createdDate}</span>
            </div>
          </div>
        </div>

        {/* Traveler Details */}
        {travelers.map((t, i) => (
          <div key={i} className="customer-status-card">
            <h2 className="customer-status-section-title">
              {travelers.length > 1 ? `Traveler ${i + 1}: ` : 'Traveler: '}
              {t.firstName} {t.lastName}
            </h2>
            <div className="customer-status-grid">
              {t.email && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Email</span>
                  <span className="customer-status-value">{t.email}</span>
                </div>
              )}
              {t.month && t.day && t.year && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Date of birth</span>
                  <span className="customer-status-value">{t.month} {t.day}, {t.year}</span>
                </div>
              )}
              {t.address && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Address</span>
                  <span className="customer-status-value">
                    {t.address}{t.city ? `, ${t.city}` : ''}{t.state ? `, ${t.state}` : ''}{t.zip ? ` ${t.zip}` : ''}
                  </span>
                </div>
              )}
              {t.passportCountry && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Passport country</span>
                  <span className="customer-status-value">{t.passportCountry}</span>
                </div>
              )}
              {t.passportNumber && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Passport number</span>
                  <span className="customer-status-value">{t.passportNumber}</span>
                </div>
              )}
              {t.passportIssMonth && t.passportIssYear && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Passport issue date</span>
                  <span className="customer-status-value">{t.passportIssMonth} {t.passportIssDay}, {t.passportIssYear}</span>
                </div>
              )}
              {t.passportExpMonth && t.passportExpYear && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Passport expiry</span>
                  <span className="customer-status-value">{t.passportExpMonth} {t.passportExpDay}, {t.passportExpYear}</span>
                </div>
              )}
              {t.isEmployed && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Employed</span>
                  <span className="customer-status-value">{t.isEmployed}</span>
                </div>
              )}
              {t.hasConviction && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Criminal convictions</span>
                  <span className="customer-status-value">{t.hasConviction}</span>
                </div>
              )}
              {t.hasTravelPlans && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Confirmed travel plans</span>
                  <span className="customer-status-value">{t.hasTravelPlans}</span>
                </div>
              )}
              {t.hasTravelPlans === 'Yes' && t.arrivalMonth && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Expected arrival</span>
                  <span className="customer-status-value">{t.arrivalMonth} {t.arrivalDay}, {t.arrivalYear}</span>
                </div>
              )}
              {/* Extended finish data */}
              {t.arrivalDate && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Arrival date</span>
                  <span className="customer-status-value">{t.arrivalDate}</span>
                </div>
              )}
              {t.arrivalPoint && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Arrival point</span>
                  <span className="customer-status-value">{t.arrivalPoint}</span>
                </div>
              )}
              {t.visitedCountries && t.visitedCountries.length > 0 && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Countries visited (last 10 years)</span>
                  <span className="customer-status-value">{t.visitedCountries.join(', ')}</span>
                </div>
              )}
              {t.gender && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Gender</span>
                  <span className="customer-status-value">{t.gender}</span>
                </div>
              )}
              {t.countryOfBirth && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Country of birth</span>
                  <span className="customer-status-value">{t.countryOfBirth}</span>
                </div>
              )}
              {t.maritalStatus && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Marital status</span>
                  <span className="customer-status-value">{t.maritalStatus}</span>
                </div>
              )}
              {t.residenceCountry && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Country of residence</span>
                  <span className="customer-status-value">{t.residenceCountry}</span>
                </div>
              )}
              {t.employmentStatus && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Employment status</span>
                  <span className="customer-status-value">{t.employmentStatus}</span>
                </div>
              )}
              {t.employerName && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Employer</span>
                  <span className="customer-status-value">{t.employerName}</span>
                </div>
              )}
              {t.servedMilitary && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Served in military/police</span>
                  <span className="customer-status-value">{t.servedMilitary}</span>
                </div>
              )}
              {t.fatherName && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Father&apos;s name</span>
                  <span className="customer-status-value">{t.fatherName}</span>
                </div>
              )}
              {t.motherName && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Mother&apos;s name</span>
                  <span className="customer-status-value">{t.motherName}</span>
                </div>
              )}
              {t.spouseName && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Spouse&apos;s name</span>
                  <span className="customer-status-value">{t.spouseName}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
