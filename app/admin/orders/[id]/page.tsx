'use client';

import { useState, useEffect, useMemo, use, useRef } from 'react';
import Link from 'next/link';
import { AdminSidebar } from '@/components/AdminSidebar';
import type { ApplicationSchema } from '@/lib/applicationSchema';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface Traveler { firstName: string; lastName: string; email: string; dob?: string; address?: string; city?: string; state?: string; zip?: string; isEmployed?: string; hasCriminalRecord?: string; hasConfirmedTravel?: string; arrivalDate?: string; passportCountry?: string; passportNumber?: string; passportPlaceOfIssue?: string; passportCountryOfIssue?: string; passportIssued?: string; passportExpiry?: string; arrivalPoint?: string; visitedCountries?: string[]; parentsFromPakistan?: string; gender?: string; countryOfBirth?: string; cityOfBirth?: string; holdAnotherNationality?: string; otherNationality?: string; maritalStatus?: string; citizenshipId?: string; religion?: string; visibleMarks?: string; educationalQualification?: string; nationalityByBirth?: string; livedTwoYears?: string; phoneNumber?: string; residenceCountry?: string; employmentStatus?: string; employerName?: string; employerAddress?: string; employerCity?: string; employerState?: string; employerCountry?: string; employerZip?: string; studentProvider?: string; servedMilitary?: string;
  // Sub-purpose under the visa type (e.g. "Attend Technical/Business Meetings"
  // for Business eVisa, "Tourism" for Tourist). Captured at apply Step 1.
  purposeOfVisit?: string;
  // Business-visa-only fields (only present when order.visaType === 'BUSINESS_1Y').
  applicantCompanyName?: string; applicantCompanyAddress?: string; applicantCompanyPhone?: string; applicantCompanyWebsite?: string;
  indianFirmName?: string; indianFirmAddress?: string; indianFirmPhone?: string; indianFirmWebsite?: string;
  knowParents?: string; fatherName?: string; fatherNationality?: string; fatherPlaceOfBirth?: string; fatherCountryOfBirth?: string; motherName?: string; motherNationality?: string; motherPlaceOfBirth?: string; motherCountryOfBirth?: string; spouseName?: string; spouseNationality?: string; spousePlaceOfBirth?: string; spouseCountryOfBirth?: string; photoUrl?: string; passportBioUrl?: string; passportPlaceOfIssue2?: string; passportCountryOfIssue2?: string; hasOtherPassport?: string; otherPassportNumber?: string; otherPassportDateOfIssue?: string; otherPassportPlaceOfIssue?: string; placesToVisit?: string; bookedHotel?: string; hotelName?: string; hotelPlace?: string; tourOperatorName?: string; tourOperatorAddress?: string; exitPort?: string; visitedIndiaBefore?: string; visaRefusedBefore?: string; refNameIndia?: string; refAddressIndia?: string; refStateIndia?: string; refDistrictIndia?: string; refPhoneIndia?: string; refNameHome?: string; refAddressHome?: string; refStateHome?: string; refDistrictHome?: string; refPhoneHome?: string; everArrested?: string; everRefusedEntry?: string; soughtAsylum?: string; finishStep?: string; }

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
  evisaUrl:        string | null;
  flaggedFields:   string | null;
  specialistNotes: string | null;
  refundAmount:    number | null;
  refundReason:    string | null;
  refundedAt:      string | null;
  botFlags:        string | null;
  /** Per-document approval — null means "needs admin review". Set when
   *  admin clicks Approve next to the document. Auto-cleared on re-upload. */
  photoApprovedAt:    string | null;
  photoApprovedBy:    string | null;
  passportApprovedAt: string | null;
  passportApprovedBy: string | null;
  /** JSON array of OrderTag.id values — admin tags applied to this order. */
  tags:            string | null;
  emailHistory:    string | null;
  /** Non-null = order has been archived (30 days post-completion). Triggers the
   *  redacted detail card — full view comes back when admin clicks Recover. */
  archivedAt:      string | null;
}

import { formatOrderNum, VISA_LABELS, STATUS_COLORS, STATUS_LABELS, VISA_COLORS, COUNTRY_FLAGS, INDIA_RELIGIONS } from '@/lib/constants';
import { CustomStatusesProvider, useCustomStatuses, StatusBadge } from '@/lib/customStatuses';
import { stripDiacritics } from '@/lib/validation';
import { SectionIcon } from '@/lib/sectionIcons';
import { TagChip, TagPicker, useOrderTagCatalog, type OrderTag as OrderTagDef } from '@/components/OrderTags';
import { useFeatureFlag } from '@/lib/useFeatureFlag';
import {
  Paperclip, User, FileBadge, Home, Briefcase, Building2, Users as UsersIcon,
  BookOpen, Plane, Hotel, Contact, Shield, FileText, ClipboardList,
  StickyNote, Mail as MailIcon, Palette, Check, X as XIcon, Upload,
  Pencil, Bot, Flag, Save, Send, Undo2, Lightbulb, AlertTriangle,
  CheckCircle, XCircle, Camera,
} from 'lucide-react';

/* ── Sidebar is the shared <AdminSidebar> from components/AdminSidebar ── */

/* ── Notes Dropdown ────────────────────────────────────────────────────────── */

function NotesDropdown({ notes, setNotes, editing, editData, updateEditField, saving, saved, saveNotes, orderNotes, applicationId, setApplicationId, orderApplicationId, orderId, order, setOrder, liveFlaggedFields, saveFlags, flagSaving, toggleFlag, setFlaggedFields, specialistNotes, setSpecialistNotes }: any) {
  const [open, setOpen] = useState(false);
  const [appIdSaving, setAppIdSaving] = useState(false);
  const [appIdSaved, setAppIdSaved] = useState(false);
  const [evisaUploading, setEvisaUploading] = useState(false);
  const [evisaRemoving, setEvisaRemoving] = useState(false);
  const evisaInputRef = useRef<HTMLInputElement>(null);
  const hasNotes = editing ? !!editData?.notes : !!notes;
  const hasAppId = editing ? !!editData?.applicationId : !!applicationId;
  const hasFlags = !editing && Array.isArray(liveFlaggedFields) && liveFlaggedFields.length > 0;

  const handleEvisaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEvisaUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orderId', orderId);
      fd.append('type', 'evisa');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
      const uploadData = await uploadRes.json();
      if (uploadData.url) {
        const patchRes = await fetch(`/api/orders/${order.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ evisaUrl: uploadData.url, status: 'COMPLETED' }),
        });
        if (patchRes.ok) {
          const updated = await patchRes.json();
          setOrder(updated);
          // NOTE: eVisa email is NOT auto-sent. Admin must send manually from the Email panel.
        }
      }
    } catch (err) { console.error('eVisa upload error:', err); }
    finally { setEvisaUploading(false); }
  };

  const handleEvisaRemove = async () => {
    setEvisaRemoving(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evisaUrl: '' }),
      });
      if (res.ok) setOrder(await res.json());
    } catch {} finally { setEvisaRemoving(false); }
  };

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

  const currentAppId = editing ? (editData?.applicationId ?? '') : applicationId;
  const currentNotes = editing ? (editData?.notes ?? '') : notes;
  const notesPreview = currentNotes ? (currentNotes.length > 140 ? currentNotes.slice(0, 140) + '…' : currentNotes) : '';

  return (
    <div className="od-notes-dropdown">
      <button className="od-notes-toggle" onClick={() => setOpen(!open)}>
        <span className="od-notes-toggle-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <StickyNote size={14} strokeWidth={2} />
          <span>Internal Notes</span>
          {(hasNotes || hasAppId || hasFlags) && <span className="od-notes-indicator" style={hasFlags ? { background: '#dc2626' } : undefined} />}
        </span>
        <span className={`od-notes-chevron${open ? ' open' : ''}`}>▾</span>
      </button>

      {/* Compact preview when collapsed — shows Application ID + notes snippet */}
      {!open && (currentAppId || currentNotes) && (
        <div className="od-notes-preview">
          {currentAppId && (
            <div className="od-notes-preview-row">
              <span className="od-notes-preview-label">Application ID</span>
              <span className="od-notes-preview-value od-notes-preview-mono">{currentAppId}</span>
            </div>
          )}
          {currentNotes && (
            <div className="od-notes-preview-row">
              <span className="od-notes-preview-label">Notes</span>
              <span className="od-notes-preview-value">{notesPreview}</span>
            </div>
          )}
        </div>
      )}

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
                  {appIdSaving ? '...' : appIdSaved ? <Check size={14} strokeWidth={2.5} /> : 'Save'}
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
              {saving ? 'Saving...' : saved ? (<><Check size={13} strokeWidth={2.5} style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: '0.25rem' }} />Saved!</>) : 'Save Notes'}
            </button>
          )}

          {/* eVisa Upload */}
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--cloud)', paddingTop: '1rem' }}>
            <div className="od-evisa-header">
              <span className="od-evisa-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={14} strokeWidth={2} /><span>E-Visa Document</span></span>
              {order?.evisaUrl && <span className="od-evisa-badge">Uploaded</span>}
            </div>
            <input ref={evisaInputRef} type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={handleEvisaUpload} />
            {order?.evisaUrl ? (
              <div className="od-evisa-preview">
                <a href={order.evisaUrl} target="_blank" rel="noopener noreferrer" className="od-evisa-link">
                  {order.evisaUrl.endsWith('.pdf') ? (
                    <div className="od-evisa-pdf" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={14} strokeWidth={2} /><span>View E-Visa PDF</span></div>
                  ) : (
                    <img src={order.evisaUrl} alt="E-Visa" className="od-evisa-img" />
                  )}
                </a>
                <div className="od-evisa-actions">
                  <a href={order.evisaUrl} download className="od-evisa-download">⬇ Download</a>
                  <button className="od-evisa-remove" onClick={handleEvisaRemove} disabled={evisaRemoving}>
                    {evisaRemoving ? '...' : (<><XIcon size={12} strokeWidth={2.5} style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: '0.25rem' }} />Remove</>)}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                <button className="od-evisa-upload-btn" onClick={() => evisaInputRef.current?.click()} disabled={evisaUploading}>
                  {evisaUploading ? 'Uploading...' : (<><Upload size={13} strokeWidth={2.25} style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: '0.35rem' }} />Upload E-Visa</>)}
                </button>
                <p className="od-evisa-hint">Upload the approved eVisa (PDF or image). Status will be set to Completed.</p>
              </div>
            )}
          </div>

          {/* Email Customer Panel */}
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--cloud)', paddingTop: '1rem' }}>
            <EmailPanel
              order={order}
              setOrder={setOrder}
              liveFlaggedFields={liveFlaggedFields}
              saveFlags={saveFlags}
              flagSaving={flagSaving}
              toggleFlag={toggleFlag}
              setFlaggedFields={setFlaggedFields}
              specialistNotes={specialistNotes}
              setSpecialistNotes={setSpecialistNotes}
            />
          </div>

          {/* Bot Run History was moved out of the notes dropdown so it's
              always visible — see the bottom of OrderDetailPageInner. */}
        </div>
      )}
    </div>
  );
}

/* ── Flaggable Row ────────────────────────────────────────────────────────── */

function FlagRow({ field, label, value, flagged, onToggle, className, showFlags }: { field: string; label: string; value: React.ReactNode; flagged: string[]; onToggle: (f: string) => void; className?: string; showFlags?: boolean }) {
  if (!value) return null;
  const isFlagged = flagged.includes(field);
  return (
    <div className={`modal-row${isFlagged ? ' flagged-row' : ''}`}>
      {(showFlags || isFlagged) && (
        <button type="button" className={`flag-btn${isFlagged ? ' active' : ''}`} onClick={(e) => { e.stopPropagation(); onToggle(field); }} title={isFlagged ? 'Remove flag' : 'Flag this field'}>
          <Flag size={13} strokeWidth={2.25} />
        </button>
      )}
      <span className="modal-row-label">{label}</span>
      <span className={`modal-row-value${className ? ' ' + className : ''}`}>{value}</span>
    </div>
  );
}

/* ── eVisa Upload (standalone, kept for compatibility) ────────────────────── */

function EvisaUpload({ orderId, order, setOrder }: { orderId: string; order: Order; setOrder: (o: Order) => void }) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orderId', orderId);
      fd.append('type', 'evisa');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
      const uploadData = await uploadRes.json();
      if (uploadData.url) {
        const patchRes = await fetch(`/api/orders/${order.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ evisaUrl: uploadData.url, status: 'COMPLETED' }),
        });
        if (patchRes.ok) {
          const updated = await patchRes.json();
          setOrder(updated);
        }
      }
    } catch (err) {
      console.error('eVisa upload error:', err);
    } finally { setUploading(false); }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evisaUrl: '' }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrder(updated);
      }
    } catch {} finally { setRemoving(false); }
  };

  return (
    <div className="od-evisa-section">
      <div className="od-evisa-header">
        <span className="od-evisa-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={14} strokeWidth={2} /><span>E-Visa Document</span></span>
        {order.evisaUrl && <span className="od-evisa-badge">Uploaded</span>}
      </div>
      <input
        id={`evisa-upload-${orderId}`}
        type="file"
        accept=".pdf,image/*"
        style={{ display: 'none' }}
        onChange={handleUpload}
        disabled={uploading}
      />
      {order.evisaUrl ? (
        <div className="od-evisa-preview">
          <a href={order.evisaUrl} target="_blank" rel="noopener noreferrer" className="od-evisa-link">
            {order.evisaUrl.endsWith('.pdf') ? (
              <div className="od-evisa-pdf" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={14} strokeWidth={2} /><span>View E-Visa PDF</span></div>
            ) : (
              <img src={order.evisaUrl} alt="E-Visa" className="od-evisa-img" />
            )}
          </a>
          <div className="od-evisa-actions">
            <a href={order.evisaUrl} download className="od-evisa-download">⬇ Download</a>
            <button className="od-evisa-remove" onClick={handleRemove} disabled={removing}>
              {removing ? '...' : (<><XIcon size={12} strokeWidth={2.5} style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: '0.25rem' }} />Remove</>)}
            </button>
          </div>
        </div>
      ) : (
        <div className="od-evisa-upload">
          <button className="od-evisa-upload-btn" onClick={() => document.getElementById(`evisa-upload-${orderId}`)?.click()} disabled={uploading}>
            {uploading ? 'Uploading...' : (<><Upload size={13} strokeWidth={2.25} style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: '0.35rem' }} />Upload E-Visa</>)}
          </button>
          <p className="od-evisa-hint">Upload the approved eVisa (PDF or image). This will be visible to the customer and the order status will be set to Approved.</p>
        </div>
      )}
    </div>
  );
}

