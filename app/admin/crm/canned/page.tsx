'use client';

/**
 * Canned-response authoring page — the place where admins build and
 * maintain the library of pre-written replies. The redesign mirrors
 * Freshdesk's authoring UX: scoped lists (Personal / Shared), per-row
 * usage stats, slash-command shortcuts, a clickable variables toolbar
 * to insert placeholders at the caret, and a live preview pane that
 * shows what the response will look like once variables are resolved.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { AdminSidebar } from '@/components/AdminSidebar';
import {
  Search, Plus, Trash2, Folder, Eye, Hash,
  User as UserIcon, Mail as MailIcon, Receipt, Calendar, UserCog,
  Lock, Globe, AlertTriangle, X as XIcon,
} from 'lucide-react';

interface CannedResponse {
  id: string;
  title: string;
  content: string;
  folder: string;
  tags: string | null;
  visibility: 'personal' | 'shared';
  shortcut: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

type Scope = 'all' | 'shared' | 'mine';

/**
 * Variables the editor lets the user insert at the caret. Each chip in
 * the toolbar inserts the literal placeholder string into the textarea.
 * The picker on the ticket page resolves these at insert time using the
 * matching ticket / order / agent context. The `sample` value is what
 * the live preview substitutes so the admin can see formatting.
 */
const VARIABLES: Array<{ key: string; label: string; sample: string; Icon: typeof UserIcon }> = [
  { key: 'name',   label: "Customer's first name", sample: 'Alex',                  Icon: UserIcon },
  { key: 'email',  label: 'Customer email',         sample: 'alex@example.com',     Icon: MailIcon },
  { key: 'ticket', label: 'Ticket number',          sample: '#1042',                Icon: Hash },
  { key: 'order',  label: 'Order number',           sample: '#00451',               Icon: Receipt },
  { key: 'agent',  label: 'Your name',              sample: 'Sam (Support)',        Icon: UserCog },
  { key: 'date',   label: 'Today',                  sample: 'Apr 30, 2026',         Icon: Calendar },
];

/** Resolve variables in `content` against the sample dictionary — used
 *  by the live preview to show "what the customer will see". The runtime
 *  resolver on the ticket page uses the actual ticket context instead. */
function renderPreview(content: string): string {
  let out = content;
  for (const v of VARIABLES) {
    out = out.replace(new RegExp(`\\{\\{${v.key}\\}\\}`, 'g'), v.sample);
  }
  return out;
}

