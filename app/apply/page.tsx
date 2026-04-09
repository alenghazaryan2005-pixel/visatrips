'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { validateName, validateEmail, validateAddress, validateCityState, validateZip, validatePassportNumber } from '@/lib/validation';

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
  { code: 'KR', flag: '🇰🇷', name: 'South Korea' },
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

const VISA_OPTIONS = [
  { id: 'tourist-30',  label: 'India Tourist eVisa – 30 days, Double entry',   validity: '30 days after arrival',  entries: 'Double entry',   maxStay: '30 days in total',   price: 25, tag: 'Most Popular' },
  { id: 'tourist-1y',  label: 'India Tourist eVisa – 1 year, Multiple entry',  validity: '1 year after arrival',   entries: 'Multiple entry', maxStay: '90 days per visit',  price: 40, tag: '' },
  { id: 'tourist-5y',  label: 'India Tourist eVisa – 5 years, Multiple entry', validity: '5 years after arrival',  entries: 'Multiple entry', maxStay: '90 days per visit',  price: 80, tag: '' },
  { id: 'business-1y', label: 'India Business eVisa – 1 year, Multiple entry', validity: '1 year after arrival',   entries: 'Multiple entry', maxStay: '180 days per visit', price: 80, tag: '' },
  { id: 'medical-60',  label: 'India Medical eVisa – 60 days, Triple entry',   validity: '60 days after arrival',  entries: 'Triple entry',   maxStay: '60 days in total',   price: 25, tag: '' },
];

const PURPOSE_OPTIONS: Record<string, string[]> = {
  'business-1y': ['Set Up Industrial/Business Venture','Sale/Purchase/Trade','Attend Technical/Business Meetings','Recruit Manpower','Participation in Exhibitions/Trade Fairs','Expert/Specialist for Ongoing Project','Conducting Tours','Deliver Lectures (GIAN)','Sports Related Activity','Join Vessel'],
};

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
function ProgressBar({ current }: { current: number }) {
  return (
    <div className="ap-progress">
      {STEPS.map((label, i) => (
        <div key={label} className="ap-progress-step">
          <div className={`ap-progress-circle${i<current?' done':i===current?' active':''}`}>
            {i < current ? '✓' : i+1}
          </div>
          <span className={`ap-progress-label${i===current?' active':i<current?' done':''}`}>{label}</span>
          {i < STEPS.length-1 && <div className={`ap-progress-line${i<current?' done':''}`} />}
        </div>
      ))}
    </div>
  );
}

