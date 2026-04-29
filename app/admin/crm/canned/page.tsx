'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminSidebar } from '@/components/AdminSidebar';

interface CannedResponse {
  id: string;
  title: string;
  content: string;
  folder: string;
  tags: string | null;
  createdBy: string | null;
  createdAt: string;
}

export default function CannedResponsesPage() {
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState('All');
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formFolder, setFormFolder] = useState('General');
  const [formTags, setFormTags] = useState('');
  const [formNewTag, setFormNewTag] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchResponses = useCallback(async () => {
    try {
      const res = await fetch('/api/canned');
      if (res.ok) setResponses(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchResponses(); }, [fetchResponses]);

  const folders = ['All', ...new Set(responses.map(r => r.folder))];

  const filtered = responses.filter(r => {
    if (activeFolder !== 'All' && r.folder !== activeFolder) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.title.toLowerCase().includes(s) || r.content.toLowerCase().includes(s);
    }
    return true;
  });

  const allCannedTags = [...new Set(responses.flatMap(r => r.tags ? r.tags.split(',').map(t => t.trim()).filter(Boolean) : []))].sort();

  const startEdit = (r: CannedResponse) => {
    setEditing(r);
    setFormTitle(r.title);
    setFormContent(r.content);
    setFormFolder(r.folder);
    setFormTags(r.tags || '');
    setShowNew(false);
  };

  const startNew = () => {
    setEditing(null);
    setFormTitle('');
    setFormContent('');
    setFormFolder('General');
    setFormTags('');
    setShowNew(true);
  };

  const cancelForm = () => {
    setEditing(null);
    setShowNew(false);
    setFormTitle('');
    setFormContent('');
    setFormFolder('General');
    setFormTags('');
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

  const saveResponse = async () => {
    if (!formTitle || !formContent) return;
    setSaving(true);
    try {
      if (editing) {
        await fetch(`/api/canned/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: formTitle, content: formContent, folder: formFolder, tags: formTags || null }),
        });
      } else {
        await fetch('/api/canned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: formTitle, content: formContent, folder: formFolder, tags: formTags || null }),
        });
      }
      cancelForm();
      fetchResponses();
    } catch {} finally { setSaving(false); }
  };

  const deleteResponse = async (id: string) => {
    await fetch(`/api/canned/${id}`, { method: 'DELETE' });
    if (editing?.id === id) cancelForm();
    fetchResponses();
  };


  return (
    <div className="admin-shell">
      <AdminSidebar active="emails" />

      <div className="admin-main" style={{ maxWidth: '100%', display: 'flex', gap: '1.5rem' }}>

        {/* Left — Folder list + Response list */}
        <div style={{ flex: 1 }}>
          <div className="crm-page-header">
            <div>
              <h1 className="crm-page-title">Canned Responses</h1>
              <p className="crm-page-sub">{responses.length} response{responses.length !== 1 ? 's' : ''}</p>
            </div>
            <button className="crm-new-btn" onClick={startNew}>+ New Response</button>
          </div>

          {/* Search */}
          <input className="crm-search" style={{ marginBottom: '1rem' }} placeholder="Search responses..." value={search} onChange={e => setSearch(e.target.value)} />

          {/* Folder tabs */}
          <div className="crm-filter-tabs" style={{ marginBottom: '1rem' }}>
            {folders.map(f => (
              <button key={f} className={`crm-filter-tab${activeFolder === f ? ' active' : ''}`} onClick={() => setActiveFolder(f)}>
                {f} {f !== 'All' ? `(${responses.filter(r => r.folder === f).length})` : `(${responses.length})`}
              </button>
            ))}
          </div>

          {/* Response list */}
          {loading ? (
            <div className="admin-empty">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty">{responses.length === 0 ? 'No canned responses yet. Create one to get started.' : 'No responses match your search.'}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filtered.map(r => (
                <div key={r.id} className={`canned-card${editing?.id === r.id ? ' active' : ''}`} onClick={() => startEdit(r)}>
                  <div className="canned-card-header">
                    <span className="canned-card-title">{r.title}</span>
                    <span className="canned-card-folder">{r.folder}</span>
                  </div>
                  {r.tags && (
                    <div className="crm-card-tags" style={{ marginTop: '0.35rem', marginBottom: '0.25rem' }}>
                      {r.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                        <span key={t} className="crm-tag">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="canned-card-preview">{r.content.slice(0, 120)}{r.content.length > 120 ? '...' : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — Edit / Create form */}
        {(showNew || editing) && (
          <div className="canned-edit-panel">
            <h3 className="canned-edit-title">{editing ? 'Edit Response' : 'New Response'}</h3>

            <div className="ap-field">
              <label className="ap-field-label">Title</label>
              <input className="ap-input" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. Welcome Reply" />
            </div>

            <div className="ap-field">
              <label className="ap-field-label">Folder</label>
              <input className="ap-input" value={formFolder} onChange={e => setFormFolder(e.target.value)} placeholder="e.g. General, Visa, Billing" list="folder-suggestions" />
              <datalist id="folder-suggestions">
                {[...new Set(responses.map(r => r.folder))].map(f => <option key={f} value={f} />)}
              </datalist>
            </div>

            <div className="ap-field">
              <label className="ap-field-label">Content</label>
              <textarea className="ap-input contact-textarea" rows={10} value={formContent} onChange={e => setFormContent(e.target.value)} placeholder="Type your canned response here...

You can use placeholders like:
{{name}} — Customer's name
{{order}} — Order number
{{ticket}} — Ticket number" />
            </div>

            <div className="ap-field">
              <label className="ap-field-label">Tags</label>
              <div className="crm-tags-wrap" style={{ marginBottom: '0.5rem' }}>
                {formTags ? formTags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                  <span key={t} className="crm-tag removable" onClick={() => removeFormTag(t)}>{t} ✕</span>
                )) : <span style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>No tags</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <input className="ap-input" style={{ flex: 1 }} placeholder="Add tag..." value={formNewTag} onChange={e => setFormNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFormTag())} list="canned-tag-suggestions" />
                <datalist id="canned-tag-suggestions">
                  {allCannedTags.filter(t => !formTags.split(',').map(x => x.trim()).includes(t)).map(t => <option key={t} value={t} />)}
                </datalist>
                <button type="button" className="crm-tag-btn" onClick={() => addFormTag()}>+</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button className="crm-new-btn" onClick={saveResponse} disabled={saving || !formTitle || !formContent}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
              <button className="crm-cancel-btn" onClick={cancelForm}>Cancel</button>
              {editing && (
                <button className="od-edit-remove-btn" style={{ marginLeft: 'auto' }} onClick={() => deleteResponse(editing.id)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
