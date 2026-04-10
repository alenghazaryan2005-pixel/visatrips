'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { formatOrderNum, VISA_LABELS, STATUS_COLORS } from '@/lib/constants';

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

  const handleLogout = async () => {
    await fetch('/api/customer/logout', { method: 'POST' });
    router.push('/login');
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
            ...(updatedFlags.length === 0 ? { status: 'UNDER_REVIEW', specialistNotes: '' } : {}),
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
              <span className="customer-correction-icon">⚠️</span>
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
            <h3 className="customer-reupload-title">📄 Please re-upload the following documents</h3>
            {flaggedDocs.includes('photoUrl') && (
              <div className="customer-reupload-item">
                <div className="customer-reupload-label">Traveler&apos;s Photo</div>
                <p className="customer-reupload-hint">Upload a clear, front-facing photo. No passport photos.</p>
                <input id="reupload-photo" type="file" accept="image/*" style={{display:'none'}} onChange={e => handleDocReupload(e, 'photo', 'photoUrl')} />
                <button className="customer-reupload-btn" onClick={() => document.getElementById('reupload-photo')?.click()}>
                  {reuploadingDoc === 'photo' ? 'Uploading...' : '📤 Upload New Photo'}
                </button>
              </div>
            )}
            {flaggedDocs.includes('passportBioUrl') && (
              <div className="customer-reupload-item">
                <div className="customer-reupload-label">Passport Bio Page</div>
                <p className="customer-reupload-hint">Upload a clear scan of your passport data page.</p>
                <input id="reupload-passport" type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={e => handleDocReupload(e, 'passport', 'passportBioUrl')} />
                <button className="customer-reupload-btn" onClick={() => document.getElementById('reupload-passport')?.click()}>
                  {reuploadingDoc === 'passport' ? 'Uploading...' : '📤 Upload New Passport Scan'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* eVisa Document — shown when approved and uploaded */}
        {order.evisaUrl && (
          <div className="customer-evisa-card">
            <div className="customer-evisa-header">
              <span className="customer-evisa-icon">✅</span>
              <div>
                <h3 className="customer-evisa-title">Your E-Visa is Ready!</h3>
                <p className="customer-evisa-sub">Your electronic visa has been approved. Download it below and print a copy for your trip.</p>
              </div>
            </div>
            <div className="customer-evisa-content">
              {order.evisaUrl.endsWith('.pdf') ? (
                <div className="customer-evisa-pdf">📄 E-Visa Document (PDF)</div>
              ) : (
                <img src={order.evisaUrl} alt="Your E-Visa" className="customer-evisa-img" />
              )}
              <div className="customer-evisa-actions">
                <a href={order.evisaUrl} target="_blank" rel="noopener noreferrer" className="customer-evisa-view">View E-Visa</a>
                <a href={order.evisaUrl} download className="customer-evisa-download">⬇ Download E-Visa</a>
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        {(() => {
          const isProcessing = order.status === 'UNDER_REVIEW' || order.status === 'APPROVED' || travelers.some(t => t.finishStep === 'complete');
          return order.evisaUrl ? null : order.status === 'NEEDS_CORRECTION' ? null : isProcessing ? (
            <div className="customer-status-cta" style={{ background: '#16a34a' }}>
              <div>
                <h3 className="customer-status-cta-title">Your Application is Processing!</h3>
                <p className="customer-status-cta-text">We are reviewing your visa application. You will be notified of any updates.</p>
              </div>
            </div>
          ) : (
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
