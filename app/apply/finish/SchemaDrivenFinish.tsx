'use client';

/**
 * Schema-driven finish page for non-India destinations (Aruba and any
 * future country whose application form is admin-defined). Reads the
 * country's schema from `application.schema.<COUNTRY>` and renders one
 * step per section.
 *
 * Visual + behavioural parity with India:
 *   - Same DOM structure and class names (.finish-page, .finish-sidebar,
 *     .finish-step / .finish-step-header / .finish-step-number /
 *     .finish-step-label / .finish-step-items / .finish-step-sub /
 *     .finish-step-bullet / .finish-step-group, .finish-main /
 *     .finish-main-inner, .finish-heading / .finish-time, the
 *     .finish-checklist landing card, .finish-form-* inputs,
 *     .finish-radio-row, .finish-nav with .finish-back-btn /
 *     .finish-next-btn / .finish-continue-btn).
 *   - Starts on a landing "overview" step that mirrors India's:
 *     "Let's finish your application", time estimate, "We still need
 *     the following" card, and a single big Continue button.
 *   - Sidebar groups the schema sections into 3 numbered groups:
 *     (1) Trip details, (2) [Traveler Name] (all personal info), and
 *     (3) Upload Documents. The schema section drives the form; the
 *     grouping is purely a sidebar concern.
 *
 * Field types supported:
 *   text / email / tel / date / number / textarea / select / radio /
 *   checkbox / file. The 'file' type uploads to /api/upload (same path
 *   India uses for its photo + passport bio uploads); the returned URL
 *   is stored in the field value.
 *
 * Submission:
 *   On the final step, all field values are flattened into a single
 *   traveler record (`traveler[fieldKey] = value`) and saved to the
 *   order's `travelers` JSON column. The customer is redirected to
 *   /status. Multi-traveler isn't supported yet — each order represents
 *   one applicant.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PER_TRAVELER_FIELD_KEYS, type ApplicationSchema, type CustomSection, type CustomField } from '@/lib/applicationSchema';
import { CustomDropdown } from './CustomDropdown';

interface OrderShape {
  id: string;
  orderNumber: number;
  destination: string;
  status: string;
  travelers: string;
  billingEmail: string;
  visaType?: string;
}

type FieldValue = string | boolean;
type FieldValues = Record<string, FieldValue>;
// PER_TRAVELER_FIELD_KEYS is imported from lib/applicationSchema so
// admin Full Edit + bot stay in sync with this client.

/**
 * Sidebar group keys. The schema sections are mapped into one of these
 * three buckets purely for the visual sidebar layout. Order matches
 * India: Trip details first, then per-traveler details, then uploads.
 */
type SidebarGroupKey = 'trip' | 'traveler' | 'uploads';

/* ── Date helpers ────────────────────────────────────────────────────
 * Dates are stored as `"January 15, 2026"` to match India's serialised
 * traveler format (the rest of the app — admin views, email templates —
 * already parses that shape). The 3-dropdown picker reads/writes that
 * string. Year range is picked heuristically from the field key so DOB
 * shows past years and arrival shows future years. */

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i + 1));

/** Year range for a date field, inferred from the field key. Past 100
 *  years for DOB / birth, far-future for passport expiry, near-future
 *  for arrival/departure/travel, default ±5 years. */
function yearOptionsFor(fieldKey: string): string[] {
  const k = fieldKey.toLowerCase();
  const now = new Date().getFullYear();
  if (k.includes('dob') || k.includes('birth')) {
    // Past 100 years, descending so the most recent year shows first.
    return Array.from({ length: 100 }, (_, i) => String(now - i));
  }
  if (k.includes('expir') || k.includes('valid')) {
    return Array.from({ length: 20 }, (_, i) => String(now + i));
  }
  if (k.includes('arrival') || k.includes('departure') || k.includes('travel') || k.includes('issue')) {
    return Array.from({ length: 5 }, (_, i) => String(now + i));
  }
  // Default: 5 future years (matches India's arrival picker).
  return Array.from({ length: 5 }, (_, i) => String(now + i));
}

/** Parse "January 15, 2026" into { month, day, year }. Tolerates
 *  ISO ("2026-01-15") since older orders may have stored it that way
 *  (we used to render <input type="date">). */
function parseStoredDate(value: string | undefined | null): { month: string; day: string; year: string } {
  if (!value) return { month: '', day: '', year: '' };
  const friendly = value.match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (friendly) return { month: friendly[1], day: friendly[2], year: friendly[3] };
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const m = parseInt(iso[2], 10);
    if (m >= 1 && m <= 12) return { month: MONTH_NAMES[m - 1], day: String(parseInt(iso[3], 10)), year: iso[1] };
  }
  return { month: '', day: '', year: '' };
}

function formatStoredDate(month: string, day: string, year: string): string {
  if (!month || !day || !year) return '';
  return `${month} ${day}, ${year}`;
}

/** Same shape as parseStoredDate but returns a Date object — used by
 *  cross-field validators (e.g. "departureDate must be within 1 year
 *  of arrivalDate"). Returns null if the input can't be parsed. */
