import Link from 'next/link';

export default function Footer() {
  return (
    <div className="footer-bg">
      <footer>
        <Link href="/" className="logo">VisaTrips<sup>®</sup></Link>
        <nav>
          <ul>
            <li><a href="/#services">Services</a></li>
            <li><a href="/#process">Process</a></li>
            <li><Link href="/contact">Contact</Link></li>
            <li><Link href="/privacy">Privacy</Link></li>
            <li><Link href="/terms">Terms</Link></li>
          </ul>
        </nav>
        <span className="footer-copy">© 2026 VisaTrips. All rights reserved.</span>
      </footer>
    </div>
  );
}
