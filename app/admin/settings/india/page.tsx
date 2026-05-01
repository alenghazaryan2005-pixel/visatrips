'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminSidebar } from '@/components/AdminSidebar';
import type { ApplicationSchema, CustomSection, CustomField, FieldType, BotAction } from '@/lib/applicationSchema';
import { FIELD_TYPE_OPTIONS, BOT_ACTION_OPTIONS, defaultSchema } from '@/lib/applicationSchema';
import { DollarSign, Mail as MailIcon, Tag, ClipboardList, Wrench, Save, Plus, Trash2, ArrowUp, ArrowDown, Bot, Zap, AlertTriangle, type LucideIcon } from 'lucide-react';
import { SECTION_ICONS, getSectionIcon, SectionIcon } from '@/lib/sectionIcons';

type Tab = 'pricing' | 'email' | 'status' | 'application' | 'bot' | 'general';

interface SettingsData {
  settings: Record<string, any>;
  defaults: Record<string, any>;
}

const VISA_CODES = ['TOURIST_30', 'TOURIST_1Y', 'TOURIST_5Y', 'BUSINESS_1Y', 'MEDICAL_60'];

// All known sub-purposes (purposeOfVisit values) — currently only the 10
// business sub-purposes have distinct gov-form sub-forms. As we map medical
// and tourist sub-purposes we'll extend this list. The admin can also type
// a custom value if a sub-purpose ever shows up that isn't here yet.
const KNOWN_PURPOSES = [
  'Set Up Industrial/Business Venture',
  'Sale/Purchase/Trade',
  'Attend Technical/Business Meetings',
  'Recruit Manpower',
  'Participation in Exhibitions/Trade Fairs',
  'Expert/Specialist for Ongoing Project',
  'Conducting Tours',
  'Deliver Lectures (GIAN)',
  'Sports Related Activity',
  'Join Vessel',
];
const VISA_LABELS: Record<string, string> = {
  TOURIST_30: 'Tourist – 30 days',
  TOURIST_1Y: 'Tourist – 1 year',
  TOURIST_5Y: 'Tourist – 5 years',
  BUSINESS_1Y: 'Business – 1 year',
  MEDICAL_60: 'Medical – 60 days',
};

const PROCESSING_CODES = ['standard', 'rush', 'super'];
const PROCESSING_LABELS: Record<string, string> = {
  standard: 'Standard',
  rush: 'Rush',
  super: 'Super Rush',
};

const STATUS_CODES = ['UNFINISHED','PROCESSING','SUBMITTED','COMPLETED','NEEDS_CORRECTION','ON_HOLD','REJECTED','REFUNDED'];

interface BuiltInTemplate {
  code: string;
  label: string;
  description: string;
  trigger: string;
  sample: { subject: string; html: string };
  structuredDefault?: StructuredEmail;
  structuredSubjectDefault?: string;
}

interface StructuredEmail {
  icon?: string;
  heading: string;
  headingColor?: string;
  subheading?: string;
  paragraphs?: string[];
  card?: { title?: string; rows: Array<{ label: string; value: string; highlight?: boolean }> };
  button?: { text?: string; url?: string; color?: string };
  footnote?: string;
}

