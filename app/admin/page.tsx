'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface Traveler { firstName: string; lastName: string; email: string; dob?: string; passportCountry?: string; passportNumber?: string; passportExpiry?: string; }

interface Order {
  id:           string;
  orderNumber:  number;
  createdAt:    string;
  destination:  string;
  visaType:     string;
  totalUSD:     number;
  status:       string;
  billingEmail: string;
  travelers:    Traveler[];
  notes:        string | null;
  refundAmount: number | null;
  refundReason: string | null;
  refundedAt:   string | null;
  /** Admin approval timestamps — null = needs admin review.
   *  Auto-cleared on document re-upload. */
  photoApprovedAt: string | null;
  passportApprovedAt: string | null;
  /** Processing speed — 'standard' | 'rush' | 'super'. */
  processingSpeed: string;
  /** JSON array of OrderTag.id values — admin-applied tags. */
  tags: string | null;
  /** Non-null = order has been moved to the Archive tab (30 days after completedAt). */
  archivedAt:   string | null;
}

import { formatOrderNum, VISA_LABELS, STATUS_COLORS, STATUS_LABELS, VISA_COLORS, COUNTRY_FLAGS } from '@/lib/constants';
import { CustomStatusesProvider, useCustomStatuses, StatusBadge } from '@/lib/customStatuses';
import { AdminSidebar } from '@/components/AdminSidebar';
import { TagChip, useOrderTagCatalog, type OrderTag as OrderTagDef } from '@/components/OrderTags';
import { useFeatureFlag } from '@/lib/useFeatureFlag';
import { Zap, X as XIcon, Mail as MailIcon, StickyNote, Palette, AlertTriangle, RefreshCw, CheckCircle, XCircle, Undo2, Trash2, Camera, FileText, Rocket, type LucideIcon } from 'lucide-react';

/* ── Login Screen ──────────────────────────────────────────────────────────── */

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) { onLogin(); }
      else { setError('Invalid email or password.'); }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-bg">
      <div className="admin-login-card">
        <div className="admin-login-logo">
          <Link href="/" className="logo" style={{ fontSize: '1.3rem' }}>VisaTrips<sup style={{ color: 'var(--blue)', fontSize: '0.5rem' }}>®</sup></Link>
          <span className="admin-login-badge">Admin</span>
        </div>
        <h1 className="admin-login-title">Sign in to Admin Panel</h1>
        <p className="admin-login-sub">Manage incoming visa applications</p>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="ap-field">
            <label className="ap-field-label">Email</label>
            <input className="ap-input" type="email" placeholder="admin@visatrips.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="ap-field">
            <label className="ap-field-label">Password</label>
            <input className="ap-input" type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <p className="admin-login-error">{error}</p>}
          <button type="submit" className={`apply-submit${email && password ? ' active' : ''}`} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>
      </div>
    </div>
  );
}


/* ── Quick Edit Modal ──────────────────────────────────────────────────────
 * Lightweight popup on the orders list that lets admins send an email +
 * save an internal note without navigating into the full order detail page.
 * Reuses POST /api/orders/notify + PATCH /api/orders/:id.
 */

interface CustomEmailLite { id: string; label: string; description: string | null; trigger: string; enabled: boolean; }

