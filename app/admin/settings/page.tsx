'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminSidebar } from '@/components/AdminSidebar';

interface CountryCard {
  slug: string;
  name: string;
  flag: string;
  status: 'live' | 'coming-soon';
  description: string;
}

const COUNTRIES: CountryCard[] = [
  { slug: 'india',    name: 'India',       flag: '🇮🇳', status: 'live',         description: 'Tourist, Business, and Medical eVisas' },
  { slug: 'turkey',   name: 'Turkey',      flag: '🇹🇷', status: 'coming-soon', description: 'eVisa for tourism and transit' },
  { slug: 'egypt',    name: 'Egypt',       flag: '🇪🇬', status: 'coming-soon', description: 'eVisa for single and multiple entry' },
  { slug: 'cambodia', name: 'Cambodia',    flag: '🇰🇭', status: 'coming-soon', description: 'Tourist and Business eVisas' },
  { slug: 'vietnam',  name: 'Vietnam',     flag: '🇻🇳', status: 'coming-soon', description: 'eVisa for 80+ eligible countries' },
];

export default function SettingsLandingPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/errors?resolved=false&limit=1');
        if (res.status === 401) { router.push('/admin'); return; }
        setAuthed(true);
      } catch {} finally { setLoading(false); }
    })();
  }, [router]);

  if (loading || !authed) return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading…</div>;

  return (
    <div className="admin-shell">
      <AdminSidebar active="settings" />

      <div className="admin-main" style={{ maxWidth: '100%' }}>
        <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.25rem' }}>⚙️ Admin Settings</h1>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Pick a country to manage its prices, email templates, status labels, and custom email flows.</p>
          </div>

          {/* Site-wide customization */}
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Site-wide</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
            <Link href="/admin/theme" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="country-card-live" style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '0.85rem',
                padding: '1.25rem',
                cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                position: 'relative',
              }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎨</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.2rem' }}>Color Palette</div>
                <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '0.75rem' }}>Customize the colors used across every page. Save and apply presets.</div>
                <div style={{
                  display: 'inline-block',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '0.3rem',
                  background: '#d1fae5',
                  color: '#065f46',
                  textTransform: 'uppercase',
                }}>● Live</div>
              </div>
            </Link>

            <Link href="/admin/features" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="country-card-live" style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '0.85rem',
                padding: '1.25rem',
                cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                position: 'relative',
              }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🧪</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.2rem' }}>Features</div>
                <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '0.75rem' }}>Toggle optional features on or off across the admin panel.</div>
                <div style={{
                  display: 'inline-block',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '0.3rem',
                  background: '#d1fae5',
                  color: '#065f46',
                  textTransform: 'uppercase',
                }}>● Live</div>
              </div>
            </Link>
          </div>

          {/* Country-specific settings */}
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Countries</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {COUNTRIES.map(c => {
              const isLive = c.status === 'live';
              const card = (
                <div style={{
                  background: 'white',
                  border: '1px solid ' + (isLive ? '#e5e7eb' : '#f3f4f6'),
                  borderRadius: '0.85rem',
                  padding: '1.25rem',
                  cursor: isLive ? 'pointer' : 'not-allowed',
                  opacity: isLive ? 1 : 0.55,
                  transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                  position: 'relative',
                }} className={isLive ? 'country-card-live' : ''}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{c.flag}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.2rem' }}>{c.name}</div>
                  <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '0.75rem' }}>{c.description}</div>
                  <div style={{
                    display: 'inline-block',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '0.3rem',
                    background: isLive ? '#d1fae5' : '#f3f4f6',
                    color: isLive ? '#065f46' : '#6b7280',
                    textTransform: 'uppercase',
                  }}>{isLive ? '● Live' : '○ Coming soon'}</div>
                </div>
              );
              return isLive
                ? <Link key={c.slug} href={`/admin/settings/${c.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>{card}</Link>
                : <div key={c.slug}>{card}</div>;
            })}
          </div>

          <style jsx>{`
            .country-card-live:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
              border-color: var(--blue) !important;
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}
