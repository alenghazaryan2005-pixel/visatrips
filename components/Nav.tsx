'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const close = () => setMenuOpen(false);

  return (
    <header>
      <nav id="main-nav" className={scrolled ? 'scrolled' : ''}>
        <div className="nav-inner">
          <Link href="/" className="logo">
            VisaTrips<sup>®</sup>
          </Link>

          <div className="nav-right">
            <ul className={`nav-links${menuOpen ? ' active' : ''}`} id="navLinks">
              <li><a href="#services" onClick={close}>Services</a></li>
              <li><a href="#process"  onClick={close}>Process</a></li>
              <li><a href="#apply"    onClick={close}>Apply</a></li>
            </ul>

            <button
              className="hamburger"
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(v => !v)}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
}