/* ── Shared Summary ── */
function SummaryCard({ visaId, travelers }: { visaId:string; travelers:number }) {
  const visa  = VISA_OPTIONS.find(v => v.id === visaId)!;
  const total = visa.price * travelers;
  return (
    <div className="apply-summary-col">
      <div className="apply-summary-card">
        <div className="apply-summary-header">
          <span className="apply-summary-flag">🇮🇳</span>
          <div>
            <div className="apply-summary-title">India eVisa</div>
            <div className="apply-summary-type">{visa.label.split('–')[0].replace('India ','').trim()}</div>
          </div>
        </div>
        <div className="apply-summary-divider" />
        <div className="apply-summary-rows">
          <div className="apply-summary-row"><span className="apply-summary-icon">📅</span><div><div className="apply-summary-row-label">Valid for</div><div className="apply-summary-row-value">{visa.validity}</div></div></div>
          <div className="apply-summary-row"><span className="apply-summary-icon">✈️</span><div><div className="apply-summary-row-label">Number of entries</div><div className="apply-summary-row-value">{visa.entries}</div></div></div>
          <div className="apply-summary-row"><span className="apply-summary-icon">🗓️</span><div><div className="apply-summary-row-label">Max stay</div><div className="apply-summary-row-value">{visa.maxStay}</div></div></div>
          <div className="apply-summary-row"><span className="apply-summary-icon">👤</span><div><div className="apply-summary-row-label">Travelers</div><div className="apply-summary-row-value">{travelers} {travelers===1?'person':'people'}</div></div></div>
        </div>
        <div className="apply-summary-divider" />
        <div className="apply-summary-price-row">
          <span className="apply-summary-price-label">Total</span>
          <span className="apply-summary-price">${total} <span className="apply-summary-price-note">USD</span></span>
        </div>
        <div className="apply-summary-note">Government fees included · No hidden charges</div>
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
                {c.code===value && <span className="apply-dropdown-check">✓</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Step 1 ── */
function Step1({ passport, setPassport, visaId, setVisaId, travelers, setTravelers, purposeOfVisit, setPurposeOfVisit, onNext }: any) {
  return (
    <div className="apply-layout">
      <div className="apply-form-col">
        <div className="apply-header">
          <h1 className="apply-title">Apply now for your<br /><span>India eVisa</span></h1>
          <p className="apply-subtitle">The India eVisa is mandatory for most foreign passport holders traveling to India.</p>
        </div>
        <div className="apply-field">
          <label className="apply-label">Your passport</label>
          <PassportDropdown value={passport} onChange={setPassport} />
        </div>
        <div className="apply-field">
          <label className="apply-label">Applying for</label>
          <div className="apply-visa-list">
            {VISA_OPTIONS.map(v=>(
              <label key={v.id} className={`apply-visa-option${visaId===v.id?' selected':''}`}>
                <input type="radio" name="visa" value={v.id} checked={visaId===v.id} onChange={()=>setVisaId(v.id)} className="sr-only"/>
                <span className="apply-visa-radio"/>
                <span className="apply-visa-label">{v.label}</span>
                {v.tag && <span className="apply-visa-tag">{v.tag}</span>}
              </label>
            ))}
          </div>
        </div>
        {PURPOSE_OPTIONS[visaId] && PURPOSE_OPTIONS[visaId].length > 1 && (
          <div className="apply-field">
            <label className="apply-label">Purpose of visit</label>
            <div className="apply-visa-list">
              {PURPOSE_OPTIONS[visaId].map(p => (
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
        <button className={`apply-submit${passport && (purposeOfVisit || !PURPOSE_OPTIONS[visaId] || PURPOSE_OPTIONS[visaId].length <= 1)?' active':''}`} disabled={!passport || (PURPOSE_OPTIONS[visaId] && PURPOSE_OPTIONS[visaId].length > 1 && !purposeOfVisit)} onClick={onNext}>
          {passport?'Continue to Your Info →':'Select your passport to continue'}
        </button>
      </div>
      <SummaryCard visaId={visaId} travelers={travelers} />
    </div>
  );
}

/* ── Address Validation ── */
/* ── Step 2 ── */
function TravelerCard({ index, data, onChange, expanded, onToggle }: any) {
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
          <div className="ap-field"><label className="ap-field-label">First &amp; middle name</label>
            <input className={`ap-input${data.firstName&&validateName(data.firstName,'First name')?' ap-input-error':''}`} placeholder="John William" value={data.firstName} onChange={e=>onChange('firstName',e.target.value)}/>
            {data.firstName&&validateName(data.firstName,'First name')&&<p className="ap-field-error">{validateName(data.firstName,'First name')}</p>}</div>
          <div className="ap-field"><label className="ap-field-label">Last name</label>
            <input className={`ap-input${data.lastName&&validateName(data.lastName,'Last name')?' ap-input-error':''}`} placeholder="Smith" value={data.lastName} onChange={e=>onChange('lastName',e.target.value)}/>
            {data.lastName&&validateName(data.lastName,'Last name')&&<p className="ap-field-error">{validateName(data.lastName,'Last name')}</p>}</div>
          <div className="ap-field"><label className="ap-field-label">Date of birth</label>
            <div className="ap-dob-row">
              <select className="ap-select" value={data.month} onChange={e=>onChange('month',e.target.value)}><option value="">Month</option>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}</select>
              <select className="ap-select" value={data.day}   onChange={e=>onChange('day',e.target.value)}><option value="">Day</option>{DAYS.map(d=><option key={d} value={d}>{d}</option>)}</select>
              <select className="ap-select" value={data.year}  onChange={e=>onChange('year',e.target.value)}><option value="">Year</option>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select>
            </div></div>
          <div className="ap-field"><label className="ap-field-label">Email address</label>
            <input className={`ap-input${data.email&&validateEmail(data.email)?' ap-input-error':''}`} type="email" placeholder="johnsmith@gmail.com" value={data.email} onChange={e=>onChange('email',e.target.value)}/>
            {data.email&&validateEmail(data.email)?<p className="ap-field-error">{validateEmail(data.email)}</p>:<p className="ap-field-hint">Your India eVisa will be sent to this email address</p>}</div>

          <div className="ap-section-divider"/>
          <div className="ap-section-title">Address Details</div>
          <div className="ap-field"><label className="ap-field-label">Home address</label>
            <p className="ap-field-hint" style={{marginTop:'-0.25rem',marginBottom:'0.35rem'}}>Your current, permanent residence</p>
            <input className={`ap-input${data.address&&validateAddress(data.address,'Home address')?' ap-input-error':''}`} placeholder="123 Main Street, Apt 4B" value={data.address} onChange={e=>onChange('address',e.target.value)}/>
            {data.address&&validateAddress(data.address,'Home address')&&<p className="ap-field-error">{validateAddress(data.address,'Home address')}</p>}</div>
          <div className="ap-row-2">
            <div className="ap-field"><label className="ap-field-label">City or town</label>
              <input className={`ap-input${data.city&&validateCityState(data.city,'City')?' ap-input-error':''}`} placeholder="New York" value={data.city} onChange={e=>onChange('city',e.target.value)}/>
              {data.city&&validateCityState(data.city,'City')&&<p className="ap-field-error">{validateCityState(data.city,'City')}</p>}</div>
            <div className="ap-field"><label className="ap-field-label">State or province</label>
              <input className={`ap-input${data.state&&validateCityState(data.state,'State')?' ap-input-error':''}`} placeholder="New York" value={data.state} onChange={e=>onChange('state',e.target.value)}/>
              {data.state&&validateCityState(data.state,'State')&&<p className="ap-field-error">{validateCityState(data.state,'State')}</p>}</div>
          </div>
          <div className="ap-field" style={{maxWidth:'12rem'}}><label className="ap-field-label">ZIP or postcode</label>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Step2({ travelers, visaId, onBack, onNext }: any) {
  const [data,     setData]     = useState<Traveler[]>(Array.from({length:travelers},emptyTraveler));
  const [expanded, setExpanded] = useState<number[]>([0]);
  const update = (i:number,f:keyof Traveler,v:string) => setData(prev=>prev.map((t,idx)=>idx===i?{...t,[f]:v}:t));
  const toggle = (i:number) => setExpanded(prev=>prev.includes(i)?prev.filter(x=>x!==i):[...prev,i]);
  const allFilled = data.every(t=>{
    if (!t.firstName||!t.lastName||!t.month||!t.day||!t.year||!t.email||!t.address||!t.city||!t.state||!t.zip) return false;
    if (!t.isEmployed||!t.hasCriminalRecord||!t.hasConfirmedTravel) return false;
    if (t.hasConfirmedTravel==='yes'&&(!t.arrivalMonth||!t.arrivalDay||!t.arrivalYear)) return false;
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
          {data.map((t,i)=><TravelerCard key={i} index={i} data={t} onChange={(f:keyof Traveler,v:string)=>update(i,f,v)} expanded={expanded.includes(i)} onToggle={()=>toggle(i)}/>)}
        </div>
        <div className="apply-step2-actions">
          <button className="apply-back-btn" onClick={onBack}>← Previous</button>
          <button className={`apply-submit${allFilled?' active':''}`} disabled={!allFilled}
            onClick={()=>onNext(data.map(t=>t.firstName), data)}>
            {allFilled?'Continue to Passport Details →':'Complete all traveler details'}
          </button>
        </div>
      </div>
      <SummaryCard visaId={visaId} travelers={travelers}/>
    </div>
  );
}

/* ── Step 2b ── */
function PassportCard({ index, travelerName, data, onChange, expanded, onToggle }: any) {
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
          <div className="ap-field"><label className="ap-field-label">Passport</label>
            <PassportDropdown value={data.country} onChange={(v:string)=>onChange('country',v)} disabled={data.skipForNow}/></div>
          <label className="ap-checkbox-label">
            <input type="checkbox" className="ap-checkbox" checked={data.skipForNow} onChange={e=>onChange('skipForNow',e.target.checked)}/>
            <span>Add passport details later</span>
          </label>
          <div className="ap-field" style={{opacity:data.skipForNow?0.45:1,pointerEvents:data.skipForNow?'none':'auto'}}>
            <label className="ap-field-label">Passport number</label>
            <input className={`ap-input${data.number&&validatePassportNumber(data.number)?' ap-input-error':''}`} placeholder="P9876543" value={data.number} disabled={data.skipForNow}
              onChange={e=>onChange('number',e.target.value)}/>
            {data.number&&validatePassportNumber(data.number)&&<p className="ap-field-error">{validatePassportNumber(data.number)}</p>}</div>
          <div className="ap-field" style={{opacity:data.skipForNow?0.45:1,pointerEvents:data.skipForNow?'none':'auto'}}>
            <label className="ap-field-label">Place of issue</label>
            <input className="ap-input" placeholder="e.g. New York" value={data.placeOfIssue} disabled={data.skipForNow}
              onChange={e=>onChange('placeOfIssue',e.target.value)}/></div>
          <div className="ap-field" style={{opacity:data.skipForNow?0.45:1,pointerEvents:data.skipForNow?'none':'auto'}}>
            <label className="ap-field-label">Country of issue</label>
            <input className="ap-input" placeholder="e.g. United States" value={data.countryOfIssue} disabled={data.skipForNow}
              onChange={e=>onChange('countryOfIssue',e.target.value)}/></div>
          <div className="ap-field" style={{opacity:data.skipForNow?0.45:1,pointerEvents:data.skipForNow?'none':'auto'}}>
            <label className="ap-field-label">Passport issue date</label>
            <div className="ap-dob-row">
              <select className="ap-select" value={data.issMonth} disabled={data.skipForNow} onChange={e=>onChange('issMonth',e.target.value)}><option value="">Month</option>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}</select>
              <select className="ap-select" value={data.issDay}   disabled={data.skipForNow} onChange={e=>onChange('issDay',e.target.value)}><option value="">Day</option>{DAYS.map(d=><option key={d} value={d}>{d}</option>)}</select>
              <select className="ap-select" value={data.issYear}  disabled={data.skipForNow} onChange={e=>onChange('issYear',e.target.value)}><option value="">Year</option>{ISS_YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select>
            </div></div>
          <div className="ap-field" style={{opacity:data.skipForNow?0.45:1,pointerEvents:data.skipForNow?'none':'auto'}}>
            <label className="ap-field-label">Passport expiration date</label>
            <div className="ap-dob-row">
              <select className="ap-select" value={data.expMonth} disabled={data.skipForNow} onChange={e=>onChange('expMonth',e.target.value)}><option value="">Month</option>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}</select>
              <select className="ap-select" value={data.expDay}   disabled={data.skipForNow} onChange={e=>onChange('expDay',e.target.value)}><option value="">Day</option>{DAYS.map(d=><option key={d} value={d}>{d}</option>)}</select>
              <select className="ap-select" value={data.expYear}  disabled={data.skipForNow} onChange={e=>onChange('expYear',e.target.value)}><option value="">Year</option>{EXP_YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select>
            </div></div>
        </div>
      )}
    </div>
  );
}

function Step2b({ travelers, travelerNames, visaId, onBack, onNext }: any) {
  const [data,     setData]     = useState<PassportInfo[]>(Array.from({length:travelers},emptyPassportInfo));
  const [expanded, setExpanded] = useState<number[]>([0]);
  const update = (i:number,f:keyof PassportInfo,v:string|boolean) => setData(prev=>prev.map((p,idx)=>idx===i?{...p,[f]:v}:p));
  const toggle = (i:number) => setExpanded(prev=>prev.includes(i)?prev.filter(x=>x!==i):[...prev,i]);
  const allDone = data.every(p=>p.skipForNow||(p.country&&p.number&&!validatePassportNumber(p.number)&&p.placeOfIssue&&p.countryOfIssue&&p.issMonth&&p.issDay&&p.issYear&&p.expMonth&&p.expDay&&p.expYear));
  return (
    <div className="apply-layout">
      <div className="apply-form-col">
        <div className="apply-header">
          <h2 className="apply-title"><span>Passport Details</span></h2>
          <p className="apply-subtitle">Enter the passport details for each traveler.</p>
        </div>
        <div className="traveler-list">
          {data.map((p,i)=><PassportCard key={i} index={i} travelerName={travelerNames[i]??''} data={p}
            onChange={(f:keyof PassportInfo,v:string|boolean)=>update(i,f,v)} expanded={expanded.includes(i)} onToggle={()=>toggle(i)}/>)}
        </div>
        <div className="apply-step2-actions">
          <button className="apply-back-btn" onClick={onBack}>← Previous</button>
          <button className={`apply-submit${allDone?' active':''}`} disabled={!allDone} onClick={()=>onNext(data)}>
            {allDone?'Continue to Checkout →':'Complete passport details to continue'}
          </button>
        </div>
      </div>
      <SummaryCard visaId={visaId} travelers={travelers}/>
    </div>
  );
}

/* ── Step 3: Checkout ── */
function Step3({ visaId, travelers, travelerData, passportData, onBack }: { visaId:string; travelers:number; travelerData:any[]; passportData:PassportInfo[]; onBack:()=>void }) {
  const router = useRouter();
  const visa  = VISA_OPTIONS.find(v=>v.id===visaId)!;
  const PROCESSING_OPTIONS = [
    { id: 'standard', label: 'Standard', surcharge: 0 },
    { id: 'rush',     label: 'Rush',     surcharge: 20 },
    { id: 'super',    label: 'Super Rush', surcharge: 60 },
  ];

  const [processing, setProcessing] = useState('standard');
  const surcharge = PROCESSING_OPTIONS.find(p=>p.id===processing)!.surcharge;
  const baseTotal = visa.price * travelers;
  const total     = baseTotal + surcharge;

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
          destination: 'India',
          visaType: visaId.toUpperCase().replace(/-/g, '_'),
          totalUSD: total,
          processingSpeed: processing,
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
      router.push(`/apply/finish?id=${data.orderId}`);
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
          <span className="checkout-order-label">🇮🇳 India eVisa — {travelers} {travelers===1?'traveler':'travelers'}</span>
          <span className="checkout-order-price">${total} USD</span>
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
              <span className="checkout-card-icons">💳</span>
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
              <input className="ap-input" placeholder="123" value={cvv} maxLength={4} type="password"
                onChange={e=>setCvv(e.target.value.replace(/\D/g,'').slice(0,4))}/>
            </div>
          </div>
        </div>

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
            {loading?'Submitting...':(canSubmit?`Pay $${total} USD →`:'Complete payment details')}
          </button>
        </div>
      </div>
      <div className="apply-summary-col">
        <div className="checkout-section" style={{marginBottom:'1rem'}}>
          <div className="checkout-section-title">Choose a processing time</div>
          <div className="processing-options">
            {PROCESSING_OPTIONS.map(opt => (
              <label key={opt.id} className={`processing-option${processing===opt.id?' selected':''}`} onClick={()=>setProcessing(opt.id)}>
                <div className="processing-option-radio">
                  <span className={`processing-radio-dot${processing===opt.id?' active':''}`}/>
                </div>
                <div className="processing-option-info">
                  <span className="processing-option-label">{opt.label}</span>
                </div>
                <span className="processing-option-price">{opt.surcharge===0?'Included':`+$${opt.surcharge}`}</span>
              </label>
            ))}
          </div>
        </div>
        <SummaryCard visaId={visaId} travelers={travelers}/>
      </div>
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

/* ── Main ── */
function ApplyForm() {
  const searchParams = useSearchParams();
  const [step,          setStep]          = useState(0);
  const [passport,      setPassport]      = useState(searchParams.get('passport') ?? '');
  const [visaId,        setVisaId]        = useState('tourist-30');
  const [purposeOfVisit, setPurposeOfVisit] = useState('');
  const [travelers,     setTravelers]     = useState(1);
  const [travelerNames, setTravelerNames] = useState<string[]>([]);
  const [travelerData,  setTravelerData]  = useState<any[]>([]);
  const [passportData,  setPassportData]  = useState<PassportInfo[]>([]);

  return (
    <>
      <Nav/>
      <div className="apply-page">
        <div className="apply-breadcrumb">
          <Link href="/" className="apply-breadcrumb-link">Home</Link>
          <span className="apply-breadcrumb-sep">›</span>
          <span>India eVisa Application</span>
        </div>
        <ProgressBar current={step}/>
        {step===0 && <Step1 passport={passport} setPassport={setPassport} visaId={visaId} setVisaId={setVisaId} travelers={travelers} setTravelers={setTravelers} purposeOfVisit={purposeOfVisit} setPurposeOfVisit={setPurposeOfVisit} onNext={()=>{
          saveAbandoned({ destination: 'India', visaType: visaId, lastStep: 'step1' });
          setStep(1);
        }}/>}
        {step===1 && <Step2 travelers={travelers} visaId={visaId} onBack={()=>setStep(0)} onNext={(names:string[], data:any[])=>{
          setTravelerNames(names); setTravelerData(data);
          const firstEmail = data[0]?.email || '';
          saveAbandoned({ destination: 'India', visaType: visaId, travelers: data, email: firstEmail, lastStep: 'step2' });
          setStep(2);
        }}/>}
        {step===2 && <Step2b travelers={travelers} travelerNames={travelerNames} visaId={visaId} onBack={()=>setStep(1)} onNext={(pData:PassportInfo[])=>{
          setPassportData(pData);
          saveAbandoned({ destination: 'India', visaType: visaId, passportData: pData, lastStep: 'step2b' });
          setStep(3);
        }}/>}
        {step===3 && <Step3 visaId={visaId} travelers={travelers} travelerData={travelerData} passportData={passportData} onBack={()=>setStep(2)}/>}
      </div>
    </>
  );
}

export default function ApplyPage() {
  return (
    <Suspense fallback={<div style={{paddingTop:'120px',textAlign:'center'}}>Loading...</div>}>
      <ApplyForm/>
    </Suspense>
  );
}
