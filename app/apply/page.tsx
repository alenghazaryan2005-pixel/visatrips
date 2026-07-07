'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import LandingNav from '@/components/LandingNav';
import LandingFooter from '@/components/LandingFooter';
import { Calendar, Plane, CalendarClock, User, CreditCard, Check } from 'lucide-react';
import CountryFlag from '@/components/CountryFlag';
import { validateName, stripNameInput, validateEmail, validateAddress, validateCityState, validateZip, validatePassportNumber } from '@/lib/validation';
import { ApplySchemaProvider, useApplySchema } from '@/lib/applySchemaClient';
import { getCountryConfig, pricingKey, type CountryConfig, type VisaProduct } from '@/lib/countryConfig';

const PASSPORT_COUNTRIES = [
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: 'KR', flag: '🇰🇷', name: 'Republic of Korea' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore' },
  { code: 'AE', flag: '🇦🇪', name: 'UAE' },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: 'ZA', flag: '🇿🇦', name: 'South Africa' },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria' },
  { code: 'KE', flag: '🇰🇪', name: 'Kenya' },
  { code: 'TR', flag: '🇹🇷', name: 'Turkey' },
  { code: 'PH', flag: '🇵🇭', name: 'Philippines' },
  { code: 'ID', flag: '🇮🇩', name: 'Indonesia' },
  { code: 'MY', flag: '🇲🇾', name: 'Malaysia' },
  { code: 'TH', flag: '🇹🇭', name: 'Thailand' },
  { code: 'VN', flag: '🇻🇳', name: 'Vietnam' },
  { code: 'EG', flag: '🇪🇬', name: 'Egypt' },
  { code: 'MA', flag: '🇲🇦', name: 'Morocco' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal' },
  { code: 'PL', flag: '🇵🇱', name: 'Poland' },
  { code: 'SE', flag: '🇸🇪', name: 'Sweden' },
  { code: 'CH', flag: '🇨🇭', name: 'Switzerland' },
  { code: 'NZ', flag: '🇳🇿', name: 'New Zealand' },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina' },
  { code: 'GH', flag: '🇬🇭', name: 'Ghana' },
];

// Visa products + hidden ids + purpose-of-visit options used to live here
// as hardcoded India arrays. They've moved to lib/countryConfig.ts so the
// apply page can render for any supported country (India, Aruba, …) by
// reading `?destination=` from the URL.

const MONTHS    = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS      = Array.from({ length: 31 }, (_,i) => String(i+1));
const YEARS     = Array.from({ length: 80 }, (_,i) => String(new Date().getFullYear()-18-i));
const EXP_YEARS  = Array.from({ length: 15 }, (_,i) => String(new Date().getFullYear()+i));
const ISS_YEARS  = Array.from({ length: 30 }, (_,i) => String(new Date().getFullYear()-i));
const STEPS     = ['Trip details', 'Your info', 'Passport details', 'Checkout'];

interface Traveler    { firstName:string; lastName:string; month:string; day:string; year:string; email:string; address:string; city:string; state:string; zip:string; isEmployed:string; hasCriminalRecord:string; hasConfirmedTravel:string; arrivalMonth:string; arrivalDay:string; arrivalYear:string; }
interface PassportInfo{ country:string; number:string; placeOfIssue:string; countryOfIssue:string; issMonth:string; issDay:string; issYear:string; expMonth:string; expDay:string; expYear:string; skipForNow:boolean; }
const emptyTraveler     = (): Traveler     => ({firstName:'',lastName:'',month:'',day:'',year:'',email:'',address:'',city:'',state:'',zip:'',isEmployed:'',hasCriminalRecord:'',hasConfirmedTravel:'',arrivalMonth:'',arrivalDay:'',arrivalYear:''});
const emptyPassportInfo = (): PassportInfo => ({country:'',number:'',placeOfIssue:'',countryOfIssue:'',issMonth:'',issDay:'',issYear:'',expMonth:'',expDay:'',expYear:'',skipForNow:false});

/* ── Progress Bar ── */
/**
 * Slim horizontal progress bar: "STEP X / N" caps label on the left,
 * a thin filled bar underneath. Replaces the previous circles-and-
 * lines checkpoint style, which took up more vertical real estate
 * than the customer needed on tight forms.
 *
 * Fill percentage = (current + 1) / total — the customer is
 * currently ON step X, so completion visually reads as `current`
 * done + the fraction of this one currently being filled. Uses
 * inline Tailwind so we don't touch globals.css (keeps /legacy and
 * India/Aruba pages unaffected).
 */