/* ── Email Panel ───────────────────────────────────────────────────────────── */

function EmailPanel({ order, setOrder, liveFlaggedFields, saveFlags, flagSaving, toggleFlag, setFlaggedFields, specialistNotes, setSpecialistNotes }: {
  order: Order;
  setOrder: (o: Order) => void;
  liveFlaggedFields?: string[];
  saveFlags?: () => Promise<void> | void;
  flagSaving?: boolean;
  toggleFlag?: (f: string) => void;
  setFlaggedFields?: (f: string[]) => void;
  specialistNotes?: string;
  setSpecialistNotes?: (v: string) => void;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [customTemplates, setCustomTemplates] = useState<Array<{ id: string; code: string; label: string; description: string | null; trigger: string; enabled: boolean }>>([]);

  // Load custom email templates for INDIA (so admins can send them manually)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/custom-emails?country=INDIA');
        if (res.ok) {
          const d = await res.json();
          setCustomTemplates(d.templates || []);
        }
      } catch {}
    })();
  }, []);

  // Parse the email history
  let history: Record<string, string> = {};
  try { if (order.emailHistory) history = JSON.parse(order.emailHistory); } catch {}

  // Determine if we have flagged fields — either currently selected in UI or saved in DB
  const currentFlags = liveFlaggedFields ?? (() => {
    try { return JSON.parse(order.flaggedFields || '[]'); } catch { return []; }
  })();
  const hasFlags = Array.isArray(currentFlags) && currentFlags.length > 0;
  // Check if there are unsaved flag changes (user still in flag mode, hasn't saved)
  const savedFlags = order.flaggedFields || '[]';
  const liveJson = JSON.stringify(currentFlags);
  const hasUnsavedFlagChanges = liveJson !== savedFlags;

  const EMAILS: { type: string; label: string; description: string; color?: string; disabled?: boolean; disabledReason?: string; warning?: string }[] = [
    { type: 'confirmation', label: 'Order Confirmation / Receipt', description: 'Thank-you with order summary (normally auto-sent at checkout).' },
    { type: 'reminder',     label: 'Finish Application Reminder',  description: 'Nudge the customer to complete their application.' },
    { type: 'correction',   label: 'Correction Needed',
      description: `Sends current specialist notes + ${currentFlags.length} flagged field${currentFlags.length === 1 ? '' : 's'}.`,
      disabled: !hasFlags,
      disabledReason: 'No fields are flagged yet — flag at least one field first.',
      warning: hasUnsavedFlagChanges ? 'You have unsaved flag changes. Sending will save them first.' : undefined,
    },
    { type: 'submitted',    label: 'Application Submitted',        description: 'Confirms we submitted to gov site (needs Application ID).', disabled: !order.applicationId, disabledReason: 'No Application ID on this order yet.' },
    { type: 'status',       label: 'Status Update',                description: `Current status: ${order.status.replace('_', ' ')}.` },
    { type: 'evisa',        label: 'eVisa Ready',                  description: 'Notifies the customer their visa is ready to download.', disabled: !order.evisaUrl, disabledReason: 'No eVisa has been uploaded yet.' },
    { type: 'autoClosed',   label: 'Order Auto-Closed',            description: 'Closes out the order after repeated non-response.' },
  ];

  const toggleAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    for (const e of EMAILS) { if (!e.disabled) next[e.type] = v; }
    setSelected(next);
  };

  const send = async () => {
    const types = Object.keys(selected).filter(k => selected[k]);
    if (types.length === 0) return;
    setSending(true);
    setLastResult(null);
    try {
      // If sending a correction email AND there are unsaved flag changes, save first
      if (types.includes('correction') && hasUnsavedFlagChanges && saveFlags) {
        await saveFlags();
      }
      const res = await fetch('/api/orders/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, types }),
      });
      const data = await res.json();
      setLastResult(data);
      if (data.history) setOrder({ ...order, emailHistory: JSON.stringify(data.history) });
      setSelected({});
    } catch (err: any) {
      setLastResult({ error: err?.message || 'Failed to send' });
    } finally { setSending(false); }
  };

  const fmtDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <MailIcon size={16} strokeWidth={2} />
            <span>Email Customer</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>Select which emails to send — nothing is sent automatically (except the confirmation at checkout).</div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => toggleAll(true)}  className="od-edit-btn" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}>Select All</button>
          <button onClick={() => toggleAll(false)} className="od-edit-btn" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}>Clear</button>
        </div>
      </div>

      {/* Flagged fields + Specialist's Note — shown when any fields are flagged */}
      {liveFlaggedFields && liveFlaggedFields.length > 0 && (
        <div className="od-flag-section" style={{ marginBottom: '1rem' }}>
          <div className="od-flag-header">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Flag size={13} strokeWidth={2.25} />
              <span>{liveFlaggedFields.length} field{liveFlaggedFields.length !== 1 ? 's' : ''} flagged</span>
            </span>
            {setFlaggedFields && <button className="od-flag-clear" onClick={() => setFlaggedFields([])}>Clear all flags</button>}
          </div>
          <div className="od-flag-tags">
            {liveFlaggedFields.map((f: string) => (
              <span key={f} className="od-flag-tag" onClick={() => toggleFlag && toggleFlag(f)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <span>{f}</span>
                <XIcon size={11} strokeWidth={2.5} />
              </span>
            ))}
          </div>
          {setSpecialistNotes && (
            <div className="ap-field" style={{ marginTop: '0.75rem' }}>
              <label className="ap-field-label">Specialist&apos;s Note (visible to customer)</label>
              <textarea
                className="ap-input contact-textarea"
                rows={3}
                placeholder="Explain what needs to be corrected..."
                value={specialistNotes ?? ''}
                onChange={ev => setSpecialistNotes(ev.target.value)}
              />
              <p style={{ fontSize: '0.78rem', color: 'var(--slate)', marginTop: '0.4rem' }}>
                <Lightbulb size={11} strokeWidth={2.25} style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: '0.3rem' }} />
                Sent to the customer when you check <strong>&quot;Correction Needed&quot;</strong> below.
              </p>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {EMAILS.map(e => {
          const sentAt = history[e.type];
          return (
            <label key={e.type} style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
              padding: '0.65rem 0.8rem', borderRadius: '0.55rem',
              background: selected[e.type] ? '#eff6ff' : '#f9fafb',
              border: '1px solid ' + (selected[e.type] ? '#bfdbfe' : '#e5e7eb'),
              cursor: e.disabled ? 'not-allowed' : 'pointer',
              opacity: e.disabled ? 0.55 : 1,
            }}>
              <input
                type="checkbox"
                checked={!!selected[e.type]}
                disabled={e.disabled || sending}
                onChange={ev => setSelected(s => ({ ...s, [e.type]: ev.target.checked }))}
                style={{ marginTop: '0.2rem', width: '16px', height: '16px' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{e.label}</span>
                  {sentAt && (
                    <span style={{ fontSize: '0.72rem', color: '#059669', background: '#d1fae5', padding: '0.12rem 0.5rem', borderRadius: '0.3rem' }}>
                      Last sent: {fmtDate(sentAt)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  {e.disabled ? (
                    <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <AlertTriangle size={12} strokeWidth={2.25} />
                      <span>{e.disabledReason}</span>
                    </span>
                  ) : e.description}
                </div>
                {!e.disabled && e.warning && (
                  <div style={{ fontSize: '0.78rem', color: '#d97706', marginTop: '0.25rem' }}>ℹ️ {e.warning}</div>
                )}
              </div>
            </label>
          );
        })}

        {/* ── Custom email templates (filtered to manual + enabled) ── */}
        {customTemplates.filter(ct => ct.enabled && ct.trigger === 'manual').length > 0 && (
          <>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', marginTop: '0.4rem', marginBottom: '0.1rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <Palette size={11} strokeWidth={2.5} />
              <span>Custom</span>
            </div>
            {customTemplates.filter(ct => ct.enabled && ct.trigger === 'manual').map(ct => {
              const key = `custom:${ct.id}`;
              const sentAt = history[key];
              return (
                <label key={ct.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.65rem 0.8rem', borderRadius: '0.55rem',
                  background: selected[key] ? '#eff6ff' : '#f9fafb',
                  border: '1px solid ' + (selected[key] ? '#bfdbfe' : '#e5e7eb'),
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={!!selected[key]}
                    disabled={sending}
                    onChange={ev => setSelected(s => ({ ...s, [key]: ev.target.checked }))}
                    style={{ marginTop: '0.2rem', width: '16px', height: '16px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                        {ct.label}
                        <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', verticalAlign: 'middle' }}>CUSTOM</span>
                      </span>
                      {sentAt && (
                        <span style={{ fontSize: '0.72rem', color: '#059669', background: '#d1fae5', padding: '0.12rem 0.5rem', borderRadius: '0.3rem' }}>
                          Last sent: {fmtDate(sentAt)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {ct.description || <em style={{ color: '#9ca3af' }}>No description</em>}
                    </div>
                  </div>
                </label>
              );
            })}
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.85rem' }}>
        <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>
          Sending to: <span style={{ fontWeight: 600, color: '#1f2937' }}>{order.billingEmail}</span>
        </div>
        <button
          onClick={send}
          disabled={selectedCount === 0 || sending}
          style={{
            background: selectedCount === 0 ? '#e5e7eb' : '#3b82f6', color: selectedCount === 0 ? '#9ca3af' : 'white',
            border: 'none', padding: '0.55rem 1.1rem', borderRadius: '0.5rem', fontWeight: 600, fontSize: '0.9rem',
            cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {sending ? 'Sending…' : (<><Send size={13} strokeWidth={2.25} style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: '0.35rem' }} />{`Send ${selectedCount > 0 ? `(${selectedCount})` : ''}`.trim()}</>)}
        </button>
      </div>

      {lastResult && (
        <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.8rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '0.5rem', fontSize: '0.82rem' }}>
          {lastResult.error ? (
            <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <XCircle size={13} strokeWidth={2.25} />
              <span>{lastResult.error}</span>
            </span>
          ) : (
            <div>
              {lastResult.results?.map((r: any) => (
                <div key={r.type} style={{ color: r.sent ? '#059669' : '#dc2626' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    {r.sent ? <CheckCircle size={12} strokeWidth={2.25} /> : <XCircle size={12} strokeWidth={2.25} />}
                    <span>{r.type}{r.error ? ` — ${r.error}` : ''}</span>
                  </span>
                </div>
              ))}
            </div>
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

export default function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <CustomStatusesProvider country="INDIA">
      <OrderDetailPageInner {...props} />
    </CustomStatusesProvider>
  );
}

function OrderDetailPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { statuses: customStatuses } = useCustomStatuses();
  const [customAppSchema, setCustomAppSchema] = useState<ApplicationSchema>({ country: 'INDIA', sections: [] });
  const [order, setOrder]     = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [notes, setNotes]     = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [flaggedFields, setFlaggedFields] = useState<string[]>([]);
  const [flagMode, setFlagMode] = useState(false);
  const [specialistNotes, setSpecialistNotes] = useState('');
  const [notifying, setNotifying] = useState(false);
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
        try { setFlaggedFields(data.flaggedFields ? JSON.parse(data.flaggedFields) : []); } catch { setFlaggedFields([]); }
        setSpecialistNotes(data.specialistNotes ?? '');
      })
      .catch(() => setError('Order not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  // Load admin-defined custom application schema for this order's country.
  useEffect(() => {
    if (!order) return;
    const country = (order.destination || 'India').toUpperCase();
    fetch(`/api/settings/application-schema?country=${encodeURIComponent(country)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && Array.isArray(data.customSections)) setCustomAppSchema(data); })
      .catch(() => {});
  }, [order]);

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

  const updateEditTraveler = (index: number, field: string, value: unknown) => {
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

  const toggleFlag = (field: string) => {
    setFlaggedFields(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
  };

  const [flagSaving, setFlagSaving] = useState(false);
  const [flagSaved, setFlagSaved] = useState(false);
  const saveFlags = async () => {
    if (!order) return;
    setFlagSaving(true);
    try {
      await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flaggedFields: JSON.stringify(flaggedFields) }),
      });
      setFlagSaved(true);
      setTimeout(() => setFlagSaved(false), 2000);
    } catch {} finally { setFlagSaving(false); }
  };

  const notifyCustomer = async () => {
    if (!order || flaggedFields.length === 0) return;
    setNotifying(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flaggedFields: JSON.stringify(flaggedFields),
          specialistNotes,
          status: 'NEEDS_CORRECTION',
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrder(updated);
        // NOTE: Correction email is NOT auto-sent. Admin must send manually from the Email panel.
      }
    } catch {} finally { setNotifying(false); }
  };

  /* ── Order tags (free-form admin tags) ────────────────────────────────
   * Backed by /api/order-tags catalog + the order's `tags` JSON array.
   * Picker is a popup; clicking outside closes it. The whole Tags row is
   * gated behind the orderTags feature flag (admin can flip it from
   * /admin/features). When OFF, no UI renders and any tags already on the
   * order stay safely in the JSON column for restoration on flip-ON. */
  const tagsEnabled = useFeatureFlag('orderTags') ?? false;
  const tagCatalog = useOrderTagCatalog();
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const appliedTagIds: string[] = useMemo(() => {
    if (!order?.tags) return [];
    try { const a = JSON.parse(order.tags); return Array.isArray(a) ? a : []; } catch { return []; }
  }, [order?.tags]);
  const appliedTags: OrderTagDef[] = useMemo(() => {
    return appliedTagIds
      .map(id => tagCatalog.tags.find(t => t.id === id))
      .filter((t): t is OrderTagDef => !!t);
  }, [appliedTagIds, tagCatalog.tags]);

  const persistTags = async (nextIds: string[]) => {
    if (!order) return;
    // Optimistic update — flip locally before the round trip.
    const prevTags = order.tags;
    const nextTags = nextIds.length > 0 ? JSON.stringify(nextIds) : null;
    setOrder({ ...order, tags: nextTags });
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: nextTags }),
      });
      if (!res.ok) {
        // Rollback on failure.
        setOrder({ ...order, tags: prevTags });
      } else {
        const updated = await res.json();
        setOrder(updated);
      }
    } catch {
      setOrder({ ...order, tags: prevTags });
    }
  };

  const handleTagApply = async (tagId: string, applied: boolean) => {
    const next = applied
      ? Array.from(new Set([...appliedTagIds, tagId]))
      : appliedTagIds.filter(id => id !== tagId);
    await persistTags(next);
  };

  const handleTagCreate = async (input: { name: string; color: string; icon?: string }) => {
    const res = await fetch('/api/order-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create tag.');
    tagCatalog.upsertLocal(data.tag);
    // Auto-apply the newly-created tag — that's almost always the user's intent.
    await persistTags(Array.from(new Set([...appliedTagIds, data.tag.id])));
    return data.tag;
  };

  const handleTagDelete = async (tagId: string) => {
    const res = await fetch(`/api/order-tags/${tagId}`, { method: 'DELETE' });
    if (res.ok) {
      tagCatalog.removeLocal(tagId);
      // Locally drop it from the applied list too — server already scrubbed every order's row.
      if (appliedTagIds.includes(tagId)) {
        const next = appliedTagIds.filter(id => id !== tagId);
        setOrder(order ? { ...order, tags: next.length ? JSON.stringify(next) : null } : null);
      }
    }
  };

  /* ── Per-document approvals ──────────────────────────────────────────────
   * Each document (photo, passport bio) needs an explicit admin approval
   * before the bot will run. The server stamps both *ApprovedAt and
   * *ApprovedBy when we send `photoApproved: true` (or false to revoke).
   * Auto-cleared by the API whenever the underlying URL changes. */
  const [approvalSaving, setApprovalSaving] = useState<'' | 'photo' | 'passport'>('');
  const setDocApproval = async (which: 'photo' | 'passport', approve: boolean) => {
    if (!order || approvalSaving) return;
    const atKey = which === 'photo' ? 'photoApprovedAt' : 'passportApprovedAt';
    const byKey = which === 'photo' ? 'photoApprovedBy' : 'passportApprovedBy';
    setApprovalSaving(which);
    // Optimistic — if approving, stamp a placeholder timestamp + name so the
    // UI flips instantly; the server's response replaces it with canonical
    // values a moment later.
    const optimistic: Partial<Order> = approve
      ? { [atKey]: new Date().toISOString(), [byKey]: 'You' } as any
      : { [atKey]: null, [byKey]: null } as any;
    const previous: Partial<Order> = {
      [atKey]: order[atKey], [byKey]: order[byKey],
    } as any;
    setOrder({ ...order, ...optimistic } as Order);
    try {
      const body = which === 'photo'
        ? { photoApproved: approve }
        : { passportApproved: approve };
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setOrder({ ...order, ...previous } as Order);
      } else {
        const updated = await res.json();
        setOrder(updated);
      }
    } catch {
      setOrder({ ...order, ...previous } as Order);
    } finally {
      setApprovalSaving('');
    }
  };

  /** Convenience derivations. Both must be approved before bot can run. */
  const photoApproved    = !!order?.photoApprovedAt;
  const passportApproved = !!order?.passportApprovedAt;
  const allDocsApproved  = photoApproved && passportApproved;

  /** Format an approval as "✓ Approved by Alice · 5m ago" or null. */
  const formatApproval = (at: string | null, by: string | null) => {
    if (!at) return null;
    const d = new Date(at);
    const ago = Date.now() - d.getTime();
    let when: string;
    if (ago < 60_000)            when = 'just now';
    else if (ago < 3600_000)     when = `${Math.floor(ago / 60_000)}m ago`;
    else if (ago < 86_400_000)   when = `${Math.floor(ago / 3600_000)}h ago`;
    else                         when = d.toLocaleDateString();
    return `✓ Approved by ${by ?? 'admin'} · ${when}`;
  };

  if (loading) return (
    <div className="admin-shell">
      <AdminSidebar active="orders" />
      <div className="admin-main"><div className="order-detail-loading">Loading order...</div></div>
    </div>
  );
  if (error || !order) return (
    <div className="admin-shell">
      <AdminSidebar active="orders" />
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

  /**
   * Archived view — customer PII is redacted until the admin hits Recover.
   * Renders the order number + date + amount only. Recover PATCHes
   * archivedAt=null and reloads the page so the full detail appears.
   */
  if (order.archivedAt) {
    const archivedDate = new Date(order.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const handleRecover = async () => {
      if (!confirm('Recover this archived order? Its full details will be visible again.')) return;
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivedAt: null }),
      });
      if (res.ok) window.location.reload();
      else alert('Failed to recover the order — check the console.');
    };
    return (
      <div className="admin-shell">
        <AdminSidebar active="orders" />
        <div className="admin-main">
          <div className="order-detail-shell">
            <div className="od-top-actions">
              <Link href="/admin" className="order-detail-back">← Back to Orders</Link>
            </div>
            <div style={{
              maxWidth: 480, margin: '3rem auto', background: '#f8fafc',
              border: '1px dashed #cbd5e1', borderRadius: '0.75rem',
              padding: '2.5rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '2.25rem', marginBottom: '1rem' }}>📦</div>
              <h1 className="order-detail-title" style={{ fontSize: '1.5rem', margin: 0 }}>
                Order {formatOrderNum(order.orderNumber)}
              </h1>
              <p style={{ color: '#64748b', fontSize: '0.95rem', marginTop: '0.4rem' }}>
                Archived on {archivedDate} &middot; ${order.totalUSD.toFixed(2)}
              </p>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '1.5rem', maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
                Customer details are hidden. Recover this order to view the full information.
              </p>
              <button
                type="button"
                onClick={handleRecover}
                style={{
                  marginTop: '1.75rem', background: 'var(--blue)', color: 'white',
                  border: 'none', padding: '0.7rem 1.5rem', borderRadius: '0.5rem',
                  fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                }}
              >
                <Undo2 size={15} strokeWidth={2.25} />
                Recover Order
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <AdminSidebar active="orders" />
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
          {/* Purpose of Visit — fine-grained sub-purpose the customer picked
              at apply Step 1 (e.g. "Set Up Industrial/Business Venture" for
              business visas, "Tourism" for tourist visas). Surfaced here so
              admins can see what the bot will write into the gov form's
              Visa Purpose dropdown. */}
          {(() => {
            const purpose = parseTravelers(order.travelers)[0]?.purposeOfVisit;
            if (!purpose) return null;
            return (
              <span
                title="Purpose of Visit (sub-purpose under the visa type)"
                style={{
                  background: '#f0fdf4', color: '#15803d',
                  padding: '0.2rem 0.55rem', borderRadius: '0.3rem',
                  fontSize: '0.78rem', fontWeight: 600,
                }}
              >· {purpose}</span>
            );
          })()}
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

      {/* ── TAGS ROW ── admin tags + the picker popup. Hidden when the
           orderTags feature flag is OFF (admin can flip it at /admin/features). */}
      {tagsEnabled && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
        marginBottom: '1rem', position: 'relative',
      }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase' }}>Tags</span>
        {appliedTags.length === 0 && (
          <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>No tags applied.</span>
        )}
        {appliedTags.map(tag => (
          <TagChip key={tag.id} tag={tag} size="md" onRemove={() => handleTagApply(tag.id, false)} />
        ))}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setTagPickerOpen(v => !v)}
            style={{
              fontSize: '0.78rem', fontWeight: 600,
              background: tagPickerOpen ? '#eef2ff' : 'transparent',
              color: 'var(--blue)', border: '1px dashed #c7d2fe',
              padding: '0.2rem 0.6rem', borderRadius: '999px', cursor: 'pointer',
            }}
          >
            + Add tag
          </button>
          {tagPickerOpen && (
            <TagPicker
              applied={appliedTagIds}
              catalog={tagCatalog.tags}
              onApply={handleTagApply}
              onCreate={handleTagCreate}
              onDelete={handleTagDelete}
              onClose={() => setTagPickerOpen(false)}
            />
          )}
        </div>
      </div>
      )}

      {/* ── STATUS SECTION ── */}
      <div className="od-status-bar">
        <div className="od-status-left">
          <span className="od-status-label">Status</span>
          <StatusBadge code={editing ? editData.status : order.status} />
        </div>
        <div className="od-status-right">
          <label className="od-status-label">Update status</label>
          <select
            className="ap-select"
            value={editing ? editData.status : order.status}
            onChange={e => editing ? updateEditField('status', e.target.value) : handleStatusChange(e.target.value)}
          >
            <option value="UNFINISHED">Unfinished</option>
            <option value="PROCESSING">Processing</option>
            <option value="NEEDS_CORRECTION">Needs Correction</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="COMPLETED">Completed</option>
            <option value="ON_HOLD">On Hold</option>
            <option value="REJECTED">Rejected</option>
            <option value="REFUNDED">Refunded</option>
            {customStatuses.length > 0 && (
              <optgroup label="Custom">
                {customStatuses.map(s => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </optgroup>
            )}
          </select>
          {order.status !== 'REFUNDED' && !editing && (
            <button className="od-refund-btn" onClick={() => setShowRefundModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Undo2 size={13} strokeWidth={2.25} />
              <span>Refund</span>
            </button>
          )}
        </div>
      </div>


      {/* Refund info banner */}
      {order.status === 'REFUNDED' && (
        <div className="od-refund-banner">
          <div className="od-refund-banner-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <Undo2 size={15} strokeWidth={2.25} />
            <span>Refunded</span>
          </div>
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
        <div className="modal-section-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <ClipboardList size={14} strokeWidth={2} />
          <span>Visa Details</span>
        </div>
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

      {/* ── INTERNAL NOTES DROPDOWN (contains Email Customer panel) ── */}
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
        order={order}
        setOrder={setOrder}
        liveFlaggedFields={flaggedFields}
        saveFlags={saveFlags}
        flagSaving={flagSaving}
        toggleFlag={toggleFlag}
        setFlaggedFields={setFlaggedFields}
        specialistNotes={specialistNotes}
        setSpecialistNotes={setSpecialistNotes}
      />

      {/* ── ACTION BUTTONS ── */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
        {!editing ? (
          <>
            <button className="od-edit-btn" onClick={startEditing}><Pencil size={13} strokeWidth={2.25} /><span>Full Edit</span></button>
            <button
              className="od-process-btn"
              disabled={!allDocsApproved}
              title={allDocsApproved ? '' : 'Approve both documents above before running the bot.'}
              style={!allDocsApproved ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              onClick={async () => {
              // Pre-flight: refuse to launch if either document still needs
              // admin approval. The bot script also guards independently,
              // but checking here gives clearer UX and avoids a wasted
              // process spawn.
              if (!allDocsApproved) {
                const pending: string[] = [];
                if (!photoApproved)    pending.push('• Traveler photo (📸)');
                if (!passportApproved) pending.push('• Passport bio page (📄)');
                alert(
                  'Cannot run bot — these documents still need your approval:\n\n'
                  + pending.join('\n')
                  + '\n\nReview each document above and click ✓ Approve next to it.'
                );
                return;
              }
              const orderNum = formatOrderNum(order.orderNumber);
              try {
                const res = await fetch('http://localhost:3001/process', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ orderNumber: orderNum }),
                });
                const data = await res.json();
                if (data.success) alert(`Bot launched for order #${orderNum}!\nCheck the bot server terminal for progress.`);
                else alert(`Error: ${data.error}`);
              } catch {
                alert('Bot server not running.\n\nStart it in a terminal:\nnpx tsx scripts/bot-server.ts');
              }
            }}><Bot size={13} strokeWidth={2.25} /><span>Process Application</span></button>
            <button
              type="button"
              title="Stop the running bot and close its browser window"
              onClick={async () => {
                if (!confirm('Stop the running bot? The browser window will close.')) return;
                try {
                  const res = await fetch('http://localhost:3001/stop', { method: 'POST' });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok || !data.success) alert(`Failed to stop bot${data.error ? `: ${data.error}` : ''}`);
                } catch {
                  alert('Bot server not running. Nothing to stop.');
                }
              }}
              style={{
                background: 'white', color: '#dc2626',
                border: '1px solid #fecaca', padding: '0.5rem 0.85rem',
                borderRadius: '0.5rem', fontSize: '0.85rem', fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              }}
            >
              <XIcon size={13} strokeWidth={2.5} />
              <span>Cancel Bot</span>
            </button>
            <button className={`od-flag-mode-btn${flagMode ? ' active' : ''}`} onClick={() => setFlagMode(!flagMode)}>
              <Flag size={13} strokeWidth={2.25} />
              <span>{flagMode ? 'Done Flagging' : 'Flag Errors'}</span>
            </button>
            {(flagMode || JSON.stringify(flaggedFields) !== (order.flaggedFields || '[]')) && (
              <button className="od-save-btn" onClick={saveFlags} disabled={flagSaving} style={{ padding: '0.5rem 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                {flagSaving ? <span>Saving...</span> : flagSaved ? (<><Check size={13} strokeWidth={2.5} /><span>Saved</span></>) : (<><Save size={13} strokeWidth={2.25} /><span>Save Flags</span></>)}
              </button>
            )}
          </>
        ) : (
          <div className="od-edit-actions">
            <button className="od-cancel-btn" onClick={cancelEditing}>Cancel</button>
            <button className="od-save-btn" onClick={saveFullEdit} disabled={editSaving} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              {editSaving ? <span>Saving...</span> : <><Save size={13} strokeWidth={2.25} /><span>Save Changes</span></>}
            </button>
          </div>
        )}
      </div>

      {/* ── BOT FLAGS ── */}
      {order.botFlags && (() => {
        try {
          const flags: string[] = JSON.parse(order.botFlags);
          if (flags.length === 0) return null;
          return (
            <div className="od-bot-flags">
              <div className="od-bot-flags-header" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Bot size={14} strokeWidth={2.25} />
                <span>Bot Processing Flags ({flags.length})</span>
              </div>
              <ul className="od-bot-flags-list">
                {flags.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
              <button className="od-bot-flags-dismiss" onClick={async () => {
                try {
                  await fetch(`/api/orders/${order.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ botFlags: null }),
                  });
                  setOrder({ ...order, botFlags: null });
                } catch {}
              }}><Check size={13} strokeWidth={2.5} style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: '0.25rem' }} />Dismiss Flags</button>
            </div>
          );
        } catch { return null; }
      })()}

      {/* ── TRAVELER DETAILS: Full-width ── */}
      <div className="od-traveler-sections">

          {/* Traveler cards */}
          {(!editing ? travelers : editTravelers).map((t, i) => (
            <div key={i} className="modal-section">
              <div className="modal-section-title" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <User size={14} strokeWidth={2} />
                  <span>Traveler #{i + 1}{!editing && t.firstName ? ` — ${t.firstName} ${t.lastName}` : ''}</span>
                </span>
                {editing && editTravelers.length > 1 && (
                  <button type="button" className="od-edit-remove-btn" onClick={() => removeEditTraveler(i)}><XIcon size={12} strokeWidth={2.5} style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: '0.25rem' }} />Remove Traveler</button>
                )}
              </div>

              {!editing ? (
                <div className="ts-grid">
                  {/* Uploaded Documents — shown at the top for quick visual verification */}
                  {(t.photoUrl || t.passportBioUrl) && (
                    <div className="ts-card ts-card-docs">
                      <div className="ts-card-header"><span className="ts-card-icon"><Paperclip size={14} strokeWidth={2} /></span><span>Uploaded Documents</span></div>
                      <div style={{display:'flex',gap:'1.5rem',flexWrap:'wrap',marginTop:'0.5rem'}}>
                      {t.photoUrl && (
                        <div style={{textAlign:'center', border: !photoApproved ? '2px solid #f59e0b' : flaggedFields.includes('photoUrl') ? '2px solid #dc2626' : '2px solid #86efac', borderRadius:'1rem', padding:'0.5rem'}}>
                          <a href={t.photoUrl} target="_blank" rel="noopener noreferrer">
                            <img src={t.photoUrl} alt="Traveler photo" style={{maxWidth:'140px',maxHeight:'140px',borderRadius:'0.75rem',border:'2px solid var(--cloud)',objectFit:'cover',cursor:'pointer'}} />
                          </a>
                          <div style={{fontSize:'0.75rem',color:'var(--slate)',marginTop:'0.25rem'}}>Traveler Photo</div>
                          {photoApproved ? (
                            <div title={formatApproval(order.photoApprovedAt, order.photoApprovedBy) ?? ''} style={{fontSize:'0.68rem',fontWeight:600,color:'#166534',background:'#dcfce7',border:'1px solid #86efac',borderRadius:'0.4rem',padding:'0.15rem 0.4rem',marginTop:'0.3rem',display:'inline-block',maxWidth:'180px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {formatApproval(order.photoApprovedAt, order.photoApprovedBy)}
                            </div>
                          ) : (
                            <div style={{fontSize:'0.7rem',fontWeight:700,color:'#92400e',background:'#fef3c7',border:'1px solid #fde68a',borderRadius:'0.4rem',padding:'0.18rem 0.45rem',marginTop:'0.3rem',display:'inline-flex',alignItems:'center',gap:'0.3rem'}}>
                              <Camera size={12} strokeWidth={2.5} aria-hidden />
                              Needs your approval
                            </div>
                          )}
                          <div style={{display:'flex',gap:'0.35rem',justifyContent:'center',marginTop:'0.35rem',flexWrap:'wrap'}}>
                            <a href={t.photoUrl} download style={{fontSize:'0.75rem',fontWeight:600,color:'var(--blue)',textDecoration:'none',padding:'0.25rem 0.5rem',borderRadius:'0.5rem',border:'1px solid var(--cloud)',background:'white'}}>
                              ⬇
                            </a>
                            <button
                              type="button"
                              onClick={() => setDocApproval('photo', !photoApproved)}
                              title={photoApproved ? 'Revoke approval (e.g. you spotted an issue)' : 'Approve this photo to allow the bot to submit it'}
                              style={{
                                fontSize:'0.7rem', fontWeight:700,
                                padding:'0.25rem 0.6rem', borderRadius:'0.5rem',
                                border: '1px solid ' + (photoApproved ? '#86efac' : '#16a34a'),
                                background: photoApproved ? 'white' : '#16a34a',
                                color: photoApproved ? '#166534' : 'white',
                                cursor: approvalSaving === 'photo' ? 'wait' : 'pointer',
                                opacity: approvalSaving === 'photo' ? 0.6 : 1,
                              }}
                              disabled={approvalSaving === 'photo'}
                            >
                              {approvalSaving === 'photo' ? '…' : photoApproved ? 'Revoke' : '✓ Approve'}
                            </button>
                            {(flagMode || flaggedFields.includes('photoUrl')) && (
                              <button type="button" className={`flag-btn${flaggedFields.includes('photoUrl') ? ' active' : ''}`} onClick={() => toggleFlag('photoUrl')} style={{opacity: flaggedFields.includes('photoUrl') ? 1 : 0.4}}>
                                <Flag size={13} strokeWidth={2.25} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {t.passportBioUrl && (
                        <div style={{textAlign:'center', border: !passportApproved ? '2px solid #f59e0b' : flaggedFields.includes('passportBioUrl') ? '2px solid #dc2626' : '2px solid #86efac', borderRadius:'1rem', padding:'0.5rem'}}>
                          <a href={t.passportBioUrl} target="_blank" rel="noopener noreferrer">
                            {t.passportBioUrl.endsWith('.pdf') ? (
                              <div style={{width:'140px',height:'140px',background:'#f1f5f9',borderRadius:'0.75rem',border:'2px solid var(--cloud)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'var(--slate)'}}><FileText size={32} strokeWidth={1.75} /></div>
                            ) : (
                              <img src={t.passportBioUrl} alt="Passport bio" style={{maxWidth:'200px',maxHeight:'140px',borderRadius:'0.75rem',border:'2px solid var(--cloud)',objectFit:'cover',cursor:'pointer'}} />
                            )}
                          </a>
                          <div style={{fontSize:'0.75rem',color:'var(--slate)',marginTop:'0.25rem'}}>Passport Bio Page</div>
                          {passportApproved ? (
                            <div title={formatApproval(order.passportApprovedAt, order.passportApprovedBy) ?? ''} style={{fontSize:'0.68rem',fontWeight:600,color:'#166534',background:'#dcfce7',border:'1px solid #86efac',borderRadius:'0.4rem',padding:'0.15rem 0.4rem',marginTop:'0.3rem',display:'inline-block',maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {formatApproval(order.passportApprovedAt, order.passportApprovedBy)}
                            </div>
                          ) : (
                            <div style={{fontSize:'0.7rem',fontWeight:700,color:'#92400e',background:'#fef3c7',border:'1px solid #fde68a',borderRadius:'0.4rem',padding:'0.18rem 0.45rem',marginTop:'0.3rem',display:'inline-flex',alignItems:'center',gap:'0.3rem'}}>
                              <FileText size={12} strokeWidth={2.5} aria-hidden />
                              Needs your approval
                            </div>
                          )}
                          <div style={{display:'flex',gap:'0.35rem',justifyContent:'center',marginTop:'0.35rem',flexWrap:'wrap'}}>
                            <a href={t.passportBioUrl} download style={{fontSize:'0.75rem',fontWeight:600,color:'var(--blue)',textDecoration:'none',padding:'0.25rem 0.5rem',borderRadius:'0.5rem',border:'1px solid var(--cloud)',background:'white'}}>
                              ⬇
                            </a>
                            <button
                              type="button"
                              onClick={() => setDocApproval('passport', !passportApproved)}
                              title={passportApproved ? 'Revoke approval (e.g. you spotted an issue)' : 'Approve this passport bio to allow the bot to submit it'}
                              style={{
                                fontSize:'0.7rem', fontWeight:700,
                                padding:'0.25rem 0.6rem', borderRadius:'0.5rem',
                                border: '1px solid ' + (passportApproved ? '#86efac' : '#16a34a'),
                                background: passportApproved ? 'white' : '#16a34a',
                                color: passportApproved ? '#166534' : 'white',
                                cursor: approvalSaving === 'passport' ? 'wait' : 'pointer',
                                opacity: approvalSaving === 'passport' ? 0.6 : 1,
                              }}
                              disabled={approvalSaving === 'passport'}
                            >
                              {approvalSaving === 'passport' ? '…' : passportApproved ? 'Revoke' : '✓ Approve'}
                            </button>
                            {(flagMode || flaggedFields.includes('passportBioUrl')) && (
                              <button type="button" className={`flag-btn${flaggedFields.includes('passportBioUrl') ? ' active' : ''}`} onClick={() => toggleFlag('passportBioUrl')} style={{opacity: flaggedFields.includes('passportBioUrl') ? 1 : 0.4}}>
                                <Flag size={13} strokeWidth={2.25} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      </div>
                    </div>
                  )}

                  {/* Personal */}
                  <div className="ts-card ts-card-personal">
                    <div className="ts-card-header"><span className="ts-card-icon"><User size={14} strokeWidth={2} /></span><span>Personal Details</span></div>
                    <div className="modal-rows">
                      <FlagRow field="firstName" label="Full name" value={`${t.firstName} ${t.lastName}`} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="dob" label="Date of birth" value={t.dob} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="email" label="Email" value={t.email} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="phoneNumber" label="Phone" value={t.phoneNumber} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="gender" label="Gender" value={t.gender} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="maritalStatus" label="Marital status" value={t.maritalStatus} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="religion" label="Religion" value={t.religion} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                    </div>
                  </div>

                  {/* Birth & Identity */}
                  <div className="ts-card ts-card-birth">
                    <div className="ts-card-header"><span className="ts-card-icon"><FileBadge size={14} strokeWidth={2} /></span><span>Birth & Identity</span></div>
                    <div className="modal-rows">
                      <FlagRow field="cityOfBirth" label="City of birth" value={t.cityOfBirth} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="countryOfBirth" label="Country of birth" value={t.countryOfBirth} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="citizenshipId" label="Citizenship/National ID" value={t.citizenshipId} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} className="modal-mono" />
                      <FlagRow field="nationalityByBirth" label="Nationality acquired" value={t.nationalityByBirth ? (t.nationalityByBirth === 'birth' ? 'By birth' : 'By naturalization') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="holdAnotherNationality" label="Other nationality" value={t.holdAnotherNationality ? (t.holdAnotherNationality === 'yes' ? `Yes — ${t.otherNationality}` : 'No') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="livedTwoYears" label="Lived 2+ yrs in country" value={t.livedTwoYears ? (t.livedTwoYears === 'yes' ? 'Yes' : 'No') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="parentsFromPakistan" label="Parents from Pakistan" value={t.parentsFromPakistan ? (t.parentsFromPakistan === 'yes' ? 'Yes' : 'No') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="visibleMarks" label="Visible marks" value={t.visibleMarks} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      <FlagRow field="educationalQualification" label="Education" value={t.educationalQualification} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                    </div>
                  </div>

                  {/* Address */}
                  {(t.address || t.city || t.state || t.zip || t.residenceCountry) && (
                    <div className="ts-card ts-card-address">
                      <div className="ts-card-header"><span className="ts-card-icon"><Home size={14} strokeWidth={2} /></span><span>Address</span></div>
                      <div className="modal-rows">
                        <FlagRow field="residenceCountry" label="Country of residence" value={t.residenceCountry} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="address" label="Home address" value={t.address} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="city" label="City / State / ZIP" value={(t.city || t.state || t.zip) ? [t.city, t.state, t.zip].filter(Boolean).join(', ') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      </div>
                    </div>
                  )}

                  {/* Employment */}
                  {(t.employmentStatus || t.isEmployed || t.servedMilitary) && (
                    <div className="ts-card ts-card-employment">
                      <div className="ts-card-header"><span className="ts-card-icon"><Briefcase size={14} strokeWidth={2} /></span><span>Employment</span></div>
                      <div className="modal-rows">
                        <FlagRow field="employmentStatus" label="Status" value={t.employmentStatus} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="employerName" label="Employer" value={t.employerName} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="employerAddress" label="Employer address" value={t.employerAddress ? [t.employerAddress, t.employerCity, t.employerState, t.employerCountry, t.employerZip].filter(Boolean).join(', ') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="servedMilitary" label="Military/police" value={t.servedMilitary ? (t.servedMilitary === 'yes' ? 'Yes' : 'No') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      </div>
                    </div>
                  )}

                  {/* Business Meeting Details — only renders for BUSINESS_1Y
                      orders whose sub-purpose is "Attend Technical/Business
                      Meetings". Other business sub-purposes have different
                      gov-form fields that will get their own card. */}
                  {order.visaType === 'BUSINESS_1Y' && t.purposeOfVisit === 'Attend Technical/Business Meetings' && (t.applicantCompanyName || t.indianFirmName || t.purposeOfVisit) && (
                    <div className="ts-card ts-card-business">
                      <div className="ts-card-header"><span className="ts-card-icon"><Building2 size={14} strokeWidth={2} /></span><span>Business Meeting Details</span></div>
                      <div className="modal-rows">
                        <FlagRow field="purposeOfVisit"          label="Purpose of visit"           value={t.purposeOfVisit}          flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="applicantCompanyName"    label="Applicant's company"        value={t.applicantCompanyName}    flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="applicantCompanyAddress" label="Applicant's company addr"   value={t.applicantCompanyAddress} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="applicantCompanyPhone"   label="Applicant's company phone"  value={t.applicantCompanyPhone}   flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="applicantCompanyWebsite" label="Applicant's company web"    value={t.applicantCompanyWebsite} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="indianFirmName"          label="Indian firm"                value={t.indianFirmName}          flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="indianFirmAddress"       label="Indian firm address"        value={t.indianFirmAddress}       flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="indianFirmPhone"         label="Indian firm phone"          value={t.indianFirmPhone}         flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="indianFirmWebsite"       label="Indian firm website"        value={t.indianFirmWebsite}       flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      </div>
                    </div>
                  )}

                  {/* Family */}
                  {(t.fatherName || t.motherName || t.spouseName || t.knowParents) && (
                    <div className="ts-card ts-card-family">
                      <div className="ts-card-header"><span className="ts-card-icon"><UsersIcon size={14} strokeWidth={2} /></span><span>Family Details</span></div>
                      <div className="modal-rows">
                        <FlagRow field="fatherName" label="Father" value={t.fatherName ? `${t.fatherName}${t.fatherNationality ? ` (${t.fatherNationality})` : ''}` : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="fatherPlaceOfBirth" label="Father's birthplace" value={(t.fatherPlaceOfBirth || t.fatherCountryOfBirth) ? [t.fatherPlaceOfBirth, t.fatherCountryOfBirth].filter(Boolean).join(', ') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="motherName" label="Mother" value={t.motherName ? `${t.motherName}${t.motherNationality ? ` (${t.motherNationality})` : ''}` : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="motherPlaceOfBirth" label="Mother's birthplace" value={(t.motherPlaceOfBirth || t.motherCountryOfBirth) ? [t.motherPlaceOfBirth, t.motherCountryOfBirth].filter(Boolean).join(', ') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="spouseName" label="Spouse" value={t.spouseName ? `${t.spouseName}${t.spouseNationality ? ` (${t.spouseNationality})` : ''}` : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="spousePlaceOfBirth" label="Spouse's birthplace" value={(t.spousePlaceOfBirth || t.spouseCountryOfBirth) ? [t.spousePlaceOfBirth, t.spouseCountryOfBirth].filter(Boolean).join(', ') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      </div>
                    </div>
                  )}

                  {/* Passport */}
                  {(t.passportCountry || t.passportNumber) && (
                    <div className="ts-card ts-card-passport">
                      <div className="ts-card-header"><span className="ts-card-icon"><BookOpen size={14} strokeWidth={2} /></span><span>Passport Details</span></div>
                      <div className="modal-rows">
                        <FlagRow field="passportCountry" label="Country" value={t.passportCountry} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="passportNumber" label="Number" value={t.passportNumber} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} className="modal-mono" />
                        <FlagRow field="passportPlaceOfIssue" label="Place of issue" value={t.passportPlaceOfIssue} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="passportCountryOfIssue" label="Country of issue" value={t.passportCountryOfIssue} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="passportIssued" label="Issued" value={t.passportIssued} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="passportExpiry" label="Expiry" value={t.passportExpiry} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="hasOtherPassport" label="Other passport/IC" value={t.hasOtherPassport ? (t.hasOtherPassport === 'yes' ? `Yes — ${t.otherPassportNumber || ''}` : 'No') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      </div>
                    </div>
                  )}

                  {/* Trip Details */}
                  {(t.arrivalDate || t.arrivalPoint || (t.visitedCountries && t.visitedCountries.length > 0)) && (
                    <div className="ts-card ts-card-trip">
                      <div className="ts-card-header"><span className="ts-card-icon"><Plane size={14} strokeWidth={2} /></span><span>Trip Details</span></div>
                      <div className="modal-rows">
                        <FlagRow field="arrivalDate" label="Arrival date" value={t.arrivalDate} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="arrivalPoint" label="Arrival point" value={t.arrivalPoint} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="visitedCountries" label="Countries visited (10 yrs)" value={t.visitedCountries?.length ? t.visitedCountries.join(', ') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      </div>
                    </div>
                  )}

                  {/* Travel & Accommodation */}
                  {(t.placesToVisit || t.bookedHotel || t.exitPort || t.visitedIndiaBefore) && (
                    <div className="ts-card ts-card-accom">
                      <div className="ts-card-header"><span className="ts-card-icon"><Hotel size={14} strokeWidth={2} /></span><span>Travel & Accommodation</span></div>
                      <div className="modal-rows">
                        <FlagRow field="placesToVisit" label="Places to visit" value={t.placesToVisit} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="bookedHotel" label="Hotel booked" value={t.bookedHotel ? (t.bookedHotel === 'yes' ? `Yes — ${t.hotelName || ''}, ${t.hotelPlace || ''}` : 'No') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="tourOperatorName" label="Tour operator" value={t.tourOperatorName} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="exitPort" label="Exit airport" value={t.exitPort} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="visitedIndiaBefore" label="Visited India before" value={t.visitedIndiaBefore ? (t.visitedIndiaBefore === 'yes' ? 'Yes' : 'No') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        {t.visitedIndiaBefore === 'yes' && <>
                          <FlagRow field="prevIndiaAddress" label="Previous address in India" value={(t as any).prevIndiaAddress} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                          <FlagRow field="prevIndiaCities" label="Cities visited" value={(t as any).prevIndiaCities} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                          <FlagRow field="prevIndiaVisaNo" label="Last visa number" value={(t as any).prevIndiaVisaNo} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} className="modal-mono" />
                          <FlagRow field="prevIndiaVisaType" label="Last visa type" value={(t as any).prevIndiaVisaType} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                          <FlagRow field="prevIndiaVisaPlace" label="Last visa place of issue" value={(t as any).prevIndiaVisaPlace} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                          <FlagRow field="prevIndiaVisaDate" label="Last visa date of issue" value={(t as any).prevIndiaVisaDate} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        </>}
                        <FlagRow field="visaRefusedBefore" label="Visa refused before" value={t.visaRefusedBefore ? (t.visaRefusedBefore === 'yes' ? 'Yes' : 'No') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} className={t.visaRefusedBefore === 'yes' ? 'text-red-600 font-semibold' : ''} />
                      </div>
                    </div>
                  )}

                  {/* References */}
                  {(t.refNameIndia || t.refAddressHome) && (
                    <div className="ts-card ts-card-reference">
                      <div className="ts-card-header"><span className="ts-card-icon"><Contact size={14} strokeWidth={2} /></span><span>References</span></div>
                      <div className="modal-rows">
                        <FlagRow field="refNameIndia" label="India reference" value={t.refNameIndia} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="refAddressIndia" label="India address" value={t.refAddressIndia ? [t.refAddressIndia, t.refStateIndia, t.refDistrictIndia].filter(Boolean).join(', ') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="refPhoneIndia" label="India phone" value={t.refPhoneIndia} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="refNameHome" label="Home country reference" value={t.refNameHome} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="refAddressHome" label="Home country address" value={t.refAddressHome ? [t.refAddressHome, t.refStateHome, t.refDistrictHome].filter(Boolean).join(', ') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                        <FlagRow field="refPhoneHome" label="Home country phone" value={t.refPhoneHome} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} />
                      </div>
                    </div>
                  )}

                  {/* Security Questions */}
                  {(t.everArrested || t.everRefusedEntry || t.soughtAsylum || t.hasCriminalRecord) && (
                    <div className="ts-card ts-card-security">
                      <div className="ts-card-header"><span className="ts-card-icon"><Shield size={14} strokeWidth={2} /></span><span>Security</span></div>
                      <div className="modal-rows">
                        <FlagRow field="everArrested" label="Arrested/convicted" value={t.everArrested ? (t.everArrested === 'yes' ? 'Yes' : 'No') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} className={t.everArrested === 'yes' ? 'text-red-600 font-semibold' : ''} />
                        <FlagRow field="everRefusedEntry" label="Refused entry/deported" value={t.everRefusedEntry ? (t.everRefusedEntry === 'yes' ? 'Yes' : 'No') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} className={t.everRefusedEntry === 'yes' ? 'text-red-600 font-semibold' : ''} />
                        <FlagRow field="soughtAsylum" label="Sought asylum" value={t.soughtAsylum ? (t.soughtAsylum === 'yes' ? 'Yes' : 'No') : undefined} flagged={flaggedFields} onToggle={toggleFlag} showFlags={flagMode} className={t.soughtAsylum === 'yes' ? 'text-red-600 font-semibold' : ''} />
                        {t.hasCriminalRecord && <div className="modal-row"><span className="modal-row-label">Criminal record</span><span className={`modal-row-value${t.hasCriminalRecord === 'yes' ? ' text-red-600 font-semibold' : ''}`}>{t.hasCriminalRecord === 'yes' ? 'Yes' : 'No'}</span></div>}
                      </div>
                    </div>
                  )}

                  {/* Application Progress */}
                  {t.finishStep && (
                    <div className="ts-card ts-card-progress">
                      <div className="ts-card-header"><span className="ts-card-icon"><ClipboardList size={14} strokeWidth={2} /></span><span>Application Progress</span></div>
                      <div style={{fontSize:'0.85rem',color:'var(--ink)',padding:'0.25rem 0'}}>Step: <strong>{t.finishStep}</strong></div>
                    </div>
                  )}

                  {/* Admin-defined custom sections (built-ins are shown via hardcoded cards above) */}
                  {customAppSchema.sections
                    .filter(sec => !sec.builtIn && !sec.hidden && sec.fields.length > 0)
                    .map(sec => {
                      const vals = (t as any).custom || {};
                      const visibleFields = sec.fields.filter(f => !f.hidden);
                      if (visibleFields.length === 0) return null;
                      return (
                        <div key={sec.key} className="ts-card">
                          <div className="ts-card-header">
                            <span className="ts-card-icon"><SectionIcon icon={sec.icon} emoji={sec.emoji} size={14} strokeWidth={2} /></span>
                            <span>{sec.title}</span>
                          </div>
                          {visibleFields.map(f => (
                            <div key={f.key} className="modal-row">
                              <span className="modal-row-label">{f.label}</span>
                              <span className="modal-row-value">{formatAdminCustomValue(vals[f.key])}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="ts-grid">
                  {/* Documents — upload/remove photo and passport bio (shown at top) */}
                  <div className="ts-card ts-card-docs">
                    <div className="ts-card-header"><span className="ts-card-icon"><Paperclip size={14} strokeWidth={2} /></span><span>Documents</span></div>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginTop:'0.5rem'}}>
                      {/* Photo */}
                      <div style={{textAlign:'center', padding:'0.75rem', border:'1px solid var(--cloud)', borderRadius:'0.75rem'}}>
                        <div style={{fontSize:'0.85rem', fontWeight:600, marginBottom:'0.5rem'}}>Traveler Photo</div>
                        {t.photoUrl ? (
                          <>
                            <img src={t.photoUrl} alt="Photo" style={{maxWidth:'120px',maxHeight:'120px',borderRadius:'0.5rem',objectFit:'cover',marginBottom:'0.5rem'}} />
                            <div style={{display:'flex', gap:'0.5rem', justifyContent:'center'}}>
                              <button type="button" style={{padding:'0.35rem 0.75rem', fontSize:'0.8rem', background:'#dc2626', color:'white', border:'none', borderRadius:'0.35rem', cursor:'pointer'}} onClick={() => updateEditTraveler(i, 'photoUrl', '')}>Remove</button>
                              <label style={{padding:'0.35rem 0.75rem', fontSize:'0.8rem', background:'var(--blue)', color:'white', border:'none', borderRadius:'0.35rem', cursor:'pointer'}}>
                                Replace
                                <input type="file" accept="image/*" style={{display:'none'}} onChange={async e => {
                                  const file = e.target.files?.[0]; if (!file || !order) return;
                                  const fd = new FormData();
                                  fd.append('file', file); fd.append('orderId', order.id); fd.append('type', 'photo');
                                  const res = await fetch('/api/upload', { method: 'POST', body: fd });
                                  const data = await res.json();
                                  if (data.url) updateEditTraveler(i, 'photoUrl', data.url);
                                  else alert('Upload failed: ' + (data.error || 'unknown'));
                                }} />
                              </label>
                            </div>
                          </>
                        ) : (
                          <label style={{display:'inline-block', padding:'0.5rem 1rem', background:'var(--blue)', color:'white', borderRadius:'0.5rem', cursor:'pointer', fontSize:'0.85rem'}}>
                            + Upload Photo
                            <input type="file" accept="image/*" style={{display:'none'}} onChange={async e => {
                              const file = e.target.files?.[0]; if (!file || !order) return;
                              const fd = new FormData();
                              fd.append('file', file); fd.append('orderId', order.id); fd.append('type', 'photo');
                              const res = await fetch('/api/upload', { method: 'POST', body: fd });
                              const data = await res.json();
                              if (data.url) updateEditTraveler(i, 'photoUrl', data.url);
                              else alert('Upload failed: ' + (data.error || 'unknown'));
                            }} />
                          </label>
                        )}
                      </div>
                      {/* Passport Bio */}
                      <div style={{textAlign:'center', padding:'0.75rem', border:'1px solid var(--cloud)', borderRadius:'0.75rem'}}>
                        <div style={{fontSize:'0.85rem', fontWeight:600, marginBottom:'0.5rem'}}>Passport Bio Page</div>
                        {t.passportBioUrl ? (
                          <>
                            <img src={t.passportBioUrl} alt="Passport" style={{maxWidth:'160px',maxHeight:'120px',borderRadius:'0.5rem',objectFit:'cover',marginBottom:'0.5rem'}} />
                            <div style={{display:'flex', gap:'0.5rem', justifyContent:'center'}}>
                              <button type="button" style={{padding:'0.35rem 0.75rem', fontSize:'0.8rem', background:'#dc2626', color:'white', border:'none', borderRadius:'0.35rem', cursor:'pointer'}} onClick={() => updateEditTraveler(i, 'passportBioUrl', '')}>Remove</button>
                              <label style={{padding:'0.35rem 0.75rem', fontSize:'0.8rem', background:'var(--blue)', color:'white', border:'none', borderRadius:'0.35rem', cursor:'pointer'}}>
                                Replace
                                <input type="file" accept="image/*,application/pdf" style={{display:'none'}} onChange={async e => {
                                  const file = e.target.files?.[0]; if (!file || !order) return;
                                  const fd = new FormData();
                                  fd.append('file', file); fd.append('orderId', order.id); fd.append('type', 'passport');
                                  const res = await fetch('/api/upload', { method: 'POST', body: fd });
                                  const data = await res.json();
                                  if (data.url) updateEditTraveler(i, 'passportBioUrl', data.url);
                                  else alert('Upload failed: ' + (data.error || 'unknown'));
                                }} />
                              </label>
                            </div>
                          </>
                        ) : (
                          <label style={{display:'inline-block', padding:'0.5rem 1rem', background:'var(--blue)', color:'white', borderRadius:'0.5rem', cursor:'pointer', fontSize:'0.85rem'}}>
                            + Upload Passport
                            <input type="file" accept="image/*,application/pdf" style={{display:'none'}} onChange={async e => {
                              const file = e.target.files?.[0]; if (!file || !order) return;
                              const fd = new FormData();
                              fd.append('file', file); fd.append('orderId', order.id); fd.append('type', 'passport');
                              const res = await fetch('/api/upload', { method: 'POST', body: fd });
                              const data = await res.json();
                              if (data.url) updateEditTraveler(i, 'passportBioUrl', data.url);
                              else alert('Upload failed: ' + (data.error || 'unknown'));
                            }} />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Personal Details */}
                  <div className="ts-card ts-card-personal">
                    <div className="ts-card-header"><span className="ts-card-icon"><User size={14} strokeWidth={2} /></span><span>Personal Details</span></div>
                    <div className="ts-edit-fields">
                      <div className="ap-field"><label className="ap-field-label">First name</label><input className="od-edit-input" value={t.firstName} onChange={e => updateEditTraveler(i, 'firstName', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Last name</label><input className="od-edit-input" value={t.lastName} onChange={e => updateEditTraveler(i, 'lastName', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Email</label><input className="od-edit-input" type="email" value={t.email} onChange={e => updateEditTraveler(i, 'email', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Phone</label><input className="od-edit-input" value={t.phoneNumber ?? ''} onChange={e => updateEditTraveler(i, 'phoneNumber', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Date of birth</label><input className="od-edit-input" value={t.dob ?? ''} onChange={e => updateEditTraveler(i, 'dob', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Gender</label>
                        <select className="od-edit-input" value={t.gender ?? ''} onChange={e => updateEditTraveler(i, 'gender', e.target.value)}>
                          <option value="">—</option><option value="Male">Male</option><option value="Female">Female</option>
                        </select></div>
                      <div className="ap-field"><label className="ap-field-label">Marital status</label>
                        <select className="od-edit-input" value={t.maritalStatus ?? ''} onChange={e => updateEditTraveler(i, 'maritalStatus', e.target.value)}>
                          <option value="">—</option><option value="Married">Married</option><option value="Single">Single</option><option value="Divorced">Divorced</option><option value="Widowed">Widowed</option>
                        </select></div>
                      <div className="ap-field"><label className="ap-field-label">Religion</label>
                        <select className="od-edit-input" value={t.religion ?? ''} onChange={e => updateEditTraveler(i, 'religion', e.target.value)}>
                          <option value="">—</option>
                          {INDIA_RELIGIONS.map(r => (
                            <option key={r.value} value={r.label}>{r.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Birth & Identity */}
                  <div className="ts-card ts-card-birth">
                    <div className="ts-card-header"><span className="ts-card-icon"><FileBadge size={14} strokeWidth={2} /></span><span>Birth & Identity</span></div>
                    <div className="ts-edit-fields">
                      <div className="ap-field"><label className="ap-field-label">City of birth</label><input className="od-edit-input" value={t.cityOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'cityOfBirth', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Country of birth</label><input className="od-edit-input" value={t.countryOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'countryOfBirth', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Citizenship/National ID</label><input className="od-edit-input" value={t.citizenshipId ?? ''} onChange={e => updateEditTraveler(i, 'citizenshipId', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Nationality acquired</label>
                        <select className="od-edit-input" value={t.nationalityByBirth ?? ''} onChange={e => updateEditTraveler(i, 'nationalityByBirth', e.target.value)}>
                          <option value="">—</option><option value="birth">By birth</option><option value="naturalization">By naturalization</option>
                        </select></div>
                      <div className="ap-field"><label className="ap-field-label">Other nationality</label>
                        <select className="od-edit-input" value={t.holdAnotherNationality ?? ''} onChange={e => updateEditTraveler(i, 'holdAnotherNationality', e.target.value)}>
                          <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                        </select></div>
                      {t.holdAnotherNationality === 'yes' && <div className="ap-field"><label className="ap-field-label">Which one</label><input className="od-edit-input" value={t.otherNationality ?? ''} onChange={e => updateEditTraveler(i, 'otherNationality', e.target.value)} /></div>}
                      <div className="ap-field"><label className="ap-field-label">Lived 2+ yrs in country</label>
                        <select className="od-edit-input" value={t.livedTwoYears ?? ''} onChange={e => updateEditTraveler(i, 'livedTwoYears', e.target.value)}>
                          <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                        </select></div>
                      <div className="ap-field"><label className="ap-field-label">Parents from Pakistan</label>
                        <select className="od-edit-input" value={t.parentsFromPakistan ?? ''} onChange={e => updateEditTraveler(i, 'parentsFromPakistan', e.target.value)}>
                          <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                        </select></div>
                      <div className="ap-field"><label className="ap-field-label">Visible marks</label><input className="od-edit-input" value={t.visibleMarks ?? ''} onChange={e => updateEditTraveler(i, 'visibleMarks', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Education</label><input className="od-edit-input" value={t.educationalQualification ?? ''} onChange={e => updateEditTraveler(i, 'educationalQualification', e.target.value)} /></div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="ts-card ts-card-address">
                    <div className="ts-card-header"><span className="ts-card-icon"><Home size={14} strokeWidth={2} /></span><span>Address</span></div>
                    <div className="ts-edit-fields">
                      <div className="ap-field"><label className="ap-field-label">Country of residence</label><input className="od-edit-input" value={t.residenceCountry ?? ''} onChange={e => updateEditTraveler(i, 'residenceCountry', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Address</label><input className="od-edit-input" value={t.address ?? ''} onChange={e => updateEditTraveler(i, 'address', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">City</label><input className="od-edit-input" value={t.city ?? ''} onChange={e => updateEditTraveler(i, 'city', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">State</label><input className="od-edit-input" value={t.state ?? ''} onChange={e => updateEditTraveler(i, 'state', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">ZIP</label><input className="od-edit-input" value={t.zip ?? ''} onChange={e => updateEditTraveler(i, 'zip', e.target.value)} /></div>
                    </div>
                  </div>

                  {/* Employment */}
                  <div className="ts-card ts-card-employment">
                    <div className="ts-card-header"><span className="ts-card-icon"><Briefcase size={14} strokeWidth={2} /></span><span>Employment</span></div>
                    <div className="ts-edit-fields">
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
                    </div>
                  </div>

                  {/* Business Meeting Details — only for BUSINESS_1Y +
                      Attend Technical/Business Meetings sub-purpose.
                      Edit-mode lets admin change the sub-purpose first, so
                      we always show the purpose dropdown for business orders
                      and reveal the rest of the fields only when the meetings
                      sub-purpose is selected. */}
                  {order.visaType === 'BUSINESS_1Y' && (
                    <div className="ts-card ts-card-business">
                      <div className="ts-card-header"><span className="ts-card-icon"><Building2 size={14} strokeWidth={2} /></span><span>Business Meeting Details</span></div>
                      <div className="ts-edit-fields">
                        <div className="ap-field"><label className="ap-field-label">Purpose of visit</label>
                          <select className="od-edit-input" value={t.purposeOfVisit ?? ''} onChange={e => updateEditTraveler(i, 'purposeOfVisit', e.target.value)}>
                            <option value="">—</option>
                            <option value="Set Up Industrial/Business Venture">Set Up Industrial/Business Venture</option>
                            <option value="Sale/Purchase/Trade">Sale/Purchase/Trade</option>
                            <option value="Attend Technical/Business Meetings">Attend Technical/Business Meetings</option>
                            <option value="Recruit Manpower">Recruit Manpower</option>
                            <option value="Participation in Exhibitions/Trade Fairs">Participation in Exhibitions/Trade Fairs</option>
                            <option value="Expert/Specialist for Ongoing Project">Expert/Specialist for Ongoing Project</option>
                            <option value="Conducting Tours">Conducting Tours</option>
                            <option value="Deliver Lectures (GIAN)">Deliver Lectures (GIAN)</option>
                            <option value="Sports Related Activity">Sports Related Activity</option>
                            <option value="Join Vessel">Join Vessel</option>
                          </select>
                        </div>
                        {/* The 6 meetings-specific fields only show when the
                            sub-purpose matches. Other sub-purposes have
                            different gov-form fields and will get their own
                            cards as we map them. */}
                        {t.purposeOfVisit === 'Attend Technical/Business Meetings' ? (
                          <>
                            <div style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--slate)', textTransform:'uppercase', marginTop:'0.5rem' }}>Applicant&apos;s Company</div>
                            <div className="ap-field"><label className="ap-field-label">Name</label><input className="od-edit-input" value={t.applicantCompanyName ?? ''} onChange={e => updateEditTraveler(i, 'applicantCompanyName', stripDiacritics(e.target.value))} /></div>
                            <div className="ap-field"><label className="ap-field-label">Address</label><input className="od-edit-input" value={t.applicantCompanyAddress ?? ''} onChange={e => updateEditTraveler(i, 'applicantCompanyAddress', stripDiacritics(e.target.value))} /></div>
                            <div className="ap-field"><label className="ap-field-label">Phone number</label><input className="od-edit-input" value={t.applicantCompanyPhone ?? ''} onChange={e => updateEditTraveler(i, 'applicantCompanyPhone', stripDiacritics(e.target.value))} /></div>
                            <div className="ap-field"><label className="ap-field-label">Website</label><input className="od-edit-input" value={t.applicantCompanyWebsite ?? ''} onChange={e => updateEditTraveler(i, 'applicantCompanyWebsite', stripDiacritics(e.target.value))} /></div>
                            <div style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--slate)', textTransform:'uppercase', marginTop:'0.5rem' }}>Indian Firm</div>
                            <div className="ap-field"><label className="ap-field-label">Name</label><input className="od-edit-input" value={t.indianFirmName ?? ''} onChange={e => updateEditTraveler(i, 'indianFirmName', stripDiacritics(e.target.value))} /></div>
                            <div className="ap-field"><label className="ap-field-label">Address</label><input className="od-edit-input" value={t.indianFirmAddress ?? ''} onChange={e => updateEditTraveler(i, 'indianFirmAddress', stripDiacritics(e.target.value))} /></div>
                            <div className="ap-field"><label className="ap-field-label">Phone number</label><input className="od-edit-input" value={t.indianFirmPhone ?? ''} onChange={e => updateEditTraveler(i, 'indianFirmPhone', stripDiacritics(e.target.value))} /></div>
                            <div className="ap-field"><label className="ap-field-label">Website</label><input className="od-edit-input" value={t.indianFirmWebsite ?? ''} onChange={e => updateEditTraveler(i, 'indianFirmWebsite', stripDiacritics(e.target.value))} /></div>
                          </>
                        ) : t.purposeOfVisit ? (
                          <p style={{ color:'var(--slate)', fontSize:'0.82rem', marginTop:'0.5rem' }}>
                            Sub-form for &quot;{t.purposeOfVisit}&quot; isn&apos;t built yet. Switch to &quot;Attend Technical/Business Meetings&quot; to edit the meetings-specific fields, or wait for that sub-purpose&apos;s mapping to be added.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Family */}
                  <div className="ts-card ts-card-family">
                    <div className="ts-card-header"><span className="ts-card-icon"><UsersIcon size={14} strokeWidth={2} /></span><span>Family Details</span></div>
                    <div className="ts-edit-fields">
                      {/* Father */}
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.78rem', fontWeight:600, color:'var(--slate)', textTransform:'uppercase', marginTop:'0.25rem'}}>
                        <span>Father</span>
                        {(t.fatherName || '').trim() !== '' ? (
                          <button type="button" className="od-edit-remove-btn" onClick={() => clearFamilyMember(i, 'father')}><XIcon size={12} strokeWidth={2.5} style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: '0.25rem' }} />Remove</button>
                        ) : (
                          <button type="button" className="od-edit-add-btn" onClick={() => updateEditTraveler(i, 'fatherName', ' ')}>+ Add</button>
                        )}
                      </div>
                      {(t.fatherName || '').trim() !== '' && <>
                        <div className="ap-field"><label className="ap-field-label">Name</label><input className="od-edit-input" value={t.fatherName ?? ''} onChange={e => updateEditTraveler(i, 'fatherName', e.target.value)} /></div>
                        <div className="ap-field"><label className="ap-field-label">Nationality</label><input className="od-edit-input" value={t.fatherNationality ?? ''} onChange={e => updateEditTraveler(i, 'fatherNationality', e.target.value)} /></div>
                        <div className="ap-field"><label className="ap-field-label">Birthplace</label><input className="od-edit-input" value={t.fatherPlaceOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'fatherPlaceOfBirth', e.target.value)} /></div>
                        <div className="ap-field"><label className="ap-field-label">Birth country</label><input className="od-edit-input" value={t.fatherCountryOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'fatherCountryOfBirth', e.target.value)} /></div>
                      </>}
                      {/* Mother */}
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.78rem', fontWeight:600, color:'var(--slate)', textTransform:'uppercase', marginTop:'0.75rem'}}>
                        <span>Mother</span>
                        {(t.motherName || '').trim() !== '' ? (
                          <button type="button" className="od-edit-remove-btn" onClick={() => clearFamilyMember(i, 'mother')}><XIcon size={12} strokeWidth={2.5} style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: '0.25rem' }} />Remove</button>
                        ) : (
                          <button type="button" className="od-edit-add-btn" onClick={() => updateEditTraveler(i, 'motherName', ' ')}>+ Add</button>
                        )}
                      </div>
                      {(t.motherName || '').trim() !== '' && <>
                        <div className="ap-field"><label className="ap-field-label">Name</label><input className="od-edit-input" value={t.motherName ?? ''} onChange={e => updateEditTraveler(i, 'motherName', e.target.value)} /></div>
                        <div className="ap-field"><label className="ap-field-label">Nationality</label><input className="od-edit-input" value={t.motherNationality ?? ''} onChange={e => updateEditTraveler(i, 'motherNationality', e.target.value)} /></div>
                        <div className="ap-field"><label className="ap-field-label">Birthplace</label><input className="od-edit-input" value={t.motherPlaceOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'motherPlaceOfBirth', e.target.value)} /></div>
                        <div className="ap-field"><label className="ap-field-label">Birth country</label><input className="od-edit-input" value={t.motherCountryOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'motherCountryOfBirth', e.target.value)} /></div>
                      </>}
                      {/* Spouse */}
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.78rem', fontWeight:600, color:'var(--slate)', textTransform:'uppercase', marginTop:'0.75rem'}}>
                        <span>Spouse</span>
                        {(t.spouseName || '').trim() !== '' ? (
                          <button type="button" className="od-edit-remove-btn" onClick={() => clearFamilyMember(i, 'spouse')}><XIcon size={12} strokeWidth={2.5} style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: '0.25rem' }} />Remove</button>
                        ) : (
                          <button type="button" className="od-edit-add-btn" onClick={() => updateEditTraveler(i, 'spouseName', ' ')}>+ Add</button>
                        )}
                      </div>
                      {(t.spouseName || '').trim() !== '' && <>
                        <div className="ap-field"><label className="ap-field-label">Name</label><input className="od-edit-input" value={t.spouseName ?? ''} onChange={e => updateEditTraveler(i, 'spouseName', e.target.value)} /></div>
                        <div className="ap-field"><label className="ap-field-label">Nationality</label><input className="od-edit-input" value={t.spouseNationality ?? ''} onChange={e => updateEditTraveler(i, 'spouseNationality', e.target.value)} /></div>
                        <div className="ap-field"><label className="ap-field-label">Birthplace</label><input className="od-edit-input" value={t.spousePlaceOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'spousePlaceOfBirth', e.target.value)} /></div>
                        <div className="ap-field"><label className="ap-field-label">Birth country</label><input className="od-edit-input" value={t.spouseCountryOfBirth ?? ''} onChange={e => updateEditTraveler(i, 'spouseCountryOfBirth', e.target.value)} /></div>
                      </>}
                    </div>
                  </div>

                  {/* Passport */}
                  <div className="ts-card ts-card-passport">
                    <div className="ts-card-header"><span className="ts-card-icon"><BookOpen size={14} strokeWidth={2} /></span><span>Passport Details</span></div>
                    <div className="ts-edit-fields">
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
                    </div>
                  </div>

                  {/* Trip Details */}
                  <div className="ts-card ts-card-trip">
                    <div className="ts-card-header"><span className="ts-card-icon"><Plane size={14} strokeWidth={2} /></span><span>Trip Details</span></div>
                    <div className="ts-edit-fields">
                      <div className="ap-field"><label className="ap-field-label">Arrival date</label><input className="od-edit-input" value={t.arrivalDate ?? ''} onChange={e => updateEditTraveler(i, 'arrivalDate', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Arrival point</label><input className="od-edit-input" value={t.arrivalPoint ?? ''} onChange={e => updateEditTraveler(i, 'arrivalPoint', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Confirmed travel</label>
                        <select className="od-edit-input" value={t.hasConfirmedTravel ?? ''} onChange={e => updateEditTraveler(i, 'hasConfirmedTravel', e.target.value)}>
                          <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                        </select></div>
                    </div>
                  </div>

                  {/* Travel & Accommodation */}
                  <div className="ts-card ts-card-accom">
                    <div className="ts-card-header"><span className="ts-card-icon"><Hotel size={14} strokeWidth={2} /></span><span>Travel & Accommodation</span></div>
                    <div className="ts-edit-fields">
                      <div className="ap-field"><label className="ap-field-label">Places to visit</label><input className="od-edit-input" value={t.placesToVisit ?? ''} onChange={e => updateEditTraveler(i, 'placesToVisit', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Booked hotel</label>
                        <select className="od-edit-input" value={t.bookedHotel ?? ''} onChange={e => updateEditTraveler(i, 'bookedHotel', e.target.value)}>
                          <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                        </select></div>
                      {t.bookedHotel === 'yes' && <>
                        <div className="ap-field"><label className="ap-field-label">Hotel name</label><input className="od-edit-input" value={t.hotelName ?? ''} onChange={e => updateEditTraveler(i, 'hotelName', e.target.value)} /></div>
                        <div className="ap-field"><label className="ap-field-label">Hotel place</label><input className="od-edit-input" value={t.hotelPlace ?? ''} onChange={e => updateEditTraveler(i, 'hotelPlace', e.target.value)} /></div>
                        <div className="ap-field"><label className="ap-field-label">Tour operator</label><input className="od-edit-input" value={t.tourOperatorName ?? ''} onChange={e => updateEditTraveler(i, 'tourOperatorName', e.target.value)} /></div>
                        <div className="ap-field"><label className="ap-field-label">Tour operator address</label><input className="od-edit-input" value={t.tourOperatorAddress ?? ''} onChange={e => updateEditTraveler(i, 'tourOperatorAddress', e.target.value)} /></div>
                      </>}
                      <div className="ap-field"><label className="ap-field-label">Exit airport</label><input className="od-edit-input" value={t.exitPort ?? ''} onChange={e => updateEditTraveler(i, 'exitPort', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Visited India before</label>
                        <select className="od-edit-input" value={t.visitedIndiaBefore ?? ''} onChange={e => updateEditTraveler(i, 'visitedIndiaBefore', e.target.value)}>
                          <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                        </select></div>
                      <div className="ap-field"><label className="ap-field-label">Visa refused before</label>
                        <select className="od-edit-input" value={t.visaRefusedBefore ?? ''} onChange={e => updateEditTraveler(i, 'visaRefusedBefore', e.target.value)}>
                          <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                        </select></div>
                    </div>
                  </div>

                  {/* References */}
                  <div className="ts-card ts-card-reference">
                    <div className="ts-card-header"><span className="ts-card-icon"><Contact size={14} strokeWidth={2} /></span><span>References</span></div>
                    <div className="ts-edit-fields">
                      <div style={{fontSize:'0.78rem', fontWeight:600, color:'var(--slate)', textTransform:'uppercase', marginTop:'0.25rem'}}>India</div>
                      <div className="ap-field"><label className="ap-field-label">Reference name</label><input className="od-edit-input" value={t.refNameIndia ?? ''} onChange={e => updateEditTraveler(i, 'refNameIndia', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Address</label><input className="od-edit-input" value={t.refAddressIndia ?? ''} onChange={e => updateEditTraveler(i, 'refAddressIndia', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">State</label><input className="od-edit-input" value={t.refStateIndia ?? ''} onChange={e => updateEditTraveler(i, 'refStateIndia', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">District</label><input className="od-edit-input" value={t.refDistrictIndia ?? ''} onChange={e => updateEditTraveler(i, 'refDistrictIndia', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Phone</label><input className="od-edit-input" value={t.refPhoneIndia ?? ''} onChange={e => updateEditTraveler(i, 'refPhoneIndia', e.target.value)} /></div>

                      <div style={{fontSize:'0.78rem', fontWeight:600, color:'var(--slate)', textTransform:'uppercase', marginTop:'0.75rem'}}>Home Country</div>
                      <div className="ap-field"><label className="ap-field-label">Reference name</label><input className="od-edit-input" value={t.refNameHome ?? ''} onChange={e => updateEditTraveler(i, 'refNameHome', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Address</label><input className="od-edit-input" value={t.refAddressHome ?? ''} onChange={e => updateEditTraveler(i, 'refAddressHome', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">State</label><input className="od-edit-input" value={t.refStateHome ?? ''} onChange={e => updateEditTraveler(i, 'refStateHome', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">District</label><input className="od-edit-input" value={t.refDistrictHome ?? ''} onChange={e => updateEditTraveler(i, 'refDistrictHome', e.target.value)} /></div>
                      <div className="ap-field"><label className="ap-field-label">Phone</label><input className="od-edit-input" value={t.refPhoneHome ?? ''} onChange={e => updateEditTraveler(i, 'refPhoneHome', e.target.value)} /></div>
                    </div>
                  </div>

                  {/* Security */}
                  <div className="ts-card ts-card-security">
                    <div className="ts-card-header"><span className="ts-card-icon"><Shield size={14} strokeWidth={2} /></span><span>Security</span></div>
                    <div className="ts-edit-fields">
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
                  </div>

                  {/* Admin-defined custom sections (editable) — built-ins are handled via hardcoded cards */}
                  {customAppSchema.sections
                    .filter(sec => !sec.builtIn && !sec.hidden && sec.fields.length > 0)
                    .map(sec => {
                      const vals = ((t as any).custom || {}) as Record<string, any>;
                      const setCustomField = (fKey: string, v: any) => {
                        const next = { ...vals, [fKey]: v };
                        updateEditTraveler(i, 'custom' as any, next);
                      };
                      const visibleFields = sec.fields.filter(f => !f.hidden);
                      if (visibleFields.length === 0) return null;
                      return (
                        <div key={sec.key} className="ts-card">
                          <div className="ts-card-header">
                            <span className="ts-card-icon"><SectionIcon icon={sec.icon} emoji={sec.emoji} size={14} strokeWidth={2} /></span>
                            <span>{sec.title}</span>
                          </div>
                          {visibleFields.map(f => (
                          <div key={f.key} className="ap-field">
                            <label className="ap-field-label">{f.label}{f.required ? <span style={{ color: '#dc2626' }}> *</span> : null}</label>
                            {f.type === 'textarea' ? (
                              <textarea className="od-edit-input" rows={3} value={vals[f.key] ?? ''} onChange={e => setCustomField(f.key, e.target.value)} placeholder={f.placeholder} />
                            ) : f.type === 'select' ? (
                              <select className="od-edit-input" value={vals[f.key] ?? ''} onChange={e => setCustomField(f.key, e.target.value)}>
                                <option value="">—</option>
                                {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : f.type === 'radio' ? (
                              <select className="od-edit-input" value={vals[f.key] ?? ''} onChange={e => setCustomField(f.key, e.target.value)}>
                                <option value="">—</option>
                                {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : f.type === 'checkbox' ? (
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input type="checkbox" checked={!!vals[f.key]} onChange={e => setCustomField(f.key, e.target.checked)} />
                                <span style={{ fontSize: '0.85rem' }}>{vals[f.key] ? 'Yes' : 'No'}</span>
                              </label>
                            ) : (
                              <input
                                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
                                className="od-edit-input"
                                value={vals[f.key] ?? ''}
                                onChange={e => setCustomField(f.key, e.target.value)}
                                placeholder={f.placeholder}
                              />
                            )}
                            {f.helpText && <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.25rem' }}>{f.helpText}</p>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
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

      {/* Bot Run History — always visible at the bottom of the order detail.
          Shows per-field audit trail for every bot run, including expandable
          option dumps when a select fails to find its target. */}
      <div style={{ marginTop: '1.5rem' }}>
        <BotRunPanel orderId={order.id} />
      </div>
    </div>
    </div>

    {/* Refund Modal */}
    {showRefundModal && order && (
      <div className="od-refund-overlay" onClick={() => setShowRefundModal(false)}>
        <div className="od-refund-modal" onClick={e => e.stopPropagation()}>
          <h2 className="od-refund-modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <Undo2 size={18} strokeWidth={2.25} />
            <span>Process Refund</span>
          </h2>
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

// ── Format an admin-defined custom field value for read-view display ──
function formatAdminCustomValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ') || '—';
  return String(v);
}

// ── Bot Run History ──────────────────────────────────────────────────────
//
// Lists every time the Playwright bot ran against this order, plus a
// per-field audit trail (which selector fired, what value was used, whether
// it was admin override vs default, whether the action succeeded).

interface BotRunSummary {
  id: string;
  orderId: string;
  country: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  errorMsg: string | null;
  entryCount: number;
  counts: { ok: number; failed: number; manual: number; skipped: number; admin: number };
}

interface BotRunEntryRow {
  id: string;
  stepKey: string;
  fieldKey: string;
  label: string;
  action: string;
  source: string;
  value: string | null;
  success: boolean;
  errorMsg: string | null;
  selector: string | null;
  createdAt: string;
}

function BotRunPanel({ orderId }: { orderId: string }) {
  const [runs, setRuns] = useState<BotRunSummary[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [entriesByRun, setEntriesByRun] = useState<Record<string, BotRunEntryRow[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/bot-runs?orderId=${encodeURIComponent(orderId)}&limit=10`);
        if (res.ok) {
          const d = await res.json();
          setRuns(d.runs || []);
        }
      } catch {}
      setLoading(false);
    })();
  }, [orderId]);

  const loadEntries = async (runId: string) => {
    if (entriesByRun[runId]) return;
    try {
      const res = await fetch(`/api/bot-runs/${runId}`);
      if (res.ok) {
        const d = await res.json();
        setEntriesByRun(prev => ({ ...prev, [runId]: d.entries || [] }));
      }
    } catch {}
  };

  const toggleExpand = async (runId: string) => {
    if (expanded === runId) { setExpanded(null); return; }
    setExpanded(runId);
    await loadEntries(runId);
  };

  const statusChip = (status: string) => {
    const map: Record<string, { bg: string; fg: string; label: string }> = {
      running:   { bg: '#dbeafe', fg: '#1e40af', label: 'RUNNING' },
      completed: { bg: '#d1fae5', fg: '#065f46', label: 'COMPLETED' },
      failed:    { bg: '#fee2e2', fg: '#991b1b', label: 'FAILED' },
      cancelled: { bg: '#f3f4f6', fg: '#6b7280', label: 'CANCELLED' },
    };
    const c = map[status] || map.cancelled;
    return (
      <span style={{ background: c.bg, color: c.fg, padding: '0.1rem 0.45rem', borderRadius: '0.25rem', fontWeight: 700, fontSize: '0.68rem' }}>
        {c.label}
      </span>
    );
  };

  const fmtTime = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const fmtDuration = (startedAt: string, finishedAt: string | null) => {
    if (!finishedAt) return 'running…';
    const diff = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    if (diff < 60_000) return `${Math.round(diff / 1000)}s`;
    return `${Math.round(diff / 60_000)}m ${Math.round((diff % 60_000) / 1000)}s`;
  };

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.4rem', padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <Bot size={16} strokeWidth={2} />
            <span>Bot Run History</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>Per-field audit trail for every bot run against this order.</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.88rem' }}>Loading runs…</div>
      ) : !runs || runs.length === 0 ? (
        <div style={{ padding: '1.25rem', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', border: '1px dashed #e5e7eb', borderRadius: '0.4rem', fontSize: '0.88rem' }}>
          No bot runs yet for this order. Run <code>npx tsx scripts/process-visa.ts {runs ? runs[0]?.orderId ?? '…' : '…'}</code> or use the Process Application button.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {runs.map(r => {
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.35rem', overflow: 'hidden' }}>
                <button
                  onClick={() => toggleExpand(r.id)}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.6rem 0.85rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {statusChip(r.status)}
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{fmtTime(r.startedAt)}</span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>· {fmtDuration(r.startedAt, r.finishedAt)} · {r.entryCount} fields</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem' }}>
                    {r.counts.ok > 0 && <span style={{ background: '#d1fae5', color: '#065f46', padding: '0.05rem 0.4rem', borderRadius: '0.2rem', fontWeight: 600 }}>{r.counts.ok} ok</span>}
                    {r.counts.admin > 0 && <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.05rem 0.4rem', borderRadius: '0.2rem', fontWeight: 600 }}>{r.counts.admin} admin</span>}
                    {r.counts.manual > 0 && <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.05rem 0.4rem', borderRadius: '0.2rem', fontWeight: 600 }}>{r.counts.manual} manual</span>}
                    {r.counts.skipped > 0 && <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '0.05rem 0.4rem', borderRadius: '0.2rem', fontWeight: 600 }}>{r.counts.skipped} skip</span>}
                    {r.counts.failed > 0 && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '0.05rem 0.4rem', borderRadius: '0.2rem', fontWeight: 700 }}>{r.counts.failed} failed</span>}
                    <span style={{ color: '#9ca3af', marginLeft: '0.2rem' }}>{isOpen ? '▾' : '▸'}</span>
                  </div>
                </button>
                {isOpen && (
                  <BotRunEntriesTable runId={r.id} entries={entriesByRun[r.id]} errorMsg={r.errorMsg} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Parse a bot_run_entry's value field as a select-failure dump.
 * Returns the option list when the entry was a failed select with the
 * `{tried, options}` payload our bot writes; otherwise null.
 */
function parseSelectDump(value: string | null): { tried: string; options: Array<{ value: string; text: string }> } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.tried === 'string' && Array.isArray(parsed.options)) {
      return parsed;
    }
  } catch {}
  return null;
}

function BotRunEntriesTable({ runId, entries, errorMsg }: { runId: string; entries: BotRunEntryRow[] | undefined; errorMsg: string | null }) {
  // Track which row's option dump is expanded.
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  if (!entries) {
    return <div style={{ padding: '0.75rem 0.85rem', color: '#9ca3af', fontSize: '0.82rem' }}>Loading entries…</div>;
  }
  if (entries.length === 0) {
    return <div style={{ padding: '0.75rem 0.85rem', color: '#9ca3af', fontSize: '0.82rem' }}>No entries logged for run <code>{runId}</code>.</div>;
  }
  // Group by step
  const byStep: Record<string, BotRunEntryRow[]> = {};
  for (const e of entries) (byStep[e.stepKey] = byStep[e.stepKey] || []).push(e);

  return (
    <div style={{ borderTop: '1px solid #e5e7eb', background: 'white', fontSize: '0.82rem' }}>
      {errorMsg && (
        <div style={{ padding: '0.6rem 0.85rem', background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem', borderBottom: '1px solid #fecaca' }}>
          <strong>Failure:</strong> {errorMsg}
        </div>
      )}
      {Object.entries(byStep).map(([stepKey, rows]) => (
        <div key={stepKey} style={{ borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ background: '#f9fafb', padding: '0.35rem 0.85rem', fontWeight: 700, color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {stepKey} · {rows.length} field{rows.length === 1 ? '' : 's'}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'white', borderBottom: '1px solid #f3f4f6' }}>
                <th style={{ textAlign: 'left', padding: '0.35rem 0.85rem', fontWeight: 600, color: '#9ca3af' }}>Field</th>
                <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', fontWeight: 600, color: '#9ca3af' }}>Action</th>
                <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', fontWeight: 600, color: '#9ca3af' }}>Source</th>
                <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', fontWeight: 600, color: '#9ca3af' }}>Value</th>
                <th style={{ textAlign: 'left', padding: '0.35rem 0.85rem', fontWeight: 600, color: '#9ca3af' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap(e => {
                const dump = !e.success ? parseSelectDump(e.value) : null;
                const isExpanded = expandedRowId === e.id;
                const main = (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '0.35rem 0.85rem' }}>
                      <div style={{ fontWeight: 500 }}>{e.label}</div>
                      {e.selector && <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontFamily: 'ui-monospace, Menlo, monospace' }}>{e.selector}</div>}
                    </td>
                    <td style={{ padding: '0.35rem 0.5rem', color: '#6b7280', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 600 }}>{e.action}</td>
                    <td style={{ padding: '0.35rem 0.5rem' }}>
                      <span style={sourceStyle(e.source)}>{e.source}</span>
                    </td>
                    <td style={{ padding: '0.35rem 0.5rem', color: '#374151', fontFamily: e.value ? 'ui-monospace, Menlo, monospace' : 'inherit', fontSize: '0.76rem', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.value || ''}>
                      {dump
                        ? <em style={{ color: '#9ca3af' }}>tried "{dump.tried}" — {dump.options.length} option{dump.options.length === 1 ? '' : 's'} on page</em>
                        : (e.value ?? <span style={{ color: '#d1d5db' }}>—</span>)
                      }
                    </td>
                    <td style={{ padding: '0.35rem 0.85rem' }}>
                      {e.success ? (
                        <span style={{ color: '#059669', fontSize: '0.72rem', fontWeight: 600 }}>OK</span>
                      ) : dump ? (
                        <button
                          type="button"
                          onClick={() => setExpandedRowId(isExpanded ? null : e.id)}
                          style={{ background: 'transparent', border: 'none', color: '#dc2626', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                          title={e.errorMsg || ''}
                        >
                          FAIL {isExpanded ? '▾' : '▸'}
                        </button>
                      ) : (
                        <span title={e.errorMsg || ''} style={{ color: '#dc2626', fontSize: '0.72rem', fontWeight: 600 }}>
                          FAIL {e.errorMsg ? `· ${e.errorMsg.slice(0, 40)}${e.errorMsg.length > 40 ? '…' : ''}` : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                );
                if (!isExpanded || !dump) return [main];
                // Expanded row — render the full option list inline so we can
                // see exactly what the gov site offered for this field.
                const detail = (
                  <tr key={`${e.id}-detail`} style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                    <td colSpan={5} style={{ padding: '0.6rem 0.85rem' }}>
                      <div style={{ fontSize: '0.78rem', color: '#991b1b', marginBottom: '0.4rem' }}>
                        Bot tried <code style={{ background: 'white', padding: '0.05rem 0.3rem', borderRadius: '0.2rem' }}>{dump.tried}</code> but <strong>{e.selector}</strong> only had these options:
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', background: 'white', border: '1px solid #fecaca' }}>
                        <thead>
                          <tr style={{ background: '#fafafa' }}>
                            <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Option text</th>
                            <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dump.options.map((o, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                              <td style={{ padding: '0.25rem 0.5rem', fontFamily: 'ui-monospace, Menlo, monospace' }}>{o.text || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                              <td style={{ padding: '0.25rem 0.5rem', fontFamily: 'ui-monospace, Menlo, monospace', color: '#6b7280' }}>{o.value || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                );
                return [main, detail];
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function sourceStyle(source: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    admin:   { bg: '#dbeafe', fg: '#1e40af' },
    default: { bg: '#f3f4f6', fg: '#6b7280' },
    manual:  { bg: '#fef3c7', fg: '#92400e' },
    skip:    { bg: '#f3f4f6', fg: '#9ca3af' },
  };
  const c = map[source] || map.default;
  return {
    background: c.bg, color: c.fg,
    padding: '0.05rem 0.4rem', borderRadius: '0.2rem',
    fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.02em',
  };
}