interface CustomTemplate {
  id: string;
  country: string;
  code: string;
  label: string;
  description: string | null;
  trigger: string;
  subject: string;
  structured: string | null;  // JSON string
  html: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

interface CustomStatus {
  id: string;
  country: string;
  code: string;
  label: string;
  color: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// Quick-pick palette for the status color picker (admins can still pick any
// hex via the color wheel).
const STATUS_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Slate',   hex: '#64748b' },
  { name: 'Blue',    hex: '#3b82f6' },
  { name: 'Green',   hex: '#22c55e' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Amber',   hex: '#f59e0b' },
  { name: 'Red',     hex: '#ef4444' },
  { name: 'Purple',  hex: '#8b5cf6' },
  { name: 'Pink',    hex: '#ec4899' },
];

// Map legacy named-color values → hex so the color wheel shows something
// reasonable when editing an old status.
const LEGACY_NAMED_TO_HEX: Record<string, string> = {
  slate: '#64748b', blue: '#3b82f6', green: '#22c55e', emerald: '#10b981',
  amber: '#f59e0b', red:  '#ef4444', purple: '#8b5cf6', pink: '#ec4899',
  // Email legacy names
  default: '#1E293B', black: '#1E293B',
};

// Quick-pick presets for email heading colors.
const HEADING_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Default', hex: '#1E293B' },
  { name: 'Blue',    hex: '#6C8AFF' },
  { name: 'Green',   hex: '#059669' },
  { name: 'Amber',   hex: '#d97706' },
  { name: 'Red',     hex: '#dc2626' },
];

// Quick-pick presets for email button colors (matches the send-email renderer defaults).
const BUTTON_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Blue',  hex: '#6C8AFF' },
  { name: 'Green', hex: '#059669' },
  { name: 'Red',   hex: '#dc2626' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Slate', hex: '#475569' },
  { name: 'Black', hex: '#1E293B' },
];

/** Turn any stored color value (named or hex) into a hex we can put into an <input type="color">. */
function toHex(c: string | null | undefined, fallback = '#64748b'): string {
  if (!c) return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  return LEGACY_NAMED_TO_HEX[c] || fallback;
}

/** Matches resolveStatusColor in lib/customStatuses.tsx — bg = 10% alpha, fg = full. */
function statusChipStyle(c: string | null | undefined): { background: string; color: string } {
  const hex = toHex(c);
  return { background: hex + '1A', color: hex };
}

const TRIGGER_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: 'manual',                       label: '✋ Manual only',                     description: 'Admin picks this email on the order page to send it.' },
  { value: 'on_status_UNFINISHED',         label: '📝 Status → Unfinished',             description: 'Sent automatically when an order enters Unfinished status.' },
  { value: 'on_status_PROCESSING',         label: '🔄 Status → Processing',             description: 'Sent automatically when an order enters Processing status.' },
  { value: 'on_status_SUBMITTED',          label: '📨 Status → Submitted',              description: 'Sent automatically when we submit to gov site.' },
  { value: 'on_status_COMPLETED',          label: '✅ Status → Completed',               description: 'Sent automatically when an order is completed.' },
  { value: 'on_status_NEEDS_CORRECTION',   label: '⚠️ Status → Needs Correction',       description: 'Sent automatically when an order is flagged for correction.' },
  { value: 'on_status_ON_HOLD',            label: '⏸️ Status → On Hold',                description: 'Sent automatically when an order is put on hold.' },
  { value: 'on_status_REJECTED',           label: '❌ Status → Rejected',                description: 'Sent automatically when an order is rejected.' },
  { value: 'on_status_REFUNDED',           label: '💸 Status → Refunded',                description: 'Sent automatically when an order is refunded.' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [tab, setTab]           = useState<Tab>('pricing');
  const [data, setData]         = useState<SettingsData | null>(null);
  const [templates, setTemplates] = useState<BuiltInTemplate[]>([]);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([]);
  // Application schema (custom sections admins add on top of the built-in form).
  // `appSchemaSaved` holds the last confirmed server snapshot — Cancel restores to it.
  const [appSchema, setAppSchema] = useState<ApplicationSchema>(defaultSchema('INDIA'));
  const [appSchemaSaved, setAppSchemaSaved] = useState<ApplicationSchema>(defaultSchema('INDIA'));
  const [appSchemaSaving, setAppSchemaSaving] = useState(false);
  const [appSchemaFlash, setAppSchemaFlash] = useState('');
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [expandedCustom, setExpandedCustom] = useState<string | null>(null);
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [creatingStatus, setCreatingStatus] = useState(false);
  const [drafts, setDrafts]     = useState<Record<string, any>>({});
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [authed, setAuthed]     = useState(false);
  const [isOwner, setIsOwner]   = useState(false);
  const [flash, setFlash]       = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Verify admin auth + owner-role (settings are app-wide config, owner only).
      const sessRes = await fetch('/api/admin/session', { cache: 'no-store' });
      if (sessRes.status === 401) { router.push('/admin'); return; }
      const sess = await sessRes.json();
      setAuthed(true);
      setIsOwner(sess.role === 'owner');
      if (sess.role !== 'owner') {
        // Skip the heavy settings fetches for employees — they'll see the
        // access-denied panel rendered below.
        setLoading(false);
        return;
      }

      const res = await fetch('/api/settings');
      const d = await res.json();
      setData(d);
      // Load email template previews
      try {
        const tplRes = await fetch('/api/settings/email-templates');
        if (tplRes.ok) {
          const tplData = await tplRes.json();
          setTemplates(tplData.templates || []);
        }
      } catch {}
      // Load custom email templates
      try {
        const cRes = await fetch('/api/settings/custom-emails?country=INDIA');
        if (cRes.ok) {
          const cData = await cRes.json();
          setCustomTemplates(cData.templates || []);
        }
      } catch {}
      // Load custom statuses
      try {
        const sRes = await fetch('/api/settings/custom-statuses?country=INDIA');
        if (sRes.ok) {
          const sData = await sRes.json();
          setCustomStatuses(sData.statuses || []);
        }
      } catch {}
      // Load application schema
      try {
        const aRes = await fetch('/api/settings/application-schema?country=INDIA');
        if (aRes.ok) {
          const aData = await aRes.json();
          const loaded: ApplicationSchema = {
            country: aData.country || 'INDIA',
            sections: Array.isArray(aData.sections) ? aData.sections : [],
            updatedAt: aData.updatedAt,
          };
          setAppSchema(loaded);
          setAppSchemaSaved(loaded);
        }
      } catch {}
      setDrafts({}); // reset unsaved edits
    } catch {}
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const getValue = (key: string, fallback?: any) => {
    if (key in drafts) return drafts[key];
    return data?.settings[key] ?? fallback ?? data?.defaults[key];
  };

  const setDraft = (key: string, value: any) => setDrafts(d => ({ ...d, [key]: value }));

  const hasUnsaved = Object.keys(drafts).length > 0;

  const save = async () => {
    if (!hasUnsaved) return;
    setSaving(true);
    setFlash('');
    try {
      const updates: Record<string, { value: any; category: string }> = {};
      for (const [key, value] of Object.entries(drafts)) {
        const category = key.split('.')[0];
        updates[key] = { value, category };
      }
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (res.ok) {
        setFlash('✅ Saved!');
        setTimeout(() => setFlash(''), 2500);
        await load();
      } else {
        const d = await res.json();
        setFlash(`❌ ${d.error || 'Failed'}`);
      }
    } catch (err: any) {
      setFlash(`❌ ${err?.message || 'Failed'}`);
    } finally { setSaving(false); }
  };

  const resetKey = async (key: string) => {
    if (!confirm(`Reset "${key}" to its default value?`)) return;
    try {
      await fetch(`/api/settings/${encodeURIComponent(key)}`, { method: 'DELETE' });
      load();
    } catch {}
  };

  if (loading && !authed) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading…</div>;
  }

  // Employees can't manage application settings — they see an access-denied
  // panel. The API also enforces owner-role on every write.
  if (!isOwner) {
    return (
      <div className="admin-shell">
        <AdminSidebar active="settings" />
        <div className="admin-main" style={{ maxWidth: '100%' }}>
          <div style={{ padding: '4rem 1.5rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔒</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>Owner access required</h1>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
              India settings (pricing, emails, status labels, application schema, bot config) are restricted to owner accounts.
            </p>
            <a href="/admin" style={{ display: 'inline-block', marginTop: '1rem', color: 'var(--blue)', fontSize: '0.9rem', textDecoration: 'none' }}>
              ← Back to admin
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <AdminSidebar active="settings" />

      <div className="admin-main" style={{ maxWidth: '100%' }}>
        <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <Link href="/admin/settings" style={{ fontSize: '0.85rem', color: 'var(--blue)', textDecoration: 'none' }}>← All countries</Link>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.25rem' }}>🇮🇳 India Settings</h1>
              <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Control prices, email templates, status labels, and general site settings for India visas.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {flash && <span style={{ fontSize: '0.88rem', fontWeight: 600, color: flash.startsWith('✅') ? '#059669' : '#dc2626' }}>{flash}</span>}
              {hasUnsaved && (
                <button
                  onClick={() => setDrafts({})}
                  disabled={saving}
                  style={{
                    background: 'white',
                    color: '#374151',
                    border: '1px solid #e5e7eb',
                    padding: '0.6rem 1.1rem', borderRadius: '0.5rem',
                    fontWeight: 600, fontSize: '0.9rem',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >Cancel</button>
              )}
              <button
                onClick={save}
                disabled={!hasUnsaved || saving}
                className="settings-save-btn"
                style={{
                  background: hasUnsaved ? 'var(--blue)' : '#e5e7eb',
                  color: hasUnsaved ? 'white' : '#9ca3af',
                  border: 'none', padding: '0.6rem 1.25rem', borderRadius: '0.5rem',
                  fontWeight: 600, fontSize: '0.9rem', cursor: hasUnsaved ? 'pointer' : 'not-allowed',
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                }}
              >
                {hasUnsaved && !saving && <Save size={15} strokeWidth={2.25} />}
                <span>{saving ? 'Saving…' : hasUnsaved ? `Save ${Object.keys(drafts).length} change${Object.keys(drafts).length === 1 ? '' : 's'}` : 'Saved'}</span>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #e5e7eb' }}>
            {([
              { id: 'pricing',     label: 'Pricing',         Icon: DollarSign },
              { id: 'email',       label: 'Email Templates', Icon: MailIcon },
              { id: 'status',      label: 'Status Labels',   Icon: Tag },
              { id: 'application', label: 'Application',     Icon: ClipboardList },
              { id: 'bot',         label: 'Bot',             Icon: Bot },
              { id: 'general',     label: 'General',         Icon: Wrench },
            ] as { id: Tab; label: string; Icon: LucideIcon }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: 'none', border: 'none', padding: '0.75rem 1rem',
                  fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                  color: tab === t.id ? 'var(--blue)' : '#6b7280',
                  borderBottom: tab === t.id ? '2px solid var(--blue)' : '2px solid transparent',
                  marginBottom: '-1px',
                  display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                }}
              >
                <t.Icon size={16} strokeWidth={2} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* PRICING TAB */}
          {tab === 'pricing' && data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <SettingsCard title="Visa Prices" description="Base price for each visa type (processing surcharge is added separately).">
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.6rem 1rem', alignItems: 'center' }}>
                  {VISA_CODES.map(code => {
                    const key = `pricing.visa.${code}`;
                    const val = getValue(key);
                    const isDraft = key in drafts;
                    return (
                      <>
                        <label key={`${key}-l`} style={{ fontWeight: 500 }}>{VISA_LABELS[code]}</label>
                        <div key={`${key}-i`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ color: '#6b7280' }}>$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={val}
                            onChange={e => setDraft(key, parseFloat(e.target.value) || 0)}
                            className="settings-input"
                            style={{ width: '120px', borderColor: isDraft ? 'var(--blue)' : undefined }}
                          />
                          <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>USD</span>
                        </div>
                        <button key={`${key}-r`} onClick={() => resetKey(key)} className="settings-reset" title="Reset to default">↻</button>
                      </>
                    );
                  })}
                </div>
              </SettingsCard>

              <SettingsCard title="Processing Speed Surcharges" description="Amount added on top of the base visa price.">
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.6rem 1rem', alignItems: 'center' }}>
                  {PROCESSING_CODES.map(code => {
                    const key = `pricing.processing.${code}`;
                    const val = getValue(key);
                    const isDraft = key in drafts;
                    return (
                      <>
                        <label key={`${key}-l`} style={{ fontWeight: 500 }}>{PROCESSING_LABELS[code]}</label>
                        <div key={`${key}-i`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ color: '#6b7280' }}>+ $</span>
                          <input
                            type="number"
                            step="0.01"
                            value={val}
                            onChange={e => setDraft(key, parseFloat(e.target.value) || 0)}
                            className="settings-input"
                            style={{ width: '120px', borderColor: isDraft ? 'var(--blue)' : undefined }}
                          />
                          <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>USD</span>
                        </div>
                        <button key={`${key}-r`} onClick={() => resetKey(key)} className="settings-reset">↻</button>
                      </>
                    );
                  })}
                </div>
              </SettingsCard>

              <SettingsCard
                title="Optional Add-Ons"
                description="Flat-fee line items the customer can opt into either at checkout or later from /status. Each row applies once per order (not per traveler)."
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.6rem 1rem', alignItems: 'center' }}>
                  {(() => {
                    const key = 'pricing.addons.rejectionProtection';
                    const val = getValue(key);
                    const isDraft = key in drafts;
                    return (
                      <>
                        <label style={{ fontWeight: 500 }}>
                          Rejection Protection Plan{' '}
                          <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.85rem' }}>
                            (one-time, per order)
                          </span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ color: '#6b7280' }}>$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={val}
                            onChange={e => setDraft(key, parseFloat(e.target.value) || 0)}
                            className="settings-input"
                            style={{ width: '120px', borderColor: isDraft ? 'var(--blue)' : undefined }}
                          />
                          <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>USD / order</span>
                        </div>
                        <button onClick={() => resetKey(key)} className="settings-reset" title="Reset to default">↻</button>
                      </>
                    );
                  })()}
                </div>
                <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.75rem' }}>
                  💡 The customer sees this as an opt-in checkbox on the apply
                  / payment page, and as an opt-in card on /status if they
                  declined initially. Setting the price to <strong>$0</strong>{' '}
                  will still show the option but at no cost.
                </p>
              </SettingsCard>

              <SettingsCard
                title="Additional Fees"
                description="Layered on top of the visa + processing cost. Government fee is per traveler; transaction fee is a % of the full subtotal."
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.6rem 1rem', alignItems: 'center' }}>
                  {/* Government fee */}
                  {(() => {
                    const key = 'pricing.fees.government';
                    const val = getValue(key);
                    const isDraft = key in drafts;
                    return (
                      <>
                        <label style={{ fontWeight: 500 }}>Government fee <span style={{ color: '#6b7280', fontWeight: 400 }}>(per traveler)</span></label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ color: '#6b7280' }}>$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={val}
                            onChange={e => setDraft(key, parseFloat(e.target.value) || 0)}
                            className="settings-input"
                            style={{ width: '120px', borderColor: isDraft ? 'var(--blue)' : undefined }}
                          />
                          <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>USD / traveler</span>
                        </div>
                        <button onClick={() => resetKey(key)} className="settings-reset" title="Reset to default">↻</button>
                      </>
                    );
                  })()}

                  {/* Transaction fee */}
                  {(() => {
                    const key = 'pricing.fees.transactionPercent';
                    const val = getValue(key);
                    const isDraft = key in drafts;
                    return (
                      <>
                        <label style={{ fontWeight: 500 }}>Transaction fee <span style={{ color: '#6b7280', fontWeight: 400 }}>(% of subtotal)</span></label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={val}
                            onChange={e => setDraft(key, parseFloat(e.target.value) || 0)}
                            className="settings-input"
                            style={{ width: '120px', borderColor: isDraft ? 'var(--blue)' : undefined }}
                          />
                          <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>% of subtotal</span>
                        </div>
                        <button onClick={() => resetKey(key)} className="settings-reset" title="Reset to default">↻</button>
                      </>
                    );
                  })()}
                </div>
                <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.75rem' }}>
                  💡 <strong>Formula:</strong> Subtotal = (visa + processing + gov fee) × travelers · Total = Subtotal + (Subtotal × transaction fee %)
                </p>
              </SettingsCard>

              <SettingsCard title="Price Breakdown Preview" description="How prices combine for 1 traveler at checkout (travelers multiply linearly; transaction fee scales with subtotal).">
                <table style={{ width: '100%', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem', color: '#6b7280', fontWeight: 600 }}>Visa Type</th>
                      <th style={{ padding: '0.5rem', color: '#6b7280', fontWeight: 600, textAlign: 'right' }}>Base</th>
                      <th style={{ padding: '0.5rem', color: '#6b7280', fontWeight: 600, textAlign: 'right' }}>+ Gov</th>
                      <th style={{ padding: '0.5rem', color: '#6b7280', fontWeight: 600, textAlign: 'right' }}>Standard</th>
                      <th style={{ padding: '0.5rem', color: '#6b7280', fontWeight: 600, textAlign: 'right' }}>Rush</th>
                      <th style={{ padding: '0.5rem', color: '#6b7280', fontWeight: 600, textAlign: 'right' }}>Super Rush</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VISA_CODES.map(code => {
                      const base = Number(getValue(`pricing.visa.${code}`)) || 0;
                      const std = Number(getValue('pricing.processing.standard')) || 0;
                      const rush = Number(getValue('pricing.processing.rush')) || 0;
                      const sup = Number(getValue('pricing.processing.super')) || 0;
                      const gov = Number(getValue('pricing.fees.government')) || 0;
                      const txPct = Number(getValue('pricing.fees.transactionPercent')) || 0;
                      const withFees = (surcharge: number) => {
                        const sub = base + surcharge + gov;
                        const tx = sub * txPct / 100;
                        return sub + tx;
                      };
                      return (
                        <tr key={code} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.5rem' }}>{VISA_LABELS[code]}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>${base.toFixed(2)}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace', color: '#6b7280' }}>${(base + gov).toFixed(2)}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace', color: '#059669' }}>${withFees(std).toFixed(2)}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace', color: '#f59e0b' }}>${withFees(rush).toFixed(2)}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace', color: '#dc2626' }}>${withFees(sup).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                  Standard / Rush / Super Rush columns show the full customer-facing total including gov fee + transaction fee at each processing speed.
                </p>
              </SettingsCard>
            </div>
          )}

          {/* EMAIL TAB */}
          {tab === 'email' && data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '1rem 1.25rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.75rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e40af', marginBottom: '0.35rem' }}>📖 How this works</div>
                <ol style={{ fontSize: '0.85rem', color: '#1e3a8a', margin: 0, paddingLeft: '1.25rem', lineHeight: 1.6 }}>
                  <li><strong>Click any email below</strong> to expand it.</li>
                  <li>The <strong>Live Preview</strong> shows you exactly what customers will see (using sample data).</li>
                  <li>Edit the <strong>text fields</strong> — heading, paragraphs, button, etc. — and the preview updates as you type.</li>
                  <li>Click <strong>Save</strong> (top right) when you&apos;re happy. Nothing changes until you save.</li>
                </ol>
                <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: '#6b7280', paddingTop: '0.5rem', borderTop: '1px dashed #bfdbfe' }}>
                  💬 <strong>Variables</strong> like <code>{'{name}'}</code> or <code>{'{orderNumber}'}</code> get replaced with real data when the email is actually sent. Available: <code>{'{name}'}</code>, <code>{'{orderNumber}'}</code>, <code>{'{destination}'}</code>, <code>{'{applicationId}'}</code>, <code>{'{specialistNotes}'}</code>, <code>{'{status}'}</code>, <code>{'{visaType}'}</code>, <code>{'{total}'}</code>, <code>{'{travelers}'}</code>
                </div>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', marginTop: '0.5rem' }}>
                📥 Built-in emails
              </div>
              {templates.map(tpl => (
                <EmailTemplateCard
                  key={tpl.code}
                  tpl={tpl}
                  expanded={expandedTemplate === tpl.code}
                  onToggle={() => setExpandedTemplate(expandedTemplate === tpl.code ? null : tpl.code)}
                  data={data}
                  drafts={drafts}
                  setDraft={setDraft}
                  onReset={load}
                />
              ))}

              {/* ── Custom Emails ── */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.5rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  🎨 Custom emails ({customTemplates.length})
                </div>
                <button
                  onClick={() => { setCreatingCustom(true); setExpandedCustom(null); }}
                  style={{
                    background: 'var(--blue)', color: 'white', border: 'none',
                    padding: '0.5rem 0.9rem', borderRadius: '0.45rem',
                    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >+ Create New Email</button>
              </div>

              <div style={{ padding: '0.85rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.55rem', fontSize: '0.82rem', color: '#166534' }}>
                💡 <strong>Custom emails</strong> let you create your own templates on top of the built-in ones.
                Each custom email has a <strong>trigger</strong> that decides when it&apos;s sent — either <em>manually</em> from the order page, or <em>automatically</em> when an order reaches a specific status.
              </div>

              {creatingCustom && (
                <CustomEmailEditor
                  key="new"
                  mode="create"
                  onSave={async (form) => {
                    const res = await fetch('/api/settings/custom-emails', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ...form, country: 'INDIA' }),
                    });
                    if (!res.ok) {
                      const err = await res.json();
                      alert(err.error || 'Failed to create');
                      return false;
                    }
                    setCreatingCustom(false);
                    await load();
                    return true;
                  }}
                  onCancel={() => setCreatingCustom(false)}
                />
              )}

              {customTemplates.length === 0 && !creatingCustom && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', background: 'white', border: '1px dashed #e5e7eb', borderRadius: '0.75rem' }}>
                  No custom emails yet. Click <strong>+ Create New Email</strong> to make one.
                </div>
              )}

              {customTemplates.map(ct => (
                <CustomEmailCard
                  key={ct.id}
                  template={ct}
                  expanded={expandedCustom === ct.id}
                  onToggle={() => setExpandedCustom(expandedCustom === ct.id ? null : ct.id)}
                  onSave={async (form) => {
                    const res = await fetch(`/api/settings/custom-emails/${ct.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(form),
                    });
                    if (!res.ok) {
                      const err = await res.json();
                      alert(err.error || 'Failed to save');
                      return false;
                    }
                    await load();
                    return true;
                  }}
                  onDelete={async () => {
                    if (!confirm(`Delete "${ct.label}" permanently?`)) return;
                    await fetch(`/api/settings/custom-emails/${ct.id}`, { method: 'DELETE' });
                    await load();
                  }}
                />
              ))}
            </div>
          )}

          {/* STATUS TAB */}
          {tab === 'status' && data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <BuiltinStatusLabels
                drafts={drafts}
                data={data}
                setDraft={setDraft}
              />

              {/* Custom Statuses */}
              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', padding: '1.25rem 1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>🎨 Custom Statuses ({customStatuses.length})</h2>
                    <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.2rem' }}>Add your own order statuses beyond the built-in ones. They work everywhere — status dropdown, filters, email triggers, customer-facing pages.</p>
                  </div>
                  <button
                    onClick={() => setCreatingStatus(true)}
                    style={{
                      background: 'var(--blue)', color: 'white', border: 'none',
                      padding: '0.5rem 0.9rem', borderRadius: '0.45rem',
                      fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >+ Add Status</button>
                </div>

                {creatingStatus && (
                  <CustomStatusEditor
                    mode="create"
                    onSave={async (form) => {
                      const res = await fetch('/api/settings/custom-statuses', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...form, country: 'INDIA' }),
                      });
                      if (!res.ok) {
                        const err = await res.json();
                        alert(err.error || 'Failed to create');
                        return false;
                      }
                      setCreatingStatus(false);
                      await load();
                      return true;
                    }}
                    onCancel={() => setCreatingStatus(false)}
                  />
                )}

                {customStatuses.length === 0 && !creatingStatus && (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', border: '1px dashed #e5e7eb', borderRadius: '0.55rem' }}>
                    No custom statuses yet. Click <strong>+ Add Status</strong> to create one.
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: creatingStatus ? '0.75rem' : 0 }}>
                  {customStatuses.map(cs => (
                    <CustomStatusRow
                      key={cs.id}
                      status={cs}
                      onSave={async (form) => {
                        const res = await fetch(`/api/settings/custom-statuses/${cs.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(form),
                        });
                        if (!res.ok) {
                          const err = await res.json();
                          alert(err.error || 'Failed to save');
                          return false;
                        }
                        await load();
                        return true;
                      }}
                      onDelete={async () => {
                        if (!confirm(`Delete "${cs.label}" (${cs.code}) permanently?`)) return;
                        const res = await fetch(`/api/settings/custom-statuses/${cs.id}`, { method: 'DELETE' });
                        if (res.status === 409) {
                          const d = await res.json();
                          const confirmForce = confirm(`${d.message} Continue?`);
                          if (!confirmForce) return;
                          await fetch(`/api/settings/custom-statuses/${cs.id}?force=true`, { method: 'DELETE' });
                        }
                        await load();
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* APPLICATION TAB */}
          {tab === 'application' && (
            <ApplicationTab
              schema={appSchema}
              setSchema={setAppSchema}
              saving={appSchemaSaving}
              flash={appSchemaFlash}
              dirty={JSON.stringify(appSchema.sections) !== JSON.stringify(appSchemaSaved.sections)}
              onCancel={() => { setAppSchema(appSchemaSaved); setAppSchemaFlash(''); }}
              onSave={async () => {
                setAppSchemaSaving(true);
                setAppSchemaFlash('');
                try {
                  const res = await fetch('/api/settings/application-schema', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ country: 'INDIA', sections: appSchema.sections }),
                  });
                  if (res.ok) {
                    const d = await res.json();
                    const saved: ApplicationSchema = { country: d.country, sections: d.sections || [], updatedAt: d.updatedAt };
                    setAppSchema(saved);
                    setAppSchemaSaved(saved);
                    setAppSchemaFlash('✅ Saved!');
                    setTimeout(() => setAppSchemaFlash(''), 2500);
                  } else {
                    const d = await res.json();
                    setAppSchemaFlash(`❌ ${d.error || 'Failed'}`);
                  }
                } catch (err: any) {
                  setAppSchemaFlash(`❌ ${err?.message || 'Failed'}`);
                } finally { setAppSchemaSaving(false); }
              }}
            />
          )}

          {/* BOT TAB */}
          {tab === 'bot' && (
            <BotTab />
          )}

          {/* GENERAL TAB */}
          {tab === 'general' && data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <SettingsCard title="Site Info" description="Basic site configuration.">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <TextInput label="Support email" keyPath="general.supportEmail" getValue={getValue} setDraft={setDraft} />
                  <TextInput label="From email (for outgoing mail)" keyPath="general.fromEmail" getValue={getValue} setDraft={setDraft} />
                  <TextInput label="Site URL" keyPath="general.siteUrl" getValue={getValue} setDraft={setDraft} />
                </div>
              </SettingsCard>

              <SettingsCard title="Reminder Emails" description="Automatic reminders for unfinished applications.">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <NumberInput label="Days between reminders" keyPath="general.reminderIntervalDays" getValue={getValue} setDraft={setDraft} min={1} />
                  <NumberInput label="Max reminders per order (then auto-closes)" keyPath="general.reminderMaxCount" getValue={getValue} setDraft={setDraft} min={1} />
                </div>
              </SettingsCard>

              {/* Feature flags — site-wide toggles. Lives here in the India General
                  tab as a convenience so admins have one stop for everything; the
                  flags themselves apply globally, not just to India. */}
              <FeaturesCard />
            </div>
          )}

          <style jsx>{`
            .settings-label {
              display: block; font-size: 0.82rem; font-weight: 600; color: #374151; margin-bottom: 0.3rem;
            }
            .settings-input {
              padding: 0.5rem 0.7rem; border: 1px solid #e5e7eb; border-radius: 0.4rem;
              font-size: 0.9rem; background: white; transition: border-color 0.15s;
            }
            .settings-input:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px rgba(79,110,247,0.12); }
            .settings-reset {
              background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 1rem;
              padding: 0.25rem 0.5rem; border-radius: 0.3rem;
            }
            .settings-reset:hover { background: #f3f4f6; color: #374151; }
            .settings-reset-btn {
              background: #f3f4f6; border: 1px solid #e5e7eb; padding: 0.35rem 0.7rem;
              border-radius: 0.4rem; font-size: 0.8rem; cursor: pointer;
            }
            .settings-reset-btn:hover { background: #e5e7eb; }
          `}</style>
        </div>
      </div>
    </div>
  );
}