function ProgressBar({ current }: { current: number }) {
  const total = STEPS.length;
  const pct = Math.min(100, Math.max(0, ((current + 1) / total) * 100));
  // No max-width or self-centering — lets the bar span the full
  // .apply-page content column (1440px max minus 5% side padding),
  // which is the same width as the breadcrumb above and the form
  // layout below. Previously capped at 720px which read narrower
  // than the rest of the page.
  return (
    <div className="pt-4 pb-6">
      <div className="text-[0.7rem] uppercase tracking-[0.14em] font-semibold text-[#475569] mb-2">
        Step {current + 1} / {total}
        <span className="ml-2 text-[#94A3B8] normal-case tracking-normal font-medium">— {STEPS[current]}</span>
      </div>
      <div className="h-1.5 w-full bg-[#EEF2F9] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#1D4ED8] transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ── Shared Summary ── */
interface ProcessingOption { id: string; label: string; surcharge: number; }

function SummaryCard({
  country,
  visaId,
  travelers,
  processingSurcharge = 0,
  showPrice = false,
  processingOptions,
  selectedProcessing,
  onProcessingChange,
  rejectionProtection = false,
  rejectionPrice = 0,
}: {
  country: CountryConfig;
  visaId: string;
  travelers: number;
  processingSurcharge?: number;
  showPrice?: boolean;
  processingOptions?: ProcessingOption[];
  selectedProcessing?: string;
  onProcessingChange?: (id: string) => void;
  /** Rejection Protection Plan opt-in — controlled by Step3's checkbox.
   *  When true, the add-on price is folded into the breakdown and total. */
  rejectionProtection?: boolean;
  /** Live price for the add-on, fetched in Step3 from
   *  `pricing.addons.rejectionProtection`. */
  rejectionPrice?: number;
}) {
  const visa = country.visaProducts.find(v => v.id === visaId) ?? country.visaProducts[0];
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [govFee, setGovFee] = useState<number>(10);
  const [txPct, setTxPct] = useState<number>(8);
  useEffect(() => {
    const code = country.visaIdToCode[visaId] || visaId.toUpperCase().replace(/-/g, '_');
    fetch('/api/settings').then(r => r.json()).then(d => {
      const s = d.settings || {};
      const visaPriceKey = pricingKey(country, `visa.${code}`);
      const govFeeKey    = pricingKey(country, 'fees.government');
      const txPctKey     = pricingKey(country, 'fees.transactionPercent');
      if (s[visaPriceKey] != null) setLivePrice(Number(s[visaPriceKey]));
      if (s[govFeeKey]    != null) setGovFee(Number(s[govFeeKey]));
      if (s[txPctKey]     != null) setTxPct(Number(s[txPctKey]));
    }).catch(() => {});
  }, [visaId, country]);

  const effectivePrice = livePrice ?? visa.price;
  const visaLine       = effectivePrice * travelers;
  const processingLine = processingSurcharge * travelers;
  const govLine        = govFee * travelers;
  // Add-on is once per order (NOT × travelers). Include in subtotal so
  // the transaction fee covers it too — at checkout the gateway processes
  // the full cart in one charge.
  const addonLine      = rejectionProtection ? rejectionPrice : 0;
  const subtotal       = visaLine + processingLine + govLine + addonLine;
  const txFee          = subtotal * (txPct / 100);
  const total          = subtotal + txFee;
  const fmt = (n: number) => n.toFixed(2).replace(/\.00$/, '');

  return (
    <div className="apply-summary-col">
      <div className="apply-summary-card">
        <div className="apply-summary-header">
          <span className="apply-summary-flag" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <CountryFlag slug={country.slug} size="1.6em" />
          </span>
          <div>
            <div className="apply-summary-title">{country.productLabel}</div>
            {/* Strip the country prefix from the visa label so the
                summary type reads as the product variant only
                (e.g. "Tourist eVisa – 30 days, …"). For single-product
                countries (Aruba) the strip is a no-op. */}
            <div className="apply-summary-type">{visa.label.split('–')[0].replace(country.destination, '').trim()}</div>
          </div>
        </div>
        <div className="apply-summary-divider" />
        <div className="apply-summary-rows">
          <div className="apply-summary-row"><span className="apply-summary-icon"><Calendar      size={18} strokeWidth={1.75} /></span><div><div className="apply-summary-row-label">Valid for</div><div className="apply-summary-row-value">{visa.validity}</div></div></div>
          <div className="apply-summary-row"><span className="apply-summary-icon"><Plane         size={18} strokeWidth={1.75} /></span><div><div className="apply-summary-row-label">Number of entries</div><div className="apply-summary-row-value">{visa.entries}</div></div></div>
          <div className="apply-summary-row"><span className="apply-summary-icon"><CalendarClock size={18} strokeWidth={1.75} /></span><div><div className="apply-summary-row-label">Max stay</div><div className="apply-summary-row-value">{visa.maxStay}</div></div></div>
          <div className="apply-summary-row"><span className="apply-summary-icon"><User          size={18} strokeWidth={1.75} /></span><div><div className="apply-summary-row-label">Travelers</div><div className="apply-summary-row-value">{travelers} {travelers===1?'person':'people'}</div></div></div>
        </div>
        {showPrice ? (
          <>
            {processingOptions && processingOptions.length > 0 && onProcessingChange && (
              <>
                <div className="apply-summary-divider" />
                <div className="apply-summary-processing">
                  <div className="apply-summary-processing-label">Processing time</div>
                  <div className="processing-options">
                    {processingOptions.map(opt => (
                      <label
                        key={opt.id}
                        className={`processing-option${selectedProcessing === opt.id ? ' selected' : ''}`}
                        onClick={() => onProcessingChange(opt.id)}
                      >
                        <div className="processing-option-radio">
                          <span className={`processing-radio-dot${selectedProcessing === opt.id ? ' active' : ''}`} />
                        </div>
                        <div className="processing-option-info">
                          <span className="processing-option-label">{opt.label}</span>
                        </div>
                        <span className="processing-option-price">
                          {opt.surcharge === 0 ? 'Included' : `+$${opt.surcharge}`}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="apply-summary-divider" />
            {/* Line-item breakdown */}
            <div className="apply-summary-breakdown">
              <div className="apply-summary-breakdown-row">
                <span>Visa fee <span className="apply-summary-breakdown-sub">({travelers} × ${fmt(effectivePrice)})</span></span>
                <span>${fmt(visaLine)}</span>
              </div>
              <div className="apply-summary-breakdown-row">
                <span>Processing surcharge <span className="apply-summary-breakdown-sub">({travelers} × ${fmt(processingSurcharge)})</span></span>
                <span>${fmt(processingLine)}</span>
              </div>
              {govFee > 0 && (
                <div className="apply-summary-breakdown-row">
                  <span>Government fee <span className="apply-summary-breakdown-sub">({travelers} × ${fmt(govFee)})</span></span>
                  <span>${fmt(govLine)}</span>
                </div>
              )}
              {rejectionProtection && rejectionPrice > 0 && (
                <div className="apply-summary-breakdown-row">
                  <span>Rejection Protection Plan <span className="apply-summary-breakdown-sub">(once per order)</span></span>
                  <span>${fmt(addonLine)}</span>
                </div>
              )}
              {txPct > 0 && (
                <div className="apply-summary-breakdown-row">
                  <span>Transaction fee <span className="apply-summary-breakdown-sub">({txPct}%)</span></span>
                  <span>${fmt(txFee)}</span>
                </div>
              )}
            </div>
            <div className="apply-summary-divider" />
            <div className="apply-summary-price-row">
              <span className="apply-summary-price-label">Total</span>
              <span className="apply-summary-price">${fmt(total)} <span className="apply-summary-price-note">USD</span></span>
            </div>
            <div className="apply-summary-note">Includes government fees & taxes · No hidden charges</div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ── Passport Dropdown ── */
function PassportDropdown({ value, onChange, disabled }: { value:string; onChange:(c:string)=>void; disabled?:boolean }) {
  const [search, setSearch] = useState('');
  const [open,   setOpen]   = useState(false);
  const sel      = PASSPORT_COUNTRIES.find(c => c.code===value);
  const filtered = PASSPORT_COUNTRIES.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="apply-select-wrap"
      style={{opacity:disabled?0.45:1, pointerEvents:disabled?'none':'auto'}}
      onClick={() => !disabled && setOpen(v=>!v)}>
      {sel
        ? <span className="apply-select-value"><span className="apply-select-flag">{sel.flag}</span>{sel.name}</span>
        : <span className="apply-select-placeholder">Select country</span>}
      <span className={`apply-select-chevron${open?' open':''}`}>›</span>
      {open && (
        <div className="apply-dropdown">
          <input className="apply-dropdown-search" placeholder="Search country..." value={search}
            onChange={e=>setSearch(e.target.value)} onClick={e=>e.stopPropagation()} autoFocus />
          <ul className="apply-dropdown-list">
            {filtered.map(c=>(
              <li key={c.code} className={`apply-dropdown-item${c.code===value?' selected':''}`}
                onClick={e=>{e.stopPropagation();onChange(c.code);setOpen(false);setSearch('');}}>
                <span>{c.flag}</span><span>{c.name}</span>
                {c.code===value && <span className="apply-dropdown-check"><Check size={14} strokeWidth={2.5} /></span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Step 1 ── */
function Step1({ country, passport, setPassport, visaId, setVisaId, travelers, setTravelers, purposeOfVisit, setPurposeOfVisit, onNext }: any) {
  const visibleVisas = country.visaProducts.filter((v: VisaProduct) => !country.hiddenVisaIds.includes(v.id));
  const purposes: string[] | undefined = country.purposeOptions?.[visaId];
  return (
    <div className="apply-layout">
      <div className="apply-form-col">
        <div className="apply-header">
          <h1 className="apply-title">{country.copy.applyHeader}<br /><span>{country.productLabel}</span></h1>
          <p className="apply-subtitle">{country.copy.applySubtitle}</p>
        </div>
        <div className="apply-field">
          <label className="apply-label">Your passport</label>
          <PassportDropdown value={passport} onChange={setPassport} />
        </div>
        <div className="apply-field">
          <label className="apply-label">Applying for</label>
          <div className="apply-visa-list">
            {visibleVisas.map((v: VisaProduct) => (
              <label key={v.id} className={`apply-visa-option${visaId===v.id?' selected':''}`}>
                <input type="radio" name="visa" value={v.id} checked={visaId===v.id} onChange={()=>setVisaId(v.id)} className="sr-only"/>
                <span className="apply-visa-radio"/>
                <span className="apply-visa-label">{v.label}</span>
                {v.tag && <span className="apply-visa-tag">{v.tag}</span>}
              </label>
            ))}
          </div>
        </div>
        {purposes && purposes.length > 1 && (
          <div className="apply-field">
            <label className="apply-label">Purpose of visit</label>
            <div className="apply-visa-list">
              {purposes.map(p => (
                <label key={p} className={`apply-visa-option${purposeOfVisit === p ? ' selected' : ''}`}>
                  <input type="radio" name="purpose" value={p} checked={purposeOfVisit === p} onChange={() => setPurposeOfVisit(p)} className="sr-only"/>
                  <span className="apply-visa-radio"/>
                  <span className="apply-visa-label" style={{ fontSize: '0.85rem' }}>{p}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="apply-field">
          <label className="apply-label">Number of travelers</label>
          <div className="apply-travelers">
            <button className="apply-travelers-btn" onClick={()=>setTravelers((t:number)=>Math.max(1,t-1))}>−</button>
            <span className="apply-travelers-count">{travelers}</span>
            <button className="apply-travelers-btn" onClick={()=>setTravelers((t:number)=>Math.min(10,t+1))}>+</button>
            <span className="apply-travelers-label">{travelers===1?'traveler':'travelers'}</span>
          </div>
        </div>
        <button className={`apply-submit${passport && (purposeOfVisit || !purposes || purposes.length <= 1)?' active':''}`} disabled={!passport || (purposes && purposes.length > 1 && !purposeOfVisit)} onClick={onNext}>
          {passport?'Continue to Your Info →':'Select your passport to continue'}
        </button>
      </div>
      <SummaryCard country={country} visaId={visaId} travelers={travelers} />
    </div>
  );
}

/* ── Address Validation ── */
/* ── Step 2 ── */
function TravelerCard({ country, index, data, onChange, expanded, onToggle }: any) {
  const { getLabel } = useApplySchema();
  return (
    <div className="traveler-card">
      <div className="traveler-card-header" onClick={onToggle}>
        <div className="traveler-card-title">
          <span className="traveler-card-num">Traveler #{index+1}</span>
          {(data.firstName||data.lastName)&&!expanded&&<span className="traveler-card-name">{data.firstName} {data.lastName}</span>}
        </div>
        <span className={`traveler-card-chevron${expanded?' open':''}`}>›</span>
      </div>
      {expanded&&(
        <div className="traveler-card-body">
          <div className="ap-field"><label className="ap-field-label">{getLabel('personal', 'firstName', 'First & middle name')}</label>
            <input className={`ap-input${data.firstName&&validateName(data.firstName,'First name')?' ap-input-error':''}`} placeholder="John William" value={data.firstName} onChange={e=>onChange('firstName',stripNameInput(e.target.value))}/>
            {data.firstName&&validateName(data.firstName,'First name')&&<p className="ap-field-error">{validateName(data.firstName,'First name')}</p>}</div>
          <div className="ap-field"><label className="ap-field-label">{getLabel('personal', 'lastName', 'Last name')}</label>
            <input className={`ap-input${data.lastName&&validateName(data.lastName,'Last name')?' ap-input-error':''}`} placeholder="Smith" value={data.lastName} onChange={e=>onChange('lastName',stripNameInput(e.target.value))}/>
            {data.lastName&&validateName(data.lastName,'Last name')&&<p className="ap-field-error">{validateName(data.lastName,'Last name')}</p>}</div>
          <div className="ap-field"><label className="ap-field-label">{getLabel('personal', 'dob', 'Date of birth')}</label>
            <div className="ap-dob-row">
              <select className="ap-select" value={data.month} onChange={e=>onChange('month',e.target.value)}><option value="">Month</option>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}</select>
              <select className="ap-select" value={data.day}   onChange={e=>onChange('day',e.target.value)}><option value="">Day</option>{DAYS.map(d=><option key={d} value={d}>{d}</option>)}</select>
              <select className="ap-select" value={data.year}  onChange={e=>onChange('year',e.target.value)}><option value="">Year</option>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select>
            </div></div>
          <div className="ap-field"><label className="ap-field-label">{getLabel('personal', 'email', 'Email address')}</label>
            <input className={`ap-input${data.email&&validateEmail(data.email)?' ap-input-error':''}`} type="email" placeholder="johnsmith@gmail.com" value={data.email} onChange={e=>onChange('email',e.target.value)}/>
            {data.email&&validateEmail(data.email)?<p className="ap-field-error">{validateEmail(data.email)}</p>:<p className="ap-field-hint">{country?.copy?.emailHint ?? 'Your travel document will be sent to this email address'}</p>}</div>

          <div className="ap-section-divider"/>
          <div className="ap-section-title">Address Details</div>
          <div className="ap-field"><label className="ap-field-label">{getLabel('address', 'address', 'Home address')}</label>
            <p className="ap-field-hint" style={{marginTop:'-0.25rem',marginBottom:'0.35rem'}}>Your current, permanent residence</p>
            <input className={`ap-input${data.address&&validateAddress(data.address,'Home address')?' ap-input-error':''}`} placeholder="123 Main Street, Apt 4B" value={data.address} onChange={e=>onChange('address',e.target.value)}/>
            {data.address&&validateAddress(data.address,'Home address')&&<p className="ap-field-error">{validateAddress(data.address,'Home address')}</p>}</div>
          <div className="ap-row-2">
            <div className="ap-field"><label className="ap-field-label">{getLabel('address', 'city', 'City or town')}</label>
              <input className={`ap-input${data.city&&validateCityState(data.city,'City')?' ap-input-error':''}`} placeholder="New York" value={data.city} onChange={e=>onChange('city',e.target.value)}/>
              {data.city&&validateCityState(data.city,'City')&&<p className="ap-field-error">{validateCityState(data.city,'City')}</p>}</div>
            <div className="ap-field"><label className="ap-field-label">{getLabel('address', 'state', 'State or province')}</label>
              <input className={`ap-input${data.state&&validateCityState(data.state,'State')?' ap-input-error':''}`} placeholder="New York" value={data.state} onChange={e=>onChange('state',e.target.value)}/>
              {data.state&&validateCityState(data.state,'State')&&<p className="ap-field-error">{validateCityState(data.state,'State')}</p>}</div>
          </div>
          <div className="ap-field" style={{maxWidth:'12rem'}}><label className="ap-field-label">{getLabel('address', 'zip', 'ZIP or postcode')}</label>
            <input className={`ap-input${data.zip&&validateZip(data.zip)?' ap-input-error':''}`} placeholder="10001" value={data.zip} onChange={e=>onChange('zip',e.target.value)}/>
            {data.zip&&validateZip(data.zip)&&<p className="ap-field-error">{validateZip(data.zip)}</p>}</div>

          {/* ── Additional Information ── */}
          <div className="ap-section-title" style={{marginTop:'1.5rem'}}>Additional Information</div>

          <div className="ap-field">
            <label className="ap-field-label">Are you employed?</label>
            <div className="ap-radio-group">
              <label className={`ap-radio-option${data.isEmployed==='yes'?' selected':''}`}>
                <input type="radio" name={`employed-${index}`} value="yes" checked={data.isEmployed==='yes'} onChange={()=>onChange('isEmployed','yes')}/> Yes
              </label>
              <label className={`ap-radio-option${data.isEmployed==='no'?' selected':''}`}>
                <input type="radio" name={`employed-${index}`} value="no" checked={data.isEmployed==='no'} onChange={()=>onChange('isEmployed','no')}/> No
              </label>
            </div>
          </div>

          <div className="ap-field">
            <label className="ap-field-label">Have you ever been convicted of criminal offenses?</label>
            <div className="ap-radio-group">
              <label className={`ap-radio-option${data.hasCriminalRecord==='yes'?' selected':''}`}>
                <input type="radio" name={`criminal-${index}`} value="yes" checked={data.hasCriminalRecord==='yes'} onChange={()=>onChange('hasCriminalRecord','yes')}/> Yes
              </label>
              <label className={`ap-radio-option${data.hasCriminalRecord==='no'?' selected':''}`}>
                <input type="radio" name={`criminal-${index}`} value="no" checked={data.hasCriminalRecord==='no'} onChange={()=>onChange('hasCriminalRecord','no')}/> No
              </label>
            </div>
          </div>

          <div className="ap-field">
            <label className="ap-field-label">Do you have confirmed travel plans?</label>
            <div className="ap-radio-group">
              <label className={`ap-radio-option${data.hasConfirmedTravel==='yes'?' selected':''}`}>
                <input type="radio" name={`travel-${index}`} value="yes" checked={data.hasConfirmedTravel==='yes'} onChange={()=>onChange('hasConfirmedTravel','yes')}/> Yes
              </label>
              <label className={`ap-radio-option${data.hasConfirmedTravel==='no'?' selected':''}`}>
                <input type="radio" name={`travel-${index}`} value="no" checked={data.hasConfirmedTravel==='no'} onChange={()=>onChange('hasConfirmedTravel','no')}/> No
              </label>
            </div>
          </div>

          {data.hasConfirmedTravel==='yes'&&(
            <div className="ap-field">
              <label className="ap-field-label">Expected arrival date</label>
              <div className="ap-row-3">
                <select className="ap-select" value={data.arrivalMonth} onChange={e=>onChange('arrivalMonth',e.target.value)}>
                  <option value="">Month</option>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
                <select className="ap-select" value={data.arrivalDay} onChange={e=>onChange('arrivalDay',e.target.value)}>
                  <option value="">Day</option>{DAYS.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
                <select className="ap-select" value={data.arrivalYear} onChange={e=>onChange('arrivalYear',e.target.value)}>
                  <option value="">Year</option>{EXP_YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              {data.arrivalMonth && data.arrivalDay && data.arrivalYear && (() => {
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                const arrDate = new Date(parseInt(data.arrivalYear), months.indexOf(data.arrivalMonth), parseInt(data.arrivalDay));
                const today = new Date(); today.setHours(0,0,0,0);
                const minDate = new Date(today.getTime() + 4 * 24*60*60*1000);
                const maxDate = new Date(today.getTime() + 120 * 24*60*60*1000);
                if (arrDate < minDate) return <p className="ap-field-error">Arrival date must be at least 4 days from today</p>;
                if (arrDate > maxDate) return <p className="ap-field-error">Arrival date cannot be more than 120 days from today</p>;
                return null;
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Step2({ country, travelers, visaId, onBack, onNext }: any) {
  const [data,     setData]     = useState<Traveler[]>(Array.from({length:travelers},emptyTraveler));
  const [expanded, setExpanded] = useState<number[]>([0]);
  const update = (i:number,f:keyof Traveler,v:string) => setData(prev=>prev.map((t,idx)=>idx===i?{...t,[f]:v}:t));
  const toggle = (i:number) => setExpanded(prev=>prev.includes(i)?prev.filter(x=>x!==i):[...prev,i]);
  const allFilled = data.every(t=>{
    if (!t.firstName||!t.lastName||!t.month||!t.day||!t.year||!t.email||!t.address||!t.city||!t.state||!t.zip) return false;
    if (!t.isEmployed||!t.hasCriminalRecord||!t.hasConfirmedTravel) return false;
    if (t.hasConfirmedTravel==='yes'&&(!t.arrivalMonth||!t.arrivalDay||!t.arrivalYear)) return false;
    if (t.hasConfirmedTravel==='yes'&&t.arrivalMonth&&t.arrivalDay&&t.arrivalYear) {
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const arrDate = new Date(parseInt(t.arrivalYear), months.indexOf(t.arrivalMonth), parseInt(t.arrivalDay));
      const today = new Date(); today.setHours(0,0,0,0);
      const minDate = new Date(today.getTime() + 4 * 24*60*60*1000);
      const maxDate = new Date(today.getTime() + 120 * 24*60*60*1000);
      if (arrDate < minDate || arrDate > maxDate) return false;
    }
    // Validation checks
    if (validateName(t.firstName,'First name')) return false;
    if (validateName(t.lastName,'Last name')) return false;
    if (validateEmail(t.email)) return false;
    if (validateAddress(t.address,'Address')) return false;
    if (validateCityState(t.city,'City')) return false;
    if (validateCityState(t.state,'State')) return false;
    if (validateZip(t.zip)) return false;
    return true;
  });
  return (
    <div className="apply-layout">
      <div className="apply-form-col">
        <div className="apply-header">
          <h2 className="apply-title"><span>Personal Details</span></h2>
          <p className="apply-subtitle">Enter the details as they appear on your passport.</p>
        </div>
        <div className="traveler-list">
          {data.map((t,i)=><TravelerCard key={i} country={country} index={i} data={t} onChange={(f:keyof Traveler,v:string)=>update(i,f,v)} expanded={expanded.includes(i)} onToggle={()=>toggle(i)}/>)}
        </div>
        <div className="apply-step2-actions">
          <button className="apply-back-btn" onClick={onBack}>← Previous</button>
          <button className={`apply-submit${allFilled?' active':''}`} disabled={!allFilled}
            onClick={()=>onNext(data.map(t=>t.firstName), data)}>
            {allFilled?'Continue to Passport Details →':'Complete all traveler details'}
          </button>
        </div>
      </div>
      <SummaryCard country={country} visaId={visaId} travelers={travelers}/>
    </div>
  );
}

/* ── Step 2b ── */
function PassportCard({ index, travelerName, data, onChange, expanded, onToggle, expiryError }: any) {
  const { getLabel } = useApplySchema();
  return (
    <div className="traveler-card">
      <div className="traveler-card-header" onClick={onToggle}>
        <div className="traveler-card-title">
          <span className="traveler-card-num">Traveler #{index+1}{travelerName?` — ${travelerName}`:''}</span>
          {data.skipForNow&&!expanded&&<span className="traveler-card-name">Adding details later</span>}
          {!data.skipForNow&&data.number&&!expanded&&<span className="traveler-card-name">Passport {data.number}</span>}
        </div>
        <span className={`traveler-card-chevron${expanded?' open':''}`}>›</span>
      </div>
      {expanded&&(
        <div className="traveler-card-body">
          <div className="ap-field"><label className="ap-field-label">{getLabel('passport', 'passportCountry', 'Passport')}</label>
            <PassportDropdown value={data.country} onChange={(v:string)=>onChange('country',v)} disabled={data.skipForNow}/></div>
          <label className="ap-checkbox-label">
            <input type="checkbox" className="ap-checkbox" checked={data.skipForNow} onChange={e=>onChange('skipForNow',e.target.checked)}/>
            <span>Add passport details later</span>
          </label>
          <div className="ap-field" style={{opacity:data.skipForNow?0.45:1,pointerEvents:data.skipForNow?'none':'auto'}}>
            <label className="ap-field-label">{getLabel('passport', 'passportNumber', 'Passport number')}</label>
            <input className={`ap-input${data.number&&validatePassportNumber(data.number)?' ap-input-error':''}`} placeholder="P9876543" value={data.number} disabled={data.skipForNow}
              onChange={e=>onChange('number',e.target.value)}/>
            {data.number&&validatePassportNumber(data.number)&&<p className="ap-field-error">{validatePassportNumber(data.number)}</p>}</div>
          <div className="ap-field" style={{opacity:data.skipForNow?0.45:1,pointerEvents:data.skipForNow?'none':'auto'}}>
            <label className="ap-field-label">{getLabel('passport', 'passportPlaceOfIssue', 'Place of issue')}</label>
            <input className="ap-input" placeholder="e.g. New York" value={data.placeOfIssue} disabled={data.skipForNow}
              onChange={e=>onChange('placeOfIssue',e.target.value)}/></div>
          <div className="ap-field" style={{opacity:data.skipForNow?0.45:1,pointerEvents:data.skipForNow?'none':'auto'}}>
            <label className="ap-field-label">{getLabel('passport', 'passportCountryOfIssue', 'Country of issue')}</label>
            <input className="ap-input" placeholder="e.g. United States" value={data.countryOfIssue} disabled={data.skipForNow}
              onChange={e=>onChange('countryOfIssue',e.target.value)}/></div>
          <div className="ap-field" style={{opacity:data.skipForNow?0.45:1,pointerEvents:data.skipForNow?'none':'auto'}}>
            <label className="ap-field-label">{getLabel('passport', 'passportIssued', 'Passport issue date')}</label>
            <div className="ap-dob-row">
              <select className="ap-select" value={data.issMonth} disabled={data.skipForNow} onChange={e=>onChange('issMonth',e.target.value)}><option value="">Month</option>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}</select>
              <select className="ap-select" value={data.issDay}   disabled={data.skipForNow} onChange={e=>onChange('issDay',e.target.value)}><option value="">Day</option>{DAYS.map(d=><option key={d} value={d}>{d}</option>)}</select>
              <select className="ap-select" value={data.issYear}  disabled={data.skipForNow} onChange={e=>onChange('issYear',e.target.value)}><option value="">Year</option>{ISS_YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select>
            </div></div>
          <div className="ap-field" style={{opacity:data.skipForNow?0.45:1,pointerEvents:data.skipForNow?'none':'auto'}}>
            <label className="ap-field-label">{getLabel('passport', 'passportExpiry', 'Passport expiration date')}</label>
            <div className="ap-dob-row">
              <select className="ap-select" value={data.expMonth} disabled={data.skipForNow} onChange={e=>onChange('expMonth',e.target.value)}><option value="">Month</option>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}</select>
              <select className="ap-select" value={data.expDay}   disabled={data.skipForNow} onChange={e=>onChange('expDay',e.target.value)}><option value="">Day</option>{DAYS.map(d=><option key={d} value={d}>{d}</option>)}</select>
              <select className="ap-select" value={data.expYear}  disabled={data.skipForNow} onChange={e=>onChange('expYear',e.target.value)}><option value="">Year</option>{EXP_YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select>
            </div>
            {expiryError && <p className="ap-field-error">{expiryError}</p>}</div>
        </div>
      )}
    </div>
  );
}

function Step2b({ country, travelers, travelerNames, travelerData, visaId, onBack, onNext }: any) {
  const [data,     setData]     = useState<PassportInfo[]>(Array.from({length:travelers},emptyPassportInfo));
  const [expanded, setExpanded] = useState<number[]>([0]);
  const update = (i:number,f:keyof PassportInfo,v:string|boolean) => setData(prev=>prev.map((p,idx)=>idx===i?{...p,[f]:v}:p));
  const toggle = (i:number) => setExpanded(prev=>prev.includes(i)?prev.filter(x=>x!==i):[...prev,i]);

  // Check passport expiry is at least 6 months from arrival (or today if no arrival date)
  const checkPassportExpiry = (p: PassportInfo, travelerIdx: number): string | null => {
    if (p.skipForNow || !p.expMonth || !p.expDay || !p.expYear) return null;
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const expDate = new Date(parseInt(p.expYear), months.indexOf(p.expMonth), parseInt(p.expDay));
    // Use arrival date if available, otherwise use today
    let refDate = new Date(); refDate.setHours(0,0,0,0);
    const t = travelerData?.[travelerIdx];
    if (t?.hasConfirmedTravel === 'yes' && t.arrivalMonth && t.arrivalDay && t.arrivalYear) {
      refDate = new Date(parseInt(t.arrivalYear), months.indexOf(t.arrivalMonth), parseInt(t.arrivalDay));
    }
    const sixMonthsLater = new Date(refDate);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    if (expDate < sixMonthsLater) {
      // Country-specific tail to the warning when the country has one
      // configured. India warns about strict 6-month enforcement; other
      // countries get a generic message.
      const tail = country?.copy?.passportExpiryWarning ??
        'Many destinations require at least 6 months of passport validity from your arrival date.';
      return `Passport must be valid for at least 6 months from your travel date. ${tail}`;
    }
    return null;
  };

  const hasExpiryError = data.some((p, i) => !!checkPassportExpiry(p, i));
  const allDone = !hasExpiryError && data.every(p=>p.skipForNow||(p.country&&p.number&&!validatePassportNumber(p.number)&&p.placeOfIssue&&p.countryOfIssue&&p.issMonth&&p.issDay&&p.issYear&&p.expMonth&&p.expDay&&p.expYear));
  return (
    <div className="apply-layout">
      <div className="apply-form-col">
        <div className="apply-header">
          <h2 className="apply-title"><span>Passport Details</span></h2>
          <p className="apply-subtitle">Enter the passport details for each traveler.</p>
        </div>
        <div className="traveler-list">
          {data.map((p,i)=><PassportCard key={i} index={i} travelerName={travelerNames[i]??''} data={p}
            onChange={(f:keyof PassportInfo,v:string|boolean)=>update(i,f,v)} expanded={expanded.includes(i)} onToggle={()=>toggle(i)} expiryError={checkPassportExpiry(p, i)}/>)}
        </div>
        <div className="apply-step2-actions">
          <button className="apply-back-btn" onClick={onBack}>← Previous</button>
          <button className={`apply-submit${allDone?' active':''}`} disabled={!allDone} onClick={()=>onNext(data)}>
            {allDone?'Continue to Checkout →':'Complete passport details to continue'}
          </button>
        </div>
      </div>
      <SummaryCard country={country} visaId={visaId} travelers={travelers}/>
    </div>
  );
}

/* ── Step 3: Checkout ── */
function Step3({ country, visaId, travelers, travelerData, passportData, purposeOfVisit, onBack }: { country: CountryConfig; visaId:string; travelers:number; travelerData:any[]; passportData:PassportInfo[]; purposeOfVisit:string; onBack:()=>void }) {
  const router = useRouter();
  const visa = country.visaProducts.find(v => v.id === visaId) ?? country.visaProducts[0];

  // Fetch live pricing from settings (falls back to country-config price if offline).
  const [livePrices, setLivePrices] = useState<Record<string, number> | null>(null);
  const [liveSurcharges, setLiveSurcharges] = useState<Record<string, number> | null>(null);
  const [govFee, setGovFee] = useState<number>(10);
  const [txPct, setTxPct] = useState<number>(8);
  // Rejection Protection Plan add-on — price fetched from settings; default
  // 50 if the API is unavailable. The opt-in checkbox state lives below
  // alongside the other form fields.
  const [rejectionPrice, setRejectionPrice] = useState<number>(50);
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      const s = d.settings || {};
      // Country-aware key prefixes — India uses legacy un-prefixed
      // `pricing.visa.X`; Aruba uses `pricing.AW.visa.X`.
      const visaPrefix = pricingKey(country, 'visa.');
      const procPrefix = pricingKey(country, 'processing.');
      const prices: Record<string, number> = {};
      const surch: Record<string, number> = {};
      for (const k of Object.keys(s)) {
        if (k.startsWith(visaPrefix)) prices[k.replace(visaPrefix, '')] = Number(s[k]);
        if (k.startsWith(procPrefix)) surch[k.replace(procPrefix, '')] = Number(s[k]);
      }
      setLivePrices(prices);
      setLiveSurcharges(surch);
      const govKey = pricingKey(country, 'fees.government');
      const txKey  = pricingKey(country, 'fees.transactionPercent');
      if (s[govKey] != null) setGovFee(Number(s[govKey]));
      if (s[txKey]  != null) setTxPct(Number(s[txKey]));
      // Rejection-protection price stays globally namespaced (one add-on
      // catalog across all countries; tweak per-country later if needed).
      if (s['pricing.addons.rejectionProtection'] != null) setRejectionPrice(Number(s['pricing.addons.rejectionProtection']));
    }).catch(() => {});
  }, [country]);

  const visaCode = country.visaIdToCode[visaId] || visaId.toUpperCase().replace(/-/g, '_');
  const livePrice = livePrices?.[visaCode];
  const effectivePrice = typeof livePrice === 'number' ? livePrice : visa.price;

  const PROCESSING_OPTIONS = [
    { id: 'standard', label: 'Standard', surcharge: liveSurcharges?.standard ?? 0 },
    { id: 'rush',     label: 'Rush',     surcharge: liveSurcharges?.rush ?? 20 },
    { id: 'super',    label: 'Super Rush', surcharge: liveSurcharges?.super ?? 60 },
  ];

  const [processing, setProcessing] = useState('standard');
  const [rejectionProtection, setRejectionProtection] = useState(false);
  const surcharge = PROCESSING_OPTIONS.find(p=>p.id===processing)!.surcharge;
  // Breakdown: (visa + surcharge + govFee) × travelers + once-per-order
  // add-ons + transactionFee × subtotal. Add-on is included in subtotal so
  // the gateway transaction fee covers it at checkout.
  const addonLine = rejectionProtection ? rejectionPrice : 0;
  const subtotal  = (effectivePrice + surcharge + govFee) * travelers + addonLine;
  const txFee     = subtotal * (txPct / 100);
  const total     = +(subtotal + txFee).toFixed(2);

  const [cardName,   setCardName]   = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry,     setExpiry]     = useState('');
  const [cvv,        setCvv]        = useState('');
  const [email,      setEmail]      = useState('');
  const [agreed,     setAgreed]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [orderId,    setOrderId]    = useState('');
  const [error,      setError]      = useState('');

  const formatCard   = (v:string) => v.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim();
  const formatExpiry = (v:string) => { const n=v.replace(/\D/g,'').slice(0,4); return n.length>=3?`${n.slice(0,2)}/${n.slice(2)}`:n; };
  const canSubmit    = cardName && cardNumber.replace(/\s/g,'').length===16 && expiry.length===5 && cvv.length>=3 && email && agreed;

  // Save email to abandoned tracking when user enters checkout
  useEffect(() => {
    if (email) saveAbandoned({ email, lastStep: 'step3' });
  }, [email]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: country.destination,
          visaType: visaCode,
          totalUSD: total,
          processingSpeed: processing,
          rejectionProtection,
          billingEmail: email,
          cardLast4: cardNumber.replace(/\s/g, '').slice(-4),
          travelers: JSON.stringify(travelerData.map((t, i) => {
            const p = passportData[i];
            return {
              firstName: t.firstName,
              lastName:  t.lastName,
              email:     t.email,
              purposeOfVisit: purposeOfVisit || undefined,
              dob:       `${t.month} ${t.day}, ${t.year}`,
              address:   t.address,
              city:      t.city,
              state:     t.state,
              zip:       t.zip,
              isEmployed:       t.isEmployed,
              hasCriminalRecord: t.hasCriminalRecord,
              hasConfirmedTravel: t.hasConfirmedTravel,
              ...(t.hasConfirmedTravel === 'yes' && t.arrivalMonth ? { arrivalDate: `${t.arrivalMonth} ${t.arrivalDay}, ${t.arrivalYear}` } : {}),
              ...(p && !p.skipForNow ? {
                passportCountry: p.country,
                passportNumber:  p.number,
                passportPlaceOfIssue: p.placeOfIssue,
                passportCountryOfIssue: p.countryOfIssue,
                passportIssued:  `${p.issMonth} ${p.issDay}, ${p.issYear}`,
                passportExpiry:  `${p.expMonth} ${p.expDay}, ${p.expYear}`,
              } : {}),
            };
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Submission failed');
      // Clean up abandoned tracking
      const sid = typeof window !== 'undefined' ? sessionStorage.getItem('ev_session_id') : null;
      if (sid) { fetch(`/api/abandoned?id=${sid}`, { method: 'DELETE' }).catch(() => {}); sessionStorage.removeItem('ev_session_id'); }
      // Include destination in the URL so the finish dispatcher can route
      // without needing to call /api/orders (which 401s for the just-paid
      // customer who doesn't yet have a session cookie).
      router.push(`/apply/finish?id=${data.orderId}&destination=${encodeURIComponent(country.destination)}`);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="apply-layout">
      <div className="apply-form-col">
        <div className="apply-header">
          <h2 className="apply-title"><span>Checkout</span></h2>
          <p className="apply-subtitle">Complete your payment to submit the application.</p>
        </div>

        <div className="checkout-order-strip">
          <span className="checkout-order-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <CountryFlag slug={country.slug} size="1.2em" />
            {country.productLabel} — {travelers} {travelers===1?'traveler':'travelers'}
          </span>
          <span className="checkout-order-price">${total.toFixed(2)} USD</span>
        </div>

        <div className="ap-field">
          <label className="ap-field-label">Billing email</label>
          <input className="ap-input" type="email" placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)}/>
        </div>

        <div className="checkout-section">
          <div className="checkout-section-title">Payment details</div>
          <div className="ap-field">
            <label className="ap-field-label">Name on card</label>
            <input className="ap-input" placeholder="John Smith" value={cardName} onChange={e=>setCardName(e.target.value)}/>
          </div>
          <div className="ap-field">
            <label className="ap-field-label">Card number</label>
            <div className="checkout-card-wrap">
              <input className="ap-input" placeholder="1234 5678 9012 3456" value={cardNumber} maxLength={19}
                onChange={e=>setCardNumber(formatCard(e.target.value))}/>
              <span className="checkout-card-icons"><CreditCard size={16} strokeWidth={1.75} /></span>
            </div>
          </div>
          <div className="checkout-row-2">
            <div className="ap-field">
              <label className="ap-field-label">Expiry date</label>
              <input className="ap-input" placeholder="MM/YY" value={expiry} maxLength={5}
                onChange={e=>setExpiry(formatExpiry(e.target.value))}/>
            </div>
            <div className="ap-field">
              <label className="ap-field-label">CVV</label>
              <input className="ap-input" placeholder="123" value={cvv} maxLength={3} type="password"
                onChange={e=>setCvv(e.target.value.replace(/\D/g,'').slice(0,3))}/>
            </div>
          </div>
        </div>

        {/* Rejection Protection Plan — flat-fee opt-in. Renders only when
            an admin has set a non-negative price (effectively always; price 0
            still shows it as a $0 add-on). */}
        {rejectionPrice >= 0 && (
          <label
            className="ap-checkbox-label"
            style={{
              marginBottom: '1rem',
              alignItems: 'flex-start',
              padding: '0.85rem 1rem',
              border: '1px solid #e5e7eb',
              borderRadius: '0.75rem',
              background: rejectionProtection ? 'rgba(108,138,255,0.06)' : '#fafafa',
              borderColor: rejectionProtection ? 'var(--blue)' : '#e5e7eb',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <input
              type="checkbox"
              className="ap-checkbox"
              checked={rejectionProtection}
              onChange={e => setRejectionProtection(e.target.checked)}
              style={{ marginTop: '0.15rem' }}
            />
            <span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                Add Rejection Protection Plan
                <span style={{
                  fontSize: '0.75rem', fontWeight: 700,
                  background: 'var(--blue)', color: 'white',
                  padding: '0.1rem 0.45rem', borderRadius: '999px',
                }}>
                  +${rejectionPrice.toFixed(2)}
                </span>
              </span>
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#6b7280', marginTop: '0.2rem', fontWeight: 400 }}>
                If your visa application is rejected for reasons within our control,
                we'll refund what you paid for the visa. One-time, per order.
              </span>
            </span>
          </label>
        )}

        <label className="ap-checkbox-label" style={{marginBottom:'1.5rem'}}>
          <input type="checkbox" className="ap-checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>
          <span>I agree to the <Link href="/terms" className="checkout-link">Terms of Service</Link> and <Link href="/privacy" className="checkout-link">Privacy Policy</Link></span>
        </label>

        {error && (
          <div style={{background:'rgba(220,38,38,0.08)',color:'#dc2626',borderRadius:'0.75rem',padding:'0.75rem 1rem',fontSize:'0.85rem',marginBottom:'0.5rem'}}>
            {error}
          </div>
        )}

        <div className="apply-step2-actions">
          <button className="apply-back-btn" onClick={onBack}>← Previous</button>
          <button className={`apply-submit${canSubmit?' active':''}`} disabled={!canSubmit||loading} onClick={handleSubmit}>
            {loading?'Submitting...':(canSubmit?`Pay $${total.toFixed(2)} USD →`:'Complete payment details')}
          </button>
        </div>
      </div>
      <SummaryCard
        country={country}
        visaId={visaId}
        travelers={travelers}
        processingSurcharge={surcharge}
        showPrice
        processingOptions={PROCESSING_OPTIONS}
        selectedProcessing={processing}
        onProcessingChange={setProcessing}
        rejectionProtection={rejectionProtection}
        rejectionPrice={rejectionPrice}
      />
    </div>
  );
}

/* ── Abandoned tracking helper ── */
function getSessionId() {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem('ev_session_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('ev_session_id', id);
  }
  return id;
}

function saveAbandoned(data: Record<string, any>) {
  const sessionId = getSessionId();
  if (!sessionId) return;
  fetch('/api/abandoned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, ...data }),
  }).catch(() => {});
}

/* ── Main ──
 * ApplyShell reads the destination + passport from the URL once and
 * threads the resolved country config + initial passport down. The
 * ApplySchemaProvider is initialised with the right country's schema
 * key (so admin label overrides for the chosen country apply
 * automatically). Passing through ApplyForm's existing tree keeps the
 * step components renderable in isolation. */
function ApplyShell() {
  const searchParams = useSearchParams();
  const country = getCountryConfig(searchParams.get('destination'));
  const initialPassport = searchParams.get('passport') ?? '';
  return (
    <ApplySchemaProvider country={country.schemaKey}>
      <ApplyForm country={country} initialPassport={initialPassport} />
    </ApplySchemaProvider>
  );
}

function ApplyForm({ country, initialPassport }: { country: CountryConfig; initialPassport: string }) {
  const [step,          setStep]          = useState(0);
  const [passport,      setPassport]      = useState(initialPassport);
  // Default to the country's first visa product (India: tourist-30,
  // Aruba: ed-card). Falls back to the very first product if the catalog
  // somehow has nothing visible.
  const defaultVisaId = country.visaProducts.find(v => !country.hiddenVisaIds.includes(v.id))?.id
    ?? country.visaProducts[0]?.id
    ?? '';
  const [visaId,        setVisaId]        = useState(defaultVisaId);
  const [purposeOfVisit, setPurposeOfVisit] = useState('');
  const [travelers,     setTravelers]     = useState(1);
  const [travelerNames, setTravelerNames] = useState<string[]>([]);
  const [travelerData,  setTravelerData]  = useState<any[]>([]);
  const [passportData,  setPassportData]  = useState<PassportInfo[]>([]);

  return (
    // Top/bottom now come from the landing-shared components so the
    // /apply flow visually matches the new "/" landing. Nav is kept
    // as an unused import so a rollback (e.g. reverting to the old
    // Nav component for country-flag context) is a one-line change.
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNav />
      <div className="apply-page">
        <div className="apply-breadcrumb">
          <Link href="/" className="apply-breadcrumb-link">Home</Link>
          <span className="apply-breadcrumb-sep">›</span>
          <span>{country.productLabel} Application</span>
        </div>
        <ProgressBar current={step}/>
        {step===0 && <Step1 country={country} passport={passport} setPassport={setPassport} visaId={visaId} setVisaId={setVisaId} travelers={travelers} setTravelers={setTravelers} purposeOfVisit={purposeOfVisit} setPurposeOfVisit={setPurposeOfVisit} onNext={()=>{
          saveAbandoned({ destination: country.destination, visaType: visaId, lastStep: 'step1' });
          setStep(1);
        }}/>}
        {step===1 && <Step2 country={country} travelers={travelers} visaId={visaId} onBack={()=>setStep(0)} onNext={(names:string[], data:any[])=>{
          setTravelerNames(names); setTravelerData(data);
          const firstEmail = data[0]?.email || '';
          saveAbandoned({ destination: country.destination, visaType: visaId, travelers: data, email: firstEmail, lastStep: 'step2' });
          setStep(2);
        }}/>}
        {step===2 && <Step2b country={country} travelers={travelers} travelerNames={travelerNames} travelerData={travelerData} visaId={visaId} onBack={()=>setStep(1)} onNext={(pData:PassportInfo[])=>{
          setPassportData(pData);
          saveAbandoned({ destination: country.destination, visaType: visaId, passportData: pData, lastStep: 'step2b' });
          setStep(3);
        }}/>}
        {step===3 && <Step3 country={country} visaId={visaId} travelers={travelers} travelerData={travelerData} passportData={passportData} purposeOfVisit={purposeOfVisit} onBack={()=>setStep(2)}/>}
      </div>
      <LandingFooter showTrust={false} />
    </div>
  );
}

export default function ApplyPage() {
  return (
    <Suspense fallback={<div style={{paddingTop:'120px',textAlign:'center'}}>Loading...</div>}>
      <ApplyShell />
    </Suspense>
  );
}
