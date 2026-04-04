'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface Traveler { firstName: string; lastName: string; email: string; dob?: string; address?: string; city?: string; state?: string; zip?: string; isEmployed?: string; hasCriminalRecord?: string; hasConfirmedTravel?: string; arrivalDate?: string; passportCountry?: string; passportNumber?: string; passportPlaceOfIssue?: string; passportCountryOfIssue?: string; passportIssued?: string; passportExpiry?: string; arrivalPoint?: string; visitedCountries?: string[]; parentsFromPakistan?: string; gender?: string; countryOfBirth?: string; cityOfBirth?: string; holdAnotherNationality?: string; otherNationality?: string; maritalStatus?: string; citizenshipId?: string; religion?: string; visibleMarks?: string; educationalQualification?: string; nationalityByBirth?: string; livedTwoYears?: string; phoneNumber?: string; residenceCountry?: string; employmentStatus?: string; employerName?: string; employerAddress?: string; employerCity?: string; employerState?: string; employerCountry?: string; employerZip?: string; studentProvider?: string; servedMilitary?: string; knowParents?: string; fatherName?: string; fatherNationality?: string; fatherPlaceOfBirth?: string; fatherCountryOfBirth?: string; motherName?: string; motherNationality?: string; motherPlaceOfBirth?: string; motherCountryOfBirth?: string; spouseName?: string; spouseNationality?: string; spousePlaceOfBirth?: string; spouseCountryOfBirth?: string; photoUrl?: string; passportBioUrl?: string; passportPlaceOfIssue2?: string; passportCountryOfIssue2?: string; hasOtherPassport?: string; otherPassportNumber?: string; otherPassportDateOfIssue?: string; otherPassportPlaceOfIssue?: string; placesToVisit?: string; bookedHotel?: string; hotelName?: string; hotelPlace?: string; tourOperatorName?: string; tourOperatorAddress?: string; exitPort?: string; visitedIndiaBefore?: string; visaRefusedBefore?: string; refNameIndia?: string; refAddressIndia?: string; refStateIndia?: string; refDistrictIndia?: string; refPhoneIndia?: string; refAddressHome?: string; refStateHome?: string; refDistrictHome?: string; refPhoneHome?: string; everArrested?: string; everRefusedEntry?: string; soughtAsylum?: string; finishStep?: string; }

interface Order {
  id:           string;
  orderNumber:  number;
  createdAt:    string;
  updatedAt:    string;
  destination:  string;
  visaType:     string;
  totalUSD:     number;
  status:       string;
  billingEmail: string;
  travelers:    Traveler[] | string;
  notes:        string | null;
  cardLast4:       string | null;
  processingSpeed: string;
  lastEditedBy:    string | null;
  applicationId:   string | null;
  refundAmount:    number | null;
  refundReason:    string | null;
  refundedAt:      string | null;
}

import { formatOrderNum, VISA_LABELS, STATUS_COLORS, VISA_COLORS, COUNTRY_FLAGS } from '@/lib/constants';

/* ── Sidebar ───────────────────────────────────────────────────────────────── */

function AdminSidebar({ onLogout }: { onLogout: () => void }) {
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-logo">
        <Link href="/" className="logo" style={{ color: 'white', fontSize: '1rem' }}>VisaTrips<sup style={{ color: 'var(--blue2)' }}>®</sup></Link>
        <span className="admin-sidebar-badge">Admin</span>
      </div>
      <nav className="admin-nav">
        <Link href="/admin" className="admin-nav-item active" style={{ textDecoration: 'none' }} onClick={() => { if (typeof window !== 'undefined') sessionStorage.setItem('admin_section', 'orders'); }}>📋 Orders</Link>
        <Link href="/admin" className="admin-nav-item" style={{ textDecoration: 'none' }} onClick={() => { if (typeof window !== 'undefined') sessionStorage.setItem('admin_section', 'customers'); }}>👤 Customer Accounts</Link>
        <Link href="/admin" className="admin-nav-item" style={{ textDecoration: 'none' }} onClick={() => { if (typeof window !== 'undefined') sessionStorage.setItem('admin_section', 'refunds'); }}>💸 Refunds</Link>
        <Link href="/admin" className="admin-nav-item" style={{ textDecoration: 'none' }} onClick={() => { if (typeof window !== 'undefined') sessionStorage.setItem('admin_section', 'abandoned'); }}>🚫 Abandoned</Link>
      </nav>
      <button className="admin-logout-btn" onClick={onLogout}>← Sign Out</button>
    </aside>
  );
}

/* ── Notes Dropdown ────────────────────────────────────────────────────────── */