export default function CannedResponsesPage() {
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState('All');
  const [scope, setScope] = useState<Scope>('all');
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formFolder, setFormFolder] = useState('General');
  const [formTags, setFormTags] = useState('');
  const [formNewTag, setFormNewTag] = useState('');
  const [formVisibility, setFormVisibility] = useState<'shared' | 'personal'>('shared');
  const [formShortcut, setFormShortcut] = useState('');
  const [saving, setSaving] = useState(false);

  // Ref into the content textarea so the variables toolbar can insert at
  // the caret rather than always at the end.
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  /* ── Fetch (server-side filtered) ──────────────────────────────────── */
  const fetchResponses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (activeFolder !== 'All') params.set('folder', activeFolder);
      if (scope !== 'all') params.set('scope', scope);
      const res = await fetch(`/api/canned?${params.toString()}`);
      if (res.ok) setResponses(await res.json());
    } catch {} finally { setLoading(false); }
  }, [search, activeFolder, scope]);

  // Debounce search-driven refetches (200ms) so each keystroke doesn't
  // hammer the API. Folder + scope changes refetch immediately.
  useEffect(() => {
    const t = setTimeout(fetchResponses, search ? 200 : 0);
    return () => clearTimeout(t);
  }, [fetchResponses, search]);

  /* ── Folder counts (computed from the current response list) ────────── */
  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of responses) counts.set(r.folder, (counts.get(r.folder) || 0) + 1);
    return ['All', ...Array.from(counts.keys()).sort()];
  }, [responses]);

  const allCannedTags = useMemo(() => (
    [...new Set(responses.flatMap(r =>
      r.tags ? r.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    ))].sort()
  ), [responses]);

  // Modal lifecycle: lock body scroll while open + global Esc closes.
  // We use a document-level listener so Esc fires regardless of which
  // form field has focus.
  const modalOpen = showNew || !!editing;
  useEffect(() => {
    if (!modalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelForm(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
    // cancelForm is stable enough — defining it as useCallback would
    // require touching every place that calls it. The effect re-runs on
    // open/close which is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  /* ── Form lifecycle ───────────────────────────────────────────────── */
  const startEdit = (r: CannedResponse) => {
    setEditing(r);
    setShowNew(false);
    setFormTitle(r.title);
    setFormContent(r.content);
    setFormFolder(r.folder);
    setFormTags(r.tags || '');
    setFormVisibility(r.visibility);
    setFormShortcut(r.shortcut || '');
    setError('');
  };

  const startNew = () => {
    setEditing(null);
    setShowNew(true);
    setFormTitle('');
    setFormContent('');
    setFormFolder('General');
    setFormTags('');
    setFormVisibility('shared');
    setFormShortcut('');
    setError('');
  };

  const cancelForm = () => {
    setEditing(null);
    setShowNew(false);
    setFormTitle(''); setFormContent('');
    setFormFolder('General'); setFormTags('');
    setFormVisibility('shared'); setFormShortcut('');
    setError('');
  };

  const addFormTag = (tag?: string) => {
    const t = (typeof tag === 'string' ? tag : formNewTag).trim();
    if (!t) return;
    const tags = formTags ? formTags.split(',').map(x => x.trim()).filter(Boolean) : [];
    if (!tags.includes(t)) tags.push(t);
    setFormTags(tags.join(', '));
    setFormNewTag('');
  };

  const removeFormTag = (tag: string) => {
    setFormTags(formTags.split(',').map(t => t.trim()).filter(t => t !== tag).join(', '));
  };

  /** Insert `{{key}}` at the textarea's current caret position. Falls
   *  back to appending if the textarea isn't focused / has no caret. */
  const insertVariable = (key: string) => {
    const el = contentRef.current;
    const placeholder = `{{${key}}}`;
    if (!el) {
      setFormContent(prev => prev + placeholder);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const next  = el.value.slice(0, start) + placeholder + el.value.slice(end);
    setFormContent(next);
    // Restore caret just after the inserted placeholder on the next tick.
    queueMicrotask(() => {
      el.focus();
      const p = start + placeholder.length;
      el.setSelectionRange(p, p);
    });
  };

  const saveResponse = async () => {
    if (!formTitle || !formContent) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        title:      formTitle,
        content:    formContent,
        folder:     formFolder || 'General',
        tags:       formTags || null,
        visibility: formVisibility,
        shortcut:   formShortcut.trim() || null,
      };
      const url    = editing ? `/api/canned/${editing.id}` : '/api/canned';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Failed to save.');
        return;
      }
      cancelForm();
      fetchResponses();
    } catch {
      setError('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  const deleteResponse = async (id: string, title: string) => {
    // Real confirm — Freshdesk fires a modal; a confirm() is enough here.
    if (!confirm(`Delete the canned response "${title}"? This can't be undone.`)) return;
    await fetch(`/api/canned/${id}`, { method: 'DELETE' });
    if (editing?.id === id) cancelForm();
    fetchResponses();
  };

  /* ── Render ───────────────────────────────────────────────────────── */
  return (
    <div className="admin-shell">
      <AdminSidebar active="emails" />

      <div className="admin-main" style={{ maxWidth: '100%' }}>

        {/* ── List ── */}
        <div style={{ minWidth: 0 }}>
          <div className="crm-page-header">
            <div>
              <h1 className="crm-page-title">Canned Responses</h1>
              <p className="crm-page-sub">
                {responses.length} response{responses.length !== 1 ? 's' : ''}
                {' · '}
                Type <code style={{ background: '#f1f5f9', padding: '0.05rem 0.3rem', borderRadius: '0.25rem', fontSize: '0.78rem' }}>/shortcut</code> in any reply to insert quickly
              </p>
            </div>
            <button className="crm-new-btn" onClick={startNew} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <Plus size={16} strokeWidth={2.2} />
              New Response
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: '0.85rem' }}>
            <Search
              size={16}
              strokeWidth={1.85}
              style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}
            />
            <input
              className="crm-search"
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Search title, content, tags, or /shortcut..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Scope tabs (Personal / Shared / All) */}
          <div className="crm-filter-tabs" style={{ marginBottom: '0.5rem' }}>
            {(['all', 'shared', 'mine'] as Scope[]).map(s => (
              <button
                key={s}
                className={`crm-filter-tab${scope === s ? ' active' : ''}`}
                onClick={() => { setScope(s); setActiveFolder('All'); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                {s === 'mine' ? <Lock size={12} /> : s === 'shared' ? <Globe size={12} /> : null}
                {s === 'all' ? 'All' : s === 'shared' ? 'Shared' : 'Personal'}
              </button>
            ))}
          </div>

          {/* Folder tabs */}
          <div className="crm-filter-tabs" style={{ marginBottom: '0.85rem' }}>
            {folders.map(f => {
              const count = f === 'All' ? responses.length : responses.filter(r => r.folder === f).length;
              return (
                <button
                  key={f}
                  className={`crm-filter-tab${activeFolder === f ? ' active' : ''}`}
                  onClick={() => setActiveFolder(f)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  {f !== 'All' && <Folder size={12} />}
                  {f} <span style={{ opacity: 0.65 }}>({count})</span>
                </button>
              );
            })}
          </div>

          {/* List */}
          {loading ? (
            <div className="admin-empty">Loading...</div>
          ) : responses.length === 0 ? (
            <div className="admin-empty" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--ink)' }}>
                {search || activeFolder !== 'All' || scope !== 'all'
                  ? 'No responses match your filters.'
                  : 'Build your library of canned replies.'}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--slate)', maxWidth: '380px', margin: '0 auto' }}>
                {search || activeFolder !== 'All' || scope !== 'all'
                  ? 'Try clearing the search or switching scopes.'
                  : 'Create canned responses for the messages you send most often. Add a /shortcut to invoke them instantly from any ticket reply.'}
              </div>
              {!(search || activeFolder !== 'All' || scope !== 'all') && (
                <button className="crm-new-btn" onClick={startNew} style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Plus size={16} strokeWidth={2.2} />
                  Create your first response
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {responses.map(r => (
                <div key={r.id} className={`canned-card${editing?.id === r.id ? ' active' : ''}`} onClick={() => startEdit(r)}>
                  <div className="canned-card-header" style={{ alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className="canned-card-title">{r.title}</span>
                    {r.shortcut && (
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        background: '#eef2ff', color: '#4338ca',
                        padding: '0.1rem 0.4rem', borderRadius: '0.3rem',
                      }}>
                        /{r.shortcut}
                      </span>
                    )}
                    <span className="canned-card-folder" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Folder size={11} /> {r.folder}
                    </span>
                    {r.visibility === 'personal' && (
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 700,
                        background: '#fef3c7', color: '#92400e',
                        padding: '0.1rem 0.4rem', borderRadius: '0.3rem',
                        display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                      }} title="Only you can see this response">
                        <Lock size={10} /> Personal
                      </span>
                    )}
                    {r.usageCount > 0 && (
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 700,
                        background: '#ecfdf5', color: '#065f46',
                        padding: '0.1rem 0.4rem', borderRadius: '0.3rem',
                        marginLeft: 'auto',
                      }} title={`Used ${r.usageCount} time${r.usageCount === 1 ? '' : 's'}`}>
                        Used {r.usageCount}×
                      </span>
                    )}
                  </div>
                  {r.tags && (
                    <div className="crm-card-tags" style={{ marginTop: '0.35rem', marginBottom: '0.25rem' }}>
                      {r.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                        <span key={t} className="crm-tag">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="canned-card-preview">{r.content.slice(0, 140)}{r.content.length > 140 ? '...' : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Centered modal: edit / create form ──
            Click-outside on the backdrop closes; the inner card stops
            propagation so clicks within the form are unaffected. The
            modal itself listens for Esc on its outer div via React's
            onKeyDown — focus is naturally on the first input or the X
            button, which lets Esc fire reliably. */}
        {(showNew || editing) && (
          <div
            className="canned-edit-panel"
            onClick={cancelForm}
            onKeyDown={e => { if (e.key === 'Escape') cancelForm(); }}
          >
            <div className="canned-edit-panel-inner" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                className="canned-edit-close"
                onClick={cancelForm}
                aria-label="Close"
                title="Close (Esc)"
              >
                <XIcon size={18} strokeWidth={2} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', paddingRight: '2.25rem' }}>
                <h3 className="canned-edit-title" style={{ margin: 0 }}>
                  {editing ? 'Edit response' : 'New response'}
                </h3>
                {editing && (
                  <button
                    className="od-edit-remove-btn"
                    onClick={() => deleteResponse(editing.id, editing.title)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}
                  >
                    <Trash2 size={14} strokeWidth={1.85} />
                    Delete
                  </button>
                )}
              </div>

            {/* Inline error */}
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem',
                padding: '0.55rem 0.75rem', marginBottom: '0.75rem',
                color: '#991b1b', fontSize: '0.82rem',
                display: 'inline-flex', alignItems: 'flex-start', gap: '0.4rem',
              }}>
                <AlertTriangle size={14} strokeWidth={1.85} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
                {error}
              </div>
            )}

            <div className="ap-field">
              <label className="ap-field-label">Title</label>
              <input
                className="ap-input"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="e.g. Welcome reply"
              />
            </div>

            {/* Folder + Shortcut + Visibility row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="ap-field">
                <label className="ap-field-label">Folder</label>
                <input
                  className="ap-input"
                  value={formFolder}
                  onChange={e => setFormFolder(e.target.value)}
                  placeholder="General"
                  list="folder-suggestions"
                />
                <datalist id="folder-suggestions">
                  {[...new Set(responses.map(r => r.folder))].map(f => <option key={f} value={f} />)}
                </datalist>
              </div>

              <div className="ap-field">
                <label className="ap-field-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  Shortcut <span style={{ color: 'var(--slate)', fontSize: '0.72rem', fontWeight: 400 }}>(optional)</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{
                    color: 'var(--slate)', fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    fontWeight: 700, fontSize: '0.95rem', userSelect: 'none',
                  }}>/</span>
                  <input
                    className="ap-input"
                    value={formShortcut}
                    onChange={e => setFormShortcut(e.target.value.replace(/^\/+/, '').toLowerCase())}
                    placeholder="welcome"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
                  />
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--slate)', marginTop: '0.25rem' }}>
                  Type {formShortcut ? <code>/{formShortcut}</code> : '/shortcut'} in any reply to insert.
                </div>
              </div>
            </div>

            {/* Visibility toggle */}
            <div className="ap-field">
              <label className="ap-field-label">Visibility</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {([
                  { v: 'shared',   Icon: Globe, label: 'Shared',   sub: 'All admins' },
                  { v: 'personal', Icon: Lock,  label: 'Personal', sub: 'Only you' },
                ] as const).map(({ v, Icon, label, sub }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFormVisibility(v)}
                    style={{
                      flex: 1, padding: '0.55rem 0.75rem', borderRadius: '0.5rem',
                      border: '1px solid ' + (formVisibility === v ? 'var(--blue)' : '#e5e7eb'),
                      background: formVisibility === v ? 'rgba(108,138,255,0.06)' : 'white',
                      color: formVisibility === v ? 'var(--blue)' : 'var(--ink)',
                      fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                      textAlign: 'left',
                    }}
                  >
                    <Icon size={15} strokeWidth={1.85} />
                    <span>
                      <span style={{ display: 'block' }}>{label}</span>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--slate)', fontWeight: 400 }}>{sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Variables toolbar */}
            <div className="ap-field">
              <label className="ap-field-label">Insert variable</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {VARIABLES.map(v => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    title={v.label}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.3rem 0.55rem', borderRadius: '999px',
                      border: '1px solid #e5e7eb', background: '#f8fafc',
                      fontSize: '0.74rem', fontWeight: 600, color: '#334155',
                      cursor: 'pointer', fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    }}
                  >
                    <v.Icon size={12} strokeWidth={1.85} />
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--slate)', marginTop: '0.3rem' }}>
                Click to insert at the cursor. Variables are resolved against the ticket / order / agent at send time.
              </div>
            </div>

            {/* Content + Live Preview */}
            <div className="ap-field">
              <label className="ap-field-label">Content</label>
              <textarea
                ref={contentRef}
                className="ap-input contact-textarea"
                rows={8}
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                placeholder="Hi {{name}},

Thanks for reaching out about {{ticket}}. ..."
              />
            </div>

            {formContent && (
              <div className="ap-field">
                <label className="ap-field-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Eye size={13} strokeWidth={1.85} />
                  Preview <span style={{ color: 'var(--slate)', fontSize: '0.72rem', fontWeight: 400 }}>(with sample data)</span>
                </label>
                <div style={{
                  background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '0.5rem',
                  padding: '0.7rem 0.85rem', fontSize: '0.85rem', lineHeight: 1.55,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  color: 'var(--ink)', maxHeight: '200px', overflowY: 'auto',
                }}>
                  {renderPreview(formContent)}
                </div>
              </div>
            )}

            {/* Tags */}
            <div className="ap-field">
              <label className="ap-field-label">Tags</label>
              <div className="crm-tags-wrap" style={{ marginBottom: '0.5rem' }}>
                {formTags
                  ? formTags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                      <span key={t} className="crm-tag removable" onClick={() => removeFormTag(t)}>
                        {t} ✕
                      </span>
                    ))
                  : <span style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>No tags</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <input
                  className="ap-input"
                  style={{ flex: 1 }}
                  placeholder="Add tag..."
                  value={formNewTag}
                  onChange={e => setFormNewTag(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFormTag())}
                  list="canned-tag-suggestions"
                />
                <datalist id="canned-tag-suggestions">
                  {allCannedTags.filter(t => !formTags.split(',').map(x => x.trim()).includes(t)).map(t => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <button type="button" className="crm-tag-btn" onClick={() => addFormTag()}>+</button>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                className="crm-new-btn"
                onClick={saveResponse}
                disabled={saving || !formTitle || !formContent}
              >
                {saving ? 'Saving...' : editing ? 'Update response' : 'Create response'}
              </button>
              <button className="crm-cancel-btn" onClick={cancelForm}>Cancel</button>
            </div>

            {/* Footer metadata */}
            {editing && (
              <div style={{
                marginTop: '1rem', padding: '0.6rem 0.8rem',
                background: '#f8fafc', borderRadius: '0.5rem',
                fontSize: '0.72rem', color: 'var(--slate)', lineHeight: 1.55,
              }}>
                Used <strong>{editing.usageCount}</strong> time{editing.usageCount === 1 ? '' : 's'}
                {editing.lastUsedAt ? ` · last on ${new Date(editing.lastUsedAt).toLocaleDateString()}` : ''}
                <br />
                Created by {editing.createdBy ?? 'unknown'} · {new Date(editing.createdAt).toLocaleDateString()}
                {editing.updatedBy && editing.updatedBy !== editing.createdBy && (
                  <> · last edited by {editing.updatedBy}</>
                )}
              </div>
            )}

              <p style={{
                marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--slate)',
              }}>
                <Link href="/admin/crm" style={{ color: 'var(--blue)' }}>← Back to tickets</Link>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
