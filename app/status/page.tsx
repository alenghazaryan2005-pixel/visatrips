'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { formatOrderNum, VISA_LABELS, STATUS_COLORS } from '@/lib/constants';

interface Order {
  id: string;
  orderNumber: number;
  createdAt: string;
  updatedAt: string;
  destination: string;
  visaType: string;
  totalUSD: number;
  status: string;
  billingEmail: string;
  cardLast4: string | null;
  processingSpeed: string;
  travelers: string;
}

interface Traveler {
  firstName?: string;
  lastName?: string;
  email?: string;
  month?: string;
  day?: string;
  year?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  passportCountry?: string;
  passportNumber?: string;
  passportIssMonth?: string;
  passportIssDay?: string;
  passportIssYear?: string;
  passportExpMonth?: string;
  passportExpDay?: string;
  passportExpYear?: string;
  isEmployed?: string;
  hasConviction?: string;
  hasTravelPlans?: string;
  arrivalMonth?: string;
  arrivalDay?: string;
  arrivalYear?: string;
  // Extended finish data
  arrivalDate?: string;
  arrivalPoint?: string;
  visitedCountries?: string[];
  parentsFromPakistan?: string;
  gender?: string;
  countryOfBirth?: string;
  holdAnotherNationality?: string;
  otherNationality?: string;
  maritalStatus?: string;
  residenceCountry?: string;
  employmentStatus?: string;
  employerName?: string;
  employerAddress?: string;
  employerCity?: string;
  employerState?: string;
  employerCountry?: string;
  employerZip?: string;
  studentProvider?: string;
  servedMilitary?: string;
  knowParents?: string;
  fatherName?: string;
  fatherNationality?: string;
  fatherPlaceOfBirth?: string;
  motherName?: string;
  motherNationality?: string;
  motherPlaceOfBirth?: string;
  spouseName?: string;
  spouseNationality?: string;
  spouseCountryOfBirth?: string;
  finishStep?: string;
}

const SPEED_LABELS: Record<string, string> = {
  standard: 'Standard',
  rush: 'Rush',
  super: 'Super Rush',
};