function parseFinishDate(value: string): Date | null {
  const parts = parseStoredDate(value);
  if (!parts.month || !parts.day || !parts.year) return null;
  const monthIdx = MONTH_NAMES.indexOf(parts.month);
  if (monthIdx < 0) return null;
  const d = new Date(parseInt(parts.year, 10), monthIdx, parseInt(parts.day, 10));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Map a schema section's `key` to a sidebar group. Sections we don't
 * know about default to the traveler group (the middle bucket — most
 * schema-author additions are personal info).
 */
function groupForSection(sectionKey: string): SidebarGroupKey {
  if (sectionKey === 'trip' || sectionKey.includes('trip') || sectionKey === 'aruba_start') return 'trip';
  if (sectionKey === 'documents' || sectionKey === 'additional' || sectionKey.includes('document') || sectionKey.includes('upload')) return 'uploads';
  return 'traveler';
}

/* Inline checkmark — matches India's <CheckIcon/> in the sidebar. */
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2.5 7L6 10.5L11.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export function SchemaDrivenFinish({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderShape | null>(null);
  const [schema, setSchema] = useState<ApplicationSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* ── Load order + schema ────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const orderRes = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
        let orderData: OrderShape | null = null;
        if (orderRes.ok) {
          orderData = await orderRes.json();
          if (!cancelled) setOrder(orderData);
        }

        const urlDest = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('destination') ?? ''
          : '';
        const country = ((orderData?.destination || urlDest || '')).toUpperCase();
        if (!country) {
          if (!cancelled) setError('We couldn\'t determine your application country. Try the link from your confirmation email again.');
          return;
        }

        const schemaRes = await fetch(`/api/settings/application-schema?country=${encodeURIComponent(country)}`);
        if (schemaRes.ok) {
          const sch = await schemaRes.json();
          if (!cancelled) setSchema(sch && Array.isArray(sch.sections) ? sch : { country, sections: [] });
        } else if (!cancelled) {
          setSchema({ country, sections: [] });
        }

        if (!orderData && !cancelled) {
          setOrder({
            id: orderId,
            orderNumber: 0,
            destination: country,
            status: 'UNFINISHED',
            travelers: '[]',
            billingEmail: '',
          });
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load your application.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  /* ── Step state ──────────────────────────────────────────────────
   * step: 'overview' on the landing screen, otherwise the integer index
   * into finishSections for the section being filled out.
   */
  const [step, setStep] = useState<'overview' | number>('overview');
  const [values, setValues] = useState<FieldValues>({});
  // Extra travelers beyond the primary. Each entry is a flat
  // `{ fieldKey: value }` map of just the per-traveler fields
  // (PER_TRAVELER_FIELD_KEYS). Order matches the gov form's
  // "Add Family Member" sequence — travelers[1] = first extra,
  // travelers[2] = second, etc.
  const [extraTravelers, setExtraTravelers] = useState<FieldValues[]>([]);
  // Which extra-traveler cards are expanded (by index in
  // `extraTravelers`). New cards open expanded by default — see
  // the addExtraTraveler handler below.
  const [expandedExtras, setExpandedExtras] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const finishSections: CustomSection[] = useMemo(() => {
    if (!schema) return [];
    return schema.sections
      .filter(s => !s.hidden)
      .filter(s => {
        const pages = (s.pages && s.pages.length > 0) ? s.pages : ['finish'];
        return pages.includes('finish');
      });
  }, [schema]);

  /* Derive the traveler's display name from the order's first traveler.
   * Used for the middle sidebar group's title (group 2: "Alen Ghazaryan"
   * style) and the per-group sub-bullet under Upload Documents.
   *
   * Falls back to "Traveler" when we don't yet have the data — the
   * just-paid customer hits the page before we PATCH any travelers
   * back, so they'll see "Traveler" until they fill out their first
   * Personal step. We then prefer the value the customer is currently
   * typing (`values`) so the sidebar updates live. */
  const travelerName = useMemo(() => {
    const liveFirst = String(values['personal:firstName'] || '').trim();
    const liveLast  = String(values['personal:lastName']  || '').trim();
    if (liveFirst || liveLast) return `${liveFirst} ${liveLast}`.trim();
    try {
      const travelers = JSON.parse(order?.travelers || '[]');
      const t = Array.isArray(travelers) ? travelers[0] : null;
      if (t && (t.firstName || t.lastName)) return `${t.firstName || ''} ${t.lastName || ''}`.trim();
    } catch {}
    return 'Traveler';
  }, [order, values]);

  // Pre-fill from existing travelers JSON if the customer reloads.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !order || finishSections.length === 0) return;
    try {
      const travelers = JSON.parse(order.travelers || '[]');
      const t = Array.isArray(travelers) ? travelers[0] : null;
      if (!t || typeof t !== 'object') return;
      const next: FieldValues = {};
      for (const sec of finishSections) {
        for (const f of sec.fields) {
          const v = t[f.key];
          if (v === undefined) continue;
          next[`${sec.key}:${f.key}`] = f.type === 'checkbox' ? !!v : String(v ?? '');
        }
      }
      if (Object.keys(next).length > 0) setValues(next);
      // Restore any extra travelers (travelers[1..N]) so the
      // customer sees them when they reload the page mid-edit.
      // Stored per-traveler values are flat `{ key: value }` —
      // we keep that shape in `extraTravelers` state.
      if (Array.isArray(travelers) && travelers.length > 1) {
        const restored: FieldValues[] = [];
        for (let i = 1; i < travelers.length; i++) {
          const extra = travelers[i];
          if (!extra || typeof extra !== 'object') continue;
          const fv: FieldValues = {};
          for (const k of PER_TRAVELER_FIELD_KEYS) {
            const v = (extra as any)[k];
            if (v === undefined) continue;
            fv[k] = typeof v === 'boolean' ? v : String(v ?? '');
          }
          restored.push(fv);
        }
        if (restored.length > 0) setExtraTravelers(restored);
      }
    } catch {}
    seededRef.current = true;
  }, [order, finishSections]);

  /* ── Sidebar grouping ────────────────────────────────────────────
   * Bucket each schema section under one of three sidebar groups in
   * stable order (preserving the schema's authored order within each
   * group). We render one numbered group circle per group, with the
   * sections under it appearing as `.finish-step-sub` items. */
  const sidebarGroups = useMemo(() => {
    const groups: { key: SidebarGroupKey; sections: { idx: number; section: CustomSection }[] }[] = [
      { key: 'trip',     sections: [] },
      { key: 'traveler', sections: [] },
      { key: 'uploads',  sections: [] },
    ];
    finishSections.forEach((s, idx) => {
      const g = groupForSection(s.key);
      const target = groups.find(x => x.key === g)!;
      target.sections.push({ idx, section: s });
    });
    return groups.filter(g => g.sections.length > 0);
  }, [finishSections]);

  const validateStep = (sec: CustomSection): string[] => {
    const errors: string[] = [];
    for (const f of sec.fields) {
      if (f.hidden || !f.required) continue;
      const v = values[`${sec.key}:${f.key}`];
      const empty = f.type === 'checkbox' ? v !== true : (v === undefined || v === '' || v === null);
      if (empty) errors.push(f.label || f.key);
    }
    for (const f of sec.fields) {
      if (!/[Cc]onfirm$/.test(f.key)) continue;
      const baseKey = f.key.replace(/[Cc]onfirm$/, '');
      const baseField = sec.fields.find(x => x.key === baseKey);
      if (!baseField) continue;
      const a = values[`${sec.key}:${baseKey}`];
      const b = values[`${sec.key}:${f.key}`];
      if (a && b && a !== b) errors.push(`${f.label} must match ${baseField.label}`);
    }

    // Departure-date sanity: Aruba's ED Card form rejects orders
    // whose departure is more than 1 year after arrival. We mirror
    // that rule here so the customer hits the message in our form
    // instead of getting a confusing rejection on the gov side.
    // Pulls both dates from the section's field values regardless
    // of which section the customer is currently on.
    const arrivalRaw   = values[`${sec.key}:arrivalDate`];
    const departureRaw = values[`${sec.key}:departureDate`];
    if (typeof arrivalRaw === 'string' && typeof departureRaw === 'string' && arrivalRaw && departureRaw) {
      const arrival   = parseFinishDate(arrivalRaw);
      const departure = parseFinishDate(departureRaw);
      if (arrival && departure) {
        const maxDeparture = new Date(arrival);
        maxDeparture.setFullYear(maxDeparture.getFullYear() + 1);
        if (departure > maxDeparture) {
          errors.push('Departure date cannot be more than 1 year after the arrival date.');
        }
        if (departure < arrival) {
          errors.push('Departure date must be on or after the arrival date.');
        }
      }
    }

    return errors;
  };

  const currentSectionIndex = typeof step === 'number' ? step : -1;
  const currentSection = currentSectionIndex >= 0 ? finishSections[currentSectionIndex] : null;
  const currentErrors = currentSection ? validateStep(currentSection) : [];
  const canAdvance = currentErrors.length === 0;
  const isLastStep = currentSectionIndex === finishSections.length - 1;

  const goTo = (next: 'overview' | number) => {
    setStep(next);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handleBack = () => {
    if (typeof step !== 'number') return;
    if (step === 0) goTo('overview');
    else goTo(step - 1);
  };
  const handleNext = () => {
    if (typeof step !== 'number') return;
    if (!canAdvance) return;
    if (isLastStep) handleSubmit();
    else goTo(step + 1);
  };

  // Add a new empty extra traveler card to the list. Returns
  // focus to the new card by marking it expanded.
  const addExtraTraveler = () => {
    setExtraTravelers(prev => {
      const next = [...prev, {} as FieldValues];
      const newIndex = next.length - 1;
      setExpandedExtras(curr => new Set(curr).add(newIndex));
      return next;
    });
  };
  const removeExtraTraveler = (idx: number) => {
    setExtraTravelers(prev => prev.filter((_, i) => i !== idx));
    setExpandedExtras(prev => {
      // Shift down any expanded-indexes above the removed one to
      // keep the open/closed state consistent after the splice.
      const next = new Set<number>();
      for (const i of prev) {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      }
      return next;
    });
  };
  const toggleExtraTraveler = (idx: number) => {
    setExpandedExtras(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const updateExtraTraveler = (idx: number, key: string, value: FieldValue) => {
    setExtraTravelers(prev => prev.map((t, i) => i === idx ? { ...t, [key]: value } : t));
  };

  const handleSubmit = async () => {
    if (!order) return;
    setSubmitting(true);
    setError('');
    try {
      // Merge new finish-form values into the existing traveler
      // record rather than replacing it. Hidden schema fields
      // (purposeOfVisit, streetNumber, addressSuffix on Aruba) and
      // any fields collected on /apply but not re-asked here
      // (passport metadata, hasConfirmedTravel, etc.) need to
      // survive the submit — otherwise the bot reads an empty
      // traveler and the gov form gets nothing for those fields.
      let existing: Record<string, any> = {};
      let existingExtras: Record<string, any>[] = [];
      try {
        const prev = JSON.parse(order.travelers || '[]');
        if (Array.isArray(prev) && prev[0] && typeof prev[0] === 'object') {
          existing = prev[0];
        }
        if (Array.isArray(prev) && prev.length > 1) {
          existingExtras = prev.slice(1).filter(t => t && typeof t === 'object');
        }
      } catch {}
      const traveler: Record<string, any> = { ...existing };
      for (const sec of finishSections) {
        for (const f of sec.fields) {
          const v = values[`${sec.key}:${f.key}`];
          if (v === undefined || v === '') continue;
          traveler[f.key] = v;
        }
      }
      if (typeof traveler.email !== 'string' || !traveler.email) {
        traveler.email = order.billingEmail;
      }

      // Package the extra travelers: merge each card's flat
      // per-traveler values onto whatever was previously stored
      // for that index (preserves OCR'd / admin-added fields
      // across submits, same as the primary traveler).
      const packagedExtras: Record<string, any>[] = extraTravelers.map((fv, idx) => {
        const base = existingExtras[idx] && typeof existingExtras[idx] === 'object' ? existingExtras[idx] : {};
        const merged: Record<string, any> = { ...base };
        for (const k of PER_TRAVELER_FIELD_KEYS) {
          const v = fv[k];
          if (v === undefined || v === '') continue;
          merged[k] = v;
        }
        return merged;
      });

      // PATCH travelers + flip the order out of UNFINISHED. Mirror
      // India's submit handler exactly (app/apply/finish/page.tsx:2228):
      //   - status → PROCESSING (the customer-side equivalent of
      //     "we've got it, our team will review")
      //   - flaggedFields cleared, specialistNotes cleared (in case the
      //     customer is re-submitting after corrections; this resets
      //     them so the next admin review starts fresh)
      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          travelers: JSON.stringify([traveler, ...packagedExtras]),
          status: 'PROCESSING',
          flaggedFields: '[]',
          specialistNotes: '',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Submission failed');
      }
      setSubmitted(true);
      setTimeout(() => router.push('/status'), 1500);
    } catch (err: any) {
      setError(err?.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Loading / error / empty states ── */
  if (loading) {
    return <div className="finish-loading">Loading...</div>;
  }
  if (error && !order) {
    return (
      <div className="finish-loading">
        {error} <Link href="/" style={{ color: 'var(--blue)', marginLeft: '0.5rem' }}>Back to home →</Link>
      </div>
    );
  }
  if (!order || finishSections.length === 0) {
    return (
      <div className="finish-loading" style={{ flexDirection: 'column', gap: '1rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Application received</h1>
        <p style={{ margin: 0 }}>
          Thanks for your order — our team will email <strong>{order?.billingEmail || 'you'}</strong> with the next steps.
        </p>
        <Link href="/status" className="finish-next-btn ready" style={{ textDecoration: 'none' }}>
          View order status →
        </Link>
      </div>
    );
  }
  if (submitted) {
    return (
      <div className="finish-loading" style={{ flexDirection: 'column', gap: '0.75rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Submitted</h1>
        <p style={{ margin: 0 }}>Thanks — your application is on its way to our team. Redirecting…</p>
      </div>
    );
  }

  /* ── Sidebar — three numbered groups, India shape ── */
  const visaLabel = order.visaType ? order.visaType.replace(/_/g, ' ') : '';
  const groupTitleFor = (g: SidebarGroupKey): string => {
    if (g === 'trip')     return 'Trip details';
    if (g === 'uploads')  return 'Upload Documents';
    return travelerName || 'Traveler';
  };
  /* A group is "active" if the current step is one of its sections.
   * "Done" if the current step is past every section in the group. */
  const isSectionDone = (idx: number): boolean => {
    if (typeof step !== 'number') return false;
    return idx < step;
  };
  const isSectionActive = (idx: number): boolean => {
    if (typeof step !== 'number') return false;
    return idx === step;
  };
  const groupStatus = (sections: { idx: number }[]): 'done' | 'active' | 'idle' => {
    if (sections.every(s => isSectionDone(s.idx))) return 'done';
    if (sections.some(s => isSectionActive(s.idx) || isSectionDone(s.idx))) return 'active';
    return 'idle';
  };

  const sidebar = (
    <aside className="finish-sidebar">
      <div className="finish-sidebar-title">{order.destination} {visaLabel} Application</div>
      {sidebarGroups.map((group, gIdx) => {
        const status = groupStatus(group.sections);
        const isUploads = group.key === 'uploads';
        return (
          <div className="finish-step" key={group.key}>
            <div className="finish-step-header">
              <span className={`finish-step-number${status === 'done' ? ' done' : status === 'active' ? ' active' : ''}`}>
                {status === 'done' ? <CheckIcon/> : gIdx + 1}
              </span>
              <span className="finish-step-label">{groupTitleFor(group.key)}</span>
            </div>
            <div className="finish-step-items">
              {/* Upload group prefixes its sub-bullets with a non-bulleted
                  group label (the traveler name) so the structure mirrors
                  India's "Upload Documents" → "Alen Ghazaryan" → "Photo /
                  Bio Page" layout. */}
              {isUploads && (
                <div className="finish-step-group">{travelerName}</div>
              )}
              {group.sections.map(({ idx, section }) => {
                const active = isSectionActive(idx);
                const done = isSectionDone(idx);
                return (
                  <div
                    key={section.key}
                    className={`finish-step-sub${active ? ' current-text' : done ? ' done-text' : ''}`}
                  >
                    {active && <span className="finish-step-bullet"/>}
                    {section.title}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </aside>
  );

  /* ── Overview (landing) — copy + structure mirror India's 1:1 ── */
  if (step === 'overview') {
    const hasUploads = sidebarGroups.some(g => g.key === 'uploads');
    const uploadFieldLabels: string[] = [];
    if (hasUploads) {
      for (const g of sidebarGroups) {
        if (g.key !== 'uploads') continue;
        for (const { section } of g.sections) {
          for (const f of section.fields) {
            if (f.type === 'file') uploadFieldLabels.push(f.label);
          }
        }
      }
    }
    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner">
            <h1 className="finish-heading">Let&apos;s finish your application</h1>
            <p className="finish-time">
              <svg className="finish-time-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 4V8L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Takes 10 minutes or less
            </p>

            <div className="finish-checklist">
              <div className="finish-checklist-title">We still need the following</div>

              <div className="finish-checklist-item">
                <div className="finish-checklist-icon finish-icon-person">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="7" r="3.5" stroke="var(--blue)" strokeWidth="1.5"/>
                    <path d="M3 17.5C3 14 6 12 10 12C14 12 17 14 17 17.5" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <div className="finish-checklist-label">Personal Details</div>
                  <div className="finish-checklist-desc">Provide remaining personal and trip details</div>
                </div>
              </div>

              {hasUploads && (
                <>
                  <div className="finish-checklist-divider"/>
                  <div className="finish-checklist-item">
                    <div className="finish-checklist-icon finish-icon-docs">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <rect x="3" y="2" width="14" height="16" rx="2" stroke="var(--blue)" strokeWidth="1.5"/>
                        <path d="M7 7H13M7 10H13M7 13H10" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div>
                      <div className="finish-checklist-label">Supporting documents</div>
                      <div className="finish-checklist-desc">Upload your documents</div>
                      {uploadFieldLabels.length > 0 && (
                        <ul className="finish-checklist-bullets">
                          {uploadFieldLabels.map(l => <li key={l}>{l}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button className="finish-continue-btn" onClick={() => goTo(0)}>Continue</button>
          </div>
        </main>
      </div>
    );
  }

  /* ── Form step ── */
  if (!currentSection) {
    // Defensive: step pointed past the end. Snap back to overview.
    return null;
  }
  return (
    <div className="finish-page">
      {sidebar}
      <main className="finish-main">
        <div className="finish-main-inner">
          <h1 className="finish-heading">{currentSection.title}</h1>
          {currentSection.description && (
            <p className="finish-time" style={{ marginBottom: '1.5rem' }}>
              {currentSection.description}
            </p>
          )}

          {currentSection.fields.filter(f => !f.hidden).map(field => (
            <SchemaField
              key={field.key}
              field={field}
              value={values[`${currentSection.key}:${field.key}`]}
              onChange={v => setValues(prev => ({ ...prev, [`${currentSection.key}:${field.key}`]: v }))}
              orderId={order.id}
            />
          ))}

          {/* Add Another Traveler — appears at the bottom of the
              Personal section. Trip / Home Address / etc. are
              order-level, so additional travelers ONLY need to
              fill the per-traveler subset (PER_TRAVELER_FIELD_KEYS).
              Resolved by looking up each key across all schema
              sections, since e.g. passportFile lives in `trip`
              but is per-traveler. */}
          {currentSection.key === 'personal' && (
            <ExtraTravelersBlock
              finishSections={finishSections}
              extraTravelers={extraTravelers}
              expandedExtras={expandedExtras}
              onAdd={addExtraTraveler}
              onRemove={removeExtraTraveler}
              onToggle={toggleExtraTraveler}
              onUpdate={updateExtraTraveler}
              orderId={order.id}
            />
          )}

          {error && (
            <p className="finish-form-error" style={{ marginTop: '1rem' }}>{error}</p>
          )}

          <div className="finish-nav">
            <button className="finish-back-btn" onClick={handleBack}>← Back</button>
            <button
              className={`finish-next-btn${canAdvance ? ' ready' : ''}`}
              onClick={handleNext}
              disabled={!canAdvance || submitting}
            >
              {submitting ? 'Submitting…' : isLastStep ? 'Submit application' : 'Continue'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Field renderer ──────────────────────────────────────────────────
 * Uses India's existing classes only.
 */
function SchemaField({ field, value, onChange, orderId }: {
  field: CustomField;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
  orderId: string;
}) {
  const id = `f-${field.key}`;
  const labelEl = (
    <label htmlFor={id} className="finish-form-label">
      {field.label}
      {field.required && <span style={{ color: 'var(--danger, #DC2626)', marginLeft: 4 }} aria-hidden>*</span>}
    </label>
  );
  const helpEl = field.helpText ? (
    <p className="finish-time" style={{ marginTop: '0.4rem', fontSize: '0.82rem' }}>{field.helpText}</p>
  ) : null;

  switch (field.type) {
    case 'textarea':
      return (
        <div className="finish-form-group">
          {labelEl}
          <textarea
            id={id}
            className="finish-form-input"
            placeholder={field.placeholder}
            value={typeof value === 'string' ? value : ''}
            onChange={e => onChange(e.target.value)}
            rows={4}
          />
          {helpEl}
        </div>
      );
    case 'select':
      // Use the searchable CustomDropdown widget — same one India uses
      // for country / port / occupation pickers — instead of a native
      // <select>. Gives a consistent stylised look across destinations
      // and brings free type-to-search even for long lists like the
      // ~190-country nationality dropdown.
      return (
        <div className="finish-form-group">
          {labelEl}
          <CustomDropdown
            options={field.options ?? []}
            value={typeof value === 'string' ? value : ''}
            onChange={onChange}
            placeholder={field.placeholder || `Select ${field.label.toLowerCase()}…`}
          />
          {helpEl}
        </div>
      );
    case 'radio': {
      const opts = field.options ?? [];
      return (
        <div className="finish-form-group">
          {labelEl}
          <div className="finish-radio-row" style={opts.length > 2 ? { flexDirection: 'column' } : undefined}>
            {opts.map(opt => (
              <button
                key={opt}
                type="button"
                className={`finish-radio-btn${value === opt ? ' selected' : ''}`}
                onClick={() => onChange(opt)}
              >
                <span className={`finish-radio-circle${value === opt ? ' active' : ''}`} />
                {opt}
              </button>
            ))}
          </div>
          {helpEl}
        </div>
      );
    }
    case 'checkbox':
      return (
        <div className="finish-form-group">
          <label htmlFor={id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
            <input
              id={id}
              type="checkbox"
              checked={value === true}
              onChange={e => onChange(e.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span className="finish-form-label" style={{ marginBottom: 0 }}>
              {field.label}
              {field.required && <span style={{ color: 'var(--danger, #DC2626)', marginLeft: 4 }} aria-hidden>*</span>}
            </span>
          </label>
          {helpEl}
        </div>
      );
    case 'date':
      return (
        <DateDropdownField
          field={field}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          labelEl={labelEl}
          helpEl={helpEl}
        />
      );
    case 'number':
      return (
        <div className="finish-form-group">
          {labelEl}
          <input
            id={id}
            type="number"
            className="finish-form-input"
            placeholder={field.placeholder}
            value={typeof value === 'string' ? value : ''}
            onChange={e => onChange(e.target.value)}
          />
          {helpEl}
        </div>
      );
    case 'email':
      return (
        <div className="finish-form-group">
          {labelEl}
          <input
            id={id}
            type="email"
            className="finish-form-input"
            placeholder={field.placeholder || 'you@example.com'}
            value={typeof value === 'string' ? value : ''}
            onChange={e => onChange(e.target.value)}
          />
          {helpEl}
        </div>
      );
    case 'tel':
      return (
        <div className="finish-form-group">
          {labelEl}
          <input
            id={id}
            type="tel"
            className="finish-form-input"
            placeholder={field.placeholder || '+1 555 123 4567'}
            value={typeof value === 'string' ? value : ''}
            onChange={e => onChange(e.target.value)}
          />
          {helpEl}
        </div>
      );
    case 'file':
      return (
        <FileUploadField
          id={id}
          field={field}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          orderId={orderId}
          labelEl={labelEl}
          helpEl={helpEl}
        />
      );
    case 'text':
    default: {
      // Flight-number fields are alphanumeric on OUR side (real
      // flight numbers look like "AA1234" — airline code + digits)
      // but Aruba's gov dropdown only accepts the numeric portion.
      // We allow customers to type the full flight number; the bot
      // strips non-digits before searching Aruba's dropdown (see
      // process-aruba.ts → applyField normalisation). No punctuation
      // is allowed since it confuses both ends.
      const isFlightNumber = /flightnumber/i.test(field.key);
      return (
        <div className="finish-form-group">
          {labelEl}
          <input
            id={id}
            type="text"
            className="finish-form-input"
            placeholder={field.placeholder}
            value={typeof value === 'string' ? value : ''}
            onChange={e => {
              const next = isFlightNumber
                ? e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
                : e.target.value;
              onChange(next);
            }}
          />
          {helpEl}
        </div>
      );
    }
  }
}

/* ── Date picker — three dropdowns in a .finish-date-row, matching
 * India's hardcoded arrival-date picker exactly. We pick a sensible
 * year range from the field key (DOB → past 100, expiry → far-future,
 * arrival/departure → near-future) so admins don't have to configure
 * it per field.
 *
 * Internal state for the 3 parts:
 *   The serialised value is "Month D, YYYY" — only meaningful when all
 *   three parts are filled. Mid-selection (e.g. user picks Month but
 *   not Day yet) the formatted value is "", so we'd lose the partial
 *   selection if we re-derived the dropdowns from the prop on every
 *   render. Instead we hold the 3 parts in local state, sync from the
 *   prop on mount + when the parent (e.g. correction-flow seeding)
 *   pushes a different complete value, and only call onChange with a
 *   non-empty string once all 3 are set.
 * ─────────────────────────────────────────────────────────────────── */
function DateDropdownField({ field, value, onChange, labelEl, helpEl }: {
  field: CustomField;
  value: string;
  onChange: (v: string) => void;
  labelEl: React.ReactNode;
  helpEl: React.ReactNode;
}) {
  const years = useMemo(() => yearOptionsFor(field.key), [field.key]);

  const initial = parseStoredDate(value);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay]     = useState(initial.day);
  const [year, setYear]   = useState(initial.year);

  // If the parent pushes a new complete value (e.g. seed from saved
  // travelers JSON, or admin flagging clears a date), reflect it here.
  // We compare formatted vs prop so we don't fight our own writes.
  useEffect(() => {
    const formattedLocal = formatStoredDate(month, day, year);
    if (value === formattedLocal) return;
    const parsed = parseStoredDate(value);
    setMonth(parsed.month);
    setDay(parsed.day);
    setYear(parsed.year);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only react to prop changes
  }, [value]);

  // Push partial-aware writes upward. While any part is missing the
  // serialised value is "" (treated as empty by validation, which is
  // correct — the customer can't advance with a half-filled date).
  const commit = (m: string, d: string, y: string) => {
    setMonth(m); setDay(d); setYear(y);
    onChange(formatStoredDate(m, d, y));
  };

  return (
    <div className="finish-form-group">
      {labelEl}
      <div className="finish-date-row">
        <select
          className="finish-form-select"
          value={month}
          onChange={e => commit(e.target.value, day, year)}
          aria-label={`${field.label} — Month`}
        >
          <option value="">Month</option>
          {MONTH_NAMES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          className="finish-form-select"
          value={day}
          onChange={e => commit(month, e.target.value, year)}
          aria-label={`${field.label} — Day`}
        >
          <option value="">Day</option>
          {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          className="finish-form-select"
          value={year}
          onChange={e => commit(month, day, e.target.value)}
          aria-label={`${field.label} — Year`}
        >
          <option value="">Year</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {helpEl}
    </div>
  );
}

/* ── File upload field — India-shaped buttons for visual parity ── */
function FileUploadField({ id, field, value, onChange, orderId, labelEl, helpEl }: {
  id: string;
  field: CustomField;
  value: string;
  onChange: (v: string) => void;
  orderId: string;
  labelEl: React.ReactNode;
  helpEl: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  /**
   * Map the schema field's key onto one of the upload "buckets" the
   * /api/upload route allowlist accepts: `photo`, `passport`, or
   * `evisa`. The API rejects anything else with "Invalid upload type",
   * so we can't just send `field.key` raw. Heuristic by name keeps
   * future schema additions (e.g. `passportBack`, `selfiePhoto`)
   * working without server changes — anything that isn't obviously a
   * photo defaults to the passport bucket since that's the closest
   * fit for "scan of an identity document". */
  const bucketTypeFor = (fieldKey: string): 'photo' | 'passport' | 'evisa' => {
    const k = fieldKey.toLowerCase();
    if (k.includes('photo') || k.includes('selfie') || k.includes('picture')) return 'photo';
    if (k.includes('evisa') || k.includes('approval')) return 'evisa';
    return 'passport';
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orderId', orderId);
      fd.append('type', bucketTypeFor(field.key));
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
      onChange(data.url);
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed. Try again.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const filename = value ? value.split('/').pop() ?? 'Uploaded file' : '';

  return (
    <div className="finish-form-group">
      {labelEl}
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: '1px solid var(--cloud)', borderRadius: '0.5rem', background: 'var(--mist)' }}>
          <span style={{ flex: 1, color: 'var(--ink)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ✓ {filename}
          </span>
          <button
            type="button"
            onClick={() => onChange('')}
            className="finish-back-btn"
            style={{ padding: '0.35rem 0.8rem', fontSize: '0.85rem' }}
            aria-label="Remove file"
          >
            Remove
          </button>
        </div>
      ) : (
        <label htmlFor={id} className={`finish-next-btn${uploading ? '' : ' ready'}`} style={{ display: 'inline-block', textAlign: 'center', cursor: uploading ? 'wait' : 'pointer' }}>
          {uploading ? 'Uploading…' : 'Choose file'}
        </label>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/gif,image/jpg,application/pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {uploadError && <p className="finish-form-error">{uploadError}</p>}
      {helpEl}
    </div>
  );
}

/* ── Extra travelers block ──────────────────────────────────────────
 * Renders the "+ Add another traveler" UI at the bottom of the
 * Personal section. Each extra traveler is a collapsible card
 * showing ONLY the per-traveler fields (passport, identity,
 * occupation, dual citizenship). Trip / address / contact /
 * payment are order-level and stay on traveler 0 only.
 *
 * Field definitions are resolved by scanning all finishSections for
 * the keys in PER_TRAVELER_FIELD_KEYS — we don't care which section
 * each key originally lived in, just that we render the right input
 * for each one.
 */
function ExtraTravelersBlock(props: {
  finishSections: CustomSection[];
  extraTravelers: FieldValues[];
  expandedExtras: Set<number>;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onToggle: (idx: number) => void;
  onUpdate: (idx: number, key: string, value: FieldValue) => void;
  orderId: string;
}) {
  const { finishSections, extraTravelers, expandedExtras, onAdd, onRemove, onToggle, onUpdate, orderId } = props;

  // Resolve each per-traveler field key to its CustomField definition
  // by scanning all sections. Skips keys the active schema doesn't
  // declare — keeps the block tolerant of country schemas that
  // don't include every field (e.g. a future country without
  // `dualCitizenship`).
  const perTravelerFields: CustomField[] = useMemo(() => {
    const out: CustomField[] = [];
    for (const key of PER_TRAVELER_FIELD_KEYS) {
      for (const sec of finishSections) {
        const f = sec.fields.find(x => x.key === key);
        if (f) { out.push(f); break; }
      }
    }
    return out;
  }, [finishSections]);

  if (perTravelerFields.length === 0) return null;

  return (
    <div style={{
      marginTop: '2rem',
      paddingTop: '1.5rem',
      borderTop: '1px solid var(--border, #e5e7eb)',
    }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, marginBottom: '0.4rem' }}>
        Additional Travelers
      </h2>
      <p className="finish-time" style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.85rem' }}>
        Add another person travelling on the same trip. Each traveler needs their own passport upload and identity details — trip dates and address stay shared across the order.
      </p>

      {extraTravelers.map((fv, idx) => {
        const expanded = expandedExtras.has(idx);
        const displayName = `${String(fv.firstName || '').trim()} ${String(fv.lastName || '').trim()}`.trim();
        return (
          <div key={idx} style={{
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: '0.5rem',
            marginBottom: '0.75rem',
            background: 'white',
          }}>
            <div
              onClick={() => onToggle(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.85rem 1rem',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600 }}>
                Traveler #{idx + 2}
                {displayName && <span style={{ marginLeft: '0.5rem', color: 'var(--ink-soft, #6b7280)', fontWeight: 400 }}>— {displayName}</span>}
              </div>
              <span style={{
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
                fontSize: '1.2rem',
                color: 'var(--ink-soft, #6b7280)',
              }}>›</span>
            </div>
            {expanded && (
              <div style={{ padding: '0 1rem 1rem 1rem', borderTop: '1px solid var(--border, #e5e7eb)' }}>
                {perTravelerFields.map(f => (
                  <SchemaField
                    key={f.key}
                    field={f}
                    value={fv[f.key]}
                    onChange={v => onUpdate(idx, f.key, v)}
                    orderId={orderId}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.45rem 0.8rem',
                    background: 'white',
                    color: '#991b1b',
                    border: '1px solid #fca5a5',
                    borderRadius: '0.4rem',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Remove this traveler
                </button>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        style={{
          marginTop: extraTravelers.length > 0 ? '0.25rem' : 0,
          padding: '0.6rem 1rem',
          background: 'white',
          color: 'var(--blue, #2563eb)',
          border: '1px dashed var(--blue, #2563eb)',
          borderRadius: '0.4rem',
          fontSize: '0.9rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}
      >
        <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span> Add another traveler
      </button>
    </div>
  );
}