function NotesDropdown({ notes, setNotes, editing, editData, updateEditField, saving, saved, saveNotes, orderNotes, applicationId, setApplicationId, orderApplicationId, orderId }: any) {
  const [open, setOpen] = useState(false);
  const [appIdSaving, setAppIdSaving] = useState(false);
  const [appIdSaved, setAppIdSaved] = useState(false);
  const hasNotes = editing ? !!editData?.notes : !!notes;
  const hasAppId = editing ? !!editData?.applicationId : !!applicationId;

  const saveApplicationId = async () => {
    setAppIdSaving(true);
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });
      setAppIdSaved(true);
      setTimeout(() => setAppIdSaved(false), 2000);
    } catch {} finally { setAppIdSaving(false); }
  };

  return (
    <div className="od-notes-dropdown">
      <button className="od-notes-toggle" onClick={() => setOpen(!open)}>
        <span className="od-notes-toggle-label">📝 Internal Notes {(hasNotes || hasAppId) && <span className="od-notes-indicator" />}</span>
        <span className={`od-notes-chevron${open ? ' open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="od-notes-body">
          {/* Application ID */}
          <div style={{ marginBottom: '1rem' }}>
            <label className="ap-field-label" style={{ marginBottom: '0.35rem', display: 'block' }}>Application ID</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                className="ap-input"
                placeholder="Enter eVisa Application ID..."
                value={editing ? (editData.applicationId ?? '') : applicationId}
                onChange={e => editing ? updateEditField('applicationId', e.target.value) : setApplicationId(e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              />
              {!editing && (
                <button
                  className={`apply-submit${applicationId !== (orderApplicationId ?? '') ? ' active' : ''}`}
                  onClick={saveApplicationId}
                  disabled={appIdSaving || applicationId === (orderApplicationId ?? '')}
                  style={{ whiteSpace: 'nowrap', padding: '0.5rem 0.75rem', fontSize: '0.8rem', flexShrink: 0, width: 'auto', minWidth: 'auto' }}
                >
                  {appIdSaving ? '...' : appIdSaved ? '✓' : 'Save'}
                </button>
              )}
            </div>
          </div>

          {/* Notes */}
          <label className="ap-field-label" style={{ marginBottom: '0.35rem', display: 'block' }}>Notes</label>
          <textarea
            className="ap-input contact-textarea"
            rows={6}
            placeholder="Add notes about this application..."
            value={editing ? editData.notes : notes}
            onChange={e => editing ? updateEditField('notes', e.target.value) : setNotes(e.target.value)}
          />
          {!editing && (
            <button
              className={`apply-submit${notes !== (orderNotes ?? '') ? ' active' : ''}`}
              onClick={saveNotes}
              disabled={saving || notes === (orderNotes ?? '')}
              style={{ marginTop: '0.75rem' }}
            >
              {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Notes'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

function parseTravelers(t: Traveler[] | string): Traveler[] {
  try {
    if (Array.isArray(t)) return t;
    if (typeof t === 'string') return JSON.parse(t);
    return [];
  } catch { return []; }
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder]     = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [notes, setNotes]     = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  // Edit mode state
  const [editing, setEditing]       = useState(false);
  const [editData, setEditData]     = useState<any>(null);
  const [editTravelers, setEditTravelers] = useState<Traveler[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  // Refund modal state
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundSaving, setRefundSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then(data => {
        setOrder(data);
        setNotes(data.notes ?? '');
        setApplicationId(data.applicationId ?? '');
      })
      .catch(() => setError('Order not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const travelers: Traveler[] = order ? parseTravelers(order.travelers) : [];

  const handleStatusChange = async (status: string) => {
    if (!order) return;
    await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setOrder(prev => prev ? { ...prev, status } : null);
  };

  const saveNotes = async () => {
    if (!order) return;
    setSaving(true);
    await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    setOrder(prev => prev ? { ...prev, notes } : null);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const startEditing = () => {
    if (!order) return;
    setEditData({
      destination: order.destination,
      visaType: order.visaType,
      totalUSD: order.totalUSD,
      billingEmail: order.billingEmail,
      cardLast4: order.cardLast4 ?? '',
      processingSpeed: order.processingSpeed ?? 'standard',
      status: order.status,
      notes: order.notes ?? '',
      applicationId: order.applicationId ?? '',
    });
    setEditTravelers(travelers.map(t => ({ ...t })));
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditData(null);
    setEditTravelers([]);
  };

  const handleRefund = async () => {
    if (!order) return;
    setRefundSaving(true);
    const amount = refundAmount ? parseFloat(refundAmount) : order.totalUSD;
    const res = await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'REFUNDED',
        refundAmount: amount,
        refundReason: refundReason || null,
        refundedAt: new Date().toISOString(),
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setOrder(updated);
      setShowRefundModal(false);
      setRefundAmount('');
      setRefundReason('');
    }
    setRefundSaving(false);
  };

  const saveFullEdit = async () => {
    if (!order || !editData) return;
    setEditSaving(true);
    const res = await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editData,
        totalUSD: parseFloat(editData.totalUSD),
        travelers: JSON.stringify(editTravelers),
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setOrder(updated);
      setNotes(updated.notes ?? '');
      setApplicationId(updated.applicationId ?? '');
      setEditing(false);
      setEditData(null);
      setEditTravelers([]);
    }
    setEditSaving(false);
  };

  const updateEditField = (field: string, value: any) => {
    setEditData((prev: any) => ({ ...prev, [field]: value }));
  };

  const updateEditTraveler = (index: number, field: string, value: string) => {
    setEditTravelers(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const addEditTraveler = () => {
    setEditTravelers(prev => [...prev, { firstName: '', lastName: '', email: '' } as Traveler]);
  };

  const removeEditTraveler = (index: number) => {
    if (editTravelers.length <= 1) return;
    setEditTravelers(prev => prev.filter((_, i) => i !== index));
  };

  const clearFamilyMember = (index: number, member: 'father' | 'mother' | 'spouse') => {
    const fields: Record<string, string> = {};
    if (member === 'father') {
      fields.fatherName = ''; fields.fatherNationality = ''; fields.fatherPlaceOfBirth = ''; fields.fatherCountryOfBirth = '';
    } else if (member === 'mother') {
      fields.motherName = ''; fields.motherNationality = ''; fields.motherPlaceOfBirth = ''; fields.motherCountryOfBirth = '';
    } else {
      fields.spouseName = ''; fields.spouseNationality = ''; fields.spousePlaceOfBirth = ''; fields.spouseCountryOfBirth = '';
    }
    setEditTravelers(prev => prev.map((t, i) => i === index ? { ...t, ...fields } : t));
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin';
  };

  if (loading) return (
    <div className="admin-shell">
      <AdminSidebar onLogout={handleLogout} />
      <div className="admin-main"><div className="order-detail-loading">Loading order...</div></div>
    </div>
  );
  if (error || !order) return (
    <div className="admin-shell">
      <AdminSidebar onLogout={handleLogout} />
      <div className="admin-main">
        <div className="order-detail-loading">
          <p>{error || 'Order not found.'}</p>
          <Link href="/admin" className="order-detail-back">← Back to Orders</Link>
        </div>
      </div>
    </div>
  );

  const createdDate = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const createdTime = new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const updatedDate = new Date(order.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const updatedTime = new Date(order.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="admin-shell">
      <AdminSidebar onLogout={handleLogout} />
      <div className="admin-main">
      <div className="order-detail-shell">

      {/* Back link */}
      <div className="od-top-actions">
        <Link href="/admin" className="order-detail-back">← Back to Orders</Link>
      </div>

      {/* ── TOP BAR: Order #, Price, Dates ── */}
      <div className="od-topbar">
        <div className="od-topbar-left">
          <h1 className="order-detail-title">Order {formatOrderNum(order.orderNumber)}</h1>
          {!editing ? (
            <span className={`admin-visa-chip ${VISA_COLORS[order.visaType] ?? 'visa-other'}`}>{VISA_LABELS[order.visaType] ?? order.visaType}</span>
          ) : (
            <select className="od-edit-input" value={editData.visaType} onChange={e => updateEditField('visaType', e.target.value)}>
              <option value="TOURIST_30">Tourist – 30 days</option>
              <option value="TOURIST_1Y">Tourist – 1 year</option>
              <option value="TOURIST_5Y">Tourist – 5 years</option>
              <option value="BUSINESS_1Y">Business – 1 year</option>
              <option value="MEDICAL_60">Medical – 60 days</option>
            </select>
          )}
        </div>
        <div className="od-topbar-meta">
          <div className="od-meta-item">
            <span className="od-meta-label">Amount</span>
            {!editing ? (
              <span className="od-meta-value od-price">${order.totalUSD} USD</span>
            ) : (
              <input className="od-edit-input" type="number" step="0.01" value={editData.totalUSD} onChange={e => updateEditField('totalUSD', e.target.value)} />
            )}
          </div>
          <div className="od-meta-item">
            <span className="od-meta-label">Placed</span>
            <span className="od-meta-value">{createdDate} at {createdTime}</span>
          </div>
          <div className="od-meta-item">
            <span className="od-meta-label">Last updated</span>
            <span className="od-meta-value">{updatedDate} at {updatedTime}</span>
            {order.lastEditedBy && <span className="od-meta-edited-by">by {order.lastEditedBy}</span>}
          </div>
        </div>
      </div>

      {/* ── STATUS SECTION ── */}
      <div className="od-status-bar">
        <div className="od-status-left">
          <span className="od-status-label">Status</span>
          <span className={`admin-status ${STATUS_COLORS[editing ? editData.status : order.status] ?? ''}`}>{(editing ? editData.status : order.status).replace('_', ' ')}</span>
        </div>
        <div className="od-status-right">
          <label className="od-status-label">Update status</label>
          <select
            className="ap-select"
            value={editing ? editData.status : order.status}
            onChange={e => editing ? updateEditField('status', e.target.value) : handleStatusChange(e.target.value)}
          >
            <option value="PENDING">Pending</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="REFUNDED">Refunded</option>
            <option value="ON_HOLD">On Hold</option>
          </select>
          {order.status !== 'REFUNDED' && !editing && (
            <button className="od-refund-btn" onClick={() => setShowRefundModal(true)}>
              💸 Refund
            </button>
          )}
        </div>
      </div>

      {/* Refund info banner */}
      {order.status === 'REFUNDED' && (
        <div className="od-refund-banner">
          <div className="od-refund-banner-title">💸 Refunded</div>
          <div className="od-refund-banner-details">
            <span>Amount: <strong>${(order.refundAmount ?? order.totalUSD).toFixed(2)}</strong>
              {order.refundAmount != null && order.refundAmount < order.totalUSD && ' (partial)'}
            </span>
            {order.refundedAt && <span>Date: {new Date(order.refundedAt).toLocaleDateString()}</span>}
            {order.refundReason && <span>Reason: {order.refundReason}</span>}
          </div>
        </div>
      )}

      {/* ── VISA DETAILS ── */}
      <div className="modal-section" style={{ maxWidth: '100%' }}>
        <div className="modal-section-title">📋 Visa Details</div>
        <div className="od-visa-grid">
          <div className="modal-row">
            <span className="modal-row-label">Destination</span>
            {!editing ? <span className="modal-row-value">{COUNTRY_FLAGS[order.destination] ?? ''} {order.destination}</span>
              : <input className="od-edit-input" value={editData.destination} onChange={e => updateEditField('destination', e.target.value)} />}
          </div>
          <div className="modal-row">
            <span className="modal-row-label">Visa type</span>
            <span className="modal-row-value">{VISA_LABELS[editing ? editData.visaType : order.visaType] ?? (editing ? editData.visaType : order.visaType)}</span>
          </div>
          <div className="modal-row">
            <span className="modal-row-label">Travelers</span>
            <span className="modal-row-value">{editing ? editTravelers.length : travelers.length}</span>
          </div>
          <div className="modal-row">
            <span className="modal-row-label">Processing</span>
            {!editing ? (
              <span className={`modal-row-value processing-badge processing-${order.processingSpeed}`}>
                {order.processingSpeed === 'super' ? 'Super Rush' : order.processingSpeed === 'rush' ? 'Rush' : 'Standard'}
              </span>
            ) : (
              <select className="od-edit-input" value={editData.processingSpeed} onChange={e => updateEditField('processingSpeed', e.target.value)}>
                <option value="standard">Standard</option>
                <option value="rush">Rush</option>
                <option value="super">Super Rush</option>
              </select>
            )}
          </div>
          <div className="modal-row">
            <span className="modal-row-label">Billing email</span>
            {!editing ? <span className="modal-row-value">{order.billingEmail}</span>
              : <input className="od-edit-input" type="email" value={editData.billingEmail} onChange={e => updateEditField('billingEmail', e.target.value)} />}
          </div>
          {(editing ? editData.cardLast4 : order.cardLast4) && <div className="modal-row">
            <span className="modal-row-label">Card on file</span>
            <span className="modal-row-value modal-mono">XXXX-XXXX-XXXX-{editing ? editData.cardLast4 : order.cardLast4}</span>
          </div>}
        </div>
      </div>

      {/* ── INTERNAL NOTES DROPDOWN ── */}
      <NotesDropdown
        notes={notes}
        setNotes={setNotes}
        editing={editing}
        editData={editData}
        updateEditField={updateEditField}
        saving={saving}
        saved={saved}
        saveNotes={saveNotes}
        orderNotes={order.notes}
        applicationId={applicationId}
        setApplicationId={setApplicationId}
        orderApplicationId={order.applicationId}
        orderId={id}
      />

      {/* ── FULL EDIT BUTTON ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        {!editing ? (
          <button className="od-edit-btn" onClick={startEditing}>✏️ Full Edit</button>
        ) : (
          <div className="od-edit-actions">
            <button className="od-cancel-btn" onClick={cancelEditing}>Cancel</button>
            <button className="od-save-btn" onClick={saveFullEdit} disabled={editSaving}>
              {editSaving ? 'Saving...' : '💾 Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* ── TRAVELER DETAILS: Full-width ── */}
      <div className="od-traveler-sections">

          {/* Traveler cards */}
          {(!editing ? travelers : editTravelers).map((t, i) => (
            <div key={i} className="modal-section">
              <div className="modal-section-title" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>👤 Traveler #{i + 1}{!editing && t.firstName ? ` — ${t.firstName} ${t.lastName}` : ''}</span>
                {editing && editTravelers.length > 1 && (
                  <button type="button" className="od-edit-remove-btn" onClick={() => removeEditTraveler(i)}>✕ Remove Traveler</button>
                )}
              </div>

              {!editing ? (
                <>
                  {/* Personal */}
                  <div className="modal-subsection-title">Personal Details</div>
                  <div className="modal-rows">
                    <div className="modal-row"><span className="modal-row-label">Full name</span><span className="modal-row-value">{t.firstName} {t.lastName}</span></div>
                    {t.dob && <div className="modal-row"><span className="modal-row-label">Date of birth</span><span className="modal-row-value">{t.dob}</span></div>}
                    <div className="modal-row"><span className="modal-row-label">Email</span><span className="modal-row-value">{t.email}</span></div>
                    {t.gender && <div className="modal-row"><span className="modal-row-label">Gender</span><span className="modal-row-value">{t.gender}</span></div>}
                    {t.countryOfBirth && <div className="modal-row"><span className="modal-row-label">Country of birth</span><span className="modal-row-value">{t.countryOfBirth}</span></div>}
                    {t.cityOfBirth && <div className="modal-row"><span className="modal-row-label">City of birth</span><span className="modal-row-value">{t.cityOfBirth}</span></div>}
                    {t.maritalStatus && <div className="modal-row"><span className="modal-row-label">Marital status</span><span className="modal-row-value">{t.maritalStatus}</span></div>}
                    {t.citizenshipId && <div className="modal-row"><span className="modal-row-label">Citizenship/National ID</span><span className="modal-row-value modal-mono">{t.citizenshipId}</span></div>}
                    {t.religion && <div className="modal-row"><span className="modal-row-label">Religion</span><span className="modal-row-value">{t.religion}</span></div>}
                    {t.visibleMarks && <div className="modal-row"><span className="modal-row-label">Visible marks</span><span className="modal-row-value">{t.visibleMarks}</span></div>}
                    {t.educationalQualification && <div className="modal-row"><span className="modal-row-label">Education</span><span className="modal-row-value">{t.educationalQualification}</span></div>}
                    {t.nationalityByBirth && <div className="modal-row"><span className="modal-row-label">Nationality acquired</span><span className="modal-row-value">{t.nationalityByBirth === 'birth' ? 'By birth' : 'By naturalization'}</span></div>}
                    {t.livedTwoYears && <div className="modal-row"><span className="modal-row-label">Lived 2+ yrs in applying country</span><span className="modal-row-value">{t.livedTwoYears === 'yes' ? 'Yes' : 'No'}</span></div>}
                    {t.phoneNumber && <div className="modal-row"><span className="modal-row-label">Phone</span><span className="modal-row-value">{t.phoneNumber}</span></div>}
                    {t.holdAnotherNationality && <div className="modal-row"><span className="modal-row-label">Holds another nationality</span><span className="modal-row-value">{t.holdAnotherNationality === 'yes' ? `Yes — ${t.otherNationality}` : 'No'}</span></div>}
                    {t.parentsFromPakistan && <div className="modal-row"><span className="modal-row-label">Parents/grandparents from Pakistan</span><span className="modal-row-value">{t.parentsFromPakistan === 'yes' ? 'Yes' : 'No'}</span></div>}
                  </div>

                  {/* Trip Details */}
                  {(t.arrivalDate || t.arrivalPoint || (t.visitedCountries && t.visitedCountries.length > 0)) && <>
                    <div className="modal-subsection-title">Trip Details</div>
                    <div className="modal-rows">
                      {t.arrivalDate && <div className="modal-row"><span className="modal-row-label">Arrival date</span><span className="modal-row-value">{t.arrivalDate}</span></div>}
                      {t.arrivalPoint && <div className="modal-row"><span className="modal-row-label">Arrival point</span><span className="modal-row-value">{t.arrivalPoint}</span></div>}
                      {t.visitedCountries && t.visitedCountries.length > 0 && <div className="modal-row"><span className="modal-row-label">Countries visited (10 yrs)</span><span className="modal-row-value">{t.visitedCountries.join(', ')}</span></div>}
                    </div>
                  </>}

                  {/* Address */}
                  {(t.address || t.city || t.state || t.zip || t.residenceCountry) && <>
                    <div className="modal-subsection-title">Address</div>
                    <div className="modal-rows">
                      {t.residenceCountry && <div className="modal-row"><span className="modal-row-label">Country of residence</span><span className="modal-row-value">{t.residenceCountry}</span></div>}
                      {t.address && <div className="modal-row"><span className="modal-row-label">Home address</span><span className="modal-row-value">{t.address}</span></div>}
                      {(t.city || t.state || t.zip) && <div className="modal-row"><span className="modal-row-label">City / State / ZIP</span><span className="modal-row-value">{[t.city, t.state, t.zip].filter(Boolean).join(', ')}</span></div>}
                    </div>
                  </>}

                  {/* Employment */}
                  {(t.employmentStatus || t.isEmployed || t.servedMilitary) && <>
                    <div className="modal-subsection-title">Employment</div>
                    <div className="modal-rows">
                      {t.employmentStatus && <div className="modal-row"><span className="modal-row-label">Status</span><span className="modal-row-value">{t.employmentStatus}</span></div>}
                      {t.employerName && <div className="modal-row"><span className="modal-row-label">Employer</span><span className="modal-row-value">{t.employerName}</span></div>}
                      {t.employerAddress && <div className="modal-row"><span className="modal-row-label">Employer address</span><span className="modal-row-value">{[t.employerAddress, t.employerCity, t.employerState, t.employerCountry, t.employerZip].filter(Boolean).join(', ')}</span></div>}
                      {t.studentProvider && <div className="modal-row"><span className="modal-row-label">Student provider</span><span className="modal-row-value">{t.studentProvider === 'father' ? "Father's details" : "Spouse's details"}</span></div>}
                      {t.servedMilitary && <div className="modal-row"><span className="modal-row-label">Military/police service</span><span className="modal-row-value">{t.servedMilitary === 'yes' ? 'Yes' : 'No'}</span></div>}
                      {t.isEmployed && !t.employmentStatus && <div className="modal-row"><span className="modal-row-label">Employed</span><span className="modal-row-value">{t.isEmployed === 'yes' ? 'Yes' : 'No'}</span></div>}
                    </div>
                  </>}

                  {/* Additional Info (legacy) */}
                  {(t.hasCriminalRecord || t.hasConfirmedTravel) && <>
                    <div className="modal-subsection-title">Additional Information</div>
                    <div className="modal-rows">
                      {t.hasCriminalRecord && <div className="modal-row"><span className="modal-row-label">Criminal record</span><span className={`modal-row-value${t.hasCriminalRecord === 'yes' ? ' text-red-600 font-semibold' : ''}`}>{t.hasCriminalRecord === 'yes' ? 'Yes' : 'No'}</span></div>}
                      {t.hasConfirmedTravel && <div className="modal-row"><span className="modal-row-label">Confirmed travel</span><span className="modal-row-value">{t.hasConfirmedTravel === 'yes' ? 'Yes' : 'No'}</span></div>}
                    </div>
                  </>}

                  {/* Family */}
                  {(t.fatherName || t.motherName || t.spouseName || t.knowParents) && <>
                    <div className="modal-subsection-title">Family Details</div>
                    <div className="modal-rows">
                      {t.fatherName && <div className="modal-row"><span className="modal-row-label">Father</span><span className="modal-row-value">{t.fatherName}{t.fatherNationality ? ` (${t.fatherNationality})` : ''}</span></div>}
                      {(t.fatherPlaceOfBirth || t.fatherCountryOfBirth) && <div className="modal-row"><span className="modal-row-label">Father&apos;s birthplace</span><span className="modal-row-value">{[t.fatherPlaceOfBirth, t.fatherCountryOfBirth].filter(Boolean).join(', ')}</span></div>}
                      {t.motherName && <div className="modal-row"><span className="modal-row-label">Mother</span><span className="modal-row-value">{t.motherName}{t.motherNationality ? ` (${t.motherNationality})` : ''}</span></div>}
                      {(t.motherPlaceOfBirth || t.motherCountryOfBirth) && <div className="modal-row"><span className="modal-row-label">Mother&apos;s birthplace</span><span className="modal-row-value">{[t.motherPlaceOfBirth, t.motherCountryOfBirth].filter(Boolean).join(', ')}</span></div>}
                      {t.spouseName && <div className="modal-row"><span className="modal-row-label">Spouse</span><span className="modal-row-value">{t.spouseName}{t.spouseNationality ? ` (${t.spouseNationality})` : ''}</span></div>}
                      {(t.spousePlaceOfBirth || t.spouseCountryOfBirth) && <div className="modal-row"><span className="modal-row-label">Spouse&apos;s birthplace</span><span className="modal-row-value">{[t.spousePlaceOfBirth, t.spouseCountryOfBirth].filter(Boolean).join(', ')}</span></div>}
                      {t.knowParents === 'none' && <div className="modal-row"><span className="modal-row-label">Parents</span><span className="modal-row-value">Unknown</span></div>}
                    </div>
                  </>}

                  {/* Passport */}
                  {(t.passportCountry || t.passportNumber) && <>
                    <div className="modal-subsection-title">Passport Details</div>
                    <div className="modal-rows">
                      {t.passportCountry && <div className="modal-row"><span className="modal-row-label">Country</span><span className="modal-row-value">{t.passportCountry}</span></div>}
                      {t.passportNumber && <div className="modal-row"><span className="modal-row-label">Number</span><span className="modal-row-value modal-mono">{t.passportNumber}</span></div>}
                      {t.passportPlaceOfIssue && <div className="modal-row"><span className="modal-row-label">Place of issue</span><span className="modal-row-value">{t.passportPlaceOfIssue}</span></div>}
                      {t.passportCountryOfIssue && <div className="modal-row"><span className="modal-row-label">Country of issue</span><span className="modal-row-value">{t.passportCountryOfIssue}</span></div>}
                      {t.passportIssued && <div className="modal-row"><span className="modal-row-label">Issued</span><span className="modal-row-value">{t.passportIssued}</span></div>}
                      {t.passportExpiry && <div className="modal-row"><span className="modal-row-label">Expiry</span><span className="modal-row-value">{t.passportExpiry}</span></div>}
                      {t.hasOtherPassport && <div className="modal-row"><span className="modal-row-label">Other passport/IC</span><span className="modal-row-value">{t.hasOtherPassport === 'yes' ? `Yes — ${t.otherPassportNumber || ''}` : 'No'}</span></div>}
                    </div>
                  </>}

                  {/* Travel & Accommodation */}
                  {(t.placesToVisit || t.bookedHotel || t.exitPort || t.visitedIndiaBefore) && <>
                    <div className="modal-subsection-title">Travel &amp; Accommodation</div>
                    <div className="modal-rows">
                      {t.placesToVisit && <div className="modal-row"><span className="modal-row-label">Places to visit</span><span className="modal-row-value">{t.placesToVisit}</span></div>}
                      {t.bookedHotel && <div className="modal-row"><span className="modal-row-label">Hotel booked</span><span className="modal-row-value">{t.bookedHotel === 'yes' ? `Yes — ${t.hotelName || ''}, ${t.hotelPlace || ''}` : 'No'}</span></div>}
                      {t.tourOperatorName && <div className="modal-row"><span className="modal-row-label">Tour operator</span><span className="modal-row-value">{t.tourOperatorName}</span></div>}
                      {t.exitPort && <div className="modal-row"><span className="modal-row-label">Exit airport</span><span className="modal-row-value">{t.exitPort}</span></div>}
                      {t.visitedIndiaBefore && <div className="modal-row"><span className="modal-row-label">Visited India before</span><span className="modal-row-value">{t.visitedIndiaBefore === 'yes' ? 'Yes' : 'No'}</span></div>}
                      {t.visaRefusedBefore && <div className="modal-row"><span className="modal-row-label">Visa refused before</span><span className={`modal-row-value${t.visaRefusedBefore === 'yes' ? ' text-red-600 font-semibold' : ''}`}>{t.visaRefusedBefore === 'yes' ? 'Yes' : 'No'}</span></div>}
                    </div>
                  </>}

                  {/* References */}
                  {(t.refNameIndia || t.refAddressHome) && <>
                    <div className="modal-subsection-title">References</div>
                    <div className="modal-rows">
                      {t.refNameIndia && <div className="modal-row"><span className="modal-row-label">India reference</span><span className="modal-row-value">{t.refNameIndia}</span></div>}
                      {t.refAddressIndia && <div className="modal-row"><span className="modal-row-label">India address</span><span className="modal-row-value">{[t.refAddressIndia, t.refStateIndia, t.refDistrictIndia].filter(Boolean).join(', ')}</span></div>}
                      {t.refPhoneIndia && <div className="modal-row"><span className="modal-row-label">India phone</span><span className="modal-row-value">{t.refPhoneIndia}</span></div>}
                      {t.refAddressHome && <div className="modal-row"><span className="modal-row-label">Home country address</span><span className="modal-row-value">{[t.refAddressHome, t.refStateHome, t.refDistrictHome].filter(Boolean).join(', ')}</span></div>}
                      {t.refPhoneHome && <div className="modal-row"><span className="modal-row-label">Home country phone</span><span className="modal-row-value">{t.refPhoneHome}</span></div>}
                    </div>
                  </>}

                  {/* Security Questions */}
                  {(t.everArrested || t.everRefusedEntry || t.soughtAsylum) && <>
                    <div className="modal-subsection-title">Security</div>
                    <div className="modal-rows">
                      {t.everArrested && <div className="modal-row"><span className="modal-row-label">Arrested/convicted</span><span className={`modal-row-value${t.everArrested === 'yes' ? ' text-red-600 font-semibold' : ''}`}>{t.everArrested === 'yes' ? 'Yes' : 'No'}</span></div>}
                      {t.everRefusedEntry && <div className="modal-row"><span className="modal-row-label">Refused entry/deported</span><span className={`modal-row-value${t.everRefusedEntry === 'yes' ? ' text-red-600 font-semibold' : ''}`}>{t.everRefusedEntry === 'yes' ? 'Yes' : 'No'}</span></div>}
                      {t.soughtAsylum && <div className="modal-row"><span className="modal-row-label">Sought asylum</span><span className={`modal-row-value${t.soughtAsylum === 'yes' ? ' text-red-600 font-semibold' : ''}`}>{t.soughtAsylum === 'yes' ? 'Yes' : 'No'}</span></div>}
                    </div>
                  </>}

                  {/* Uploaded Documents */}
                  {(t.photoUrl || t.passportBioUrl) && <>
                    <div className="modal-subsection-title">Uploaded Documents</div>
                    <div style={{display:'flex',gap:'1.5rem',flexWrap:'wrap',marginTop:'0.5rem'}}>
                      {t.photoUrl && (
                        <div style={{textAlign:'center'}}>
                          <a href={t.photoUrl} target="_blank" rel="noopener noreferrer">
                            <img src={t.photoUrl} alt="Traveler photo" style={{maxWidth:'140px',maxHeight:'140px',borderRadius:'0.75rem',border:'2px solid var(--cloud)',objectFit:'cover',cursor:'pointer'}} />
                          </a>
                          <div style={{fontSize:'0.75rem',color:'var(--slate)',marginTop:'0.25rem'}}>Traveler Photo</div>
                          <a href={t.photoUrl} download style={{display:'inline-block',marginTop:'0.35rem',fontSize:'0.75rem',fontWeight:600,color:'var(--blue)',textDecoration:'none',padding:'0.25rem 0.75rem',borderRadius:'0.5rem',border:'1px solid var(--cloud)',background:'white'}}>
                            ⬇ Download
                          </a>
                        </div>
                      )}
                      {t.passportBioUrl && (
                        <div style={{textAlign:'center'}}>
                          <a href={t.passportBioUrl} target="_blank" rel="noopener noreferrer">
                            {t.passportBioUrl.endsWith('.pdf') ? (
                              <div style={{width:'140px',height:'140px',background:'#f1f5f9',borderRadius:'0.75rem',border:'2px solid var(--cloud)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2rem',cursor:'pointer'}}>📄</div>
                            ) : (
                              <img src={t.passportBioUrl} alt="Passport bio" style={{maxWidth:'200px',maxHeight:'140px',borderRadius:'0.75rem',border:'2px solid var(--cloud)',objectFit:'cover',cursor:'pointer'}} />
                            )}
                          </a>
                          <div style={{fontSize:'0.75rem',color:'var(--slate)',marginTop:'0.25rem'}}>Passport Bio Page</div>
                          <a href={t.passportBioUrl} download style={{display:'inline-block',marginTop:'0.35rem',fontSize:'0.75rem',fontWeight:600,color:'var(--blue)',textDecoration:'none',padding:'0.25rem 0.75rem',borderRadius:'0.5rem',border:'1px solid var(--cloud)',background:'white'}}>
                            ⬇ Download
                          </a>
                        </div>
                      )}
                    </div>
                  </>}

                  {/* Application Progress */}
                  {t.finishStep && <div style={{marginTop:'0.5rem',fontSize:'0.75rem',color:'var(--slate)'}}>Application progress: {t.finishStep}</div>}
                </>
              ) : (
                <div className="od-edit-grid">
                  {/* Personal Details */}
                  <div className="od-edit-section-title" style={{gridColumn:'1/-1'}}>Personal Details</div>
                  <div className="ap-field"><label className="ap-field-label">First name</label><input className="od-edit-input" value={t.firstName} onChange={e => updateEditTraveler(i, 'firstName', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Last name</label><input className="od-edit-input" value={t.lastName} onChange={e => updateEditTraveler(i, 'lastName', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Email</label><input className="od-edit-input" type="email" value={t.email} onChange={e => updateEditTraveler(i, 'email', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Date of birth</label><input className="od-edit-input" value={t.dob ?? ''} onChange={e => updateEditTraveler(i, 'dob', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Gender</label>
                    <select className="od-edit-input" value={t.gender ?? ''} onChange={e => updateEditTraveler(i, 'gender', e.target.value)}>
                      <option value="">—</option><option value="Male">Male</option><option value="Female">Female</option>
                    </select></div>
                  <div className="ap-field"><label className="ap-field-label">Country of birth</label><input className="od-edit-input" value={t.countryOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'countryOfBirth', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">City of birth</label><input className="od-edit-input" value={t.cityOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'cityOfBirth', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Citizenship/National ID</label><input className="od-edit-input" value={t.citizenshipId ?? ''} onChange={e => updateEditTraveler(i, 'citizenshipId', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Religion</label><input className="od-edit-input" value={t.religion ?? ''} onChange={e => updateEditTraveler(i, 'religion', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Visible marks</label><input className="od-edit-input" value={t.visibleMarks ?? ''} onChange={e => updateEditTraveler(i, 'visibleMarks', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Education</label><input className="od-edit-input" value={t.educationalQualification ?? ''} onChange={e => updateEditTraveler(i, 'educationalQualification', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Nationality acquired</label>
                    <select className="od-edit-input" value={t.nationalityByBirth ?? ''} onChange={e => updateEditTraveler(i, 'nationalityByBirth', e.target.value)}>
                      <option value="">—</option><option value="birth">By birth</option><option value="naturalization">By naturalization</option>
                    </select></div>
                  <div className="ap-field"><label className="ap-field-label">Lived 2+ yrs</label>
                    <select className="od-edit-input" value={t.livedTwoYears ?? ''} onChange={e => updateEditTraveler(i, 'livedTwoYears', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>
                  <div className="ap-field"><label className="ap-field-label">Phone</label><input className="od-edit-input" value={t.phoneNumber ?? ''} onChange={e => updateEditTraveler(i, 'phoneNumber', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Marital status</label>
                    <select className="od-edit-input" value={t.maritalStatus ?? ''} onChange={e => updateEditTraveler(i, 'maritalStatus', e.target.value)}>
                      <option value="">—</option><option value="Married">Married</option><option value="Single">Single</option><option value="Divorced">Divorced</option><option value="Widowed">Widowed</option>
                    </select></div>
                  <div className="ap-field"><label className="ap-field-label">Other nationality</label>
                    <select className="od-edit-input" value={t.holdAnotherNationality ?? ''} onChange={e => updateEditTraveler(i, 'holdAnotherNationality', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>
                  {t.holdAnotherNationality === 'yes' && <div className="ap-field"><label className="ap-field-label">Other nationality</label><input className="od-edit-input" value={t.otherNationality ?? ''} onChange={e => updateEditTraveler(i, 'otherNationality', e.target.value)} /></div>}
                  <div className="ap-field"><label className="ap-field-label">Parents from Pakistan</label>
                    <select className="od-edit-input" value={t.parentsFromPakistan ?? ''} onChange={e => updateEditTraveler(i, 'parentsFromPakistan', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>

                  {/* Trip Details */}
                  <div className="od-edit-section-title" style={{gridColumn:'1/-1'}}>Trip Details</div>
                  <div className="ap-field"><label className="ap-field-label">Arrival date</label><input className="od-edit-input" value={t.arrivalDate ?? ''} onChange={e => updateEditTraveler(i, 'arrivalDate', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Arrival point</label><input className="od-edit-input" value={t.arrivalPoint ?? ''} onChange={e => updateEditTraveler(i, 'arrivalPoint', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Confirmed travel</label>
                    <select className="od-edit-input" value={t.hasConfirmedTravel ?? ''} onChange={e => updateEditTraveler(i, 'hasConfirmedTravel', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>

                  {/* Address */}
                  <div className="od-edit-section-title" style={{gridColumn:'1/-1'}}>Address</div>
                  <div className="ap-field"><label className="ap-field-label">Country of residence</label><input className="od-edit-input" value={t.residenceCountry ?? ''} onChange={e => updateEditTraveler(i, 'residenceCountry', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Address</label><input className="od-edit-input" value={t.address ?? ''} onChange={e => updateEditTraveler(i, 'address', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">City</label><input className="od-edit-input" value={t.city ?? ''} onChange={e => updateEditTraveler(i, 'city', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">State</label><input className="od-edit-input" value={t.state ?? ''} onChange={e => updateEditTraveler(i, 'state', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">ZIP</label><input className="od-edit-input" value={t.zip ?? ''} onChange={e => updateEditTraveler(i, 'zip', e.target.value)} /></div>

                  {/* Employment */}
                  <div className="od-edit-section-title" style={{gridColumn:'1/-1'}}>Employment</div>
                  <div className="ap-field"><label className="ap-field-label">Employment status</label>
                    <select className="od-edit-input" value={t.employmentStatus ?? ''} onChange={e => updateEditTraveler(i, 'employmentStatus', e.target.value)}>
                      <option value="">—</option><option value="Employed">Employed</option><option value="Unemployed">Unemployed</option><option value="Student">Student</option><option value="Retired">Retired</option>
                    </select></div>
                  <div className="ap-field"><label className="ap-field-label">Employer name</label><input className="od-edit-input" value={t.employerName ?? ''} onChange={e => updateEditTraveler(i, 'employerName', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Employer address</label><input className="od-edit-input" value={t.employerAddress ?? ''} onChange={e => updateEditTraveler(i, 'employerAddress', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Employer city</label><input className="od-edit-input" value={t.employerCity ?? ''} onChange={e => updateEditTraveler(i, 'employerCity', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Employer state</label><input className="od-edit-input" value={t.employerState ?? ''} onChange={e => updateEditTraveler(i, 'employerState', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Employer country</label><input className="od-edit-input" value={t.employerCountry ?? ''} onChange={e => updateEditTraveler(i, 'employerCountry', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Employer ZIP</label><input className="od-edit-input" value={t.employerZip ?? ''} onChange={e => updateEditTraveler(i, 'employerZip', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Military/police</label>
                    <select className="od-edit-input" value={t.servedMilitary ?? ''} onChange={e => updateEditTraveler(i, 'servedMilitary', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>

                  {/* Family — Father */}
                  <div className="od-edit-section-title" style={{gridColumn:'1/-1', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <span>Father&apos;s Details</span>
                    {t.fatherName ? (
                      <button type="button" className="od-edit-remove-btn" onClick={() => clearFamilyMember(i, 'father')}>✕ Remove</button>
                    ) : (
                      <button type="button" className="od-edit-add-btn" onClick={() => updateEditTraveler(i, 'fatherName', ' ')}>+ Add</button>
                    )}
                  </div>
                  {(t.fatherName || '').trim() !== '' && <>
                    <div className="ap-field"><label className="ap-field-label">Father&apos;s name</label><input className="od-edit-input" value={t.fatherName ?? ''} onChange={e => updateEditTraveler(i, 'fatherName', e.target.value)} /></div>
                    <div className="ap-field"><label className="ap-field-label">Father&apos;s nationality</label><input className="od-edit-input" value={t.fatherNationality ?? ''} onChange={e => updateEditTraveler(i, 'fatherNationality', e.target.value)} /></div>
                    <div className="ap-field"><label className="ap-field-label">Father&apos;s birthplace</label><input className="od-edit-input" value={t.fatherPlaceOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'fatherPlaceOfBirth', e.target.value)} /></div>
                    <div className="ap-field"><label className="ap-field-label">Father&apos;s birth country</label><input className="od-edit-input" value={t.fatherCountryOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'fatherCountryOfBirth', e.target.value)} /></div>
                  </>}

                  {/* Family — Mother */}
                  <div className="od-edit-section-title" style={{gridColumn:'1/-1', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <span>Mother&apos;s Details</span>
                    {t.motherName ? (
                      <button type="button" className="od-edit-remove-btn" onClick={() => clearFamilyMember(i, 'mother')}>✕ Remove</button>
                    ) : (
                      <button type="button" className="od-edit-add-btn" onClick={() => updateEditTraveler(i, 'motherName', ' ')}>+ Add</button>
                    )}
                  </div>
                  {(t.motherName || '').trim() !== '' && <>
                    <div className="ap-field"><label className="ap-field-label">Mother&apos;s name</label><input className="od-edit-input" value={t.motherName ?? ''} onChange={e => updateEditTraveler(i, 'motherName', e.target.value)} /></div>
                    <div className="ap-field"><label className="ap-field-label">Mother&apos;s nationality</label><input className="od-edit-input" value={t.motherNationality ?? ''} onChange={e => updateEditTraveler(i, 'motherNationality', e.target.value)} /></div>
                    <div className="ap-field"><label className="ap-field-label">Mother&apos;s birthplace</label><input className="od-edit-input" value={t.motherPlaceOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'motherPlaceOfBirth', e.target.value)} /></div>
                    <div className="ap-field"><label className="ap-field-label">Mother&apos;s birth country</label><input className="od-edit-input" value={t.motherCountryOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'motherCountryOfBirth', e.target.value)} /></div>
                  </>}

                  {/* Family — Spouse */}
                  <div className="od-edit-section-title" style={{gridColumn:'1/-1', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <span>Spouse&apos;s Details</span>
                    {t.spouseName ? (
                      <button type="button" className="od-edit-remove-btn" onClick={() => clearFamilyMember(i, 'spouse')}>✕ Remove</button>
                    ) : (
                      <button type="button" className="od-edit-add-btn" onClick={() => updateEditTraveler(i, 'spouseName', ' ')}>+ Add</button>
                    )}
                  </div>
                  {(t.spouseName || '').trim() !== '' && <>
                    <div className="ap-field"><label className="ap-field-label">Spouse&apos;s name</label><input className="od-edit-input" value={t.spouseName ?? ''} onChange={e => updateEditTraveler(i, 'spouseName', e.target.value)} /></div>
                    <div className="ap-field"><label className="ap-field-label">Spouse&apos;s nationality</label><input className="od-edit-input" value={t.spouseNationality ?? ''} onChange={e => updateEditTraveler(i, 'spouseNationality', e.target.value)} /></div>
                    <div className="ap-field"><label className="ap-field-label">Spouse&apos;s birthplace</label><input className="od-edit-input" value={t.spousePlaceOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'spousePlaceOfBirth', e.target.value)} /></div>
                    <div className="ap-field"><label className="ap-field-label">Spouse&apos;s birth country</label><input className="od-edit-input" value={t.spouseCountryOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'spouseCountryOfBirth', e.target.value)} /></div>
                  </>}

                  {/* Passport */}
                  <div className="od-edit-section-title" style={{gridColumn:'1/-1'}}>Passport</div>
                  <div className="ap-field"><label className="ap-field-label">Passport country</label><input className="od-edit-input" value={t.passportCountry ?? ''} onChange={e => updateEditTraveler(i, 'passportCountry', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Passport number</label><input className="od-edit-input" value={t.passportNumber ?? ''} onChange={e => updateEditTraveler(i, 'passportNumber', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Place of issue</label><input className="od-edit-input" value={t.passportPlaceOfIssue ?? ''} onChange={e => updateEditTraveler(i, 'passportPlaceOfIssue', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Country of issue</label><input className="od-edit-input" value={t.passportCountryOfIssue ?? ''} onChange={e => updateEditTraveler(i, 'passportCountryOfIssue', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Passport issued</label><input className="od-edit-input" value={t.passportIssued ?? ''} onChange={e => updateEditTraveler(i, 'passportIssued', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Passport expiry</label><input className="od-edit-input" value={t.passportExpiry ?? ''} onChange={e => updateEditTraveler(i, 'passportExpiry', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Other passport</label>
                    <select className="od-edit-input" value={t.hasOtherPassport ?? ''} onChange={e => updateEditTraveler(i, 'hasOtherPassport', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>
                  {t.hasOtherPassport === 'yes' && <>
                    <div className="ap-field"><label className="ap-field-label">Other passport #</label><input className="od-edit-input" value={t.otherPassportNumber ?? ''} onChange={e => updateEditTraveler(i, 'otherPassportNumber', e.target.value)} /></div>
                    <div className="ap-field"><label className="ap-field-label">Other passport issued</label><input className="od-edit-input" value={t.otherPassportDateOfIssue ?? ''} onChange={e => updateEditTraveler(i, 'otherPassportDateOfIssue', e.target.value)} /></div>
                    <div className="ap-field"><label className="ap-field-label">Other passport place</label><input className="od-edit-input" value={t.otherPassportPlaceOfIssue ?? ''} onChange={e => updateEditTraveler(i, 'otherPassportPlaceOfIssue', e.target.value)} /></div>
                  </>}

                  {/* Travel & Accommodation */}
                  <div className="od-edit-section-title" style={{gridColumn:'1/-1'}}>Travel &amp; Accommodation</div>
                  <div className="ap-field"><label className="ap-field-label">Places to visit</label><input className="od-edit-input" value={t.placesToVisit ?? ''} onChange={e => updateEditTraveler(i, 'placesToVisit', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Booked hotel</label>
                    <select className="od-edit-input" value={t.bookedHotel ?? ''} onChange={e => updateEditTraveler(i, 'bookedHotel', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>
                  {t.bookedHotel === 'yes' && <>
                    <div className="ap-field"><label className="ap-field-label">Hotel name</label><input className="od-edit-input" value={t.hotelName ?? ''} onChange={e => updateEditTraveler(i, 'hotelName', e.target.value)} /></div>
                    <div className="ap-field"><label className="ap-field-label">Hotel place</label><input className="od-edit-input" value={t.hotelPlace ?? ''} onChange={e => updateEditTraveler(i, 'hotelPlace', e.target.value)} /></div>
                  </>}
                  <div className="ap-field"><label className="ap-field-label">Tour operator</label><input className="od-edit-input" value={t.tourOperatorName ?? ''} onChange={e => updateEditTraveler(i, 'tourOperatorName', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Tour operator address</label><input className="od-edit-input" value={t.tourOperatorAddress ?? ''} onChange={e => updateEditTraveler(i, 'tourOperatorAddress', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Exit airport</label><input className="od-edit-input" value={t.exitPort ?? ''} onChange={e => updateEditTraveler(i, 'exitPort', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Visited India before</label>
                    <select className="od-edit-input" value={t.visitedIndiaBefore ?? ''} onChange={e => updateEditTraveler(i, 'visitedIndiaBefore', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>
                  <div className="ap-field"><label className="ap-field-label">Visa refused before</label>
                    <select className="od-edit-input" value={t.visaRefusedBefore ?? ''} onChange={e => updateEditTraveler(i, 'visaRefusedBefore', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>

                  {/* References */}
                  <div className="od-edit-section-title" style={{gridColumn:'1/-1'}}>References — India</div>
                  <div className="ap-field"><label className="ap-field-label">Reference name</label><input className="od-edit-input" value={t.refNameIndia ?? ''} onChange={e => updateEditTraveler(i, 'refNameIndia', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Reference address</label><input className="od-edit-input" value={t.refAddressIndia ?? ''} onChange={e => updateEditTraveler(i, 'refAddressIndia', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">State</label><input className="od-edit-input" value={t.refStateIndia ?? ''} onChange={e => updateEditTraveler(i, 'refStateIndia', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">District</label><input className="od-edit-input" value={t.refDistrictIndia ?? ''} onChange={e => updateEditTraveler(i, 'refDistrictIndia', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Phone</label><input className="od-edit-input" value={t.refPhoneIndia ?? ''} onChange={e => updateEditTraveler(i, 'refPhoneIndia', e.target.value)} /></div>

                  <div className="od-edit-section-title" style={{gridColumn:'1/-1'}}>References — Home Country</div>
                  <div className="ap-field"><label className="ap-field-label">Address</label><input className="od-edit-input" value={t.refAddressHome ?? ''} onChange={e => updateEditTraveler(i, 'refAddressHome', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">State</label><input className="od-edit-input" value={t.refStateHome ?? ''} onChange={e => updateEditTraveler(i, 'refStateHome', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">District</label><input className="od-edit-input" value={t.refDistrictHome ?? ''} onChange={e => updateEditTraveler(i, 'refDistrictHome', e.target.value)} /></div>
                  <div className="ap-field"><label className="ap-field-label">Phone</label><input className="od-edit-input" value={t.refPhoneHome ?? ''} onChange={e => updateEditTraveler(i, 'refPhoneHome', e.target.value)} /></div>

                  {/* Security */}
                  <div className="od-edit-section-title" style={{gridColumn:'1/-1'}}>Security</div>
                  <div className="ap-field"><label className="ap-field-label">Arrested/convicted</label>
                    <select className="od-edit-input" value={t.everArrested ?? ''} onChange={e => updateEditTraveler(i, 'everArrested', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>
                  <div className="ap-field"><label className="ap-field-label">Refused entry/deported</label>
                    <select className="od-edit-input" value={t.everRefusedEntry ?? ''} onChange={e => updateEditTraveler(i, 'everRefusedEntry', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>
                  <div className="ap-field"><label className="ap-field-label">Sought asylum</label>
                    <select className="od-edit-input" value={t.soughtAsylum ?? ''} onChange={e => updateEditTraveler(i, 'soughtAsylum', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>
                  <div className="ap-field"><label className="ap-field-label">Criminal record</label>
                    <select className="od-edit-input" value={t.hasCriminalRecord ?? ''} onChange={e => updateEditTraveler(i, 'hasCriminalRecord', e.target.value)}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select></div>
                </div>
              )}
            </div>
          ))}

          {editing && (
            <button type="button" className="od-edit-add-traveler-btn" onClick={addEditTraveler}>
              + Add Traveler
            </button>
          )}

      </div>
    </div>
    </div>

    {/* Refund Modal */}
    {showRefundModal && order && (
      <div className="od-refund-overlay" onClick={() => setShowRefundModal(false)}>
        <div className="od-refund-modal" onClick={e => e.stopPropagation()}>
          <h2 className="od-refund-modal-title">💸 Process Refund</h2>
          <p className="od-refund-modal-sub">Order #{formatOrderNum(order.orderNumber)} — Original: ${order.totalUSD.toFixed(2)}</p>

          <div className="od-refund-field">
            <label className="od-refund-label">Refund amount ($)</label>
            <input
              className="ap-input"
              type="number"
              step="0.01"
              min="0.01"
              max={order.totalUSD}
              placeholder={order.totalUSD.toFixed(2)}
              value={refundAmount}
              onChange={e => setRefundAmount(e.target.value)}
            />
            <p className="od-refund-hint">Leave blank for full refund (${order.totalUSD.toFixed(2)}). Enter a custom amount for a partial refund.</p>
          </div>

          <div className="od-refund-field">
            <label className="od-refund-label">Reason for refund</label>
            <textarea
              className="ap-input"
              rows={3}
              placeholder="e.g. Customer requested cancellation, duplicate order, service issue..."
              value={refundReason}
              onChange={e => setRefundReason(e.target.value)}
            />
          </div>

          <div className="od-refund-actions">
            <button className="od-cancel-btn" onClick={() => setShowRefundModal(false)}>Cancel</button>
            <button className="od-refund-confirm-btn" disabled={refundSaving} onClick={handleRefund}>
              {refundSaving ? 'Processing...' : `Refund $${(refundAmount ? parseFloat(refundAmount) : order.totalUSD).toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