function QuickEditModal({ order, onClose, onSaved }: {
  order: Order;
  onClose: () => void;
  onSaved: (patch: Partial<Order>) => void;
}) {
  const [noteText, setNoteText] = useState(order.notes || '');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [customEmails, setCustomEmails] = useState<CustomEmailLite[]>([]);
  const [working, setWorking] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Track which built-in templates already have a send timestamp so we can show it.
  // The Order on the admin list doesn't include emailHistory so we'll fetch it lazily.
  const [history, setHistory] = useState<Record<string, string>>({});

  useEffect(() => {
    // Pull the full order to get emailHistory + applicationId + evisaUrl for enable/disable logic.
    (async () => {
      try {
        const res = await fetch(`/api/orders/${order.id}`);
        if (res.ok) {
          const full = await res.json();
          if (full.emailHistory) { try { setHistory(JSON.parse(full.emailHistory)); } catch {} }
          // Stash these on the order object reference so the gate logic below sees them.
          (order as any).applicationId = full.applicationId;
          (order as any).evisaUrl = full.evisaUrl;
        }
      } catch {}
      // Load any enabled, manual-trigger custom templates.
      try {
        const cRes = await fetch('/api/settings/custom-emails?country=INDIA');
        if (cRes.ok) {
          const cData = await cRes.json();
          setCustomEmails((cData.templates || []).filter((t: any) => t.enabled && t.trigger === 'manual'));
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const fmtDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const BUILT_IN_EMAILS: Array<{ type: string; label: string; description: string; disabled?: boolean; disabledReason?: string }> = [
    { type: 'confirmation', label: 'Order Confirmation',   description: 'Thank-you with order summary.' },
    { type: 'reminder',     label: 'Finish Reminder',      description: 'Nudge to complete the application.' },
    { type: 'submitted',    label: 'Application Submitted', description: 'Confirms submission (needs Application ID).', disabled: !(order as any).applicationId, disabledReason: 'No Application ID yet.' },
    { type: 'status',       label: 'Status Update',        description: `Current: ${order.status.replace('_',' ')}.` },
    { type: 'evisa',        label: 'eVisa Ready',          description: 'Notifies that the visa is ready.', disabled: !(order as any).evisaUrl, disabledReason: 'No eVisa uploaded yet.' },
    { type: 'autoClosed',   label: 'Order Auto-Closed',    description: 'Closes the order after no response.' },
  ];

  const noteChanged = noteText !== (order.notes || '');
  const selectedTypes = Object.keys(selected).filter(k => selected[k]);
  const canAct = noteChanged || selectedTypes.length > 0;

  const handleSave = async () => {
    if (!canAct) return;
    setWorking(true);
    setFlash(null);
    try {
      const results: string[] = [];

      if (noteChanged) {
        const res = await fetch(`/api/orders/${order.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: noteText }),
        });
        if (res.ok) {
          onSaved({ notes: noteText });
          results.push('note saved');
        } else {
          throw new Error('Failed to save note');
        }
      }

      if (selectedTypes.length > 0) {
        const res = await fetch('/api/orders/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id, types: selectedTypes }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const sent = (data.results || []).filter((r: any) => r.sent).length;
        const failed = (data.results || []).filter((r: any) => !r.sent);
        if (data.history) setHistory(data.history);
        results.push(`${sent} email${sent === 1 ? '' : 's'} sent`);
        if (failed.length > 0) results.push(`${failed.length} failed`);
        setSelected({});
      }

      setFlash({ kind: 'ok', msg: results.join(' · ') });
      setTimeout(() => setFlash(null), 2500);
    } catch (err: any) {
      setFlash({ kind: 'err', msg: err?.message || 'Failed' });
    } finally {
      setWorking(false);
    }
  };

  const travelers: Traveler[] = Array.isArray(order.travelers) ? order.travelers : [];
  const traveler0 = travelers[0];
  const customerName = traveler0 ? `${traveler0.firstName} ${traveler0.lastName}`.trim() : order.billingEmail;
  const customerEmail = traveler0?.email || order.billingEmail;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '0.85rem', padding: '1.25rem 1.5rem',
          maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Zap size={12} strokeWidth={2.5} />
              <span>Quick Edit · {formatOrderNum(order.orderNumber)}</span>
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0.15rem 0 0' }}>
              {customerName}
            </h2>
            <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>
              {COUNTRY_FLAGS[order.destination] ?? ''} {order.destination} · {VISA_LABELS[order.visaType] ?? order.visaType}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '0.2rem 0.4rem', display: 'inline-flex', alignItems: 'center' }}
            title="Close"
          ><XIcon size={20} strokeWidth={2} /></button>
        </div>

        {/* Email section */}
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: '0.4rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <MailIcon size={14} strokeWidth={2.25} />
            <span>Send email to <span style={{ color: '#6b7280', fontWeight: 500 }}>{customerEmail}</span></span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {BUILT_IN_EMAILS.map(e => {
              const sentAt = history[e.type];
              return (
                <label key={e.type} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.55rem',
                  padding: '0.5rem 0.7rem', borderRadius: '0.45rem',
                  background: selected[e.type] ? '#eff6ff' : '#f9fafb',
                  border: '1px solid ' + (selected[e.type] ? '#bfdbfe' : '#e5e7eb'),
                  cursor: e.disabled ? 'not-allowed' : 'pointer',
                  opacity: e.disabled ? 0.55 : 1,
                }}>
                  <input
                    type="checkbox"
                    checked={!!selected[e.type]}
                    disabled={e.disabled || working}
                    onChange={ev => setSelected(s => ({ ...s, [e.type]: ev.target.checked }))}
                    style={{ marginTop: '0.15rem' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{e.label}</span>
                      {sentAt && (
                        <span style={{ fontSize: '0.7rem', color: '#059669', background: '#d1fae5', padding: '0.1rem 0.45rem', borderRadius: '0.3rem', whiteSpace: 'nowrap' }}>
                          Last sent: {fmtDate(sentAt)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#6b7280' }}>
                      {e.disabled ? (
                        <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <AlertTriangle size={12} strokeWidth={2.25} />
                          <span>{e.disabledReason}</span>
                        </span>
                      ) : e.description}
                    </div>
                  </div>
                </label>
              );
            })}

            {customEmails.length > 0 && (
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', marginTop: '0.3rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <Palette size={11} strokeWidth={2.5} />
                <span>Custom</span>
              </div>
            )}
            {customEmails.map(ct => {
              const key = `custom:${ct.id}`;
              const sentAt = history[key];
              return (
                <label key={ct.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.55rem',
                  padding: '0.5rem 0.7rem', borderRadius: '0.45rem',
                  background: selected[key] ? '#eff6ff' : '#f9fafb',
                  border: '1px solid ' + (selected[key] ? '#bfdbfe' : '#e5e7eb'),
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={!!selected[key]}
                    disabled={working}
                    onChange={ev => setSelected(s => ({ ...s, [key]: ev.target.checked }))}
                    style={{ marginTop: '0.15rem' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                        {ct.label}
                        <span style={{ marginLeft: '0.35rem', fontSize: '0.62rem', fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '0.05rem 0.35rem', borderRadius: '0.25rem', verticalAlign: 'middle' }}>CUSTOM</span>
                      </span>
                      {sentAt && (
                        <span style={{ fontSize: '0.7rem', color: '#059669', background: '#d1fae5', padding: '0.1rem 0.45rem', borderRadius: '0.3rem', whiteSpace: 'nowrap' }}>
                          Last sent: {fmtDate(sentAt)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#6b7280' }}>
                      {ct.description || <em style={{ color: '#9ca3af' }}>No description</em>}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Internal note */}
        <div style={{ marginTop: '0.9rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: '0.3rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <StickyNote size={14} strokeWidth={2.25} />
            <span>Internal note <span style={{ color: '#9ca3af', fontWeight: 500, fontSize: '0.78rem' }}>(not shown to customer)</span></span>
          </div>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={3}
            placeholder="Add a note about this order..."
            style={{
              width: '100%', padding: '0.55rem 0.7rem', borderRadius: '0.45rem',
              border: '1px solid #e5e7eb', fontSize: '0.88rem',
              resize: 'vertical', fontFamily: 'inherit',
            }}
          />
          {noteChanged && (
            <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '0.2rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <Zap size={11} strokeWidth={2.25} />
              <span>Will overwrite the current note when you save.</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
          {flash ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, color: flash.kind === 'ok' ? '#059669' : '#dc2626' }}>
              {flash.kind === 'ok' ? <CheckCircle size={15} strokeWidth={2.25} /> : <XCircle size={15} strokeWidth={2.25} />}
              <span>{flash.msg}</span>
            </span>
          ) : <span />}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={onClose}
              disabled={working}
              style={{
                background: 'white', color: '#374151', border: '1px solid #e5e7eb',
                padding: '0.5rem 1rem', borderRadius: '0.45rem',
                fontSize: '0.85rem', fontWeight: 600, cursor: working ? 'not-allowed' : 'pointer',
              }}
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={!canAct || working}
              style={{
                background: canAct ? 'var(--blue)' : '#e5e7eb',
                color: canAct ? 'white' : '#9ca3af',
                border: 'none', padding: '0.55rem 1.1rem', borderRadius: '0.45rem',
                fontSize: '0.88rem', fontWeight: 700,
                cursor: canAct && !working ? 'pointer' : 'not-allowed',
              }}
            >
              {working ? 'Working…' : (selectedTypes.length > 0 && noteChanged ? 'Save note & Send' : selectedTypes.length > 0 ? `Send ${selectedTypes.length}` : 'Save note')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Status Select — built-in options + any admin-defined custom statuses ── */

function StatusSelect({ value, onChange, className }: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { statuses: custom, getLabel, isDeletedBuiltIn } = useCustomStatuses();
  // Built-ins admin hasn't deleted, in display order. Always include the
  // CURRENT value even if it's tombstoned — otherwise the select would
  // silently change the order's status when re-rendered.
  const builtInOptions = ['UNFINISHED','PROCESSING','NEEDS_CORRECTION','SUBMITTED','COMPLETED','ON_HOLD','REJECTED','REFUNDED']
    .filter(c => !isDeletedBuiltIn(c) || c === value);
  return (
    <select
      className={className}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {builtInOptions.map(c => (
        <option key={c} value={c}>{getLabel(c)}</option>
      ))}
      {custom.length > 0 && (
        <optgroup label="Custom">
          {custom.map(s => (
            <option key={s.code} value={s.code}>{s.label}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/* ── Archive Recover Modal ────────────────────────────────────────────────────
 * Lightweight modal that mirrors the redacted detail card on the standalone
 * archived-order page. Lets admins recover from the Archive list without
 * navigating away. The detail page still works for direct URL access.
 */
function ArchiveRecoverModal({ order, onClose, onRecovered }: {
  order: Order;
  onClose: () => void;
  onRecovered: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const archivedDate = order.archivedAt
    ? new Date(order.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  const handleRecover = async () => {
    setWorking(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivedAt: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      onRecovered();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to recover');
      setWorking(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '0.85rem',
          padding: '2rem 1.75rem 1.5rem', maxWidth: 460, width: '100%',
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
          textAlign: 'center', position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '0.6rem', right: '0.7rem', background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '0.2rem 0.4rem', display: 'inline-flex', alignItems: 'center' }}
          title="Close"
        ><XIcon size={20} strokeWidth={2} /></button>

        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📦</div>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
          Order {formatOrderNum(order.orderNumber)}
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.88rem', marginTop: '0.4rem' }}>
          Archived on {archivedDate} &middot; ${order.totalUSD.toFixed(2)}
        </p>
        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '1.25rem', maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
          Customer details are hidden. Recover this order to view the full information.
        </p>

        {errorMsg && (
          <p style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: '0.75rem', fontWeight: 600 }}>
            {errorMsg}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.6rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            style={{
              background: 'white', color: '#374151',
              border: '1px solid #e5e7eb',
              padding: '0.6rem 1.1rem', borderRadius: '0.5rem',
              fontSize: '0.88rem', fontWeight: 600,
              cursor: working ? 'not-allowed' : 'pointer',
            }}
          >Close</button>
          <button
            type="button"
            onClick={handleRecover}
            disabled={working}
            style={{
              background: 'var(--blue)', color: 'white',
              border: 'none', padding: '0.6rem 1.25rem', borderRadius: '0.5rem',
              fontSize: '0.88rem', fontWeight: 600,
              cursor: working ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            }}
          >
            <Undo2 size={14} strokeWidth={2.25} />
            {working ? 'Recovering…' : 'Recover Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Pagination ────────────────────────────────────────────────────────────── */

const PAGE_SIZE = 30;

/**
 * Tiny shared pager. Always renders the "Showing 1–30 of N" count copy
 * when there's at least one row, so admins always know how many results
 * matched their filter. The Prev/Next/numbered buttons only appear when
 * there's more than one page (no point clicking around when everything
 * fits on the current page). Caller is responsible for slicing its own
 * data; we only emit the controls.
 */
function Pagination({ total, page, onPageChange, label = 'rows' }: {
  total: number;
  page: number;
  onPageChange: (p: number) => void;
  /** Plural noun used in the count copy ("orders", "customers", …). */
  label?: string;
}) {
  if (total <= 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  const showButtons = pageCount > 1;
  const btn = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--blue)' : 'white',
    color: active ? 'white' : '#374151',
    border: '1px solid ' + (active ? 'var(--blue)' : '#e5e7eb'),
    padding: '0.35rem 0.7rem', borderRadius: '0.4rem',
    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
    minWidth: '2rem',
  });
  // Show first, last, current, current±1; collapse the rest with ellipsis.
  const pages: Array<number | 'ellipsis'> = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== 'ellipsis') pages.push('ellipsis');
  }
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      gap: '1rem', padding: '0.75rem 0.25rem', flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>
        Showing <strong>{start}–{end}</strong> of <strong>{total}</strong> {label}
      </span>
      {showButtons && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <button type="button" style={btn(false)} disabled={page === 1}
            onClick={() => onPageChange(page - 1)}>← Prev</button>
          {pages.map((p, i) =>
            p === 'ellipsis'
              ? <span key={`e${i}`} style={{ padding: '0 0.3rem', color: '#9ca3af' }}>…</span>
              : <button key={p} type="button" style={btn(p === page)}
                  onClick={() => onPageChange(p)}>{p}</button>
          )}
          <button type="button" style={btn(false)} disabled={page === pageCount}
            onClick={() => onPageChange(page + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

/* ── Order Row ─────────────────────────────────────────────────────────────── */

/** Tiny pill chip showing the order's processing speed. Three colors so admins
 *  can spot rushed orders at a glance: slate (standard), amber (rush), red (super). */
function SpeedChip({ speed }: { speed: string }) {
  const config: Record<string, { label: string; bg: string; fg: string; border: string; Icon: LucideIcon | null }> = {
    standard: { label: 'Standard',   bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1', Icon: null },
    rush:     { label: 'Rush',       bg: '#fef3c7', fg: '#92400e', border: '#fde68a', Icon: Zap },
    super:    { label: 'Super Rush', bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5', Icon: Rocket },
  };
  const c = config[speed] ?? config.standard;
  return (
    <span
      title={`Processing speed: ${c.label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.02em',
        padding: '0.12rem 0.45rem', borderRadius: '999px',
        background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
        textTransform: 'uppercase', whiteSpace: 'nowrap', lineHeight: 1.4,
      }}
    >
      {c.Icon && <c.Icon size={11} strokeWidth={2.5} aria-hidden />}
      <span>{c.label}</span>
    </span>
  );
}

function OrderRow({ order, onStatusChange, onNotesChange, onQuickEdit, tagCatalog }: {
  order: Order;
  onStatusChange: (id: string, status: string) => void;
  onNotesChange: (id: string, notes: string) => void;
  onQuickEdit: (order: Order) => void;
  tagCatalog: OrderTagDef[];
}) {
  const travelers = (() => {
    try {
      const t = order.travelers;
      if (Array.isArray(t)) return t;
      if (typeof t === 'string') return JSON.parse(t);
      return [];
    } catch { return []; }
  })();
  const orderTagIds: string[] = (() => {
    if (!order.tags) return [];
    try { const a = JSON.parse(order.tags); return Array.isArray(a) ? a : []; } catch { return []; }
  })();
  const orderTags = orderTagIds
    .map(id => tagCatalog.find(t => t.id === id))
    .filter((t): t is OrderTagDef => !!t);
  const date = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const router = useRouter();

  return (
    <tr className="admin-row" onClick={() => router.push(`/admin/orders/${formatOrderNum(order.orderNumber)}`)}>
      <td className="admin-td admin-td-id">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
          <span className="admin-order-id">{formatOrderNum(order.orderNumber)}</span>
          <span className={`admin-visa-chip ${VISA_COLORS[order.visaType] ?? 'visa-other'}`}>{VISA_LABELS[order.visaType] ?? order.visaType}</span>
          <SpeedChip speed={order.processingSpeed} />
          {(!order.photoApprovedAt || !order.passportApprovedAt) && (() => {
            // Single combined "needs review" chip — icons indicate which doc(s) are pending.
            const tip = [
              !order.photoApprovedAt    && 'Photo needs approval',
              !order.passportApprovedAt && 'Passport bio needs approval',
            ].filter(Boolean).join(' · ');
            return (
              <span
                title={tip}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.01em',
                  padding: '0.12rem 0.45rem', borderRadius: '999px',
                  background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a',
                  whiteSpace: 'nowrap', lineHeight: 1.4,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                  {!order.photoApprovedAt    && <Camera   size={11} strokeWidth={2.5} aria-hidden />}
                  {!order.passportApprovedAt && <FileText size={11} strokeWidth={2.5} aria-hidden />}
                </span>
                <span style={{ textTransform: 'uppercase' }}>Awaiting review</span>
              </span>
            );
          })()}
        </div>
        {orderTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.35rem' }} onClick={e => e.stopPropagation()}>
            {orderTags.map(tag => <TagChip key={tag.id} tag={tag} size="sm" />)}
          </div>
        )}
      </td>
      <td className="admin-td">
        <div className="admin-td-main">{date}</div>
        <div className="admin-td-sub">{time}</div>
      </td>
      <td className="admin-td">
        <div className="admin-td-main">{travelers.map((t: Traveler) => `${t.firstName} ${t.lastName}`).join(', ') || '—'}</div>
        <div className="admin-td-sub">{order.billingEmail}</div>
      </td>
      <td className="admin-td">
        <div className="admin-td-main">{COUNTRY_FLAGS[order.destination] ?? ''} {order.destination}</div>
      </td>
      <td className="admin-td">
        <StatusBadge code={order.status} />
      </td>
      <td className="admin-td admin-td-notes">
        <div className="admin-notes-text">{order.notes || <span className="admin-notes-empty">—</span>}</div>
      </td>
      <td className="admin-td admin-td-price">${order.totalUSD}</td>
      <td className="admin-td" onClick={e => e.stopPropagation()}>
        <StatusSelect
          className="admin-status-select"
          value={order.status}
          onChange={v => onStatusChange(order.id, v)}
        />
      </td>
      <td className="admin-td" onClick={e => e.stopPropagation()}>
        <button
          className="admin-quick-edit-btn"
          onClick={() => onQuickEdit(order)}
          title="Quick edit: send email or add note without opening the full order"
        >
          <Zap size={13} strokeWidth={2.25} />
          <span>Quick</span>
        </button>
      </td>
    </tr>
  );
}

/* ── Dashboard ─────────────────────────────────────────────────────────────── */

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [orders,        setOrders]        = useState<Order[]>([]);
  const [ordersError,   setOrdersError]   = useState<string | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [filter,        setFilter]        = useState('ALL');
  const [search,        setSearch]        = useState('');
  /** When true, show only orders whose photo still needs admin approval. */
  const [photoNeedsApprovalOnly, setPhotoNeedsApprovalOnly] = useState(false);
  /** When true, show only orders whose passport bio still needs admin approval. */
  const [passportNeedsApprovalOnly, setPassportNeedsApprovalOnly] = useState(false);
  /** Free-form tag filter — id of the OrderTag to filter by, or null for "all". */
  const [tagFilterId, setTagFilterId] = useState<string | null>(null);
  /** Processing-speed chip — single-select since each order has exactly one
   *  speed. Click an active chip again to clear (back to "all speeds"). */
  const [speedFilter, setSpeedFilter] = useState<string | null>(null);
  const tagCatalog = useOrderTagCatalog();
  /** Feature flag — when OFF, hides tag UI everywhere on this page. Default off. */
  const tagsEnabled = useFeatureFlag('orderTags') ?? false;
  const [quickEditOrder, setQuickEditOrder] = useState<Order | null>(null);
  const [orderSortBy, setOrderSortBy] = useState<string>('order');
  const [orderSortDir, setOrderSortDir] = useState<'asc' | 'desc'>('desc');
  // Sub-section is driven by ?section= in the URL so the sidebar links from
  // other admin pages (/admin/crm, /admin/settings, …) can deep-link into it.
  const searchParams = useSearchParams();
  const sectionParam = searchParams?.get('section');
  const activeSection: 'orders' | 'customers' | 'abandoned' | 'refunds' | 'archive' = (() => {
    if (sectionParam === 'customers' || sectionParam === 'abandoned' || sectionParam === 'refunds' || sectionParam === 'archive') return sectionParam;
    return 'orders';
  })();
  const [customerSearch, setCustomerSearch] = useState('');
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [abandonedApps, setAbandonedApps] = useState<any[]>([]);
  const [abandonedLoading, setAbandonedLoading] = useState(false);
  const [unresolvedErrors, setUnresolvedErrors] = useState(0);

  // Per-section page state. Reset to 1 whenever the relevant filter or search
  // term changes so the user never lands on an empty later page.
  const [ordersPage,    setOrdersPage]    = useState(1);
  const [customersPage, setCustomersPage] = useState(1);
  const [refundsPage,   setRefundsPage]   = useState(1);
  const [abandonedPage, setAbandonedPage] = useState(1);
  const [archivePage,   setArchivePage]   = useState(1);
  const [archiveModalOrder, setArchiveModalOrder] = useState<Order | null>(null);
  // Track which abandoned-application row is currently being deleted so the
  // Delete button can show a disabled "…" state while the request is in flight.
  const [deletingAbandonedId, setDeletingAbandonedId] = useState<string | null>(null);

  const handleDeleteAbandoned = async (id: string, label: string) => {
    if (!confirm(`Delete this abandoned application (${label})? This cannot be undone.`)) return;
    setDeletingAbandonedId(id);
    try {
      const res = await fetch(`/api/abandoned?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      // Optimistic remove — fast feedback, no refetch needed since the server confirmed.
      setAbandonedApps(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      alert(`Failed to delete: ${err?.message || 'unknown error'}`);
    } finally {
      setDeletingAbandonedId(null);
    }
  };
  useEffect(() => { setOrdersPage(1); }, [filter, search, photoNeedsApprovalOnly, passportNeedsApprovalOnly, tagFilterId, speedFilter]);
  useEffect(() => { setCustomersPage(1); }, [customerSearch]);
  useEffect(() => { setArchivePage(1); }, [activeSection]);

  // Custom statuses (admin-defined) — merged into filter tabs, stat cards, dropdowns.
  // `isDeletedBuiltIn` filters tombstoned built-in codes (admin deleted them
  // via the Status Labels tab) so they stop appearing in the filter row.
  const { statuses: customStatusesList, isDeletedBuiltIn } = useCustomStatuses();
  const customStatusCodes = customStatusesList.map(s => s.code);
  const customStatusesMap = new Map(customStatusesList.map(s => [s.code, s]));

  // Fetch error count every minute
  useEffect(() => {
    let cancelled = false;
    const fetchErrorCount = async () => {
      try {
        const res = await fetch('/api/errors?resolved=false&limit=1');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setUnresolvedErrors(data.counts?.unresolved || 0);
        }
      } catch {}
    };
    fetchErrorCount();
    const interval = setInterval(fetchErrorCount, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  /**
   * Robust orders fetch — retries once on a transient failure (Neon cold
   * start / pooler blip), distinguishes "fetch errored" from "no orders",
   * and never silently empties an existing populated list. The previous
   * version replaced the list with [] on any error, which made transient
   * blips look like permanent data loss on the page.
   */
  const fetchOrders = useCallback(async () => {
    const attempt = async (): Promise<Order[] | null> => {
      try {
        const res = await fetch('/api/orders', { cache: 'no-store' });
        if (!res.ok) {
          console.warn(`[fetchOrders] /api/orders responded ${res.status}`);
          return null;
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
          console.warn('[fetchOrders] /api/orders did not return an array', data);
          return null;
        }
        return data as Order[];
      } catch (err) {
        console.warn('[fetchOrders] network error', err);
        return null;
      }
    };

    let result = await attempt();
    if (result === null) {
      // Brief retry — covers Neon cold-start hiccups (~500ms-1s).
      await new Promise(r => setTimeout(r, 600));
      result = await attempt();
    }

    if (result !== null) {
      setOrders(result);
      setOrdersError(null);
    } else {
      setOrdersError('Failed to load orders. The database may be slow — click Refresh to try again.');
      // Deliberately do NOT clear `orders` — keep whatever we already have
      // displayed so a transient failure doesn't blank the screen.
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const fetchAbandoned = useCallback(async () => {
    setAbandonedLoading(true);
    try {
      const res = await fetch('/api/abandoned');
      if (res.ok) setAbandonedApps(await res.json());
    } catch {} finally { setAbandonedLoading(false); }
  }, []);

  useEffect(() => { if (activeSection === 'abandoned') fetchAbandoned(); }, [activeSection, fetchAbandoned]);

  /* CRM state */
  const [crmCustomers, setCrmCustomers] = useState<any[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmSearch, setCrmSearch] = useState('');
  const [crmSelected, setCrmSelected] = useState<any>(null);
  const [crmNotes, setCrmNotes] = useState('');
  const [crmTags, setCrmTags] = useState('');
  const [crmSaving, setCrmSaving] = useState(false);
  const [crmNewTag, setCrmNewTag] = useState('');

  const fetchCrm = useCallback(async () => {
    setCrmLoading(true);
    try {
      const res = await fetch('/api/crm/customers');
      if (res.ok) setCrmCustomers(await res.json());
    } catch {} finally { setCrmLoading(false); }
  }, []);

  // CRM section moved to its own page at /admin/crm — the inline tab was removed.
  void fetchCrm;

  const syncOrdersToCrm = async () => {
    // Auto-create CRM customers from existing orders
    const emails = new Set<string>();
    for (const o of orders) {
      let email = o.billingEmail;
      let name = '';
      try {
        const t = typeof o.travelers === 'string' ? JSON.parse(o.travelers) : o.travelers;
        if (t[0]?.email) email = t[0].email;
        if (t[0]?.firstName) name = `${t[0].firstName} ${t[0].lastName || ''}`.trim();
      } catch {}
      if (!emails.has(email.toLowerCase())) {
        emails.add(email.toLowerCase());
        await fetch('/api/crm/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: name || email }),
        });
      }
    }
    fetchCrm();
  };

  const selectCrmCustomer = (c: any) => {
    setCrmSelected(c);
    setCrmNotes(c.notes || '');
    setCrmTags(c.tags || '');
  };

  const saveCrmCustomer = async () => {
    if (!crmSelected) return;
    setCrmSaving(true);
    await fetch(`/api/crm/customers/${crmSelected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: crmNotes, tags: crmTags }),
    });
    setCrmSaving(false);
    fetchCrm();
  };

  const addCrmTag = () => {
    if (!crmNewTag.trim()) return;
    const current = crmTags ? crmTags.split(',').map((t: string) => t.trim()) : [];
    if (!current.includes(crmNewTag.trim())) {
      const updated = [...current, crmNewTag.trim()].join(', ');
      setCrmTags(updated);
    }
    setCrmNewTag('');
  };

  const removeCrmTag = (tag: string) => {
    const updated = crmTags.split(',').map((t: string) => t.trim()).filter((t: string) => t !== tag).join(', ');
    setCrmTags(updated);
  };

  const handleStatusChange = async (id: string, status: string) => {
    const order = orders.find(o => o.id === id);
    await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes: order?.notes }),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  };

  const handleNotesChange = (id: string, notes: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, notes } : o));
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    onLogout();
  };

  const toggleOrderSort = (col: string) => {
    if (orderSortBy === col) setOrderSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setOrderSortBy(col); setSortDir('asc'); }
  };
  const setSortDir = setOrderSortDir;

  const orderStatusOrder: Record<string, number> = {
    UNFINISHED: 0, PENDING: 0,
    PROCESSING: 1, UNDER_REVIEW: 1,
    NEEDS_CORRECTION: 2,
    SUBMITTED: 3,
    ON_HOLD: 4,
    COMPLETED: 5, APPROVED: 5,
    REJECTED: 6,
    REFUNDED: 7,
  };

  const filtered = orders.filter(o => {
    // Archived orders only live under the dedicated /admin?section=archive
    // sidebar item. Hide them from every status filter on the main orders page.
    if (o.archivedAt) return false;
    if (filter !== 'ALL' && o.status !== filter) return false;
    // Approval chips union — when at least one chip is active, the order
    // must match at least one of the active chip conditions (photo OR
    // passport needs approval). Click both chips → see every order that
    // needs ANY admin attention on documents.
    if (photoNeedsApprovalOnly || passportNeedsApprovalOnly) {
      const photoMatch    = photoNeedsApprovalOnly    && !o.photoApprovedAt;
      const passportMatch = passportNeedsApprovalOnly && !o.passportApprovedAt;
      if (!photoMatch && !passportMatch) return false;
    }
    // Speed filter — single-select; an order matches if its speed equals the active chip.
    if (speedFilter && (o.processingSpeed ?? 'standard') !== speedFilter) {
      return false;
    }
    if (tagsEnabled && tagFilterId) {
      try {
        const ids = o.tags ? JSON.parse(o.tags) : [];
        if (!Array.isArray(ids) || !ids.includes(tagFilterId)) return false;
      } catch { return false; }
    }
    const travelers = (() => { try { const t = o.travelers; return Array.isArray(t) ? t : JSON.parse(t as any); } catch { return []; } })();
    const matchSearch = !search || [
      o.billingEmail, o.destination, o.id,
      formatOrderNum(o.orderNumber),
      ...travelers.map((t: Traveler) => `${t.firstName} ${t.lastName}`),
    ].some(v => v?.toLowerCase().includes(search.toLowerCase()));
    return matchSearch;
  }).sort((a, b) => {
    let cmp = 0;
    switch (orderSortBy) {
      case 'order': cmp = a.orderNumber - b.orderNumber; break;
      case 'applicant': {
        const nameA = (() => { try { const t = typeof a.travelers === 'string' ? JSON.parse(a.travelers) : a.travelers; return `${t[0]?.firstName || ''} ${t[0]?.lastName || ''}`; } catch { return ''; } })();
        const nameB = (() => { try { const t = typeof b.travelers === 'string' ? JSON.parse(b.travelers) : b.travelers; return `${t[0]?.firstName || ''} ${t[0]?.lastName || ''}`; } catch { return ''; } })();
        cmp = nameA.localeCompare(nameB); break;
      }
      case 'country': cmp = a.destination.localeCompare(b.destination); break;
      case 'status': cmp = (orderStatusOrder[a.status] ?? 9) - (orderStatusOrder[b.status] ?? 9); break;
      case 'amount': cmp = a.totalUSD - b.totalUSD; break;
      case 'date': default: cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); break;
    }
    return orderSortDir === 'desc' ? -cmp : cmp;
  });

  const stats = {
    total:    orders.length,
    pending:  orders.filter(o => o.status === 'UNFINISHED' || o.status === 'PENDING').length,
    approved: orders.filter(o => o.status === 'COMPLETED' || o.status === 'APPROVED').length,
    revenue:  orders.reduce((s, o) => s + o.totalUSD, 0),
  };

  return (
    <>
    <div className="admin-shell">
      <AdminSidebar active={activeSection} errorCountOverride={unresolvedErrors} />

      {/* Main */}
      <div className="admin-main">
        {activeSection === 'orders' ? (
          <>
            {/* Header */}
            <div className="admin-header">
              <div>
                <h1 className="admin-title">Orders</h1>
                <p className="admin-sub">Manage and review incoming visa applications</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Link
                  href="/admin/errors"
                  className="admin-refresh-btn"
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: unresolvedErrors > 0 ? '#fef2f2' : undefined,
                    borderColor: unresolvedErrors > 0 ? '#fecaca' : undefined,
                    color: unresolvedErrors > 0 ? '#dc2626' : undefined,
                  }}
                >
                  <AlertTriangle size={14} strokeWidth={2} />
                  <span>Error Logs</span>
                  {unresolvedErrors > 0 && (
                    <span style={{
                      background: '#dc2626', color: 'white', borderRadius: '999px',
                      padding: '0.1rem 0.55rem', fontSize: '0.7rem', fontWeight: 700,
                    }}>
                      {unresolvedErrors > 99 ? '99+' : unresolvedErrors}
                    </span>
                  )}
                </Link>
                <button className="admin-refresh-btn" onClick={fetchOrders}><RefreshCw size={13} strokeWidth={2.25} /><span>Refresh</span></button>
              </div>
            </div>

            {/* Stats */}
            <div className="admin-stats">
              <div className="admin-stat-card">
                <div className="admin-stat-label">Unfinished</div>
                <div className="admin-stat-value admin-stat-pending">{stats.pending}</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-label">Processing</div>
                <div className="admin-stat-value admin-stat-pending">{orders.filter(o => o.status === 'PROCESSING' || o.status === 'UNDER_REVIEW').length}</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-label">Submitted</div>
                <div className="admin-stat-value admin-stat-pending">{orders.filter(o => o.status === 'SUBMITTED').length}</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-label">Completed</div>
                <div className="admin-stat-value admin-stat-pending">{stats.approved}</div>
              </div>
            </div>

            {/* Filters */}
            <div className="admin-filters">
              <input className="admin-search" placeholder="Search by order number, name, email, destination..."
                value={search} onChange={e => setSearch(e.target.value)} />
              <div className="admin-filter-tabs">
                {(['ALL','UNFINISHED','PROCESSING','NEEDS_CORRECTION','SUBMITTED','COMPLETED','ON_HOLD','REJECTED','REFUNDED', ...customStatusCodes].filter(s => s === 'ALL' || !isDeletedBuiltIn(s))).map(s => (
                  <button key={s} className={`admin-filter-tab${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
                    {s === 'ALL' ? 'All' : (customStatusesMap.get(s)?.label ?? s.replace('_',' '))}
                  </button>
                ))}
              </div>
            </div>

            {/* Admin-tag filters (separate row — orthogonal to status). */}
            {(() => {
              const photoNeedsApprovalCount    = orders.filter(o => !o.archivedAt && !o.photoApprovedAt).length;
              const passportNeedsApprovalCount = orders.filter(o => !o.archivedAt && !o.passportApprovedAt).length;
              // Count orders that carry each tag (active orders only, mirrors the main list filter).
              const counts = new Map<string, number>();
              for (const o of orders) {
                if (o.archivedAt || !o.tags) continue;
                try {
                  const ids = JSON.parse(o.tags);
                  if (Array.isArray(ids)) for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
                } catch {}
              }
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase' }}>Tags</span>

                  {/* Built-in: Photo needs approval */}
                  <button
                    type="button"
                    onClick={() => setPhotoNeedsApprovalOnly(v => !v)}
                    title={photoNeedsApprovalOnly
                      ? 'Showing only orders whose photo still needs your approval — click to clear'
                      : 'Filter to orders whose photo still needs your approval'}
                    style={{
                      fontSize: '0.75rem', fontWeight: 600,
                      padding: '0.3rem 0.65rem', borderRadius: '0.4rem',
                      border: '1px solid ' + (photoNeedsApprovalOnly ? '#f59e0b' : '#e5e7eb'),
                      background: photoNeedsApprovalOnly ? '#fef3c7' : 'white',
                      color: photoNeedsApprovalOnly ? '#92400e' : 'var(--slate)',
                      cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    }}
                  >
                    <Camera size={13} strokeWidth={2.25} aria-hidden />
                    Photo needs approval
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 700,
                      padding: '0 0.35rem', borderRadius: '999px',
                      background: photoNeedsApprovalOnly ? '#92400e' : '#e5e7eb',
                      color: photoNeedsApprovalOnly ? '#fef3c7' : 'var(--slate)',
                    }}>{photoNeedsApprovalCount}</span>
                  </button>

                  {/* Built-in: Passport needs approval */}
                  <button
                    type="button"
                    onClick={() => setPassportNeedsApprovalOnly(v => !v)}
                    title={passportNeedsApprovalOnly
                      ? 'Showing only orders whose passport bio still needs your approval — click to clear'
                      : 'Filter to orders whose passport bio still needs your approval'}
                    style={{
                      fontSize: '0.75rem', fontWeight: 600,
                      padding: '0.3rem 0.65rem', borderRadius: '0.4rem',
                      border: '1px solid ' + (passportNeedsApprovalOnly ? '#f59e0b' : '#e5e7eb'),
                      background: passportNeedsApprovalOnly ? '#fef3c7' : 'white',
                      color: passportNeedsApprovalOnly ? '#92400e' : 'var(--slate)',
                      cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    }}
                  >
                    <FileText size={13} strokeWidth={2.25} aria-hidden />
                    Passport needs approval
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 700,
                      padding: '0 0.35rem', borderRadius: '999px',
                      background: passportNeedsApprovalOnly ? '#92400e' : '#e5e7eb',
                      color: passportNeedsApprovalOnly ? '#fef3c7' : 'var(--slate)',
                    }}>{passportNeedsApprovalCount}</span>
                  </button>

                  {/* Divider — separates the document-approval chips (left)
                      from the processing-speed chips (right). Helps visually
                      hint that they're separate filter dimensions. */}
                  <span aria-hidden style={{
                    width: '1px', alignSelf: 'stretch', minHeight: '1.5rem',
                    background: '#e5e7eb', margin: '0 0.25rem',
                  }} />

                  {/* Built-in: Processing speed — single-select since each
                      order has exactly one speed. Clicking the active chip
                      again clears the filter. */}
                  {(['rush', 'super', 'standard'] as const).map(speed => {
                    const isActive = speedFilter === speed;
                    const count = orders.filter(o => !o.archivedAt && (o.processingSpeed ?? 'standard') === speed).length;
                    const cfg: { label: string; Icon: LucideIcon | null; accent: string; bg: string; border: string } =
                      speed === 'super'
                        ? { label: 'Super Rush', Icon: Rocket, accent: '#991b1b', bg: '#fee2e2', border: '#fca5a5' }
                        : speed === 'rush'
                        ? { label: 'Rush',       Icon: Zap,    accent: '#92400e', bg: '#fef3c7', border: '#fde68a' }
                        : { label: 'Standard',   Icon: null,   accent: '#475569', bg: '#f1f5f9', border: '#cbd5e1' };
                    return (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setSpeedFilter(prev => prev === speed ? null : speed)}
                        title={isActive ? `Showing only ${cfg.label} orders — click to clear` : `Filter to ${cfg.label} orders`}
                        style={{
                          fontSize: '0.75rem', fontWeight: 600,
                          padding: '0.3rem 0.65rem', borderRadius: '0.4rem',
                          border: '1px solid ' + (isActive ? cfg.border : '#e5e7eb'),
                          background: isActive ? cfg.bg : 'white',
                          color: isActive ? cfg.accent : 'var(--slate)',
                          cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                        }}
                      >
                        {cfg.Icon && <cfg.Icon size={13} strokeWidth={2.25} aria-hidden />}
                        {cfg.label}
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 700,
                          padding: '0 0.35rem', borderRadius: '999px',
                          background: isActive ? cfg.accent : '#e5e7eb',
                          color: isActive ? cfg.bg : 'var(--slate)',
                        }}>{count}</span>
                      </button>
                    );
                  })}

                  {/* User-defined tags — gated behind the orderTags feature flag.
                      When OFF, the chips disappear and the catalog API call is wasted
                      data but harmless; flipping ON restores everything as it was. */}
                  {tagsEnabled && tagCatalog.tags.map(tag => {
                    const isActive = tagFilterId === tag.id;
                    const count = counts.get(tag.id) ?? 0;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setTagFilterId(prev => prev === tag.id ? null : tag.id)}
                        title={isActive ? `Showing only "${tag.name}" — click to clear` : `Filter to orders tagged "${tag.name}"`}
                        style={{
                          fontSize: '0.75rem', fontWeight: 600,
                          padding: '0.25rem 0.55rem', borderRadius: '0.4rem',
                          border: '1px solid ' + (isActive ? '#1e3a8a' : '#e5e7eb'),
                          background: isActive ? '#eef2ff' : 'white',
                          color: isActive ? '#1e3a8a' : 'var(--slate)',
                          cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        }}
                      >
                        <TagChip tag={tag} size="sm" />
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 700, padding: '0 0.35rem', borderRadius: '999px',
                          background: isActive ? '#1e3a8a' : '#e5e7eb',
                          color: isActive ? 'white' : 'var(--slate)',
                        }}>{count}</span>
                      </button>
                    );
                  })}
                  {(photoNeedsApprovalOnly || passportNeedsApprovalOnly || tagFilterId || speedFilter) && (
                    <button
                      type="button"
                      onClick={() => { setPhotoNeedsApprovalOnly(false); setPassportNeedsApprovalOnly(false); setTagFilterId(null); setSpeedFilter(null); }}
                      style={{
                        fontSize: '0.72rem', color: '#6b7280', background: 'transparent',
                        border: 'none', cursor: 'pointer', textDecoration: 'underline',
                      }}
                    >Clear</button>
                  )}
                </div>
              );
            })()}

            {/* Visible error banner — shown when the fetch failed but we
                may still have stale data from a previous successful load. */}
            {ordersError && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                padding: '0.7rem 0.95rem',
                marginBottom: '0.75rem',
                color: '#991b1b',
                fontSize: '0.85rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
              }}>
                <span>⚠️ {ordersError}</span>
                <button
                  type="button"
                  onClick={fetchOrders}
                  style={{
                    background: '#dc2626', color: 'white', border: 'none',
                    borderRadius: '0.35rem', padding: '0.35rem 0.7rem',
                    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Table */}
            <div className="admin-table-wrap">
              {loading ? (
                <div className="admin-empty">Loading orders...</div>
              ) : filtered.length === 0 ? (
                <div className="admin-empty">
                  {orders.length === 0 ? 'No orders yet. They\'ll appear here once customers complete checkout.' : 'No orders match your filter.'}
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th className="admin-th crm-th-sort" onClick={() => toggleOrderSort('order')}>Order {orderSortBy === 'order' && (orderSortDir === 'asc' ? '↑' : '↓')}</th>
                      <th className="admin-th crm-th-sort" onClick={() => toggleOrderSort('date')}>Date {orderSortBy === 'date' && (orderSortDir === 'asc' ? '↑' : '↓')}</th>
                      <th className="admin-th crm-th-sort" onClick={() => toggleOrderSort('applicant')}>Applicant {orderSortBy === 'applicant' && (orderSortDir === 'asc' ? '↑' : '↓')}</th>
                      <th className="admin-th crm-th-sort" onClick={() => toggleOrderSort('country')}>Country {orderSortBy === 'country' && (orderSortDir === 'asc' ? '↑' : '↓')}</th>
                      <th className="admin-th crm-th-sort" onClick={() => toggleOrderSort('status')}>Status {orderSortBy === 'status' && (orderSortDir === 'asc' ? '↑' : '↓')}</th>
                      <th className="admin-th">Notes</th>
                      <th className="admin-th crm-th-sort" onClick={() => toggleOrderSort('amount')}>Amount {orderSortBy === 'amount' && (orderSortDir === 'asc' ? '↑' : '↓')}</th>
                      <th className="admin-th">Status</th>
                      <th className="admin-th">Quick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((ordersPage - 1) * PAGE_SIZE, ordersPage * PAGE_SIZE).map(o => (
                      <OrderRow key={o.id} order={o} onStatusChange={handleStatusChange} onNotesChange={handleNotesChange} onQuickEdit={setQuickEditOrder} tagCatalog={tagsEnabled ? tagCatalog.tags : []} />
                    ))}
                  </tbody>
                </table>
              )}
              <Pagination total={filtered.length} page={ordersPage} onPageChange={setOrdersPage} label="orders" />
            </div>
          </>
        ) : null}

        {activeSection === 'customers' && (
          <>
            {/* Customer Accounts */}
            <div className="admin-header">
              <div>
                <h1 className="admin-title">Customer Accounts</h1>
                <p className="admin-sub">All customers grouped by contact email</p>
              </div>
              <button className="admin-refresh-btn" onClick={fetchOrders}><RefreshCw size={13} strokeWidth={2.25} /><span>Refresh</span></button>
            </div>

            <div className="admin-filters">
              <input className="admin-search" placeholder="Search by email..."
                value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
            </div>

            <div className="admin-table-wrap">
              {loading ? (
                <div className="admin-empty">Loading...</div>
              ) : (() => {
                const grouped = orders.reduce<Record<string, Order[]>>((acc, o) => {
                  // Group by first traveler's email (contact email)
                  let key = o.billingEmail;
                  try {
                    const travelers = (typeof o.travelers === 'string' ? JSON.parse(o.travelers) : o.travelers);
                    if (travelers[0]?.email) key = travelers[0].email;
                  } catch {}
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(o);
                  return acc;
                }, {});
                const entries = Object.entries(grouped)
                  .filter(([email]) => !customerSearch || email.toLowerCase().includes(customerSearch.toLowerCase()))
                  .sort((a, b) => b[1].length - a[1].length);

                if (entries.length === 0) return <div className="admin-empty">No customer accounts found.</div>;
                const pagedEntries = entries.slice((customersPage - 1) * PAGE_SIZE, customersPage * PAGE_SIZE);

                return (
                  <>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th className="admin-th">Email</th>
                        <th className="admin-th">Orders</th>
                        <th className="admin-th">Latest Status</th>
                        <th className="admin-th">Total Spent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedEntries.map(([email, customerOrders]) => {
                        const latest = customerOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                        const totalSpent = customerOrders.reduce((s, o) => s + o.totalUSD, 0);
                        const isExpanded = expandedEmail === email;
                        return (
                          <React.Fragment key={email}>
                            <tr className="admin-tr" onClick={() => setExpandedEmail(isExpanded ? null : email)} style={{ cursor: 'pointer' }}>
                              <td className="admin-td">
                                <span style={{ fontWeight: 600 }}>{isExpanded ? '▾' : '▸'} {email}</span>
                              </td>
                              <td className="admin-td">{customerOrders.length}</td>
                              <td className="admin-td">
                                <StatusBadge code={latest.status} />
                              </td>
                              <td className="admin-td">
                                <span style={{ fontWeight: 600 }}>${totalSpent.toFixed(2)}</span>
                              </td>
                            </tr>
                            {isExpanded && customerOrders.map(o => (
                              <tr key={o.id} className="admin-tr" style={{ background: 'rgba(79,110,247,0.04)' }}>
                                <td className="admin-td" style={{ paddingLeft: '2.5rem' }}>
                                  <a href={`/admin/orders/${formatOrderNum(o.orderNumber)}`} style={{ color: 'var(--blue)', fontWeight: 500, textDecoration: 'none' }}>
                                    #{formatOrderNum(o.orderNumber)}
                                  </a>
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--slate)' }}>
                                    {VISA_LABELS[o.visaType] ?? o.visaType}
                                  </span>
                                </td>
                                <td className="admin-td">{new Date(o.createdAt).toLocaleDateString()}</td>
                                <td className="admin-td">
                                  <StatusBadge code={o.status} />
                                </td>
                                <td className="admin-td">${o.totalUSD.toFixed(2)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  <Pagination total={entries.length} page={customersPage} onPageChange={setCustomersPage} label="customers" />
                  </>
                );
              })()}
            </div>
          </>
        )}

        {activeSection === 'refunds' && (() => {
          const refundedOrders = orders.filter(o => o.status === 'REFUNDED');
          const totalRefunded = refundedOrders.reduce((s, o) => s + (o.refundAmount ?? o.totalUSD), 0);
          return (
            <>
              <div className="admin-header">
                <div>
                  <h1 className="admin-title">Refunds</h1>
                  <p className="admin-sub">{refundedOrders.length} refund{refundedOrders.length !== 1 ? 's' : ''} — ${totalRefunded.toFixed(2)} total refunded</p>
                </div>
                <button className="admin-refresh-btn" onClick={fetchOrders}><RefreshCw size={13} strokeWidth={2.25} /><span>Refresh</span></button>
              </div>

              <div className="admin-table-wrap">
                {loading ? (
                  <div className="admin-empty">Loading...</div>
                ) : refundedOrders.length === 0 ? (
                  <div className="admin-empty">No refunds yet. Refund an order from its detail page to see it here.</div>
                ) : (
                  <>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th className="admin-th">Order</th>
                        <th className="admin-th">Date Refunded</th>
                        <th className="admin-th">Applicant</th>
                        <th className="admin-th">Original</th>
                        <th className="admin-th">Refunded</th>
                        <th className="admin-th">Reason</th>
                        <th className="admin-th">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refundedOrders.slice((refundsPage - 1) * PAGE_SIZE, refundsPage * PAGE_SIZE).map(o => {
                        let applicant = o.billingEmail;
                        try { const t = (typeof o.travelers === 'string' ? JSON.parse(o.travelers) : o.travelers); if (t[0]) applicant = `${t[0].firstName} ${t[0].lastName}`; } catch {}
                        return (
                          <tr key={o.id} className="admin-tr">
                            <td className="admin-td">
                              <a href={`/admin/orders/${formatOrderNum(o.orderNumber)}`} style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
                                #{formatOrderNum(o.orderNumber)}
                              </a>
                              <span className={`admin-visa-badge ${VISA_COLORS[o.visaType] ?? ''}`} style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                                {VISA_LABELS[o.visaType] ?? o.visaType}
                              </span>
                            </td>
                            <td className="admin-td">{o.refundedAt ? new Date(o.refundedAt).toLocaleDateString() : '—'}</td>
                            <td className="admin-td">{applicant}</td>
                            <td className="admin-td">${o.totalUSD.toFixed(2)}</td>
                            <td className="admin-td" style={{ fontWeight: 600, color: '#7c3aed' }}>
                              ${(o.refundAmount ?? o.totalUSD).toFixed(2)}
                              {o.refundAmount != null && o.refundAmount < o.totalUSD && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--slate)', marginLeft: '0.3rem' }}>partial</span>
                              )}
                            </td>
                            <td className="admin-td" style={{ maxWidth: '200px' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--slate)' }}>{o.refundReason || '—'}</span>
                            </td>
                            <td className="admin-td">
                              <a href={`/admin/orders/${formatOrderNum(o.orderNumber)}`} style={{ color: 'var(--blue)', fontSize: '0.8rem', textDecoration: 'none' }}>View</a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <Pagination total={refundedOrders.length} page={refundsPage} onPageChange={setRefundsPage} label="refunds" />
                  </>
                )}
              </div>
            </>
          );
        })()}

        {activeSection === 'abandoned' && (
          <>
            <div className="admin-header">
              <div>
                <h1 className="admin-title">Abandoned Applications</h1>
                <p className="admin-sub">Users who started but never completed checkout</p>
              </div>
              <button className="admin-refresh-btn" onClick={fetchAbandoned}><RefreshCw size={13} strokeWidth={2.25} /><span>Refresh</span></button>
            </div>

            <div className="admin-table-wrap">
              {abandonedLoading ? (
                <div className="admin-empty">Loading...</div>
              ) : abandonedApps.length === 0 ? (
                <div className="admin-empty">No abandoned applications found.</div>
              ) : (
                <>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th className="admin-th">Date</th>
                      <th className="admin-th">Email</th>
                      <th className="admin-th">Destination</th>
                      <th className="admin-th">Visa Type</th>
                      <th className="admin-th">Last Step</th>
                      <th className="admin-th">Travelers</th>
                      <th className="admin-th" style={{ width: '90px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {abandonedApps.slice((abandonedPage - 1) * PAGE_SIZE, abandonedPage * PAGE_SIZE).map(a => {
                      const stepLabels: Record<string, string> = {
                        step1: 'Trip Details',
                        step2: 'Personal Info',
                        step2b: 'Passport Details',
                        step3: 'Checkout',
                      };
                      let travelerCount = 0;
                      let travelerNames = '';
                      try {
                        const t = a.travelers ? (typeof a.travelers === 'string' ? JSON.parse(a.travelers) : a.travelers) : [];
                        travelerCount = t.length;
                        travelerNames = t.map((tr: any) => `${tr.firstName || ''} ${tr.lastName || ''}`.trim()).filter(Boolean).join(', ');
                      } catch {}

                      return (
                        <tr key={a.id} className="admin-tr">
                          <td className="admin-td">
                            <span style={{ fontSize: '0.8rem' }}>{new Date(a.updatedAt).toLocaleString()}</span>
                          </td>
                          <td className="admin-td">
                            <span style={{ fontWeight: 600 }}>{a.email || '—'}</span>
                          </td>
                          <td className="admin-td">{a.destination ? `${COUNTRY_FLAGS[a.destination] ?? ''} ${a.destination}` : '—'}</td>
                          <td className="admin-td">
                            {a.visaType ? (
                              <span className={`admin-visa-badge ${VISA_LABELS[a.visaType] ? 'visa-' + a.visaType.toLowerCase().replace(/_/g, '-') : ''}`}>
                                {VISA_LABELS[a.visaType] ?? a.visaType}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="admin-td">
                            <span style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: a.lastStep === 'step3' ? 'rgba(234,179,8,0.12)' : 'rgba(107,114,128,0.1)',
                              color: a.lastStep === 'step3' ? '#b45309' : '#4b5563',
                            }}>
                              {stepLabels[a.lastStep] ?? a.lastStep}
                            </span>
                          </td>
                          <td className="admin-td">
                            {travelerCount > 0 ? (
                              <span title={travelerNames}>{travelerCount} — {travelerNames || 'No names'}</span>
                            ) : '—'}
                          </td>
                          <td className="admin-td" style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              title="Delete this abandoned application"
                              onClick={() => handleDeleteAbandoned(a.id, a.email || a.id.slice(0, 8))}
                              disabled={deletingAbandonedId === a.id}
                              style={{
                                background: 'transparent', border: '1px solid #fecaca',
                                color: '#dc2626', borderRadius: '0.4rem',
                                padding: '0.3rem 0.55rem',
                                fontSize: '0.78rem', fontWeight: 600,
                                cursor: deletingAbandonedId === a.id ? 'wait' : 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                opacity: deletingAbandonedId === a.id ? 0.6 : 1,
                              }}
                            >
                              <Trash2 size={12} strokeWidth={2.25} />
                              {deletingAbandonedId === a.id ? '…' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination total={abandonedApps.length} page={abandonedPage} onPageChange={setAbandonedPage} label="abandoned applications" />
                </>
              )}
            </div>
          </>
        )}

        {/* ARCHIVE — dedicated section. Renders the same OrderRow as the
            main orders list, but scoped to archivedAt-non-null rows. */}
        {activeSection === 'archive' && (() => {
          const archivedOrders = orders
            .filter(o => o.archivedAt)
            .sort((a, b) =>
              new Date(b.archivedAt as string).getTime() -
              new Date(a.archivedAt as string).getTime(),
            );
          const total = archivedOrders.length;
          const paged = archivedOrders.slice((archivePage - 1) * PAGE_SIZE, archivePage * PAGE_SIZE);
          return (
            <>
              <div className="admin-header">
                <div>
                  <h1 className="admin-title">Archive</h1>
                  <p className="admin-sub">
                    {total} archived order{total !== 1 ? 's' : ''} — customer details are
                                    redacted until you click <strong>Recover</strong> on one.
                  </p>
                </div>
                <button className="admin-refresh-btn" onClick={fetchOrders}>
                  <RefreshCw size={13} strokeWidth={2.25} /><span>Refresh</span>
                </button>
              </div>

              <div className="admin-table-wrap">
                {loading ? (
                  <div className="admin-empty">Loading...</div>
                ) : total === 0 ? (
                  <div className="admin-empty">
                    No archived orders yet. Completed orders move here automatically 30 days after completion.
                  </div>
                ) : (
                  <>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th className="admin-th">Order</th>
                          <th className="admin-th">Archived</th>
                          <th className="admin-th">Country</th>
                          <th className="admin-th">Amount</th>
                          <th className="admin-th">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map(o => (
                          <tr
                            key={o.id}
                            className="admin-tr"
                            onClick={() => setArchiveModalOrder(o)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td className="admin-td">
                              <span style={{ color: 'var(--blue)', fontWeight: 600 }}>
                                #{formatOrderNum(o.orderNumber)}
                              </span>
                            </td>
                            <td className="admin-td">
                              {o.archivedAt ? new Date(o.archivedAt).toLocaleDateString() : '—'}
                            </td>
                            <td className="admin-td">
                              {COUNTRY_FLAGS[o.destination] ?? ''} {o.destination}
                            </td>
                            <td className="admin-td">${o.totalUSD.toFixed(2)}</td>
                            <td className="admin-td" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setArchiveModalOrder(o)}
                                style={{
                                  background: 'transparent', border: 'none',
                                  color: 'var(--blue)', fontSize: '0.8rem',
                                  fontWeight: 600, cursor: 'pointer', padding: 0,
                                }}
                              >
                                View / Recover →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pagination total={total} page={archivePage} onPageChange={setArchivePage} label="archived orders" />
                  </>
                )}
              </div>
            </>
          );
        })()}

      </div>
    </div>

    {quickEditOrder && (
      <QuickEditModal
        order={quickEditOrder}
        onClose={() => setQuickEditOrder(null)}
        onSaved={patch => {
          // Optimistically update the row so the note preview reflects the change.
          setOrders(prev => prev.map(o => o.id === quickEditOrder.id ? { ...o, ...patch } : o));
          setQuickEditOrder(prev => prev ? { ...prev, ...patch } : prev);
        }}
      />
    )}
    {archiveModalOrder && (
      <ArchiveRecoverModal
        order={archiveModalOrder}
        onClose={() => setArchiveModalOrder(null)}
        onRecovered={() => {
          // Optimistic clear so the row disappears from the Archive list immediately;
          // refetch keeps state in sync with whatever the server confirms.
          setOrders(prev => prev.map(o =>
            o.id === archiveModalOrder.id ? { ...o, archivedAt: null } : o,
          ));
          fetchOrders();
        }}
      />
    )}
    </>
  );
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/admin/session')
      .then(r => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;
  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;
  return (
    <CustomStatusesProvider country="INDIA">
      <Dashboard onLogout={() => setAuthed(false)} />
    </CustomStatusesProvider>
  );
}