function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', padding: '1.25rem 1.5rem' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{title}</h2>
        {description && <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.2rem' }}>{description}</p>}
      </div>
      {children}
    </div>
  );
}

/* ── Features card ─────────────────────────────────────────────────────────
 * Self-contained feature-flag toggle list. Backed by /api/features (GET/POST)
 * and the Setting table (`features.<id>`). Was originally a standalone page
 * at /admin/features; folded in here for one-stop admin settings access. */
interface FlagRow {
  id: string;
  label: string;
  description: string;
  details: string[];
  enabled: boolean;
}

function FeaturesCard() {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  // Owner-only — employees won't see the card at all even though the GET
  // endpoint is public. The POST is owner-only on the server side anyway.
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessRes, flagsRes] = await Promise.all([
          fetch('/api/admin/session', { cache: 'no-store' }),
          fetch('/api/features', { cache: 'no-store' }),
        ]);
        if (!cancelled) {
          if (sessRes.ok) {
            const sess = await sessRes.json();
            setIsOwner(sess.role === 'owner');
          } else {
            setIsOwner(false);
          }
          if (flagsRes.ok) {
            const data = await flagsRes.json();
            setFlags(data.flags || []);
          }
        }
      } catch {} finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Render nothing for employees — keeps the General tab cleaner.
  if (isOwner === false) return null;

  const toggle = async (flag: FlagRow) => {
    if (savingId) return;
    setSavingId(flag.id);
    setError('');
    setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, enabled: !f.enabled } : f));
    try {
      const res = await fetch('/api/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: flag.id, enabled: !flag.enabled }),
      });
      if (!res.ok) {
        setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, enabled: flag.enabled } : f));
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to save.');
      }
    } catch (err: any) {
      setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, enabled: flag.enabled } : f));
      setError(err?.message || 'Failed to save.');
    } finally { setSavingId(''); }
  };

  return (
    <SettingsCard title="Features" description="Site-wide toggles for optional admin-panel features. Flipping off only hides UI — underlying data is preserved.">
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.4rem', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', color: '#991b1b', fontSize: '0.82rem' }}>⚠️ {error}</div>
      )}
      {loading ? (
        <div style={{ fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic' }}>Loading…</div>
      ) : flags.length === 0 ? (
        <div style={{ fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic' }}>No feature flags defined.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {flags.map(flag => (
            <div key={flag.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', paddingBottom: '0.85rem', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--ink)' }}>{flag.label}</span>
                  <span style={{
                    fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                    padding: '0.08rem 0.35rem', borderRadius: '0.25rem',
                    background: flag.enabled ? '#dcfce7' : '#f3f4f6',
                    color:      flag.enabled ? '#166534' : '#6b7280',
                    border: '1px solid ' + (flag.enabled ? '#86efac' : '#e5e7eb'),
                  }}>{flag.enabled ? 'On' : 'Off'}</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#475569', marginBottom: flag.details.length ? '0.5rem' : 0 }}>{flag.description}</p>
                {flag.details.length > 0 && (
                  <ul style={{ fontSize: '0.74rem', color: '#6b7280', paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {flag.details.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={flag.enabled}
                disabled={savingId === flag.id}
                onClick={() => toggle(flag)}
                title={flag.enabled ? 'Click to turn off' : 'Click to turn on'}
                style={{
                  position: 'relative', width: '44px', height: '24px',
                  background: flag.enabled ? 'var(--blue)' : '#cbd5e1',
                  border: 'none', borderRadius: '999px',
                  cursor: savingId === flag.id ? 'wait' : 'pointer',
                  opacity: savingId === flag.id ? 0.6 : 1,
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: '3px', left: flag.enabled ? '23px' : '3px',
                  width: '18px', height: '18px',
                  background: 'white', borderRadius: '999px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

function TextInput({ label, keyPath, getValue, setDraft }: { label: string; keyPath: string; getValue: (k: string) => any; setDraft: (k: string, v: any) => void }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>{label}</label>
      <input
        type="text"
        value={getValue(keyPath) ?? ''}
        onChange={e => setDraft(keyPath, e.target.value)}
        style={{ width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '0.4rem', fontSize: '0.9rem' }}
      />
    </div>
  );
}

function NumberInput({ label, keyPath, getValue, setDraft, min }: { label: string; keyPath: string; getValue: (k: string) => any; setDraft: (k: string, v: any) => void; min?: number }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>{label}</label>
      <input
        type="number"
        min={min}
        value={getValue(keyPath) ?? 0}
        onChange={e => setDraft(keyPath, parseInt(e.target.value) || 0)}
        style={{ width: '160px', padding: '0.5rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '0.4rem', fontSize: '0.9rem' }}
      />
    </div>
  );
}

// ── Email Template Card with Simple / Advanced modes ──
function EmailTemplateCard({ tpl, expanded, onToggle, data, drafts, setDraft, onReset }: {
  tpl: BuiltInTemplate;
  expanded: boolean;
  onToggle: () => void;
  data: SettingsData;
  drafts: Record<string, any>;
  setDraft: (k: string, v: any) => void;
  onReset: () => void;
}) {
  const subjKey = `email.${tpl.code}.subject`;
  const htmlKey = `email.${tpl.code}.html`;
  const structKey = `email.${tpl.code}.structured`;

  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');

  const subjOverride = drafts[subjKey] ?? data.settings[subjKey] ?? '';
  const htmlOverride = drafts[htmlKey] ?? data.settings[htmlKey] ?? '';
  const structOverride = drafts[structKey] ?? data.settings[structKey] ?? null;

  const isOverridden = !!(data.settings[subjKey] || data.settings[htmlKey] || data.settings[structKey]);

  // Effective structured data = override ?? default
  const effectiveStructured: StructuredEmail = structOverride || tpl.structuredDefault || {
    heading: tpl.label, paragraphs: [],
  };
  const effectiveSubject = subjOverride || tpl.structuredSubjectDefault || tpl.sample.subject;

  // Debounced preview refresh when in Simple mode
  useEffect(() => {
    if (!expanded || mode !== 'simple') return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/settings/email-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structured: effectiveStructured, subject: effectiveSubject }),
        });
        if (res.ok) {
          const d = await res.json();
          setPreviewHtml(d.html);
          setPreviewSubject(d.subject);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [expanded, mode, JSON.stringify(effectiveStructured), effectiveSubject]);

  const updateStruct = (patch: Partial<StructuredEmail>) => {
    setDraft(structKey, { ...effectiveStructured, ...patch });
  };

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.25rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>📧 {tpl.label}</span>
            {isOverridden && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '0.15rem 0.5rem', borderRadius: '0.3rem' }}>
                CUSTOMIZED
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>{tpl.description}</div>
          <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.15rem' }}>⏰ {tpl.trigger}</div>
        </div>
        <span style={{ fontSize: '1.2rem', color: '#9ca3af', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Mode switcher */}
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.3rem', background: '#f3f4f6', borderRadius: '0.55rem', width: 'fit-content' }}>
              <button
                onClick={() => setMode('simple')}
                style={{
                  padding: '0.5rem 1rem', border: 'none', borderRadius: '0.4rem', cursor: 'pointer',
                  fontSize: '0.9rem', fontWeight: 600,
                  background: mode === 'simple' ? 'white' : 'transparent',
                  color: mode === 'simple' ? 'var(--blue)' : '#6b7280',
                  boxShadow: mode === 'simple' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >✏️ Simple Editor</button>
              <button
                onClick={() => setMode('advanced')}
                style={{
                  padding: '0.5rem 1rem', border: 'none', borderRadius: '0.4rem', cursor: 'pointer',
                  fontSize: '0.9rem', fontWeight: 600,
                  background: mode === 'advanced' ? 'white' : 'transparent',
                  color: mode === 'advanced' ? 'var(--blue)' : '#6b7280',
                  boxShadow: mode === 'advanced' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >🧑‍💻 Advanced (HTML)</button>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.4rem' }}>
              {mode === 'simple'
                ? '✅ Recommended — edit just the text and colors. No HTML knowledge needed.'
                : '⚠️ For developers — edit raw HTML. Overrides the Simple editor.'}
            </p>
          </div>

          {/* Live preview — always shown */}
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.35rem' }}>📺 Live Preview</div>
            <div style={{ padding: '0.5rem 0.85rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.4rem 0.4rem 0 0', borderBottom: 'none', fontSize: '0.82rem' }}>
              <strong>Subject:</strong> {mode === 'advanced' ? (subjOverride || tpl.sample.subject) : (previewSubject || tpl.sample.subject)}
            </div>
            <iframe
              srcDoc={mode === 'advanced' ? (htmlOverride || tpl.sample.html) : (previewHtml || tpl.sample.html)}
              style={{ width: '100%', height: '500px', border: '1px solid #e5e7eb', borderRadius: '0 0 0.5rem 0.5rem', background: 'white' }}
              sandbox=""
              title={`Preview of ${tpl.label}`}
            />
          </div>

          {/* SIMPLE MODE */}
          {mode === 'simple' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem 1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.5rem', fontSize: '0.85rem', color: '#1e40af' }}>
                ✏️ <strong>Edit any field below — the preview above updates as you type.</strong> Variables like <code>{'{name}'}</code> and <code>{'{orderNumber}'}</code> get replaced with real values when the email is sent. Leave a field alone to keep its default.
              </div>

              <FieldBlock label="📬 Subject line" help="What appears in the email's subject bar.">
                <input
                  type="text"
                  value={effectiveSubject}
                  onChange={e => setDraft(subjKey, e.target.value)}
                  className="settings-input"
                  style={{ width: '100%' }}
                />
              </FieldBlock>

              <FieldBlock label="🎯 Main heading" help="The big bold title shown at the top of the email. Always centered.">
                <input
                  type="text"
                  value={effectiveStructured.heading || ''}
                  onChange={e => updateStruct({ heading: e.target.value })}
                  className="settings-input"
                  style={{ width: '100%', marginBottom: '0.5rem' }}
                />
                <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.3rem' }}>Heading color:</div>
                <ColorPicker
                  value={effectiveStructured.headingColor}
                  onChange={hex => updateStruct({ headingColor: hex })}
                  presets={HEADING_PRESETS}
                  defaultHex="#1E293B"
                />
              </FieldBlock>

              <FieldBlock label="📝 Subheading (optional)" help="Gray text shown directly below the heading — usually a short intro or greeting.">
                <textarea
                  value={effectiveStructured.subheading || ''}
                  onChange={e => updateStruct({ subheading: e.target.value })}
                  rows={2}
                  className="settings-input"
                  style={{ width: '100%' }}
                />
              </FieldBlock>

              <FieldBlock label="📄 Body paragraphs" help="Main message text. Each line becomes its own paragraph.">
                <textarea
                  value={(effectiveStructured.paragraphs || []).join('\n')}
                  onChange={e => updateStruct({ paragraphs: e.target.value.split('\n').filter(Boolean) })}
                  rows={4}
                  className="settings-input"
                  style={{ width: '100%' }}
                  placeholder="One paragraph per line. Press Enter to start a new paragraph."
                />
              </FieldBlock>

              {/* Card editor */}
              <FieldBlock label="📦 Info card (optional)" help="A gray box showing key/value pairs — perfect for order summaries, status badges, etc. The 'Highlight' checkbox makes a row stand out (e.g. the total).">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {(effectiveStructured.card?.rows || []).map((row, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={row.label}
                        onChange={e => {
                          const rows = [...(effectiveStructured.card?.rows || [])];
                          rows[idx] = { ...rows[idx], label: e.target.value };
                          updateStruct({ card: { ...effectiveStructured.card, rows } });
                        }}
                        placeholder="Label"
                        className="settings-input"
                        style={{ flex: 1 }}
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={e => {
                          const rows = [...(effectiveStructured.card?.rows || [])];
                          rows[idx] = { ...rows[idx], value: e.target.value };
                          updateStruct({ card: { ...effectiveStructured.card, rows } });
                        }}
                        placeholder="Value (supports {variables})"
                        className="settings-input"
                        style={{ flex: 2 }}
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', color: '#6b7280' }}>
                        <input
                          type="checkbox"
                          checked={!!row.highlight}
                          onChange={e => {
                            const rows = [...(effectiveStructured.card?.rows || [])];
                            rows[idx] = { ...rows[idx], highlight: e.target.checked };
                            updateStruct({ card: { ...effectiveStructured.card, rows } });
                          }}
                        />
                        Highlight
                      </label>
                      <button
                        onClick={() => {
                          const rows = [...(effectiveStructured.card?.rows || [])].filter((_, i) => i !== idx);
                          updateStruct({ card: rows.length > 0 ? { ...effectiveStructured.card, rows } : undefined });
                        }}
                        style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '0.35rem 0.6rem', borderRadius: '0.35rem', cursor: 'pointer', fontSize: '0.78rem' }}
                      >✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const rows = [...(effectiveStructured.card?.rows || []), { label: '', value: '' }];
                      updateStruct({ card: { ...effectiveStructured.card, rows } });
                    }}
                    style={{ alignSelf: 'flex-start', background: '#f3f4f6', border: '1px dashed #d1d5db', padding: '0.4rem 0.8rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.82rem' }}
                  >+ Add row</button>
                </div>
              </FieldBlock>

              {/* Button */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem', background: '#f9fafb' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#374151', marginBottom: '0.15rem' }}>🔘 Call-to-action button (optional)</div>
                <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 0.5rem' }}>The big colored button near the bottom. Use <code>/login</code>, <code>/contact</code>, etc. — or a full URL.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    type="text"
                    value={effectiveStructured.button?.text || ''}
                    onChange={e => updateStruct({ button: { ...(effectiveStructured.button || {}), text: e.target.value } })}
                    placeholder="Button text"
                    className="settings-input"
                  />
                  <input
                    type="text"
                    value={effectiveStructured.button?.url || ''}
                    onChange={e => updateStruct({ button: { ...(effectiveStructured.button || {}), url: e.target.value } })}
                    placeholder="Link (e.g. /login)"
                    className="settings-input"
                  />
                </div>
                <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.3rem' }}>Button color:</div>
                <ColorPicker
                  value={effectiveStructured.button?.color}
                  onChange={hex => updateStruct({ button: { ...(effectiveStructured.button || {}), color: hex } })}
                  presets={BUTTON_PRESETS}
                  defaultHex="#6C8AFF"
                />
                {effectiveStructured.button?.text && (
                  <button
                    onClick={() => updateStruct({ button: undefined })}
                    style={{ marginTop: '0.5rem', background: 'transparent', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: '0.78rem' }}
                  >✕ Remove button</button>
                )}
              </div>

              <FieldBlock label="🔽 Footnote (optional)" help="Small gray disclaimer text shown at the very bottom, below the button.">
                <textarea
                  value={effectiveStructured.footnote || ''}
                  onChange={e => updateStruct({ footnote: e.target.value })}
                  rows={2}
                  className="settings-input"
                  style={{ width: '100%' }}
                />
              </FieldBlock>

              {isOverridden && (
                <button onClick={async () => {
                  if (!confirm(`Reset "${tpl.label}" to built-in default?`)) return;
                  await fetch(`/api/settings/${encodeURIComponent(subjKey)}`, { method: 'DELETE' });
                  await fetch(`/api/settings/${encodeURIComponent(htmlKey)}`, { method: 'DELETE' });
                  await fetch(`/api/settings/${encodeURIComponent(structKey)}`, { method: 'DELETE' });
                  onReset();
                }} className="settings-reset-btn" style={{ alignSelf: 'flex-start' }}>
                  ↻ Reset to built-in default
                </button>
              )}
            </div>
          )}

          {/* ADVANCED MODE */}
          {mode === 'advanced' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem 1rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '0.4rem', fontSize: '0.82rem', color: '#92400e' }}>
                ⚠️ Advanced mode — raw HTML. Uses <code>{'{variable}'}</code> placeholders. Overrides the Simple editor when set.
              </div>
              <FieldBlock label="Subject line">
                <input
                  type="text"
                  value={subjOverride}
                  onChange={e => setDraft(subjKey, e.target.value)}
                  placeholder={tpl.sample.subject}
                  className="settings-input"
                  style={{ width: '100%' }}
                />
              </FieldBlock>
              <FieldBlock label="Full HTML body">
                <textarea
                  value={htmlOverride}
                  onChange={e => setDraft(htmlKey, e.target.value)}
                  rows={14}
                  className="settings-input"
                  style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.78rem' }}
                  placeholder="Paste your full HTML here. Leave blank to use the Simple editor or built-in default."
                />
              </FieldBlock>
              <details style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                <summary style={{ cursor: 'pointer' }}>📄 View built-in default HTML (click to copy)</summary>
                <textarea
                  readOnly
                  value={tpl.sample.html}
                  rows={14}
                  style={{ width: '100%', marginTop: '0.5rem', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.72rem', padding: '0.5rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.4rem' }}
                  onFocus={e => e.target.select()}
                />
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldBlock({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: '#374151', marginBottom: help ? '0.15rem' : '0.3rem' }}>{label}</label>
      {help && <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 0.4rem' }}>{help}</p>}
      {children}
    </div>
  );
}

/**
 * ColorPicker — color wheel (native <input type="color">) + hex text box + optional preset swatches.
 * `value` and `onChange` always work in hex (#RRGGBB). If a named legacy value comes in, it's
 * converted to hex on display.
 */
function ColorPicker({ value, onChange, presets, defaultHex = '#64748b' }: {
  value: string | null | undefined;
  onChange: (hex: string) => void;
  presets?: Array<{ name: string; hex: string }>;
  defaultHex?: string;
}) {
  const hex = toHex(value, defaultHex);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="color"
          value={hex}
          onChange={e => onChange(e.target.value)}
          title="Open color wheel"
          style={{
            width: '44px', height: '36px', padding: '2px',
            border: '1px solid #e5e7eb', borderRadius: '0.4rem',
            background: 'white', cursor: 'pointer',
          }}
        />
        <input
          type="text"
          value={hex}
          onChange={e => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
            else if (/^#?[0-9a-fA-F]{6}$/.test(v)) onChange('#' + v.replace(/^#/, ''));
            else onChange(v); // allow partial typing; validation happens on blur/save
          }}
          placeholder="#000000"
          style={{
            width: '120px', padding: '0.45rem 0.6rem',
            border: '1px solid #e5e7eb', borderRadius: '0.4rem',
            fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.85rem',
          }}
        />
        <div style={{
          flex: 1, minHeight: '36px', padding: '0.35rem 0.7rem',
          background: hex + '1A', color: hex,
          borderRadius: '0.4rem', fontSize: '0.78rem', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.02em',
          display: 'flex', alignItems: 'center', gap: '0.4rem',
        }}>
          <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: hex }}></span>
          Preview
        </div>
      </div>
      {presets && presets.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', alignSelf: 'center' }}>Quick pick:</span>
          {presets.map(p => (
            <button
              key={p.hex}
              type="button"
              onClick={() => onChange(p.hex)}
              title={p.name}
              style={{
                width: '24px', height: '24px', borderRadius: '50%',
                background: p.hex, border: hex.toLowerCase() === p.hex.toLowerCase() ? '2px solid #1f2937' : '1px solid #e5e7eb',
                cursor: 'pointer', padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Custom Email Card (existing template — displays with expand/edit/delete) ──
function CustomEmailCard({ template, expanded, onToggle, onSave, onDelete }: {
  template: CustomTemplate;
  expanded: boolean;
  onToggle: () => void;
  onSave: (form: CustomEmailForm) => Promise<boolean>;
  onDelete: () => void;
}) {
  const triggerLabel = TRIGGER_OPTIONS.find(t => t.value === template.trigger)?.label || template.trigger;
  const parsedStructured: StructuredEmail | null = (() => {
    try { return template.structured ? JSON.parse(template.structured) : null; } catch { return null; }
  })();

  const initial: CustomEmailForm = {
    label: template.label,
    code: template.code,
    description: template.description || '',
    trigger: template.trigger,
    subject: template.subject,
    structured: parsedStructured || { heading: template.label, paragraphs: [] },
    html: template.html || '',
    enabled: template.enabled,
  };

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.25rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>📧 {template.label}</span>
            {!template.enabled && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#fee2e2', color: '#991b1b', padding: '0.15rem 0.5rem', borderRadius: '0.3rem' }}>
                DISABLED
              </span>
            )}
            <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '0.15rem 0.5rem', borderRadius: '0.3rem' }}>
              CUSTOM
            </span>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>{template.description || <em style={{ color: '#9ca3af' }}>No description</em>}</div>
          <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.15rem' }}>
            ⏰ {triggerLabel} · <code style={{ fontSize: '0.72rem' }}>{template.code}</code>
          </div>
        </div>
        <span style={{ fontSize: '1.2rem', color: '#9ca3af', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 1.25rem 1.25rem' }}>
          <CustomEmailEditor
            key={template.id}
            mode="edit"
            initial={initial}
            onSave={onSave}
            onCancel={onToggle}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
}

// ── Custom Email Form shape ──
export interface CustomEmailForm {
  label: string;
  code: string;
  description: string;
  trigger: string;
  subject: string;
  structured: StructuredEmail;
  html: string;
  enabled: boolean;
}

const BLANK_FORM: CustomEmailForm = {
  label: '',
  code: '',
  description: '',
  trigger: 'manual',
  subject: '',
  structured: {
    heading: '',
    subheading: '',
    paragraphs: [],
    button: { text: '', url: '/login', color: 'blue' },
    footnote: '',
  },
  html: '',
  enabled: true,
};

// ── Custom Email Editor — create or edit form ──
function CustomEmailEditor({ mode, initial, onSave, onCancel, onDelete }: {
  mode: 'create' | 'edit';
  initial?: CustomEmailForm;
  onSave: (form: CustomEmailForm) => Promise<boolean>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<CustomEmailForm>(initial || BLANK_FORM);
  const [editorMode, setEditorMode] = useState<'simple' | 'advanced'>('simple');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [saving, setSaving] = useState(false);

  const patch = (p: Partial<CustomEmailForm>) => setForm(f => ({ ...f, ...p }));
  const patchStruct = (p: Partial<StructuredEmail>) => setForm(f => ({ ...f, structured: { ...f.structured, ...p } }));

  // Auto-generate code from label in create mode
  useEffect(() => {
    if (mode === 'create' && form.label && !form.code) {
      const code = form.label.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      patch({ code });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.label]);

  // Debounced preview update (Simple mode)
  useEffect(() => {
    if (editorMode !== 'simple') return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/settings/email-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structured: form.structured, subject: form.subject }),
        });
        if (res.ok) {
          const d = await res.json();
          setPreviewHtml(d.html);
          setPreviewSubject(d.subject);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [editorMode, JSON.stringify(form.structured), form.subject]);

  const canSave = form.label.trim() && form.subject.trim() && (editorMode === 'advanced' ? form.html.trim() : form.structured.heading.trim());

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const ok = await onSave(form);
      if (ok && mode === 'create') {
        setForm(BLANK_FORM);
      }
    } finally { setSaving(false); }
  };

  return (
    <div style={{
      background: mode === 'create' ? '#fafbff' : 'transparent',
      border: mode === 'create' ? '2px solid var(--blue)' : 'none',
      borderRadius: '0.85rem',
      padding: mode === 'create' ? '1.25rem' : '0',
      display: 'flex', flexDirection: 'column', gap: '1rem',
    }}>
      {mode === 'create' && (
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>✨ New Custom Email</h3>
      )}

      {/* Meta fields — always visible */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <FieldBlock label="📌 Name" help="Shown in the admin panel — pick something descriptive.">
          <input
            type="text"
            value={form.label}
            onChange={e => patch({ label: e.target.value })}
            placeholder="e.g. Document upload reminder"
            className="settings-input"
            style={{ width: '100%' }}
          />
        </FieldBlock>
        <FieldBlock label="🔖 Code" help="Auto-generated from name. Used internally.">
          <input
            type="text"
            value={form.code}
            onChange={e => patch({ code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
            placeholder="doc-upload-reminder"
            className="settings-input"
            style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, monospace' }}
            disabled={mode === 'edit'}
          />
        </FieldBlock>
      </div>

      <FieldBlock label="🗒️ Description (optional)" help="Shown in the admin panel so you remember what this email is for.">
        <input
          type="text"
          value={form.description}
          onChange={e => patch({ description: e.target.value })}
          placeholder="e.g. Reminds customer to upload passport scan"
          className="settings-input"
          style={{ width: '100%' }}
        />
      </FieldBlock>

      <FieldBlock label="⏰ When is this email sent? (Trigger)" help="Manual = you pick it from the order page. Status triggers = sent automatically when an order reaches that status.">
        <select
          value={form.trigger}
          onChange={e => patch({ trigger: e.target.value })}
          className="settings-input"
          style={{ width: '100%' }}
        >
          {TRIGGER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0.4rem 0 0' }}>
          {TRIGGER_OPTIONS.find(o => o.value === form.trigger)?.description}
        </p>
      </FieldBlock>

      <FieldBlock label="✅ Enabled">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={e => patch({ enabled: e.target.checked })}
          />
          <span>{form.enabled ? 'Active — will be sent based on trigger' : 'Disabled — will not be sent'}</span>
        </label>
      </FieldBlock>

      <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0.25rem 0' }} />

      {/* Editor mode switcher */}
      <div>
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.3rem', background: '#f3f4f6', borderRadius: '0.55rem', width: 'fit-content' }}>
          <button
            onClick={() => setEditorMode('simple')}
            style={{
              padding: '0.5rem 1rem', border: 'none', borderRadius: '0.4rem', cursor: 'pointer',
              fontSize: '0.9rem', fontWeight: 600,
              background: editorMode === 'simple' ? 'white' : 'transparent',
              color: editorMode === 'simple' ? 'var(--blue)' : '#6b7280',
              boxShadow: editorMode === 'simple' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >✏️ Simple Editor</button>
          <button
            onClick={() => setEditorMode('advanced')}
            style={{
              padding: '0.5rem 1rem', border: 'none', borderRadius: '0.4rem', cursor: 'pointer',
              fontSize: '0.9rem', fontWeight: 600,
              background: editorMode === 'advanced' ? 'white' : 'transparent',
              color: editorMode === 'advanced' ? 'var(--blue)' : '#6b7280',
              boxShadow: editorMode === 'advanced' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >🧑‍💻 Advanced (HTML)</button>
        </div>
      </div>

      {/* Live preview */}
      <div>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.35rem' }}>📺 Live Preview</div>
        <div style={{ padding: '0.5rem 0.85rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.4rem 0.4rem 0 0', borderBottom: 'none', fontSize: '0.82rem' }}>
          <strong>Subject:</strong> {editorMode === 'advanced' ? (form.subject || '(no subject yet)') : (previewSubject || form.subject || '(no subject yet)')}
        </div>
        <iframe
          srcDoc={editorMode === 'advanced' ? (form.html || '<p style="padding:2rem;color:#9ca3af;text-align:center;">Enter HTML in the field below to see a preview.</p>') : (previewHtml || '<p style="padding:2rem;color:#9ca3af;text-align:center;">Fill in the heading and subject to see a preview.</p>')}
          style={{ width: '100%', height: '500px', border: '1px solid #e5e7eb', borderRadius: '0 0 0.5rem 0.5rem', background: 'white' }}
          sandbox=""
          title="Custom email preview"
        />
      </div>

      {/* SIMPLE MODE */}
      {editorMode === 'simple' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <FieldBlock label="📬 Subject line" help="What appears in the email's subject bar. Supports {variables}.">
            <input
              type="text"
              value={form.subject}
              onChange={e => patch({ subject: e.target.value })}
              placeholder="e.g. Action Required — Order #{orderNumber}"
              className="settings-input"
              style={{ width: '100%' }}
            />
          </FieldBlock>

          <FieldBlock label="🎯 Main heading" help="The big bold title shown at the top of the email. Always centered.">
            <input
              type="text"
              value={form.structured.heading || ''}
              onChange={e => patchStruct({ heading: e.target.value })}
              className="settings-input"
              style={{ width: '100%', marginBottom: '0.5rem' }}
            />
            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.3rem' }}>Heading color:</div>
            <ColorPicker
              value={form.structured.headingColor}
              onChange={hex => patchStruct({ headingColor: hex })}
              presets={HEADING_PRESETS}
              defaultHex="#1E293B"
            />
          </FieldBlock>

          <FieldBlock label="📝 Subheading (optional)" help="Gray text shown directly below the heading.">
            <textarea
              value={form.structured.subheading || ''}
              onChange={e => patchStruct({ subheading: e.target.value })}
              rows={2}
              className="settings-input"
              style={{ width: '100%' }}
            />
          </FieldBlock>

          <FieldBlock label="📄 Body paragraphs" help="Main message text. Each line becomes its own paragraph.">
            <textarea
              value={(form.structured.paragraphs || []).join('\n')}
              onChange={e => patchStruct({ paragraphs: e.target.value.split('\n').filter(Boolean) })}
              rows={4}
              className="settings-input"
              style={{ width: '100%' }}
              placeholder="One paragraph per line."
            />
          </FieldBlock>

          <FieldBlock label="📦 Info card rows (optional)" help="Gray box showing key/value pairs.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {(form.structured.card?.rows || []).map((row, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={row.label}
                    onChange={e => {
                      const rows = [...(form.structured.card?.rows || [])];
                      rows[idx] = { ...rows[idx], label: e.target.value };
                      patchStruct({ card: { ...form.structured.card, rows } });
                    }}
                    placeholder="Label"
                    className="settings-input"
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={e => {
                      const rows = [...(form.structured.card?.rows || [])];
                      rows[idx] = { ...rows[idx], value: e.target.value };
                      patchStruct({ card: { ...form.structured.card, rows } });
                    }}
                    placeholder="Value"
                    className="settings-input"
                    style={{ flex: 2 }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', color: '#6b7280' }}>
                    <input
                      type="checkbox"
                      checked={!!row.highlight}
                      onChange={e => {
                        const rows = [...(form.structured.card?.rows || [])];
                        rows[idx] = { ...rows[idx], highlight: e.target.checked };
                        patchStruct({ card: { ...form.structured.card, rows } });
                      }}
                    />
                    Highlight
                  </label>
                  <button
                    onClick={() => {
                      const rows = [...(form.structured.card?.rows || [])].filter((_, i) => i !== idx);
                      patchStruct({ card: rows.length > 0 ? { ...form.structured.card, rows } : undefined });
                    }}
                    style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '0.35rem 0.6rem', borderRadius: '0.35rem', cursor: 'pointer', fontSize: '0.78rem' }}
                  >✕</button>
                </div>
              ))}
              <button
                onClick={() => {
                  const rows = [...(form.structured.card?.rows || []), { label: '', value: '' }];
                  patchStruct({ card: { ...form.structured.card, rows } });
                }}
                style={{ alignSelf: 'flex-start', background: '#f3f4f6', border: '1px dashed #d1d5db', padding: '0.4rem 0.8rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.82rem' }}
              >+ Add row</button>
            </div>
          </FieldBlock>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem', background: '#f9fafb' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#374151', marginBottom: '0.15rem' }}>🔘 Call-to-action button (optional)</div>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 0.5rem' }}>The big colored button near the bottom.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="text"
                value={form.structured.button?.text || ''}
                onChange={e => patchStruct({ button: { ...(form.structured.button || {}), text: e.target.value } })}
                placeholder="Button text"
                className="settings-input"
              />
              <input
                type="text"
                value={form.structured.button?.url || ''}
                onChange={e => patchStruct({ button: { ...(form.structured.button || {}), url: e.target.value } })}
                placeholder="Link (e.g. /login)"
                className="settings-input"
              />
            </div>
            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.3rem' }}>Button color:</div>
            <ColorPicker
              value={form.structured.button?.color}
              onChange={hex => patchStruct({ button: { ...(form.structured.button || {}), color: hex } })}
              presets={BUTTON_PRESETS}
              defaultHex="#6C8AFF"
            />
            {form.structured.button?.text && (
              <button
                onClick={() => patchStruct({ button: undefined })}
                style={{ marginTop: '0.5rem', background: 'transparent', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: '0.78rem' }}
              >✕ Remove button</button>
            )}
          </div>

          <FieldBlock label="🔽 Footnote (optional)" help="Small gray disclaimer text shown at the very bottom.">
            <textarea
              value={form.structured.footnote || ''}
              onChange={e => patchStruct({ footnote: e.target.value })}
              rows={2}
              className="settings-input"
              style={{ width: '100%' }}
            />
          </FieldBlock>
        </div>
      )}

      {/* ADVANCED MODE */}
      {editorMode === 'advanced' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ padding: '0.75rem 1rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '0.4rem', fontSize: '0.82rem', color: '#92400e' }}>
            ⚠️ Advanced mode — raw HTML. Uses <code>{'{variable}'}</code> placeholders. Overrides the Simple editor.
          </div>
          <FieldBlock label="Subject line">
            <input
              type="text"
              value={form.subject}
              onChange={e => patch({ subject: e.target.value })}
              className="settings-input"
              style={{ width: '100%' }}
            />
          </FieldBlock>
          <FieldBlock label="Full HTML body">
            <textarea
              value={form.html}
              onChange={e => patch({ html: e.target.value })}
              rows={14}
              className="settings-input"
              style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.78rem' }}
              placeholder="Paste your full HTML here."
            />
          </FieldBlock>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
        <div>
          {mode === 'edit' && onDelete && (
            <button
              onClick={onDelete}
              style={{
                background: 'white', color: '#dc2626', border: '1px solid #fca5a5',
                padding: '0.5rem 0.9rem', borderRadius: '0.45rem',
                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              }}
            >🗑️ Delete</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={onCancel}
            style={{
              background: 'white', color: '#374151', border: '1px solid #e5e7eb',
              padding: '0.55rem 1rem', borderRadius: '0.45rem',
              fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              background: canSave ? 'var(--blue)' : '#e5e7eb',
              color: canSave ? 'white' : '#9ca3af',
              border: 'none',
              padding: '0.55rem 1.1rem', borderRadius: '0.45rem',
              fontSize: '0.88rem', fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          ><span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            {!saving && (mode === 'create' ? <Plus size={14} strokeWidth={2.25} /> : <Save size={14} strokeWidth={2.25} />)}
            <span>{saving ? 'Saving…' : mode === 'create' ? 'Create Email' : 'Save Changes'}</span>
          </span></button>
        </div>
      </div>
    </div>
  );
}

// ── Custom Status Row (display + inline edit) ──
/**
 * Built-in status labels — mirrored UX of CustomStatusRow but operates on
 * the drafts settings (`status.labels` / `status.colors` / `status.descriptions`
 * / `status.deleted`) instead of the custom_statuses table.
 *
 * Each built-in status code (UNFINISHED, PROCESSING, …) renders as a row
 * with Edit + Delete buttons. Delete writes the code to `status.deleted`
 * which the useCustomStatuses provider reads and filters from the rendered
 * UI everywhere.
 */
function BuiltinStatusLabels({
  drafts, data, setDraft,
}: {
  drafts: Record<string, any>;
  data: { settings: Record<string, any>; defaults: Record<string, any> };
  setDraft: (key: string, value: any) => void;
}) {
  const [editingCode, setEditingCode] = useState<string | null>(null);

  // Effective values for each setting (drafts override stored override defaults).
  const labels       = drafts['status.labels']       ?? data.settings['status.labels']       ?? data.defaults['status.labels']       ?? {};
  const colors       = drafts['status.colors']       ?? data.settings['status.colors']       ?? data.defaults['status.colors']       ?? {};
  const descriptions = drafts['status.descriptions'] ?? data.settings['status.descriptions'] ?? data.defaults['status.descriptions'] ?? {};
  const deleted      = drafts['status.deleted']      ?? data.settings['status.deleted']      ?? data.defaults['status.deleted']      ?? [];

  const visibleCodes = STATUS_CODES.filter(c => !deleted.includes(c));
  const deletedCount = STATUS_CODES.length - visibleCodes.length;

  const handleEditSave = (code: string, form: { label: string; color: string; description: string }) => {
    setDraft('status.labels',       { ...labels,       [code]: form.label });
    setDraft('status.colors',       { ...colors,       [code]: form.color });
    setDraft('status.descriptions', { ...descriptions, [code]: form.description });
    setEditingCode(null);
  };

  const handleDelete = (code: string) => {
    if (!confirm(`Delete the built-in status "${labels[code] || code}"?\n\nThis hides it from the admin filter tabs, status dropdowns, and customer pages. Existing orders that already use this status keep their value but render with a fallback label. You can restore it from the Settings table if you change your mind.`)) return;
    setDraft('status.deleted', [...deleted, code]);
    if (editingCode === code) setEditingCode(null);
  };

  const handleRestoreAll = () => {
    if (!confirm('Restore all deleted built-in statuses?')) return;
    setDraft('status.deleted', []);
  };

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', padding: '1.25rem 1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>🏷️ Built-in Status Labels ({visibleCodes.length})</h2>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.2rem' }}>
            Edit how each built-in status appears, or delete the ones you don&apos;t use. Deleted statuses still render on existing orders that already have them — they just stop appearing in dropdowns + filters.
          </p>
        </div>
        {deletedCount > 0 && (
          <button
            onClick={handleRestoreAll}
            style={{
              background: 'white', color: '#374151',
              border: '1px solid #e5e7eb', padding: '0.4rem 0.8rem',
              borderRadius: '0.4rem', fontSize: '0.82rem', fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
            title={`Restore ${deletedCount} deleted built-in${deletedCount === 1 ? '' : 's'}`}
          >↺ Restore deleted ({deletedCount})</button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {visibleCodes.map(code => {
          if (editingCode === code) {
            return (
              <BuiltinStatusEditor
                key={code}
                code={code}
                initial={{
                  label:       labels[code]       ?? code,
                  color:       colors[code]       ?? '#6c8aff',
                  description: descriptions[code] ?? '',
                }}
                onSave={form => handleEditSave(code, form)}
                onCancel={() => setEditingCode(null)}
                onDelete={() => handleDelete(code)}
              />
            );
          }

          const label = labels[code] ?? code;
          const color = colors[code] ?? '#6c8aff';
          const description = descriptions[code] ?? '';
          const chipStyle = statusChipStyle(color);

          return (
            <div key={code} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.75rem 1rem', background: '#fffbeb',
              border: '1px solid #fde68a', borderRadius: '0.55rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                <span style={{
                  display: 'inline-block', padding: '0.25rem 0.7rem', borderRadius: '0.3rem',
                  background: chipStyle.background, color: chipStyle.color,
                  fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                }}>● {label}</span>
                <code style={{ fontSize: '0.75rem', color: '#6b7280' }}>{code}</code>
                <span title="Built-in" style={{ background: '#fef3c7', color: '#92400e', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', fontWeight: 700, fontSize: '0.65rem' }}>BUILT-IN</span>
                {description && (
                  <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>— {description}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  onClick={() => setEditingCode(code)}
                  style={{ background: 'white', color: '#374151', border: '1px solid #e5e7eb', padding: '0.35rem 0.7rem', borderRadius: '0.35rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                >✏️ Edit</button>
                <button
                  onClick={() => handleDelete(code)}
                  style={{ background: 'white', color: '#dc2626', border: '1px solid #fca5a5', padding: '0.35rem 0.7rem', borderRadius: '0.35rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                >🗑️</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Inline editor for a single built-in status — label / color / description. */
function BuiltinStatusEditor({
  code, initial, onSave, onCancel, onDelete,
}: {
  code: string;
  initial: { label: string; color: string; description: string };
  onSave: (form: { label: string; color: string; description: string }) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState(initial);

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.55rem', padding: '1rem 1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <code style={{ fontSize: '0.78rem', color: '#92400e', background: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: '0.25rem', fontWeight: 700 }}>{code}</code>
        <span style={{ fontSize: '0.78rem', color: '#92400e' }}>built-in — code is locked</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem 1rem' }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.25rem' }}>Label</label>
          <input
            type="text"
            value={form.label}
            onChange={e => setForm({ ...form, label: e.target.value })}
            className="settings-input"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.25rem' }}>Color</label>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input
              type="color"
              value={form.color}
              onChange={e => setForm({ ...form, color: e.target.value })}
              style={{ width: '2.5rem', height: '2rem', border: '1px solid #e5e7eb', borderRadius: '0.3rem', cursor: 'pointer', padding: 0 }}
            />
            <input
              type="text"
              value={form.color}
              onChange={e => setForm({ ...form, color: e.target.value })}
              className="settings-input"
              style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.85rem' }}
              placeholder="#6c8aff"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
            {STATUS_PRESETS.map(p => (
              <button
                key={p.name}
                onClick={() => setForm({ ...form, color: p.hex })}
                title={p.name}
                style={{
                  width: '1.25rem', height: '1.25rem', borderRadius: '0.25rem',
                  background: p.hex, border: form.color.toLowerCase() === p.hex.toLowerCase() ? '2px solid #1f2937' : '1px solid #e5e7eb',
                  cursor: 'pointer', padding: 0,
                }}
              />
            ))}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.25rem' }}>Description (optional)</label>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="settings-input"
            style={{ width: '100%' }}
            placeholder="Shown as a tooltip + on customer status page"
          />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
        <button
          onClick={onDelete}
          style={{ background: 'white', color: '#dc2626', border: '1px solid #fca5a5', padding: '0.45rem 0.9rem', borderRadius: '0.4rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
        >🗑️ Delete</button>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={onCancel}
            style={{ background: 'white', color: '#374151', border: '1px solid #e5e7eb', padding: '0.45rem 0.9rem', borderRadius: '0.4rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
          >Cancel</button>
          <button
            onClick={() => onSave(form)}
            style={{ background: 'var(--blue)', color: 'white', border: 'none', padding: '0.45rem 0.95rem', borderRadius: '0.4rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
          >Save</button>
        </div>
      </div>
    </div>
  );
}

function CustomStatusRow({ status, onSave, onDelete }: {
  status: CustomStatus;
  onSave: (form: { label: string; color: string; description: string; sortOrder: number }) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const chipStyle = statusChipStyle(status.color);

  if (editing) {
    return (
      <CustomStatusEditor
        mode="edit"
        initial={{ code: status.code, label: status.label, color: status.color, description: status.description || '', sortOrder: status.sortOrder }}
        onSave={async (form) => {
          const ok = await onSave(form);
          if (ok) setEditing(false);
          return ok;
        }}
        onCancel={() => setEditing(false)}
        onDelete={onDelete}
      />
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.75rem 1rem', background: '#f9fafb',
      border: '1px solid #e5e7eb', borderRadius: '0.55rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
        <span style={{
          display: 'inline-block', padding: '0.25rem 0.7rem', borderRadius: '0.3rem',
          background: chipStyle.background, color: chipStyle.color,
          fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.02em',
        }}>
          ● {status.label}
        </span>
        <code style={{ fontSize: '0.75rem', color: '#6b7280' }}>{status.code}</code>
        {status.description && (
          <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>— {status.description}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button
          onClick={() => setEditing(true)}
          style={{ background: 'white', color: '#374151', border: '1px solid #e5e7eb', padding: '0.35rem 0.7rem', borderRadius: '0.35rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
        >✏️ Edit</button>
        <button
          onClick={onDelete}
          style={{ background: 'white', color: '#dc2626', border: '1px solid #fca5a5', padding: '0.35rem 0.7rem', borderRadius: '0.35rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
        >🗑️</button>
      </div>
    </div>
  );
}

// ── Custom Status Editor (create/edit form) ──
interface CustomStatusForm {
  code: string;
  label: string;
  color: string;
  description: string;
  sortOrder: number;
}

function CustomStatusEditor({ mode, initial, onSave, onCancel, onDelete }: {
  mode: 'create' | 'edit';
  initial?: CustomStatusForm;
  onSave: (form: CustomStatusForm) => Promise<boolean>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<CustomStatusForm>(initial || {
    code: '', label: '', color: '#64748b', description: '', sortOrder: 50,
  });
  const [saving, setSaving] = useState(false);

  // Auto-generate code from label in create mode
  useEffect(() => {
    if (mode === 'create' && form.label && !initial?.code) {
      const code = form.label.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
      if (code !== form.code) setForm(f => ({ ...f, code }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.label]);

  const canSave = form.code.trim() && form.label.trim();
  const previewChipStyle = statusChipStyle(form.color);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  return (
    <div style={{
      background: mode === 'create' ? '#fafbff' : 'white',
      border: '2px solid var(--blue)',
      borderRadius: '0.65rem',
      padding: '1rem 1.15rem',
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      {mode === 'create' && (
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>✨ New Custom Status</h3>
      )}

      {/* Preview */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#6b7280' }}>
        <span>Preview:</span>
        <span style={{
          display: 'inline-block', padding: '0.25rem 0.7rem', borderRadius: '0.3rem',
          background: previewChipStyle.background, color: previewChipStyle.color,
          fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em',
        }}>● {form.label || '(no label)'}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
        <FieldBlock label="📌 Label" help="Display name shown in the admin panel.">
          <input
            type="text"
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Awaiting Documents"
            className="settings-input"
            style={{ width: '100%' }}
          />
        </FieldBlock>
        <FieldBlock label="🔖 Code" help={mode === 'edit' ? 'Cannot be changed after creation.' : 'Auto-generated from label. Saved on orders.'}>
          <input
            type="text"
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))}
            placeholder="AWAITING_DOCS"
            className="settings-input"
            style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, monospace' }}
            disabled={mode === 'edit'}
          />
        </FieldBlock>
      </div>

      <FieldBlock label="🎨 Color" help="Pick any color — use the color wheel, type a hex code, or use a quick-pick swatch.">
        <ColorPicker
          value={form.color}
          onChange={hex => setForm(f => ({ ...f, color: hex }))}
          presets={STATUS_PRESETS}
        />
      </FieldBlock>

      <FieldBlock label="🗒️ Description (optional)" help="Shown in the settings panel for reference — not shown to customers.">
        <input
          type="text"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="e.g. Waiting for customer to upload passport scan"
          className="settings-input"
          style={{ width: '100%' }}
        />
      </FieldBlock>

      <FieldBlock label="🔢 Sort order" help="Lower numbers appear first in stat cards and dropdowns. Built-in statuses use 0-7; pick 10+ to place after them.">
        <input
          type="number"
          value={form.sortOrder}
          onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
          className="settings-input"
          style={{ width: '120px' }}
        />
      </FieldBlock>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
        <div>
          {mode === 'edit' && onDelete && (
            <button
              onClick={onDelete}
              style={{
                background: 'white', color: '#dc2626', border: '1px solid #fca5a5',
                padding: '0.45rem 0.85rem', borderRadius: '0.4rem',
                fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
              }}
            >🗑️ Delete</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={onCancel}
            style={{
              background: 'white', color: '#374151', border: '1px solid #e5e7eb',
              padding: '0.5rem 0.95rem', borderRadius: '0.4rem',
              fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              background: canSave ? 'var(--blue)' : '#e5e7eb',
              color: canSave ? 'white' : '#9ca3af',
              border: 'none',
              padding: '0.5rem 1rem', borderRadius: '0.4rem',
              fontSize: '0.85rem', fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          ><span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            {!saving && (mode === 'create' ? <Plus size={14} strokeWidth={2.25} /> : <Save size={14} strokeWidth={2.25} />)}
            <span>{saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}</span>
          </span></button>
        </div>
      </div>
    </div>
  );
}


// ── Application Schema Editor ───────────────────────────────────────────
//
// Supports BOTH built-in and custom sections in a unified list.
// Built-in sections/fields are wired into the Playwright bot + gov submission,
// so they're guarded:
//   - Cannot be deleted
//   - Cannot change `key` or `type`
//   - CAN change label, required, hidden, placeholder, helpText, bot mapping
//   - CAN reorder within their section
//   - CAN have new custom fields added to them

function ApplicationTab({ schema, setSchema, saving, flash, dirty, onSave, onCancel }: {
  schema: ApplicationSchema;
  setSchema: (s: ApplicationSchema) => void;
  saving: boolean;
  flash: string;
  /** True when local edits diverge from the last saved snapshot. */
  dirty: boolean;
  onSave: () => Promise<void> | void;
  /** Revert all unsaved edits to the last saved snapshot. */
  onCancel: () => void;
}) {
  const sections = schema.sections || [];
  const builtInCount = sections.filter(s => s.builtIn).length;
  const customCount = sections.length - builtInCount;
  const [pageFilter, setPageFilter] = useState<'all' | 'apply' | 'finish'>('all');

  const sectionPages = (s: CustomSection): ('apply' | 'finish')[] =>
    (s.pages && s.pages.length > 0) ? s.pages : ['finish'];
  const matchesFilter = (s: CustomSection) =>
    pageFilter === 'all' || sectionPages(s).includes(pageFilter);

  const applyCount  = sections.filter(s => sectionPages(s).includes('apply')).length;
  const finishCount = sections.filter(s => sectionPages(s).includes('finish')).length;

  const updateSection = (idx: number, patch: Partial<CustomSection>) => {
    const next = sections.map((s, i) => i === idx ? { ...s, ...patch } : s);
    setSchema({ ...schema, sections: next });
  };
  const removeSection = (idx: number) => {
    const s = sections[idx];
    const isBuiltIn = !!s.builtIn;
    const msg = isBuiltIn
      ? `Delete the built-in section "${s.title}"?\n\nThis removes ${s.fields.length} field${s.fields.length === 1 ? '' : 's'} from the customer apply/finish forms and the admin detail view. The bot will skip them at runtime (or fall back to hardcoded values). You can restore defaults from the database if you change your mind.`
      : `Remove section "${s.title}"? Custom field values in submitted orders will remain stored but won't render.`;
    if (!confirm(msg)) return;
    // For built-ins, persist a tombstone so mergeWithDefaults doesn't reinject
    // the section on next load. Custom sections just disappear from the array.
    const nextSchema: ApplicationSchema = {
      ...schema,
      sections: sections.filter((_, i) => i !== idx),
      ...(isBuiltIn ? {
        deletedBuiltIns: Array.from(new Set([...(schema.deletedBuiltIns ?? []), s.key])),
      } : {}),
    };
    setSchema(nextSchema);
  };
  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[idx], next[target]] = [next[target], next[idx]];
    setSchema({ ...schema, sections: next });
  };
  const addSection = () => {
    const existingKeys = new Set(sections.map(s => s.key));
    let k = `section_${sections.length + 1}`;
    let i = sections.length + 1;
    while (existingKeys.has(k)) { i++; k = `section_${i}`; }
    setSchema({
      ...schema,
      sections: [...sections, { key: k, title: '', emoji: '', description: '', fields: [], builtIn: false }],
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header + save bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>📋 Application Schema — India</h2>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.2rem', maxWidth: '720px' }}>
            Controls every section and field on the customer&apos;s apply + finish pages and the admin order view.
            Built-in fields <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.05rem 0.35rem', borderRadius: '0.25rem', fontWeight: 700, fontSize: '0.72rem' }}>BUILT-IN</span> are wired into the Playwright bot and gov submission. You can rename, hide, reorder, delete them, and map them to the bot. The internal key and type stay locked because the bot reads them by key — changing those would silently break submissions.
          </p>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.3rem' }}>
            {builtInCount} built-in · {customCount} custom · {applyCount} on apply · {finishCount} on finish
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
          {flash && <span style={{ fontSize: '0.85rem', fontWeight: 600, color: flash.startsWith('✅') ? '#059669' : '#dc2626' }}>{flash}</span>}
          {dirty && (
            <button
              onClick={onCancel}
              disabled={saving}
              style={{
                background: 'white',
                color: '#374151',
                border: '1px solid #e5e7eb',
                padding: '0.55rem 0.95rem', borderRadius: '0.5rem',
                fontSize: '0.88rem', fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >Cancel</button>
          )}
          <button
            onClick={onSave}
            disabled={saving || !dirty}
            style={{
              background: dirty ? 'var(--blue)' : '#e5e7eb',
              color: dirty ? 'white' : '#9ca3af',
              border: 'none',
              padding: '0.55rem 1.1rem', borderRadius: '0.5rem',
              fontSize: '0.88rem', fontWeight: 700,
              cursor: saving ? 'wait' : dirty ? 'pointer' : 'not-allowed',
            }}
          ><span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            {dirty && !saving && <Save size={14} strokeWidth={2.25} />}
            <span>{saving ? 'Saving…' : dirty ? 'Save Schema' : 'Saved'}</span>
          </span></button>
        </div>
      </div>

      {/* Page filter chips */}
      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, marginRight: '0.2rem' }}>Show:</span>
        {([
          { id: 'all',    label: 'All',    count: sections.length },
          { id: 'apply',  label: 'Apply page',  count: applyCount },
          { id: 'finish', label: 'Finish page', count: finishCount },
        ] as const).map(chip => (
          <button
            key={chip.id}
            onClick={() => setPageFilter(chip.id)}
            style={{
              background: pageFilter === chip.id ? 'var(--blue)' : 'white',
              color: pageFilter === chip.id ? 'white' : '#374151',
              border: '1px solid ' + (pageFilter === chip.id ? 'var(--blue)' : '#e5e7eb'),
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            }}
          >{chip.label} <span style={{ opacity: 0.7, fontWeight: 500 }}>({chip.count})</span></button>
        ))}
      </div>

      {/* Sections list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {sections.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', background: 'white', border: '1px dashed #e5e7eb', borderRadius: '0.75rem' }}>
            No sections yet. Built-in sections should auto-load — try refreshing.
          </div>
        )}
        {sections.length > 0 && sections.every(s => !matchesFilter(s)) && (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', background: 'white', border: '1px dashed #e5e7eb', borderRadius: '0.75rem' }}>
            No sections match the current filter.
          </div>
        )}
        {sections.map((section, i) => {
          if (!matchesFilter(section)) return null;
          return (
            <SectionEditor
              key={section.key}
              section={section}
              first={i === 0}
              last={i === sections.length - 1}
              onChange={patch => updateSection(i, patch)}
              onRemove={() => removeSection(i)}
              onMoveUp={() => moveSection(i, -1)}
              onMoveDown={() => moveSection(i, 1)}
              onTombstone={(key) => setSchema({
                ...schema,
                deletedBuiltIns: Array.from(new Set([...(schema.deletedBuiltIns ?? []), key])),
              })}
            />
          );
        })}
        <button
          onClick={addSection}
          style={{
            alignSelf: 'flex-start', background: 'var(--blue)',
            color: 'white', border: 'none',
            padding: '0.6rem 1rem', borderRadius: '0.5rem',
            fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
          }}
        >+ Add Custom Section</button>
      </div>

      {schema.updatedAt && (
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
          Last saved: {new Date(schema.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function SectionEditor({ section, first, last, onChange, onRemove, onMoveUp, onMoveDown, onTombstone }: {
  section: CustomSection;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<CustomSection>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Record a built-in tombstone (e.g. "personal.firstName") so the merge
   *  doesn't reinject the deleted entry on next load. */
  onTombstone: (key: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(section.builtIn ? true : false);
  const addField = () => {
    const existingKeys = new Set(section.fields.map(f => f.key));
    let k = `field_${section.fields.length + 1}`;
    let i = section.fields.length + 1;
    while (existingKeys.has(k)) { i++; k = `field_${i}`; }
    onChange({ fields: [...section.fields, { key: k, label: '', type: 'text', required: false, builtIn: false }] });
  };
  const updateField = (idx: number, patch: Partial<CustomField>) => {
    onChange({ fields: section.fields.map((f, i) => i === idx ? { ...f, ...patch } : f) });
  };
  const removeField = (idx: number) => {
    const f = section.fields[idx];
    const isBuiltIn = !!f.builtIn;
    const msg = isBuiltIn
      ? `Delete the built-in field "${f.label || f.key}"?\n\nThis removes it from the customer apply/finish forms. The bot will skip it (or fall back to a hardcoded value mapped in the Bot tab).`
      : `Remove field "${f.label || f.key}"?`;
    if (!confirm(msg)) return;
    if (isBuiltIn) onTombstone(`${section.key}.${f.key}`);
    onChange({ fields: section.fields.filter((_, i) => i !== idx) });
  };
  const moveField = (idx: number, dir: -1 | 1) => {
    const t = idx + dir;
    if (t < 0 || t >= section.fields.length) return;
    const next = [...section.fields];
    [next[idx], next[t]] = [next[t], next[idx]];
    onChange({ fields: next });
  };

  const builtInFieldCount = section.fields.filter(f => f.builtIn).length;
  const customFieldCount = section.fields.length - builtInFieldCount;

  return (
    <div style={{
      background: 'white',
      border: '1px solid ' + (section.builtIn ? '#e5e7eb' : '#bfdbfe'),
      borderRadius: '0.75rem',
      padding: '1rem 1.15rem',
      opacity: section.hidden ? 0.6 : 1,
    }}>
      {/* Section header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 60px 1fr auto', gap: '0.5rem', alignItems: 'flex-start' }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0.4rem', marginTop: '0.2rem' }}
        >{collapsed ? '▸' : '▾'}</button>
        <IconPickerButton
          value={section.icon}
          emojiFallback={section.emoji}
          onChange={iconName => onChange({ icon: iconName, emoji: iconName ? undefined : section.emoji })}
        />
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.2rem' }}>
            <input
              type="text"
              value={section.title}
              onChange={e => onChange({ title: e.target.value })}
              placeholder="Section title (e.g. Personal)"
              className="settings-input"
              style={{ flex: 1, fontWeight: 600, fontSize: '0.95rem' }}
            />
            {section.builtIn && (
              <span title="Built-in sections can't be deleted — they're wired into the bot." style={{ background: '#fef3c7', color: '#92400e', padding: '0.1rem 0.45rem', borderRadius: '0.25rem', fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>BUILT-IN</span>
            )}
            {(() => {
              const pages = section.pages && section.pages.length > 0 ? section.pages : ['finish'];
              const isApply = pages.includes('apply');
              const isFinish = pages.includes('finish');
              const label = isApply && isFinish ? 'APPLY + FINISH' : isApply ? 'APPLY' : 'FINISH';
              const bg = isApply && isFinish ? '#e0e7ff' : isApply ? '#dbeafe' : '#f1f5f9';
              const fg = isApply && isFinish ? '#3730a3' : isApply ? '#1e40af' : '#475569';
              return (
                <span title={`Appears on: ${pages.join(' + ')}`} style={{ background: bg, color: fg, padding: '0.1rem 0.45rem', borderRadius: '0.25rem', fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              );
            })()}
            {section.hidden && (
              <span style={{ background: '#fee2e2', color: '#991b1b', padding: '0.1rem 0.45rem', borderRadius: '0.25rem', fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>HIDDEN</span>
            )}
            {section.visibleForVisaTypes && section.visibleForVisaTypes.length > 0 && (
              <span title={`Only visible for: ${section.visibleForVisaTypes.join(', ')}`} style={{ background: '#fce7f3', color: '#9d174d', padding: '0.1rem 0.45rem', borderRadius: '0.25rem', fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                {section.visibleForVisaTypes.length === 1 ? section.visibleForVisaTypes[0] : `${section.visibleForVisaTypes.length} VISA TYPES`}
              </span>
            )}
          </div>
          <input
            type="text"
            value={section.description || ''}
            onChange={e => onChange({ description: e.target.value })}
            placeholder="Optional description shown under the title"
            className="settings-input"
            style={{ width: '100%', marginTop: '0.25rem', fontSize: '0.85rem' }}
          />
          {/* Visa-type filter — toggle which visa codes this section applies
              to. No selection = visible for ALL visa types (default). */}
          <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280' }}>Visible for:</span>
            <button
              type="button"
              onClick={() => onChange({ visibleForVisaTypes: undefined })}
              style={{
                fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem',
                borderRadius: '0.25rem', cursor: 'pointer',
                background: !section.visibleForVisaTypes || section.visibleForVisaTypes.length === 0 ? '#1f2937' : 'white',
                color: !section.visibleForVisaTypes || section.visibleForVisaTypes.length === 0 ? 'white' : '#374151',
                border: '1px solid ' + (!section.visibleForVisaTypes || section.visibleForVisaTypes.length === 0 ? '#1f2937' : '#e5e7eb'),
              }}
            >All</button>
            {VISA_CODES.map(code => {
              const set = section.visibleForVisaTypes ?? [];
              const on = set.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    const next = on ? set.filter(c => c !== code) : [...set, code];
                    onChange({ visibleForVisaTypes: next.length > 0 ? next : undefined });
                  }}
                  style={{
                    fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem',
                    borderRadius: '0.25rem', cursor: 'pointer',
                    background: on ? 'var(--blue)' : 'white',
                    color: on ? 'white' : '#374151',
                    border: '1px solid ' + (on ? 'var(--blue)' : '#e5e7eb'),
                  }}
                >{VISA_LABELS[code] || code}</button>
              );
            })}
          </div>
          {/* Sub-purpose filter — narrows the section further inside a visa
              type (e.g. only show for business + Attend Technical Meetings).
              No selection = all purposes; non-empty = only those. */}
          <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280' }}>Sub-purpose:</span>
            <button
              type="button"
              onClick={() => onChange({ visibleForPurposes: undefined })}
              style={{
                fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem',
                borderRadius: '0.25rem', cursor: 'pointer',
                background: !section.visibleForPurposes || section.visibleForPurposes.length === 0 ? '#1f2937' : 'white',
                color: !section.visibleForPurposes || section.visibleForPurposes.length === 0 ? 'white' : '#374151',
                border: '1px solid ' + (!section.visibleForPurposes || section.visibleForPurposes.length === 0 ? '#1f2937' : '#e5e7eb'),
              }}
            >Any</button>
            {KNOWN_PURPOSES.map(purpose => {
              const set = section.visibleForPurposes ?? [];
              const on = set.includes(purpose);
              return (
                <button
                  key={purpose}
                  type="button"
                  onClick={() => {
                    const next = on ? set.filter(p => p !== purpose) : [...set, purpose];
                    onChange({ visibleForPurposes: next.length > 0 ? next : undefined });
                  }}
                  style={{
                    fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem',
                    borderRadius: '0.25rem', cursor: 'pointer',
                    background: on ? '#7c3aed' : 'white',
                    color: on ? 'white' : '#374151',
                    border: '1px solid ' + (on ? '#7c3aed' : '#e5e7eb'),
                  }}
                >{purpose}</button>
              );
            })}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.35rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <code style={{ background: '#f3f4f6', padding: '0.05rem 0.35rem', borderRadius: '0.25rem' }}>{section.key}</code>
            <span>·</span>
            <span>{builtInFieldCount} built-in + {customFieldCount} custom fields</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          <label title="Hide this section from the customer form + admin view" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: '#374151', cursor: 'pointer', marginRight: '0.4rem' }}>
            <input type="checkbox" checked={!!section.hidden} onChange={e => onChange({ hidden: e.target.checked })} />
            Hide
          </label>
          <button onClick={onMoveUp} disabled={first} title="Move up" style={{ background: 'white', border: '1px solid #e5e7eb', padding: '0.35rem 0.5rem', borderRadius: '0.35rem', cursor: first ? 'not-allowed' : 'pointer', opacity: first ? 0.4 : 1 }}>↑</button>
          <button onClick={onMoveDown} disabled={last} title="Move down" style={{ background: 'white', border: '1px solid #e5e7eb', padding: '0.35rem 0.5rem', borderRadius: '0.35rem', cursor: last ? 'not-allowed' : 'pointer', opacity: last ? 0.4 : 1 }}>↓</button>
          <button
            onClick={onRemove}
            title={section.builtIn ? 'Delete built-in section (creates a tombstone — restore by clearing deletedBuiltIns in the DB)' : 'Delete section'}
            style={{
              background: 'white', color: '#dc2626',
              border: '1px solid #fca5a5',
              padding: '0.35rem 0.6rem', borderRadius: '0.35rem',
              fontSize: '0.78rem', fontWeight: 600,
              cursor: 'pointer',
            }}
          >🗑️</button>
        </div>
      </div>

      {/* Fields */}
      {!collapsed && (
        <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {section.fields.length === 0 && (
            <div style={{ padding: '0.75rem', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', border: '1px dashed #e5e7eb', borderRadius: '0.5rem', fontSize: '0.85rem' }}>
              No fields yet. Click <strong>+ Add Field</strong> below.
            </div>
          )}
          {section.fields.map((field, fi) => (
            <FieldEditor
              key={field.key + '_' + fi}
              field={field}
              first={fi === 0}
              last={fi === section.fields.length - 1}
              onChange={patch => updateField(fi, patch)}
              onRemove={() => removeField(fi)}
              onMoveUp={() => moveField(fi, -1)}
              onMoveDown={() => moveField(fi, 1)}
            />
          ))}
          <button
            onClick={addField}
            style={{
              alignSelf: 'flex-start', background: '#f3f4f6',
              border: '1px dashed #d1d5db', padding: '0.45rem 0.8rem',
              borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
            }}
          >+ Add Custom Field</button>
        </div>
      )}
    </div>
  );
}

function FieldEditor({ field, first, last, onChange, onRemove, onMoveUp, onMoveDown }: {
  field: CustomField;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<CustomField>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const needsOptions = field.type === 'select' || field.type === 'radio';
  return (
    <div style={{
      background: field.builtIn ? '#fffbeb' : '#f9fafb',
      border: '1px solid ' + (field.builtIn ? '#fde68a' : '#e5e7eb'),
      borderRadius: '0.5rem',
      padding: '0.65rem 0.8rem',
      opacity: field.hidden ? 0.6 : 1,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr auto', gap: '0.4rem', alignItems: 'center' }}>
        <input
          type="text"
          value={field.label}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="Field label (e.g. First name)"
          className="settings-input"
        />
        <input
          type="text"
          value={field.key}
          onChange={e => onChange({ key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40) })}
          placeholder="internal_key"
          title={field.builtIn ? 'Built-in field keys can\'t be changed — the bot depends on them.' : 'Internal storage key (camelCase, no spaces)'}
          disabled={field.builtIn}
          className="settings-input"
          style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.82rem', opacity: field.builtIn ? 0.65 : 1 }}
        />
        <select
          value={field.type}
          onChange={e => onChange({ type: e.target.value as FieldType })}
          disabled={field.builtIn}
          title={field.builtIn ? 'Built-in field types can\'t be changed.' : 'Field type'}
          className="settings-input"
          style={{ opacity: field.builtIn ? 0.65 : 1 }}
        >
          {FIELD_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: '0.2rem' }}>
          <button onClick={onMoveUp} disabled={first} title="Move up" style={{ background: 'white', border: '1px solid #e5e7eb', padding: '0.3rem 0.45rem', borderRadius: '0.3rem', cursor: first ? 'not-allowed' : 'pointer', opacity: first ? 0.4 : 1, fontSize: '0.78rem' }}>↑</button>
          <button onClick={onMoveDown} disabled={last} title="Move down" style={{ background: 'white', border: '1px solid #e5e7eb', padding: '0.3rem 0.45rem', borderRadius: '0.3rem', cursor: last ? 'not-allowed' : 'pointer', opacity: last ? 0.4 : 1, fontSize: '0.78rem' }}>↓</button>
          <button
            onClick={onRemove}
            title={field.builtIn ? 'Delete built-in field (creates a tombstone — bot will skip or use a hardcoded fallback)' : 'Remove field'}
            style={{
              background: 'white', color: '#dc2626',
              border: '1px solid #fca5a5',
              padding: '0.3rem 0.5rem', borderRadius: '0.3rem',
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >✕</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '0.4rem', marginTop: '0.4rem', alignItems: 'center' }}>
        <input
          type="text"
          value={field.placeholder || ''}
          onChange={e => onChange({ placeholder: e.target.value })}
          placeholder="Placeholder (optional)"
          className="settings-input"
          style={{ fontSize: '0.82rem' }}
        />
        <input
          type="text"
          value={field.helpText || ''}
          onChange={e => onChange({ helpText: e.target.value })}
          placeholder="Help text (optional)"
          className="settings-input"
          style={{ fontSize: '0.82rem' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', color: '#374151', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={!!field.required} onChange={e => onChange({ required: e.target.checked })} />
          Required
        </label>
        <label title="Hide this field from the customer form + admin view" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', color: '#374151', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={!!field.hidden} onChange={e => onChange({ hidden: e.target.checked })} />
          Hide
        </label>
      </div>

      {needsOptions && (
        <div style={{ marginTop: '0.4rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.2rem' }}>Options — one per line:</div>
          <textarea
            value={(field.options || []).join('\n')}
            onChange={e => onChange({ options: e.target.value.split('\n').filter(o => o.trim()) })}
            rows={Math.max(3, (field.options || []).length + 1)}
            className="settings-input"
            style={{ width: '100%', fontSize: '0.82rem', fontFamily: 'ui-monospace, Menlo, monospace' }}
            placeholder={'Option A\nOption B\nOption C'}
          />
        </div>
      )}

    </div>
  );
}

// ── Icon picker used in the Application tab's section editor ──
// Shows the current icon, and pops a searchable grid of the curated
// SECTION_ICONS when clicked.
function IconPickerButton({ value, emojiFallback, onChange }: {
  value?: string;
  emojiFallback?: string;
  onChange: (name: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const current = getSectionIcon(value);

  const filtered = search
    ? SECTION_ICONS.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.label.toLowerCase().includes(search.toLowerCase()) ||
        i.group.toLowerCase().includes(search.toLowerCase())
      )
    : SECTION_ICONS;

  // Group the filtered list by category for rendering.
  const grouped: Record<string, typeof SECTION_ICONS> = {};
  for (const i of filtered) (grouped[i.group] = grouped[i.group] || []).push(i);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title={current ? `Icon: ${current.label}` : emojiFallback ? `Emoji: ${emojiFallback}` : 'Pick an icon'}
        style={{
          width: '100%', height: '38px',
          padding: '0.35rem 0.5rem',
          border: '1px solid ' + (open ? 'var(--blue)' : '#e5e7eb'),
          borderRadius: '0.4rem',
          background: 'white', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#1f2937',
        }}
      >
        <SectionIcon icon={value} emoji={emojiFallback} size={18} strokeWidth={2} />
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div style={{
            position: 'absolute', top: 'calc(100% + 0.3rem)', left: 0,
            width: '360px', maxHeight: '380px', overflowY: 'auto',
            background: 'white', border: '1px solid #e5e7eb',
            borderRadius: '0.55rem', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: '0.65rem', zIndex: 50,
          }}>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search icons…"
                className="settings-input"
                style={{ flex: 1, fontSize: '0.85rem' }}
                autoFocus
              />
              <button
                type="button"
                onClick={() => { onChange(undefined); setOpen(false); }}
                title="Clear icon"
                style={{
                  background: '#f3f4f6', border: '1px solid #e5e7eb',
                  padding: '0.4rem 0.7rem', borderRadius: '0.4rem',
                  fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                }}
              >Clear</button>
            </div>
            {Object.keys(grouped).length === 0 && (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
                No icons match &quot;{search}&quot;.
              </div>
            )}
            {Object.entries(grouped).map(([group, icons]) => (
              <div key={group} style={{ marginBottom: '0.65rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.35rem' }}>
                  {group}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.25rem' }}>
                  {icons.map(entry => {
                    const Icon = entry.Icon;
                    const isSelected = value === entry.name;
                    return (
                      <button
                        key={entry.name}
                        type="button"
                        title={entry.label}
                        onClick={() => { onChange(entry.name); setOpen(false); }}
                        style={{
                          width: '34px', height: '34px',
                          border: isSelected ? '2px solid var(--blue)' : '1px solid #e5e7eb',
                          borderRadius: '0.35rem',
                          background: isSelected ? '#eff6ff' : 'white',
                          cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          color: isSelected ? 'var(--blue)' : '#374151',
                        }}
                      >
                        <Icon size={16} strokeWidth={2} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Bot Mapping Tab ─────────────────────────────────────────────────
//
// Lists every gov-site field the Playwright bot interacts with, grouped by
// the step where it appears. For each field, admin can override the "source"
// — the schema field or hardcoded value the bot uses to fill it.

type BotCatalogStep = import('@/lib/botMapping').BotStep;
type BotCatalogField = import('@/lib/botMapping').BotField;
type BotCatalogSource = import('@/lib/botMapping').BotSource;

function BotTab() {
  const [catalog, setCatalog] = useState<BotCatalogStep[]>([]);
  const [overrides, setOverrides] = useState<Record<string, BotCatalogSource>>({});
  /** Snapshot of the last-saved overrides — used by the Cancel button to revert unsaved edits. */
  const [savedOverrides, setSavedOverrides] = useState<Record<string, BotCatalogSource>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');
  const [schemaFieldOptions, setSchemaFieldOptions] = useState<Array<{ key: string; label: string }>>([]);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Load catalog + current overrides + the schema field list (for dropdown options).
  useEffect(() => {
    (async () => {
      try {
        const [botRes, schemaRes] = await Promise.all([
          fetch('/api/settings/bot-mapping?country=INDIA'),
          fetch('/api/settings/application-schema?country=INDIA'),
        ]);
        if (botRes.ok) {
          const d = await botRes.json();
          setCatalog(d.catalog || []);
          setOverrides(d.overrides || {});
          setSavedOverrides(d.overrides || {});
          if (d.catalog?.length) setExpandedStep(d.catalog[0].key);
        }
        if (schemaRes.ok) {
          const sd = await schemaRes.json();
          const opts: Array<{ key: string; label: string }> = [];
          for (const sec of sd.sections || []) {
            for (const f of sec.fields || []) {
              opts.push({ key: f.key, label: `${sec.title} › ${f.label}` });
            }
          }
          setSchemaFieldOptions(opts);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const effectiveSource = (step: BotCatalogStep, field: BotCatalogField): BotCatalogSource => {
    return overrides[`${step.key}.${field.key}`] ?? field.defaultSource;
  };
  const isOverridden = (step: BotCatalogStep, field: BotCatalogField) =>
    !!overrides[`${step.key}.${field.key}`];

  const setSource = (step: BotCatalogStep, field: BotCatalogField, src: BotCatalogSource | null) => {
    const key = `${step.key}.${field.key}`;
    const next = { ...overrides };
    if (src === null) delete next[key];
    else next[key] = src;
    setOverrides(next);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setFlash('');
    try {
      const res = await fetch('/api/settings/bot-mapping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: 'INDIA', overrides }),
      });
      if (res.ok) {
        setFlash('✓ Saved');
        setDirty(false);
        setSavedOverrides(overrides);
        setTimeout(() => setFlash(''), 2500);
      } else {
        const d = await res.json();
        setFlash(`✕ ${d.error || 'Failed'}`);
      }
    } catch (err: any) {
      setFlash(`✕ ${err?.message || 'Failed'}`);
    } finally { setSaving(false); }
  };

  const cancel = () => {
    if (!dirty) return;
    const changeCount = Object.keys(overrides).length + Object.keys(savedOverrides).length
      - Object.keys(overrides).filter(k => JSON.stringify(overrides[k]) === JSON.stringify(savedOverrides[k])).length * 2;
    if (changeCount > 0 && !confirm('Discard unsaved bot-mapping changes?')) return;
    setOverrides(savedOverrides);
    setDirty(false);
    setFlash('');
  };

  const totals = {
    fields:  catalog.reduce((a, s) => a + s.fields.length, 0),
    mapped:  catalog.reduce((a, s) => a + s.fields.filter(f => {
      const src = effectiveSource(s, f);
      return src.type === 'schema' || src.type === 'hardcoded';
    }).length, 0),
    manual:  catalog.reduce((a, s) => a + s.fields.filter(f => effectiveSource(s, f).type === 'manual').length, 0),
    overrides: Object.keys(overrides).length,
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Loading bot catalog…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <Bot size={16} strokeWidth={2} />
            <span>Bot Mapping — India</span>
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.2rem', maxWidth: '720px' }}>
            Every gov-site field the Playwright bot fills, across all {catalog.length} steps of the
            Indian government&apos;s visa flow. For each field, pick which <strong>schema field</strong> the
            bot reads (e.g. <code>passportNumber</code>), or a <strong>hardcoded value</strong>, or
            leave it <strong>manual</strong> (bot skips it — admin does it in the browser).
          </p>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.3rem' }}>
            {totals.mapped} mapped · {totals.manual} manual · {totals.overrides} admin override{totals.overrides === 1 ? '' : 's'} · {totals.fields} total fields
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
          {flash && <span style={{ fontSize: '0.85rem', fontWeight: 600, color: flash.startsWith('✓') ? '#059669' : '#dc2626' }}>{flash}</span>}
          {dirty && (
            <button
              onClick={cancel}
              disabled={saving}
              style={{
                background: 'white',
                color: '#374151',
                border: '1px solid #e5e7eb',
                padding: '0.55rem 0.95rem', borderRadius: '0.4rem',
                fontSize: '0.88rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >Cancel</button>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            style={{
              background: dirty ? 'var(--blue)' : '#e5e7eb',
              color: dirty ? 'white' : '#9ca3af',
              border: 'none', padding: '0.55rem 1.1rem', borderRadius: '0.4rem',
              fontSize: '0.88rem', fontWeight: 700, cursor: dirty && !saving ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            }}
          >
            {dirty && !saving && <Save size={14} strokeWidth={2.25} />}
            <span>{saving ? 'Saving…' : dirty ? 'Save Mapping' : 'Saved'}</span>
          </button>
        </div>
      </div>

      {/* Wired / not-wired status banner */}
      <div style={{ padding: '0.75rem 1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.4rem', fontSize: '0.82rem', color: '#1e40af', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <Bot size={15} strokeWidth={2.25} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
        <div>
          <strong>Wired:</strong> Steps 1, 3, 4, 5, 6, 9, and 11 read your overrides at bot runtime.
          <br />
          <strong>Partial:</strong> Step 2 (Applicant Details) — the 9 ID-based fields (passport details, Lived-2-years, other-passport fields) are wired. The 13 position-based fields (name, gender, city of birth, religion, etc.) use index-based selector discovery and can&apos;t be overridden yet.
          <br />
          <strong>Not wired:</strong> Steps 7, 8, and 10 are manual-only (photo crop, preview click, summary review).
        </div>
      </div>

      {/* Steps list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {catalog.map(step => {
          const isOpen = expandedStep === step.key;
          const stepOverrideCount = step.fields.filter(f => isOverridden(step, f)).length;
          // Keep in sync with the bot script — which steps actually consume the mapping at runtime.
          const WIRED_STEPS = new Set(['registration', 'addressFamily', 'visaDetails', 'security', 'photoUpload', 'passportDoc', 'payment']);
          // Steps where only *some* fields are wired (the rest use different selector patterns the bot can't honor yet).
          const PARTIAL_STEPS = new Set(['applicant']);
          const wired = WIRED_STEPS.has(step.key);
          const partial = PARTIAL_STEPS.has(step.key);
          return (
            <div key={step.key} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.4rem', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setExpandedStep(isOpen ? null : step.key)}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.85rem 1rem', background: isOpen ? '#f9fafb' : 'white',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>{step.label}</div>
                  {step.description && <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.15rem' }}>{step.description}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.78rem', color: '#6b7280' }}>
                  <span
                    title={wired ? 'Overrides for this step take effect at bot runtime.' : partial ? 'Some fields in this step are wired (ID-based selectors); others use position-based discovery and can\'t be overridden yet.' : 'Overrides on this step save, but the bot script still uses hardcoded logic.'}
                    style={{
                      background: wired ? '#d1fae5' : partial ? '#fef3c7' : '#f3f4f6',
                      color:      wired ? '#065f46' : partial ? '#92400e' : '#6b7280',
                      padding: '0.1rem 0.45rem', borderRadius: '0.25rem', fontWeight: 700, fontSize: '0.68rem',
                    }}
                  >
                    {wired ? 'WIRED' : partial ? 'PARTIAL' : 'NOT WIRED'}
                  </span>
                  <span>{step.fields.length} field{step.fields.length === 1 ? '' : 's'}</span>
                  {stepOverrideCount > 0 && (
                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.45rem', borderRadius: '0.25rem', fontWeight: 700, fontSize: '0.7rem' }}>
                      {stepOverrideCount} override{stepOverrideCount === 1 ? '' : 's'}
                    </span>
                  )}
                  <span style={{ fontSize: '1rem' }}>{isOpen ? '▾' : '▸'}</span>
                </div>
              </button>
              {isOpen && (
                <div style={{ borderTop: '1px solid #e5e7eb' }}>
                  {step.fields.map(field => (
                    <BotFieldRow
                      key={field.key}
                      step={step}
                      field={field}
                      source={effectiveSource(step, field)}
                      overridden={isOverridden(step, field)}
                      schemaOptions={schemaFieldOptions}
                      onChange={src => setSource(step, field, src)}
                      onReset={() => setSource(step, field, null)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BotFieldRow({ step, field, source, overridden, schemaOptions, onChange, onReset }: {
  step: BotCatalogStep;
  field: BotCatalogField;
  source: BotCatalogSource;
  overridden: boolean;
  schemaOptions: Array<{ key: string; label: string }>;
  onChange: (src: BotCatalogSource) => void;
  onReset: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok?: boolean; skipped?: boolean; reason?: string; error?: string; elapsedMs?: number; info?: any; note?: string } | null>(null);
  const runSelectorTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('http://localhost:3001/test-selector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: field.selector }),
      });
      const d = await res.json();
      setTestResult(d);
    } catch {
      setTestResult({ error: 'Bot server not running on :3001. Start it: npx tsx scripts/bot-server.ts' });
    } finally { setTesting(false); }
  };
  const actionBadge: Record<string, { bg: string; fg: string; label: string }> = {
    fill:   { bg: '#dbeafe', fg: '#1e40af', label: 'FILL' },
    select: { bg: '#e0e7ff', fg: '#3730a3', label: 'SELECT' },
    click:  { bg: '#ede9fe', fg: '#5b21b6', label: 'CLICK' },
    check:  { bg: '#d1fae5', fg: '#065f46', label: 'CHECK' },
    upload: { bg: '#fef3c7', fg: '#92400e', label: 'UPLOAD' },
  };
  const ab = actionBadge[field.action];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1.15fr auto',
      gap: '0.75rem',
      alignItems: 'center',
      padding: '0.6rem 1rem',
      borderTop: '1px solid #f3f4f6',
      background: overridden ? '#eff6ff' : 'white',
    }}>
      {/* Left: gov field info */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{field.label}</span>
          {ab && (
            <span style={{ background: ab.bg, color: ab.fg, padding: '0.1rem 0.4rem', borderRadius: '0.2rem', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.03em' }}>
              {ab.label}
            </span>
          )}
          {overridden && (
            <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.1rem 0.4rem', borderRadius: '0.2rem', fontSize: '0.65rem', fontWeight: 700 }}>
              OVERRIDDEN
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontFamily: 'ui-monospace, Menlo, monospace', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {field.selector}
        </div>
        {field.hint && (
          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '0.15rem' }}>{field.hint}</div>
        )}
      </div>

      {/* Middle: source selector */}
      <BotSourceEditor source={source} schemaOptions={schemaOptions} onChange={onChange} />

      {/* Right: reset button */}
      <div>
        <button
          onClick={onReset}
          disabled={!overridden}
          title={overridden ? 'Reset to default' : 'Using default'}
          style={{
            background: 'white', color: overridden ? '#6b7280' : '#d1d5db',
            border: '1px solid ' + (overridden ? '#e5e7eb' : '#f3f4f6'),
            padding: '0.3rem 0.55rem', borderRadius: '0.3rem',
            fontSize: '0.75rem', fontWeight: 600,
            cursor: overridden ? 'pointer' : 'not-allowed',
          }}
        >↻</button>
        <button
          onClick={runSelectorTest}
          disabled={testing}
          title="Launch a headless browser, navigate to the gov page, verify the selector resolves"
          style={{
            background: testing ? '#e5e7eb' : 'white',
            color: '#6b7280',
            border: '1px solid #e5e7eb',
            padding: '0.3rem 0.55rem', borderRadius: '0.3rem',
            fontSize: '0.72rem', fontWeight: 600,
            cursor: testing ? 'wait' : 'pointer',
            marginLeft: '0.2rem',
          }}
        >
          {testing ? 'Testing…' : 'Test'}
        </button>
      </div>
      {testResult && (
        <div style={{
          gridColumn: '1 / -1',
          marginTop: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: testResult.ok ? '#ecfdf5' : testResult.skipped ? '#f3f4f6' : testResult.error ? '#fef2f2' : '#fef3c7',
          color: testResult.ok ? '#065f46' : testResult.skipped ? '#6b7280' : testResult.error ? '#991b1b' : '#92400e',
          borderRadius: '0.3rem', fontSize: '0.78rem',
          display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
        }}>
          <div style={{ flex: 1 }}>
            {testResult.error ? (
              <div><strong>Test failed:</strong> {testResult.error}</div>
            ) : testResult.skipped ? (
              <div><strong>Skipped:</strong> {testResult.reason}</div>
            ) : testResult.ok ? (
              <div>
                <strong>Selector resolved</strong> on the gov site ({testResult.elapsedMs}ms).
                {testResult.info && <span style={{ color: '#6b7280', fontSize: '0.72rem', marginLeft: '0.5rem' }}>
                  {'<' + String(testResult.info.tag).toLowerCase()}
                  {testResult.info.id ? ' id="' + testResult.info.id + '"' : ''}
                  {testResult.info.type ? ' type="' + testResult.info.type + '"' : ''}
                  {'>'}
                  {!testResult.info.visible && ' (hidden)'}
                </span>}
              </div>
            ) : (
              <div>
                <strong>No match</strong> on the registration landing page ({testResult.elapsedMs}ms).
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.15rem' }}>{testResult.note}</div>
              </div>
            )}
          </div>
          <button
            onClick={() => setTestResult(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, fontSize: '0.85rem', padding: 0 }}
            title="Dismiss"
          >✕</button>
        </div>
      )}
    </div>
  );
}

function BotSourceEditor({ source, schemaOptions, onChange }: {
  source: BotCatalogSource;
  schemaOptions: Array<{ key: string; label: string }>;
  onChange: (src: BotCatalogSource) => void;
}) {
  const type = source.type;
  return (
    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        value={type}
        onChange={e => {
          const next = e.target.value as BotCatalogSource['type'];
          if (next === 'schema')     onChange({ type: 'schema', fieldKey: schemaOptions[0]?.key ?? '' });
          else if (next === 'hardcoded') onChange({ type: 'hardcoded', value: '' });
          else if (next === 'skip')   onChange({ type: 'skip' });
          else                         onChange({ type: 'manual' });
        }}
        style={{ padding: '0.35rem 0.5rem', borderRadius: '0.3rem', border: '1px solid #e5e7eb', fontSize: '0.8rem', background: 'white' }}
      >
        <option value="schema">Schema field</option>
        <option value="hardcoded">Hardcoded value</option>
        <option value="manual">Manual (browser)</option>
        <option value="skip">Skip (don&apos;t fill)</option>
      </select>
      {type === 'schema' && (
        <select
          value={source.fieldKey}
          onChange={e => onChange({ type: 'schema', fieldKey: e.target.value })}
          style={{ flex: 1, minWidth: '180px', padding: '0.35rem 0.5rem', borderRadius: '0.3rem', border: '1px solid #e5e7eb', fontSize: '0.8rem', background: 'white' }}
        >
          {!schemaOptions.some(o => o.key === source.fieldKey) && (
            <option value={source.fieldKey}>⚠ {source.fieldKey} (not in schema)</option>
          )}
          {schemaOptions.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      )}
      {type === 'hardcoded' && (
        <input
          type="text"
          value={source.value}
          onChange={e => onChange({ type: 'hardcoded', value: e.target.value })}
          placeholder="Value"
          style={{ flex: 1, minWidth: '120px', padding: '0.35rem 0.5rem', borderRadius: '0.3rem', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontFamily: 'ui-monospace, Menlo, monospace' }}
        />
      )}
    </div>
  );
}