export default function StatusPage() {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/customer/session')
      .then(r => r.json())
      .then(async (session) => {
        if (!session.authenticated) { router.replace('/login'); return; }
        const res = await fetch(`/api/orders/${session.orderId}`);
        const data = await res.json();
        if (data.error) { router.replace('/login'); return; }
        setOrder(data);
        try { setTravelers(JSON.parse(data.travelers)); } catch { setTravelers([]); }
        setLoading(false);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/customer/logout', { method: 'POST' });
    router.push('/login');
  };

  if (loading) return <div style={{ paddingTop: '120px', textAlign: 'center' }}>Loading...</div>;
  if (!order) return null;

  const createdDate = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <>
      <Nav />
      <div className="customer-status-page">
        <div className="customer-status-header">
          <div>
            <h1 className="customer-status-title">Your Visa Application</h1>
            <p className="customer-status-order-num">Order #{formatOrderNum(order.orderNumber)}</p>
          </div>
          <button className="customer-status-logout" onClick={handleLogout}>Log Out</button>
        </div>

        {/* CTA */}
        {(() => {
          const isProcessing = order.status === 'UNDER_REVIEW' || order.status === 'APPROVED' || travelers.some(t => t.finishStep === 'complete');
          return isProcessing ? (
            <div className="customer-status-cta" style={{ background: '#16a34a' }}>
              <div>
                <h3 className="customer-status-cta-title">Your Application is Processing!</h3>
                <p className="customer-status-cta-text">We are reviewing your visa application. You will be notified of any updates.</p>
              </div>
            </div>
          ) : (
            <div className="customer-status-cta">
              <div>
                <h3 className="customer-status-cta-title">Continue your application</h3>
                <p className="customer-status-cta-text">Complete the remaining steps to finalize your visa application.</p>
              </div>
              <Link href={`/apply/finish?id=${formatOrderNum(order.orderNumber)}`} className="customer-status-cta-btn">
                Finish Your Application →
              </Link>
            </div>
          );
        })()}

        {/* Order Summary */}
        <div className="customer-status-card">
          <h2 className="customer-status-section-title">Order Summary</h2>
          <div className="customer-status-grid">
            <div className="customer-status-row">
              <span className="customer-status-label">Status</span>
              <span className={`admin-status ${STATUS_COLORS[order.status] ?? ''}`}>{order.status.replace('_', ' ')}</span>
            </div>
            <div className="customer-status-row">
              <span className="customer-status-label">Destination</span>
              <span className="customer-status-value">{order.destination}</span>
            </div>
            <div className="customer-status-row">
              <span className="customer-status-label">Visa type</span>
              <span className="customer-status-value">{VISA_LABELS[order.visaType] ?? order.visaType}</span>
            </div>
            <div className="customer-status-row">
              <span className="customer-status-label">Processing speed</span>
              <span className="customer-status-value">{SPEED_LABELS[order.processingSpeed] ?? order.processingSpeed}</span>
            </div>
            <div className="customer-status-row">
              <span className="customer-status-label">Total paid</span>
              <span className="customer-status-value">${order.totalUSD} USD</span>
            </div>
            <div className="customer-status-row">
              <span className="customer-status-label">Billing email</span>
              <span className="customer-status-value">{order.billingEmail}</span>
            </div>
            {order.cardLast4 && (
              <div className="customer-status-row">
                <span className="customer-status-label">Card</span>
                <span className="customer-status-value">XXXX-XXXX-XXXX-{order.cardLast4}</span>
              </div>
            )}
            <div className="customer-status-row">
              <span className="customer-status-label">Date submitted</span>
              <span className="customer-status-value">{createdDate}</span>
            </div>
          </div>
        </div>

        {/* Traveler Details */}
        {travelers.map((t, i) => (
          <div key={i} className="customer-status-card">
            <h2 className="customer-status-section-title">
              {travelers.length > 1 ? `Traveler ${i + 1}: ` : 'Traveler: '}
              {t.firstName} {t.lastName}
            </h2>
            <div className="customer-status-grid">
              {t.email && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Email</span>
                  <span className="customer-status-value">{t.email}</span>
                </div>
              )}
              {t.month && t.day && t.year && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Date of birth</span>
                  <span className="customer-status-value">{t.month} {t.day}, {t.year}</span>
                </div>
              )}
              {t.address && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Address</span>
                  <span className="customer-status-value">
                    {t.address}{t.city ? `, ${t.city}` : ''}{t.state ? `, ${t.state}` : ''}{t.zip ? ` ${t.zip}` : ''}
                  </span>
                </div>
              )}
              {t.passportCountry && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Passport country</span>
                  <span className="customer-status-value">{t.passportCountry}</span>
                </div>
              )}
              {t.passportNumber && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Passport number</span>
                  <span className="customer-status-value">{t.passportNumber}</span>
                </div>
              )}
              {t.passportIssMonth && t.passportIssYear && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Passport issue date</span>
                  <span className="customer-status-value">{t.passportIssMonth} {t.passportIssDay}, {t.passportIssYear}</span>
                </div>
              )}
              {t.passportExpMonth && t.passportExpYear && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Passport expiry</span>
                  <span className="customer-status-value">{t.passportExpMonth} {t.passportExpDay}, {t.passportExpYear}</span>
                </div>
              )}
              {t.isEmployed && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Employed</span>
                  <span className="customer-status-value">{t.isEmployed}</span>
                </div>
              )}
              {t.hasConviction && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Criminal convictions</span>
                  <span className="customer-status-value">{t.hasConviction}</span>
                </div>
              )}
              {t.hasTravelPlans && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Confirmed travel plans</span>
                  <span className="customer-status-value">{t.hasTravelPlans}</span>
                </div>
              )}
              {t.hasTravelPlans === 'Yes' && t.arrivalMonth && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Expected arrival</span>
                  <span className="customer-status-value">{t.arrivalMonth} {t.arrivalDay}, {t.arrivalYear}</span>
                </div>
              )}
              {/* Extended finish data */}
              {t.arrivalDate && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Arrival date</span>
                  <span className="customer-status-value">{t.arrivalDate}</span>
                </div>
              )}
              {t.arrivalPoint && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Arrival point</span>
                  <span className="customer-status-value">{t.arrivalPoint}</span>
                </div>
              )}
              {t.visitedCountries && t.visitedCountries.length > 0 && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Countries visited (last 10 years)</span>
                  <span className="customer-status-value">{t.visitedCountries.join(', ')}</span>
                </div>
              )}
              {t.gender && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Gender</span>
                  <span className="customer-status-value">{t.gender}</span>
                </div>
              )}
              {t.countryOfBirth && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Country of birth</span>
                  <span className="customer-status-value">{t.countryOfBirth}</span>
                </div>
              )}
              {t.maritalStatus && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Marital status</span>
                  <span className="customer-status-value">{t.maritalStatus}</span>
                </div>
              )}
              {t.residenceCountry && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Country of residence</span>
                  <span className="customer-status-value">{t.residenceCountry}</span>
                </div>
              )}
              {t.employmentStatus && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Employment status</span>
                  <span className="customer-status-value">{t.employmentStatus}</span>
                </div>
              )}
              {t.employerName && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Employer</span>
                  <span className="customer-status-value">{t.employerName}</span>
                </div>
              )}
              {t.servedMilitary && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Served in military/police</span>
                  <span className="customer-status-value">{t.servedMilitary}</span>
                </div>
              )}
              {t.fatherName && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Father&apos;s name</span>
                  <span className="customer-status-value">{t.fatherName}</span>
                </div>
              )}
              {t.motherName && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Mother&apos;s name</span>
                  <span className="customer-status-value">{t.motherName}</span>
                </div>
              )}
              {t.spouseName && (
                <div className="customer-status-row">
                  <span className="customer-status-label">Spouse&apos;s name</span>
                  <span className="customer-status-value">{t.spouseName}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
