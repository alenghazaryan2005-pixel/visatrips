'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { validateName, stripNameInput, validatePhone, validateAddress, validateCityState, validateZip, validateRequired, stripDiacritics } from '@/lib/validation';
import { INDIA_RELIGIONS } from '@/lib/constants';
import type { ApplicationSchema, CustomSection, CustomField } from '@/lib/applicationSchema';
import { SectionIcon } from '@/lib/sectionIcons';

/* ── Custom Dropdown ── */
function CustomDropdown({ options, value, onChange, placeholder }: { options: string[]; value: string; onChange: (v: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (!open) setSearch('');
  }, [open]);

  const filtered = search ? options.filter(o => o.toLowerCase().includes(search.toLowerCase())) : options;

  return (
    <div className="cdd-wrap" ref={ref}>
      <button type="button" className={`cdd-trigger${value ? ' has-value' : ''}`} onClick={() => setOpen(!open)}>
        <span className={value ? 'cdd-value' : 'cdd-placeholder'}>{value || placeholder}</span>
        <svg className={`cdd-chevron${open ? ' open' : ''}`} width="12" height="12" viewBox="0 0 12 12"><path fill="#8892B0" d="M6 8L1 3h10z"/></svg>
      </button>
      {open && (
        <div className="cdd-menu">
          <div className="cdd-search-wrap">
            <input ref={inputRef} className="cdd-search" type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="cdd-options">
            {filtered.length === 0 && <div className="cdd-empty">No results</div>}
            {filtered.map(o => (
              <button key={o} type="button" className={`cdd-option${o === value ? ' selected' : ''}`} onClick={() => { onChange(o); setOpen(false); }}>
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Traveler {
  firstName: string;
  lastName: string;
  passportCountry?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  [key: string]: any;
}

interface Order {
  id: string;
  visaType: string;
  destination: string;
  travelers: string;
  flaggedFields: string | null;
  specialistNotes: string | null;
}

const INDIA_AIRPORTS = [
  'Ahmedabad','Amritsar','Bagdogra','Bengaluru','Bhubaneswar','Calicut',
  'Chandigarh','Chennai','Cochin','Coimbatore','Delhi','Gaya','Goa (Dabolim)',
  'Goa (Mopa)','Guwahati','Hyderabad','Indore','Jaipur','Kannur','Kolkata',
  'Lucknow','Madurai','Mangalore','Mumbai','Nagpur','Port Blair','Pune',
  'Surat','Thiruvananthapuram','Trichy','Varanasi','Vijayawada','Visakhapatnam',
];

const INDIA_SEAPORTS = [
  'Agatti','Alang','Bedi Bandar','Bhavnagar','Calicut','Kamarajar','Kandla',
  'Kattupalli','Cochin','Kolkata','Kollam','Krishnapatnam','Mundra',
  'Mumbai','Nagapattinam','New Mangalore','Nhava Sheva','Paradeep',
  'Pipavav','Port Blair','Porbandar','Tuticorin','Vallarpadam',
  'Vishakhapatnam','Vizhinjam','Vizhinjam International','Dhamra',
  'Chennai','Mormugao','Cuddalore','Hazira','Mandvi','Kakinada',
];

const INDIA_LAND_PORTS = [
  'Raxaul','Rupaidiha','Darranga','Jogbani',
];

const ALL_INDIA_PORTS = [
  ...INDIA_AIRPORTS.map(p => `${p} (Airport)`),
  ...INDIA_SEAPORTS.map(p => `${p} (Seaport)`),
  ...INDIA_LAND_PORTS.map(p => `${p} (Land Port)`),
];

const INDIA_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Chandigarh','Puducherry','Jammu and Kashmir','Ladakh',
  'Andaman and Nicobar Islands','Dadra and Nagar Haveli and Daman and Diu','Lakshadweep',
];

const INDIA_DISTRICTS: Record<string, string[]> = {
  'Delhi': ['Central Delhi','East Delhi','New Delhi','North Delhi','North East Delhi','North West Delhi','Shahdara','South Delhi','South East Delhi','South West Delhi','West Delhi'],
  'Maharashtra': ['Ahmednagar','Akola','Amravati','Aurangabad','Beed','Bhandara','Buldhana','Chandrapur','Dhule','Gadchiroli','Gondia','Hingoli','Jalgaon','Jalna','Kolhapur','Latur','Mumbai City','Mumbai Suburban','Nagpur','Nanded','Nandurbar','Nashik','Osmanabad','Palghar','Parbhani','Pune','Raigad','Ratnagiri','Sangli','Satara','Sindhudurg','Solapur','Thane','Wardha','Washim','Yavatmal'],
  'Karnataka': ['Bagalkot','Ballari','Belagavi','Bengaluru Rural','Bengaluru Urban','Bidar','Chamarajanagar','Chikkaballapur','Chikkamagaluru','Chitradurga','Dakshina Kannada','Davanagere','Dharwad','Gadag','Hassan','Haveri','Kalaburagi','Kodagu','Kolar','Koppal','Mandya','Mysuru','Raichur','Ramanagara','Shivamogga','Tumakuru','Udupi','Uttara Kannada','Vijayapura','Yadgir'],
  'Tamil Nadu': ['Ariyalur','Chengalpattu','Chennai','Coimbatore','Cuddalore','Dharmapuri','Dindigul','Erode','Kallakurichi','Kancheepuram','Kanyakumari','Karur','Krishnagiri','Madurai','Mayiladuthurai','Nagapattinam','Namakkal','Nilgiris','Perambalur','Pudukkottai','Ramanathapuram','Ranipet','Salem','Sivaganga','Tenkasi','Thanjavur','Theni','Thoothukudi','Tiruchirappalli','Tirunelveli','Tirupathur','Tiruppur','Tiruvallur','Tiruvannamalai','Tiruvarur','Vellore','Viluppuram','Virudhunagar'],
  'Uttar Pradesh': ['Agra','Aligarh','Allahabad','Ambedkar Nagar','Amethi','Amroha','Auraiya','Ayodhya','Azamgarh','Baghpat','Bahraich','Ballia','Balrampur','Banda','Barabanki','Bareilly','Basti','Bijnor','Budaun','Bulandshahr','Chandauli','Chitrakoot','Deoria','Etah','Etawah','Farrukhabad','Fatehpur','Firozabad','Gautam Buddh Nagar','Ghaziabad','Ghazipur','Gonda','Gorakhpur','Hamirpur','Hapur','Hardoi','Hathras','Jalaun','Jaunpur','Jhansi','Kannauj','Kanpur Dehat','Kanpur Nagar','Kasganj','Kaushambi','Kushinagar','Lakhimpur Kheri','Lalitpur','Lucknow','Maharajganj','Mahoba','Mainpuri','Mathura','Mau','Meerut','Mirzapur','Moradabad','Muzaffarnagar','Pilibhit','Pratapgarh','Raebareli','Rampur','Saharanpur','Sambhal','Sant Kabir Nagar','Shahjahanpur','Shamli','Shravasti','Siddharthnagar','Sitapur','Sonbhadra','Sultanpur','Unnao','Varanasi'],
  'West Bengal': ['Alipurduar','Bankura','Birbhum','Cooch Behar','Dakshin Dinajpur','Darjeeling','Hooghly','Howrah','Jalpaiguri','Jhargram','Kalimpong','Kolkata','Malda','Murshidabad','Nadia','North 24 Parganas','Paschim Bardhaman','Paschim Medinipur','Purba Bardhaman','Purba Medinipur','Purulia','South 24 Parganas','Uttar Dinajpur'],
  'Gujarat': ['Ahmedabad','Amreli','Anand','Aravalli','Banaskantha','Bharuch','Bhavnagar','Botad','Chhota Udaipur','Dahod','Dang','Devbhoomi Dwarka','Gandhinagar','Gir Somnath','Jamnagar','Junagadh','Kachchh','Kheda','Mahisagar','Mehsana','Morbi','Narmada','Navsari','Panchmahal','Patan','Porbandar','Rajkot','Sabarkantha','Surat','Surendranagar','Tapi','Vadodara','Valsad'],
  'Rajasthan': ['Ajmer','Alwar','Banswara','Baran','Barmer','Bharatpur','Bhilwara','Bikaner','Bundi','Chittorgarh','Churu','Dausa','Dholpur','Dungarpur','Hanumangarh','Jaipur','Jaisalmer','Jalore','Jhalawar','Jhunjhunu','Jodhpur','Karauli','Kota','Nagaur','Pali','Pratapgarh','Rajsamand','Sawai Madhopur','Sikar','Sirohi','Sri Ganganagar','Tonk','Udaipur'],
  'Kerala': ['Alappuzha','Ernakulam','Idukki','Kannur','Kasaragod','Kollam','Kottayam','Kozhikode','Malappuram','Palakkad','Pathanamthitta','Thiruvananthapuram','Thrissur','Wayanad'],
  'Telangana': ['Adilabad','Bhadradri Kothagudem','Hyderabad','Jagtial','Jangaon','Jayashankar Bhupalpally','Jogulamba Gadwal','Kamareddy','Karimnagar','Khammam','Kumuram Bheem','Mahabubabad','Mahbubnagar','Mancherial','Medak','Medchal-Malkajgiri','Mulugu','Nagarkurnool','Nalgonda','Narayanpet','Nirmal','Nizamabad','Peddapalli','Rajanna Sircilla','Rangareddy','Sangareddy','Siddipet','Suryapet','Vikarabad','Wanaparthy','Warangal Rural','Warangal Urban','Yadadri Bhuvanagiri'],
  'Andhra Pradesh': ['Anantapur','Chittoor','East Godavari','Guntur','Krishna','Kurnool','Nellore','Prakasam','Srikakulam','Visakhapatnam','Vizianagaram','West Godavari','YSR Kadapa'],
  'Punjab': ['Amritsar','Barnala','Bathinda','Faridkot','Fatehgarh Sahib','Fazilka','Ferozepur','Gurdaspur','Hoshiarpur','Jalandhar','Kapurthala','Ludhiana','Mansa','Moga','Muktsar','Nawanshahr','Pathankot','Patiala','Rupnagar','Sangrur','SAS Nagar','Tarn Taran'],
  'Haryana': ['Ambala','Bhiwani','Charkhi Dadri','Faridabad','Fatehabad','Gurugram','Hisar','Jhajjar','Jind','Kaithal','Karnal','Kurukshetra','Mahendragarh','Nuh','Palwal','Panchkula','Panipat','Rewari','Rohtak','Sirsa','Sonipat','Yamunanagar'],
  'Bihar': ['Araria','Arwal','Aurangabad','Banka','Begusarai','Bhagalpur','Bhojpur','Buxar','Darbhanga','East Champaran','Gaya','Gopalganj','Jamui','Jehanabad','Kaimur','Katihar','Khagaria','Kishanganj','Lakhisarai','Madhepura','Madhubani','Munger','Muzaffarpur','Nalanda','Nawada','Patna','Purnia','Rohtas','Saharsa','Samastipur','Saran','Sheikhpura','Sheohar','Sitamarhi','Siwan','Supaul','Vaishali','West Champaran'],
  'Goa': ['North Goa','South Goa'],
};

const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Argentina','Armenia','Australia','Austria','Azerbaijan',
  'Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia',
  'Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cambodia','Cameroon',
  'Canada','Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo','Costa Rica','Croatia',
  'Cuba','Cyprus','Czech Republic','Denmark','Djibouti','Dominican Republic','Ecuador','Egypt','El Salvador',
  'Estonia','Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia','Germany','Ghana','Greece','Guatemala',
  'Guinea','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy',
  'Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Libya',
  'Lithuania','Luxembourg','Madagascar','Malaysia','Maldives','Mali','Malta','Mexico','Moldova','Monaco',
  'Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia','Nepal','Netherlands','New Zealand','Nicaragua',
  'Niger','Nigeria','North Korea','North Macedonia','Norway','Oman','Pakistan','Palestine','Panama','Paraguay',
  'Peru','Philippines','Poland','Portugal','Qatar','Republic of Korea','Romania','Russia','Rwanda','Saudi Arabia','Senegal','Serbia',
  'Singapore','Slovakia','Slovenia','Somalia','South Africa','Spain','Sri Lanka','Sudan','Sweden',
  'Switzerland','Syria','Taiwan','Tajikistan','Tanzania','Thailand','Togo','Trinidad and Tobago','Tunisia',
  'Turkey','Turkmenistan','Uganda','Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay',
  'Uzbekistan','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
];

const COUNTRY_CODE_MAP: Record<string, string> = {
  US:'United States',GB:'United Kingdom',CA:'Canada',AU:'Australia',DE:'Germany',FR:'France',
  IT:'Italy',ES:'Spain',NL:'Netherlands',JP:'Japan',KR:'Republic of Korea',SG:'Singapore',
  AE:'United Arab Emirates',BR:'Brazil',MX:'Mexico',ZA:'South Africa',NG:'Nigeria',KE:'Kenya',
  TR:'Turkey',PH:'Philippines',ID:'Indonesia',MY:'Malaysia',TH:'Thailand',VN:'Vietnam',
  EG:'Egypt',MA:'Morocco',PT:'Portugal',PL:'Poland',SE:'Sweden',CH:'Switzerland',
  NZ:'New Zealand',AR:'Argentina',GH:'Ghana',
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = Array.from({ length: 31 }, (_,i) => String(i+1));
const ARR_YEARS = Array.from({ length: 5 }, (_,i) => String(new Date().getFullYear()+i));

/* ── Sub-step views ── */
type FinishStep = 'overview' | 'trip' | 'personal' | 'address' | 'employment' | 'business' | 'family' | 'photo-guide' | 'photo-upload' | 'passport-bio-guide' | 'passport-bio-upload' | 'additional' | 'verify' | 'complete';

function CheckIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function FinishContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('id');
  const [order, setOrder] = useState<Order | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<FinishStep>('overview');

  /* Admin-defined custom sections (from /admin/settings/india → Application tab) */
  const [customSchema, setCustomSchema] = useState<ApplicationSchema>({ country: 'INDIA', sections: [] });
  const [customValues, setCustomValues] = useState<Record<string, any>>({});

  /* Trip details state */
  const [arrMonth, setArrMonth] = useState('');
  const [arrDay, setArrDay]     = useState('');
  const [arrYear, setArrYear]   = useState('');
  const [arrivalPoint, setArrivalPoint] = useState('');
  const [visitedCountries, setVisitedCountries] = useState<string[]>(['']);

  /* Personal details state */
  const [parentsFromDest, setParentsFromDest] = useState('');
  const [gender, setGender] = useState('');
  const [countryOfBirth, setCountryOfBirth] = useState('');
  const [cityOfBirth, setCityOfBirth] = useState('');
  const [holdAnotherNat, setHoldAnotherNat] = useState('');
  const [otherNationality, setOtherNationality] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [citizenshipId, setCitizenshipId] = useState('');
  const [religion, setReligion] = useState('');
  const [visibleMarks, setVisibleMarks] = useState('');
  const [educationalQualification, setEducationalQualification] = useState('');
  const [nationalityByBirth, setNationalityByBirth] = useState('');
  const [livedTwoYears, setLivedTwoYears] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  /* Home address state */
  const [residenceCountry, setResidenceCountry] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [homeState, setHomeState] = useState('');
  const [homeZip, setHomeZip] = useState('');
  const [addressError, setAddressError] = useState('');

  /* Employment state */
  const [employmentStatus, setEmploymentStatus] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [employerAddress, setEmployerAddress] = useState('');
  const [employerCity, setEmployerCity] = useState('');
  const [employerState, setEmployerState] = useState('');
  const [employerCountry, setEmployerCountry] = useState('');
  const [employerZip, setEmployerZip] = useState('');
  const [studentProvider, setStudentProvider] = useState(''); // 'father' | 'spouse'
  const [servedMilitary, setServedMilitary] = useState('');

  /* Business-visa-only state (rendered only when order.visaType is BUSINESS_1Y).
   * stripDiacritics on input so accented characters get sanitized — the gov
   * form rejects them. */
  const [applicantCompanyName,    setApplicantCompanyName]    = useState('');
  const [applicantCompanyAddress, setApplicantCompanyAddress] = useState('');
  const [applicantCompanyPhone,   setApplicantCompanyPhone]   = useState('');
  const [applicantCompanyWebsite, setApplicantCompanyWebsite] = useState('');
  const [indianFirmName,    setIndianFirmName]    = useState('');
  const [indianFirmAddress, setIndianFirmAddress] = useState('');
  const [indianFirmPhone,   setIndianFirmPhone]   = useState('');
  const [indianFirmWebsite, setIndianFirmWebsite] = useState('');

  /* Family state */
  const [knowParents, setKnowParents] = useState(''); // 'both' | 'mother' | 'father' | 'none'
  const [fatherName, setFatherName] = useState('');
  const [fatherNationality, setFatherNationality] = useState('');
  const [fatherPlaceOfBirth, setFatherPlaceOfBirth] = useState('');
  const [fatherCountryOfBirth, setFatherCountryOfBirth] = useState('');
  const [motherName, setMotherName] = useState('');
  const [motherNationality, setMotherNationality] = useState('');
  const [motherPlaceOfBirth, setMotherPlaceOfBirth] = useState('');
  const [motherCountryOfBirth, setMotherCountryOfBirth] = useState('');
  const [spouseName, setSpouseName] = useState('');
  const [spouseNationality, setSpouseNationality] = useState('');
  const [spousePlaceOfBirth, setSpousePlaceOfBirth] = useState('');
  const [spouseCountryOfBirth, setSpouseCountryOfBirth] = useState('');

  /* Photo upload state */
  const [travelerPhoto, setTravelerPhoto] = useState<File | null>(null);
  const [travelerPhotoPreview, setTravelerPhotoPreview] = useState<string | null>(null);

  /* Passport bio scan state */
  const [passportBio, setPassportBio] = useState<File | null>(null);
  const [passportBioPreview, setPassportBioPreview] = useState<string | null>(null);

  /* Persisted upload URLs */
  const [photoUrl, setPhotoUrl] = useState('');
  const [passportBioUrl, setPassportBioUrl] = useState('');

  /* Additional details state */
  // Passport extras
  const [passportPlaceOfIssue, setPassportPlaceOfIssue] = useState('');
  const [finishPassportNumber, setFinishPassportNumber] = useState('');
  const [finishPassportIssued, setFinishPassportIssued] = useState('');
  const [finishPassportExpiry, setFinishPassportExpiry] = useState('');
  const [passportCountryOfIssue, setPassportCountryOfIssue] = useState('');
  const [hasOtherPassport, setHasOtherPassport] = useState('');
  const [otherPassportNumber, setOtherPassportNumber] = useState('');
  const [otherPassportDateOfIssue, setOtherPassportDateOfIssue] = useState('');
  const [otherPassportPlaceOfIssue, setOtherPassportPlaceOfIssue] = useState('');

  // Travel / accommodation
  const [placesToVisit, setPlacesToVisit] = useState('');
  const [bookedHotel, setBookedHotel] = useState('');
  const [tourOperatorName, setTourOperatorName] = useState('');
  const [tourOperatorAddress, setTourOperatorAddress] = useState('');
  const [hotelName, setHotelName] = useState('');
  const [hotelPlace, setHotelPlace] = useState('');
  const [exitPort, setExitPort] = useState('');
  const [visitedIndiaBefore, setVisitedIndiaBefore] = useState('');
  const [visaRefusedBefore, setVisaRefusedBefore] = useState('');

  // References in India
  const [refNameIndia, setRefNameIndia] = useState('');
  const [refAddressIndia, setRefAddressIndia] = useState('');
  const [refStateIndia, setRefStateIndia] = useState('');
  const [refDistrictIndia, setRefDistrictIndia] = useState('');
  const [refPhoneIndia, setRefPhoneIndia] = useState('');

  // References in Home Country
  const [refNameHome, setRefNameHome] = useState('');
  const [refAddressHome, setRefAddressHome] = useState('');
  const [refStateHome, setRefStateHome] = useState('');
  const [refDistrictHome, setRefDistrictHome] = useState('');
  const [refPhoneHome, setRefPhoneHome] = useState('');

  // Security questions
  const [everArrested, setEverArrested] = useState('');
  const [everRefusedEntry, setEverRefusedEntry] = useState('');
  const [soughtAsylum, setSoughtAsylum] = useState('');

  /* Previous India visit */
  const [prevIndiaVisit, setPrevIndiaVisit] = useState('');
  const [prevIndiaAddress, setPrevIndiaAddress] = useState('');
  const [prevIndiaCities, setPrevIndiaCities] = useState('');
  const [prevIndiaVisaNo, setPrevIndiaVisaNo] = useState('');
  const [prevIndiaVisaType, setPrevIndiaVisaType] = useState('');
  const [prevIndiaVisaPlace, setPrevIndiaVisaPlace] = useState('');
  const [prevIndiaVisaDate, setPrevIndiaVisaDate] = useState('');

  /* Flagged fields from admin */
  const [orderFlaggedFields, setOrderFlaggedFields] = useState<string[]>([]);
  const [orderSpecialistNotes, setOrderSpecialistNotes] = useState('');

  useEffect(() => {
    if (!orderId) return;
    fetch(`/api/orders/${orderId}`)
      .then(r => r.json())
      .then(data => {
        setOrder(data);
        try { setOrderFlaggedFields(data.flaggedFields ? JSON.parse(data.flaggedFields) : []); } catch { setOrderFlaggedFields([]); }
        setOrderSpecialistNotes(data.specialistNotes ?? '');
        try {
          const parsed = JSON.parse(data.travelers);
          setTravelers(parsed);
          const t = parsed[0];
          if (!t) return;

          // Restore any previously-entered custom field values
          if (t.custom && typeof t.custom === 'object') setCustomValues({ ...t.custom });

          // Restore passport-derived defaults
          if (t.passportCountry) {
            const countryName = COUNTRY_CODE_MAP[t.passportCountry] || t.passportCountry;
            setCountryOfBirth(t.countryOfBirth || countryName);
            setResidenceCountry(t.residenceCountry || countryName);
          }

          // Restore address
          if (t.address) setHomeAddress(t.address);
          if (t.city) setHomeCity(t.city);
          if (t.state) setHomeState(t.state);
          if (t.zip) setHomeZip(t.zip);

          // Restore trip details
          if (t.arrivalDate) {
            const parts = t.arrivalDate.match(/^(\w+)\s+(\d+),\s+(\d+)$/);
            if (parts) { setArrMonth(parts[1]); setArrDay(parts[2]); setArrYear(parts[3]); }
          }
          if (t.arrivalPoint) setArrivalPoint(t.arrivalPoint);
          if (t.visitedCountries?.length) setVisitedCountries(t.visitedCountries);

          // Restore personal details
          if (t.parentsFromPakistan) setParentsFromDest(t.parentsFromPakistan);
          if (t.gender) setGender(t.gender);
          if (t.countryOfBirth) setCountryOfBirth(t.countryOfBirth);
          if (t.cityOfBirth) setCityOfBirth(t.cityOfBirth);
          if (t.holdAnotherNationality) setHoldAnotherNat(t.holdAnotherNationality);
          if (t.otherNationality) setOtherNationality(t.otherNationality);
          if (t.maritalStatus) setMaritalStatus(t.maritalStatus);
          if (t.citizenshipId) setCitizenshipId(t.citizenshipId);
          if (t.religion) setReligion(t.religion);
          if (t.visibleMarks) setVisibleMarks(t.visibleMarks);
          if (t.educationalQualification) setEducationalQualification(t.educationalQualification);
          if (t.nationalityByBirth) setNationalityByBirth(t.nationalityByBirth);
          if (t.livedTwoYears) setLivedTwoYears(t.livedTwoYears);
          if (t.phoneNumber) setPhoneNumber(t.phoneNumber);

          // Restore home address
          if (t.residenceCountry) setResidenceCountry(t.residenceCountry);

          // Restore employment
          if (t.employmentStatus) setEmploymentStatus(t.employmentStatus);
          if (t.employerName) setEmployerName(t.employerName);
          if (t.employerAddress) setEmployerAddress(t.employerAddress);
          if (t.employerCity) setEmployerCity(t.employerCity);
          if (t.employerState) setEmployerState(t.employerState);
          if (t.employerCountry) setEmployerCountry(t.employerCountry);
          if (t.employerZip) setEmployerZip(t.employerZip);
          if (t.studentProvider) setStudentProvider(t.studentProvider);
          if (t.servedMilitary) setServedMilitary(t.servedMilitary);
          // Business visa fields
          if (t.applicantCompanyName)    setApplicantCompanyName(t.applicantCompanyName);
          if (t.applicantCompanyAddress) setApplicantCompanyAddress(t.applicantCompanyAddress);
          if (t.applicantCompanyPhone)   setApplicantCompanyPhone(t.applicantCompanyPhone);
          if (t.applicantCompanyWebsite) setApplicantCompanyWebsite(t.applicantCompanyWebsite);
          if (t.indianFirmName)    setIndianFirmName(t.indianFirmName);
          if (t.indianFirmAddress) setIndianFirmAddress(t.indianFirmAddress);
          if (t.indianFirmPhone)   setIndianFirmPhone(t.indianFirmPhone);
          if (t.indianFirmWebsite) setIndianFirmWebsite(t.indianFirmWebsite);

          // Restore family
          if (t.knowParents) setKnowParents(t.knowParents);
          if (t.fatherName) setFatherName(t.fatherName);
          if (t.fatherNationality) setFatherNationality(t.fatherNationality);
          if (t.fatherPlaceOfBirth) setFatherPlaceOfBirth(t.fatherPlaceOfBirth);
          if (t.fatherCountryOfBirth) setFatherCountryOfBirth(t.fatherCountryOfBirth);
          if (t.motherName) setMotherName(t.motherName);
          if (t.motherNationality) setMotherNationality(t.motherNationality);
          if (t.motherPlaceOfBirth) setMotherPlaceOfBirth(t.motherPlaceOfBirth);
          if (t.motherCountryOfBirth) setMotherCountryOfBirth(t.motherCountryOfBirth);
          if (t.spouseName) setSpouseName(t.spouseName);
          if (t.spouseNationality) setSpouseNationality(t.spouseNationality);
          if (t.spousePlaceOfBirth) setSpousePlaceOfBirth(t.spousePlaceOfBirth);
          if (t.spouseCountryOfBirth) setSpouseCountryOfBirth(t.spouseCountryOfBirth);

          // Restore passport extras & additional
          if (t.passportPlaceOfIssue) setPassportPlaceOfIssue(t.passportPlaceOfIssue);
          if (t.passportNumber) setFinishPassportNumber(t.passportNumber);
          if (t.passportIssued) setFinishPassportIssued(t.passportIssued);
          if (t.passportExpiry) setFinishPassportExpiry(t.passportExpiry);
          if (t.passportCountryOfIssue) setPassportCountryOfIssue(t.passportCountryOfIssue);
          if (t.hasOtherPassport) setHasOtherPassport(t.hasOtherPassport);
          if (t.otherPassportNumber) setOtherPassportNumber(t.otherPassportNumber);
          if (t.otherPassportDateOfIssue) setOtherPassportDateOfIssue(t.otherPassportDateOfIssue);
          if (t.otherPassportPlaceOfIssue) setOtherPassportPlaceOfIssue(t.otherPassportPlaceOfIssue);
          if (t.placesToVisit) setPlacesToVisit(t.placesToVisit);
          if (t.bookedHotel) setBookedHotel(t.bookedHotel);
          if (t.tourOperatorName) setTourOperatorName(t.tourOperatorName);
          if (t.tourOperatorAddress) setTourOperatorAddress(t.tourOperatorAddress);
          if (t.hotelName) setHotelName(t.hotelName);
          if (t.hotelPlace) setHotelPlace(t.hotelPlace);
          if (t.exitPort) setExitPort(t.exitPort);
          if (t.visitedIndiaBefore) setVisitedIndiaBefore(t.visitedIndiaBefore);
          if (t.visaRefusedBefore) setVisaRefusedBefore(t.visaRefusedBefore);
          if (t.refNameIndia) setRefNameIndia(t.refNameIndia);
          if (t.refAddressIndia) setRefAddressIndia(t.refAddressIndia);
          if (t.refStateIndia) setRefStateIndia(t.refStateIndia);
          if (t.refDistrictIndia) setRefDistrictIndia(t.refDistrictIndia);
          if (t.refPhoneIndia) setRefPhoneIndia(t.refPhoneIndia);
          if (t.refNameHome) setRefNameHome(t.refNameHome);
          if (t.refAddressHome) setRefAddressHome(t.refAddressHome);
          if (t.refStateHome) setRefStateHome(t.refStateHome);
          if (t.refDistrictHome) setRefDistrictHome(t.refDistrictHome);
          if (t.refPhoneHome) setRefPhoneHome(t.refPhoneHome);
          if (t.everArrested) setEverArrested(t.everArrested);
          if (t.everRefusedEntry) setEverRefusedEntry(t.everRefusedEntry);
          if (t.soughtAsylum) setSoughtAsylum(t.soughtAsylum);
          if (t.prevIndiaVisit) setPrevIndiaVisit(t.prevIndiaVisit);
          if (t.prevIndiaAddress) setPrevIndiaAddress(t.prevIndiaAddress);
          if (t.prevIndiaCities) setPrevIndiaCities(t.prevIndiaCities);
          if (t.prevIndiaVisaNo) setPrevIndiaVisaNo(t.prevIndiaVisaNo);
          if (t.prevIndiaVisaType) setPrevIndiaVisaType(t.prevIndiaVisaType);
          if (t.prevIndiaVisaPlace) setPrevIndiaVisaPlace(t.prevIndiaVisaPlace);
          if (t.prevIndiaVisaDate) setPrevIndiaVisaDate(t.prevIndiaVisaDate);

          // Restore upload URLs
          if (t.photoUrl) { setPhotoUrl(t.photoUrl); setTravelerPhotoPreview(t.photoUrl); }
          if (t.passportBioUrl) { setPassportBioUrl(t.passportBioUrl); setPassportBioPreview(t.passportBioUrl); }

          // Resume from saved step (unless fix mode — start from beginning)
          const isFix = searchParams.get('fix') === 'true';
          if (!isFix && t.finishStep) setStep(t.finishStep as FinishStep);
        } catch { setTravelers([]); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

  /* Load admin-defined custom application schema (country-scoped). */
  useEffect(() => {
    if (!order) return;
    const country = (order.destination || 'India').toUpperCase();
    fetch(`/api/settings/application-schema?country=${encodeURIComponent(country)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && Array.isArray(data.sections)) setCustomSchema(data); })
      .catch(() => {});
  }, [order]);

  /* Upload a file and return the URL */
  const uploadFile = async (file: File, type: 'photo' | 'passport'): Promise<string> => {
    if (!orderId) return '';
    const fd = new FormData();
    fd.append('file', file);
    fd.append('orderId', orderId);
    fd.append('type', type);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      return data.url || '';
    } catch { return ''; }
  };

  /* Save progress to the order by updating the travelers JSON with extended data */
  const saveProgress = async (nextStep: FinishStep) => {
    if (!order) return;
    const extendedTravelers = travelers.map((t, i) => {
      if (i !== 0) return t; // Only extend first traveler for now
      return {
        ...t,
        // Trip details
        arrivalDate: arrMonth && arrDay && arrYear ? `${arrMonth} ${arrDay}, ${arrYear}` : t.arrivalDate,
        arrivalPoint: arrivalPoint || t.arrivalPoint,
        visitedCountries: visitedCountries.filter(Boolean).length ? visitedCountries.filter(Boolean) : t.visitedCountries,
        // Personal details
        parentsFromPakistan: parentsFromDest || t.parentsFromPakistan,
        gender: gender || t.gender,
        countryOfBirth: countryOfBirth || t.countryOfBirth,
        cityOfBirth: cityOfBirth || t.cityOfBirth,
        holdAnotherNationality: holdAnotherNat || t.holdAnotherNationality,
        otherNationality: otherNationality || t.otherNationality,
        maritalStatus: maritalStatus || t.maritalStatus,
        citizenshipId: citizenshipId || t.citizenshipId,
        religion: religion || t.religion,
        visibleMarks: visibleMarks || t.visibleMarks,
        educationalQualification: educationalQualification || t.educationalQualification,
        nationalityByBirth: nationalityByBirth || t.nationalityByBirth,
        livedTwoYears: livedTwoYears || t.livedTwoYears,
        phoneNumber: phoneNumber || t.phoneNumber,
        // Home address
        residenceCountry: residenceCountry || t.residenceCountry,
        address: homeAddress || t.address,
        city: homeCity || t.city,
        state: homeState || t.state,
        zip: homeZip || t.zip,
        // Employment
        employmentStatus: employmentStatus || t.employmentStatus,
        employerName: employerName || t.employerName,
        employerAddress: employerAddress || t.employerAddress,
        employerCity: employerCity || t.employerCity,
        employerState: employerState || t.employerState,
        employerCountry: employerCountry || t.employerCountry,
        employerZip: employerZip || t.employerZip,
        studentProvider: studentProvider || t.studentProvider,
        servedMilitary: servedMilitary || t.servedMilitary,
        // Business visa
        applicantCompanyName:    applicantCompanyName    || t.applicantCompanyName,
        applicantCompanyAddress: applicantCompanyAddress || t.applicantCompanyAddress,
        applicantCompanyPhone:   applicantCompanyPhone   || t.applicantCompanyPhone,
        applicantCompanyWebsite: applicantCompanyWebsite || t.applicantCompanyWebsite,
        indianFirmName:    indianFirmName    || t.indianFirmName,
        indianFirmAddress: indianFirmAddress || t.indianFirmAddress,
        indianFirmPhone:   indianFirmPhone   || t.indianFirmPhone,
        indianFirmWebsite: indianFirmWebsite || t.indianFirmWebsite,
        // Family
        knowParents: knowParents || t.knowParents,
        fatherName: fatherName || t.fatherName,
        fatherNationality: fatherNationality || t.fatherNationality,
        fatherPlaceOfBirth: fatherPlaceOfBirth || t.fatherPlaceOfBirth,
        fatherCountryOfBirth: fatherCountryOfBirth || t.fatherCountryOfBirth,
        motherName: motherName || t.motherName,
        motherNationality: motherNationality || t.motherNationality,
        motherPlaceOfBirth: motherPlaceOfBirth || t.motherPlaceOfBirth,
        motherCountryOfBirth: motherCountryOfBirth || t.motherCountryOfBirth,
        spouseName: spouseName || t.spouseName,
        spouseNationality: spouseNationality || t.spouseNationality,
        spousePlaceOfBirth: spousePlaceOfBirth || t.spousePlaceOfBirth,
        spouseCountryOfBirth: spouseCountryOfBirth || t.spouseCountryOfBirth,
        // Passport extras
        passportNumber: finishPassportNumber || t.passportNumber,
        passportIssued: finishPassportIssued || t.passportIssued,
        passportExpiry: finishPassportExpiry || t.passportExpiry,
        passportPlaceOfIssue: passportPlaceOfIssue || t.passportPlaceOfIssue,
        passportCountryOfIssue: passportCountryOfIssue || t.passportCountryOfIssue,
        hasOtherPassport: hasOtherPassport || t.hasOtherPassport,
        otherPassportNumber: otherPassportNumber || t.otherPassportNumber,
        otherPassportDateOfIssue: otherPassportDateOfIssue || t.otherPassportDateOfIssue,
        otherPassportPlaceOfIssue: otherPassportPlaceOfIssue || t.otherPassportPlaceOfIssue,
        // Travel / accommodation
        placesToVisit: placesToVisit || t.placesToVisit,
        bookedHotel: bookedHotel || t.bookedHotel,
        tourOperatorName: tourOperatorName || t.tourOperatorName,
        tourOperatorAddress: tourOperatorAddress || t.tourOperatorAddress,
        hotelName: hotelName || t.hotelName,
        hotelPlace: hotelPlace || t.hotelPlace,
        exitPort: exitPort || t.exitPort,
        visitedIndiaBefore: visitedIndiaBefore || t.visitedIndiaBefore,
        visaRefusedBefore: visaRefusedBefore || t.visaRefusedBefore,
        // References India
        refNameIndia: refNameIndia || t.refNameIndia,
        refAddressIndia: refAddressIndia || t.refAddressIndia,
        refStateIndia: refStateIndia || t.refStateIndia,
        refDistrictIndia: refDistrictIndia || t.refDistrictIndia,
        refPhoneIndia: refPhoneIndia || t.refPhoneIndia,
        // References Home Country
        refNameHome: refNameHome || t.refNameHome,
        refAddressHome: refAddressHome || t.refAddressHome,
        refStateHome: refStateHome || t.refStateHome,
        refDistrictHome: refDistrictHome || t.refDistrictHome,
        refPhoneHome: refPhoneHome || t.refPhoneHome,
        // Security questions
        everArrested: everArrested || t.everArrested,
        everRefusedEntry: everRefusedEntry || t.everRefusedEntry,
        soughtAsylum: soughtAsylum || t.soughtAsylum,
        // Previous India visit
        prevIndiaVisit: prevIndiaVisit || t.prevIndiaVisit,
        prevIndiaAddress: prevIndiaAddress || t.prevIndiaAddress,
        prevIndiaCities: prevIndiaCities || t.prevIndiaCities,
        prevIndiaVisaNo: prevIndiaVisaNo || t.prevIndiaVisaNo,
        prevIndiaVisaType: prevIndiaVisaType || t.prevIndiaVisaType,
        prevIndiaVisaPlace: prevIndiaVisaPlace || t.prevIndiaVisaPlace,
        prevIndiaVisaDate: prevIndiaVisaDate || t.prevIndiaVisaDate,
        // Upload URLs
        photoUrl: photoUrl || t.photoUrl,
        passportBioUrl: passportBioUrl || t.passportBioUrl,
        // Admin-defined custom fields (merge preserves any previously-saved values)
        custom: { ...(t.custom || {}), ...customValues },
        // Progress tracking
        finishStep: nextStep,
      };
    });

    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ travelers: JSON.stringify(extendedTravelers), flaggedFields: JSON.stringify(orderFlaggedFields) }),
      });
    } catch (err) {
      console.error('Failed to save progress:', err);
    }

    setStep(nextStep);
  };

  const isFlagged = (field: string) => orderFlaggedFields.includes(field);
  const flagClass = (field: string) => isFlagged(field) ? ' finish-flagged-field' : '';
  const clearFlag = (field: string) => {
    if (isFlagged(field)) setOrderFlaggedFields(prev => prev.filter(f => f !== field));
  };
  const FlagHint = ({ field }: { field: string }) => isFlagged(field) ? (
    <span className="finish-flag-hint">🚩 Correct this field</span>
  ) : null;

  const CorrectionBanner = () => orderFlaggedFields.length > 0 && orderSpecialistNotes ? (
    <div className="finish-correction-banner">
      <span>⚠️</span>
      <div>
        <strong>Specialist&apos;s Note:</strong> {orderSpecialistNotes}
      </div>
    </div>
  ) : null;

  if (loading) return <div className="finish-loading">Loading...</div>;
  if (!order) return <div className="finish-loading">Order not found.</div>;

  const visaLabel = order.visaType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const isComplete = step === 'complete' || step === 'verify';

  // Routing for the conditional business step:
  // The 6-field "business meetings details" sub-form is shown ONLY for
  // BUSINESS_1Y visas with sub-purpose "Attend Technical/Business Meetings".
  // Other business sub-purposes (Recruit Manpower, Set Up Industrial/Business
  // Venture, etc.) have different gov-form fields and will get their own
  // dedicated steps as we map them.
  const businessPurpose = travelers[0]?.purposeOfVisit;
  const isBusinessMeetings = order.visaType === 'BUSINESS_1Y'
    && businessPurpose === 'Attend Technical/Business Meetings';
  const stepAfterEmployment: FinishStep = isBusinessMeetings ? 'business' : 'family';
  const stepBeforeFamily: FinishStep    = isBusinessMeetings ? 'business' : 'employment';
  const tripDone = isComplete || (step !== 'overview' && step !== 'trip');
  const tripActive = step === 'trip';
  const personalActive = step === 'personal';
  const addressActive = step === 'address';
  const employmentActive = step === 'employment';
  const familyActive = step === 'family';
  const photoGuideActive = step === 'photo-guide';
  const photoUploadActive = step === 'photo-upload';
  const passportBioGuideActive = step === 'passport-bio-guide';
  const passportBioUploadActive = step === 'passport-bio-upload';
  const additionalActive = step === 'additional';
  const inUploadSteps = photoGuideActive || photoUploadActive || passportBioGuideActive || passportBioUploadActive || additionalActive;
  const personalDone = isComplete || step === 'address' || step === 'employment' || step === 'family' || inUploadSteps;
  const addressDone = isComplete || step === 'employment' || step === 'family' || inUploadSteps;
  const employmentDone = isComplete || step === 'family' || inUploadSteps;
  const familyDone = isComplete || inUploadSteps;
  const photoDone = isComplete || passportBioGuideActive || passportBioUploadActive || additionalActive;
  const passportBioDone = isComplete || additionalActive;
  const uploadsDone = isComplete;

  /* ── Sidebar ── */
  const sidebar = (
    <aside className="finish-sidebar">
      <div className="finish-sidebar-title">{order.destination} {visaLabel} eVisa Application</div>

      {/* Step 1: Trip details */}
      <div className="finish-step">
        <div className="finish-step-header">
          <span className={`finish-step-number${tripDone ? ' done' : tripActive ? ' active' : ''}`}>
            {tripDone ? <CheckIcon/> : '1'}
          </span>
          <span className="finish-step-label">Trip details</span>
        </div>
        <div className="finish-step-items">
          <div className={`finish-step-sub${tripDone ? ' done-text' : ''}`}>General details</div>
          <div className={`finish-step-sub${step === 'trip' ? ' current-text' : tripDone ? ' done-text' : ''}`}>
            {step === 'trip' && <span className="finish-step-bullet"/>}
            Trip details
          </div>
        </div>
      </div>

      {/* Step 2: Per traveler */}
      {travelers.map((t, i) => (
        <div className="finish-step" key={i}>
          <div className="finish-step-header">
            <span className={`finish-step-number${familyDone ? ' done' : (personalActive || addressActive || employmentActive || familyActive) ? ' active' : ''}`}>
              {familyDone ? <CheckIcon/> : String(i + 2)}
            </span>
            <span className="finish-step-label">{t.firstName} {t.lastName}</span>
          </div>
          <div className="finish-step-items">
            <div className={`finish-step-sub${personalActive ? ' current-text' : personalDone ? ' done-text' : ''}`}>
              {personalActive && <span className="finish-step-bullet"/>}
              Personal details
            </div>
            <div className={`finish-step-sub${addressActive ? ' current-text' : addressDone ? ' done-text' : ''}`}>
              {addressActive && <span className="finish-step-bullet"/>}
              Home address details
            </div>
            <div className={`finish-step-sub${employmentActive ? ' current-text' : employmentDone ? ' done-text' : ''}`}>
              {employmentActive && <span className="finish-step-bullet"/>}
              Employment details
            </div>
            <div className={`finish-step-sub${familyActive ? ' current-text' : familyDone ? ' done-text' : ''}`}>
              {familyActive && <span className="finish-step-bullet"/>}
              Family details
            </div>
          </div>
        </div>
      ))}

      {/* Step 3: Upload Documents */}
      <div className="finish-step">
        <div className="finish-step-header">
          <span className={`finish-step-number${uploadsDone ? ' done' : inUploadSteps ? ' active' : ''}`}>{uploadsDone ? <CheckIcon/> : travelers.length + 2}</span>
          <span className="finish-step-label">Upload Documents</span>
        </div>
        <div className="finish-step-items">
          {travelers.map((t, i) => (
            <div key={i}>
              <div className="finish-step-group">{t.firstName} {t.lastName}</div>
              <div className={`finish-step-sub${(photoGuideActive || photoUploadActive) ? ' current-text' : photoDone ? ' done-text' : ''}`}>
                {(photoGuideActive || photoUploadActive) && <span className="finish-step-bullet"/>}
                Traveler&apos;s Photo
              </div>
              <div className={`finish-step-sub${(passportBioGuideActive || passportBioUploadActive) ? ' current-text' : passportBioDone ? ' done-text' : ''}`}>
                {(passportBioGuideActive || passportBioUploadActive) && <span className="finish-step-bullet"/>}
                Passport Bio Page
              </div>
            </div>
          ))}
          <div className={`finish-step-sub${additionalActive ? ' current-text' : ''}`}>
            {additionalActive && <span className="finish-step-bullet"/>}
            Additional Details
          </div>
        </div>
      </div>
    </aside>
  );

  /* ── Overview (landing) ── */
  if (step === 'overview') {
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
                  <ul className="finish-checklist-bullets">
                    <li>Traveler&apos;s Photo</li>
                    <li>Passport Bio Page</li>
                  </ul>
                </div>
              </div>
            </div>

            <button className="finish-continue-btn" onClick={() => saveProgress('trip')}>Continue</button>
          </div>
        </main>
      </div>
    );
  }

  /* ── Trip details ── */
  if (step === 'trip') {
    const addCountry = () => setVisitedCountries([...visitedCountries, '']);
    const removeCountry = (idx: number) => setVisitedCountries(visitedCountries.filter((_, i) => i !== idx));
    const updateCountry = (idx: number, val: string) => {
      const copy = [...visitedCountries];
      copy[idx] = val;
      setVisitedCountries(copy);
    };

    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner">
            <h1 className="finish-heading">Trip</h1>

            <div className="finish-form-group">
              <label className="finish-form-label">Arrival date</label>
              <div className="finish-date-row">
                <select className="finish-form-select" value={arrMonth} onChange={e => setArrMonth(e.target.value)}>
                  <option value="">Month</option>
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className="finish-form-select" value={arrDay} onChange={e => setArrDay(e.target.value)}>
                  <option value="">Day</option>
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select className="finish-form-select" value={arrYear} onChange={e => setArrYear(e.target.value)}>
                  <option value="">Year</option>
                  {ARR_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="finish-form-group">
              <label className="finish-form-label">Port of arrival in {order.destination}</label>
              <CustomDropdown
                options={ALL_INDIA_PORTS}
                value={arrivalPoint}
                onChange={setArrivalPoint}
                placeholder="Select port of arrival"
              />
              <a href="#" className="finish-learn-more" onClick={e => e.preventDefault()}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M7 6V10M7 4.5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                Learn more
              </a>
            </div>

            <div className="finish-form-group">
              <h2 className="finish-form-heading">List the countries you have visited in the last 10 years</h2>
              <div className="finish-countries-card">
                {visitedCountries.map((c, i) => (
                  <div key={i} className="finish-country-row">
                    <div className="finish-country-field">
                      <label className="finish-form-label-sm">Country before {order.destination}</label>
                      <CustomDropdown
                        options={COUNTRIES}
                        value={c}
                        onChange={v => updateCountry(i, v)}
                        placeholder="Select country"
                      />
                    </div>
                    {visitedCountries.length > 1 && (
                      <button className="finish-country-remove" onClick={() => removeCountry(i)} title="Remove">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button className="finish-add-btn" onClick={addCountry}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2V12M2 7H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Add another
              </button>
            </div>

            <div className="finish-nav">
              <button className="finish-back-btn" onClick={() => setStep('overview')}>
                ← Back
              </button>
              {arrMonth && arrDay && arrYear && (() => {
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                const arrDate = new Date(parseInt(arrYear), months.indexOf(arrMonth), parseInt(arrDay));
                const today = new Date(); today.setHours(0,0,0,0);
                const minDate = new Date(today.getTime() + 4 * 24*60*60*1000);
                const maxDate = new Date(today.getTime() + 120 * 24*60*60*1000);
                if (arrDate < minDate) return <p className="finish-form-error">Arrival date must be at least 4 days from today</p>;
                if (arrDate > maxDate) return <p className="finish-form-error">Arrival date cannot be more than 120 days from today</p>;
                return null;
              })()}
              <button className={`finish-next-btn${arrMonth && arrDay && arrYear && arrivalPoint && (() => {
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                const arrDate = new Date(parseInt(arrYear), months.indexOf(arrMonth), parseInt(arrDay));
                const today = new Date(); today.setHours(0,0,0,0);
                const minDate = new Date(today.getTime() + 4 * 24*60*60*1000);
                const maxDate = new Date(today.getTime() + 120 * 24*60*60*1000);
                return arrDate >= minDate && arrDate <= maxDate;
              })() ? ' ready' : ''}`} disabled={!arrMonth || !arrDay || !arrYear || !arrivalPoint || (() => {
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                const arrDate = new Date(parseInt(arrYear), months.indexOf(arrMonth), parseInt(arrDay));
                const today = new Date(); today.setHours(0,0,0,0);
                const minDate = new Date(today.getTime() + 4 * 24*60*60*1000);
                const maxDate = new Date(today.getTime() + 120 * 24*60*60*1000);
                return arrDate < minDate || arrDate > maxDate;
              })()} onClick={() => saveProgress('personal')}>
                Next
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Personal Details Step ── */
  if (step === 'personal') {
    const cityBirthErr = cityOfBirth ? validateCityState(cityOfBirth, 'City of birth') : '';
    const phoneErr = phoneNumber ? validatePhone(phoneNumber) : '';
    const canProceedPersonal = parentsFromDest && gender && countryOfBirth && cityOfBirth && !cityBirthErr && religion && educationalQualification && nationalityByBirth && livedTwoYears && phoneNumber && !phoneErr && holdAnotherNat && maritalStatus && (holdAnotherNat === 'no' || otherNationality);

    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner">
            <CorrectionBanner />
            <h1 className="finish-heading">Personal Details</h1>

            {/* Parents/grandparents question */}
            <div className="finish-form-group">
              <label className="finish-form-label">
                Were your parents or grandparents born in Pakistan, or did they live there permanently?
              </label>
              <div className="finish-radio-row">
                <button type="button" className={`finish-radio-btn${parentsFromDest === 'yes' ? ' selected' : ''}`} onClick={() => setParentsFromDest('yes')}>
                  <span className={`finish-radio-circle${parentsFromDest === 'yes' ? ' active' : ''}`}/>
                  Yes
                </button>
                <button type="button" className={`finish-radio-btn${parentsFromDest === 'no' ? ' selected' : ''}`} onClick={() => setParentsFromDest('no')}>
                  <span className={`finish-radio-circle${parentsFromDest === 'no' ? ' active' : ''}`}/>
                  No
                </button>
              </div>
            </div>

            {/* Gender */}
            <div className={`finish-form-group${flagClass('gender')}`}>
              <label className="finish-form-label">Gender</label>
              <div className="finish-radio-stack">
                {['Male', 'Female', 'Transgender'].map(g => (
                  <button key={g} type="button" className={`finish-radio-btn-full${gender === g ? ' selected' : ''}`} onClick={() => { setGender(g); clearFlag('gender'); }}>
                    <span className={`finish-radio-circle${gender === g ? ' active' : ''}`}/>
                    {g}
                  </button>
                ))}
              </div>
              <FlagHint field="gender" />
            </div>

            {/* Country of birth */}
            <div className={`finish-form-group${flagClass('countryOfBirth')}`}>
              <label className="finish-form-label">Country of birth</label>
              <CustomDropdown
                options={COUNTRIES}
                value={countryOfBirth}
                onChange={setCountryOfBirth}
                placeholder="Select country"
              />
              <FlagHint field="countryOfBirth" />
            </div>

            {/* City / Place of birth */}
            <div className="finish-form-group">
              <label className="finish-form-label">City / Place of birth</label>
              <input className={`finish-form-input${cityBirthErr ? ' error' : ''}${flagClass('cityOfBirth')}`} value={cityOfBirth} onChange={e => { setCityOfBirth(stripDiacritics(e.target.value)); clearFlag('cityOfBirth'); }} placeholder="Enter city or town" />
              {cityBirthErr && <span className="finish-form-error">{cityBirthErr}</span>}
              <FlagHint field="cityOfBirth" />
            </div>

            {/* Citizenship / National ID */}
            <div className="finish-form-group">
              <label className="finish-form-label">Citizenship / National ID Number</label>
              <input className="finish-form-input" value={citizenshipId} onChange={e => setCitizenshipId(e.target.value)} placeholder="Enter ID number, or N/A if non-applicable" />
              <p className="finish-form-hint">Enter N/A if non-applicable.</p>
            </div>

            {/* Religion */}
            <div className="finish-form-group">
              <label className="finish-form-label">Religion</label>
              <CustomDropdown
                options={INDIA_RELIGIONS.map(r => r.label)}
                value={religion}
                onChange={setReligion}
                placeholder="Select religion"
              />
            </div>

            {/* Visible Qualification Marks */}
            <div className="finish-form-group">
              <label className="finish-form-label">Visible identification marks</label>
              <input className="finish-form-input" value={visibleMarks} onChange={e => setVisibleMarks(stripDiacritics(e.target.value))} placeholder="e.g. Mole on left cheek, scar on right arm" />
              <p className="finish-form-hint">Mole, scar, etc. Leave blank if there are none.</p>
            </div>

            {/* Educational Qualification */}
            <div className="finish-form-group">
              <label className="finish-form-label">Educational qualification</label>
              <CustomDropdown
                options={['Below Matriculation', 'Matriculation', 'Higher Secondary', 'Graduate', 'Post Graduate', 'Doctorate', 'Professional', 'NA Being Minor', 'Illiterate', 'Others']}
                value={educationalQualification}
                onChange={setEducationalQualification}
                placeholder="Select qualification"
              />
            </div>

            {/* Nationality by birth or naturalization */}
            <div className="finish-form-group">
              <label className="finish-form-label">Did you acquire nationality by birth or naturalization?</label>
              <div className="finish-radio-row">
                <button type="button" className={`finish-radio-btn${nationalityByBirth === 'birth' ? ' selected' : ''}`} onClick={() => setNationalityByBirth('birth')}>
                  <span className={`finish-radio-circle${nationalityByBirth === 'birth' ? ' active' : ''}`}/>
                  By birth
                </button>
                <button type="button" className={`finish-radio-btn${nationalityByBirth === 'naturalization' ? ' selected' : ''}`} onClick={() => setNationalityByBirth('naturalization')}>
                  <span className={`finish-radio-circle${nationalityByBirth === 'naturalization' ? ' active' : ''}`}/>
                  By naturalization
                </button>
              </div>
            </div>

            {/* Lived two years */}
            <div className="finish-form-group">
              <label className="finish-form-label">Have you lived for at least two years in the country where you are applying for visa from?</label>
              <div className="finish-radio-row">
                <button type="button" className={`finish-radio-btn${livedTwoYears === 'yes' ? ' selected' : ''}`} onClick={() => setLivedTwoYears('yes')}>
                  <span className={`finish-radio-circle${livedTwoYears === 'yes' ? ' active' : ''}`}/>
                  Yes
                </button>
                <button type="button" className={`finish-radio-btn${livedTwoYears === 'no' ? ' selected' : ''}`} onClick={() => setLivedTwoYears('no')}>
                  <span className={`finish-radio-circle${livedTwoYears === 'no' ? ' active' : ''}`}/>
                  No
                </button>
              </div>
            </div>

            {/* Phone number */}
            <div className="finish-form-group">
              <label className="finish-form-label">Phone number</label>
              <input className={`finish-form-input${phoneErr ? ' error' : ''}${flagClass('phoneNumber')}`} type="tel" maxLength={15} value={phoneNumber} onChange={e => { setPhoneNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 15)); clearFlag('phoneNumber'); }} placeholder="12345678900" />
              {phoneErr && <span className="finish-form-error">{phoneErr}</span>}
              <FlagHint field="phoneNumber" />
            </div>

            {/* Another nationality */}
            <div className="finish-form-group">
              <label className="finish-form-label">Do you hold another nationality?</label>
              <div className="finish-radio-row">
                <button type="button" className={`finish-radio-btn${holdAnotherNat === 'yes' ? ' selected' : ''}`} onClick={() => setHoldAnotherNat('yes')}>
                  <span className={`finish-radio-circle${holdAnotherNat === 'yes' ? ' active' : ''}`}/>
                  Yes
                </button>
                <button type="button" className={`finish-radio-btn${holdAnotherNat === 'no' ? ' selected' : ''}`} onClick={() => setHoldAnotherNat('no')}>
                  <span className={`finish-radio-circle${holdAnotherNat === 'no' ? ' active' : ''}`}/>
                  No
                </button>
              </div>
              {holdAnotherNat === 'yes' && (
                <div style={{ marginTop: '0.75rem' }}>
                  <CustomDropdown
                    options={COUNTRIES}
                    value={otherNationality}
                    onChange={setOtherNationality}
                    placeholder="Select nationality"
                  />
                </div>
              )}
            </div>

            {/* Marital status */}
            <div className="finish-form-group">
              <label className="finish-form-label">Marital status</label>
              <div className="finish-radio-stack">
                {['Married', 'Single', 'Divorced', 'Widowed'].map(s => (
                  <button key={s} type="button" className={`finish-radio-btn-full${maritalStatus === s ? ' selected' : ''}`} onClick={() => setMaritalStatus(s)}>
                    <span className={`finish-radio-circle${maritalStatus === s ? ' active' : ''}`}/>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="finish-nav">
              <button className="finish-back-btn" onClick={() => setStep('trip')}>
                ← Back
              </button>
              <button className={`finish-next-btn${canProceedPersonal ? ' ready' : ''}`} disabled={!canProceedPersonal} onClick={() => saveProgress('address')}>
                Next
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Home Address Step ── */
  if (step === 'address') {
    const addrErr = homeAddress ? validateAddress(homeAddress, 'Home address') : '';
    const cityErr = homeCity ? validateCityState(homeCity, 'City') : '';
    const stateErr = homeState ? validateCityState(homeState, 'State') : '';
    const zipErr = homeZip ? validateZip(homeZip) : '';
    const canProceed = residenceCountry && homeAddress && !addrErr && homeCity && !cityErr && homeState && !stateErr && homeZip && !zipErr;

    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner">
            <h1 className="finish-heading">{travelers[0]?.firstName} {travelers[0]?.lastName}</h1>
            <CorrectionBanner />
            <p className="finish-subheading">— Home address</p>

            {addressError && (
              <div className="finish-error-banner">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#dc2626"/><path d="M8 5V9M8 11V11.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                Please fix the fields highlighted in red
              </div>
            )}

            {/* Country of residence */}
            <div className="finish-form-group">
              <label className="finish-form-label">Country of residence</label>
              <CustomDropdown
                options={COUNTRIES}
                value={residenceCountry}
                onChange={setResidenceCountry}
                placeholder="Select country"
              />
              <span className="finish-form-hint">The country where you live permanently.</span>
            </div>

            {/* Home address */}
            <div className="finish-form-group">
              <label className="finish-form-label">Home address</label>
              <input
                className={`finish-form-input${addrErr ? ' error' : ''}`}
                type="text"
                value={homeAddress}
                onChange={e => { setHomeAddress(stripDiacritics(e.target.value)); clearFlag('address'); }}
                placeholder="Enter your home address"
              />
              {addrErr ? <span className="finish-form-error">{addrErr}</span> : <span className="finish-form-hint">The address must be in the country where you live.</span>}
              <FlagHint field="address" />
            </div>

            {/* City or town */}
            <div className="finish-form-group">
              <label className="finish-form-label">City or town</label>
              <input
                className={`finish-form-input${cityErr ? ' error' : ''}`}
                type="text"
                value={homeCity}
                onChange={e => setHomeCity(stripDiacritics(e.target.value))}
                placeholder="Enter city or town"
              />
              {cityErr && <span className="finish-form-error">{cityErr}</span>}
            </div>

            {/* State or province */}
            <div className="finish-form-group">
              <label className="finish-form-label">State or province</label>
              <input
                className={`finish-form-input${stateErr ? ' error' : ''}`}
                type="text"
                value={homeState}
                onChange={e => setHomeState(stripDiacritics(e.target.value))}
                placeholder="Enter state or province"
              />
              {stateErr && <span className="finish-form-error">{stateErr}</span>}
            </div>

            {/* ZIP or postcode */}
            <div className="finish-form-group">
              <label className="finish-form-label">ZIP or postcode</label>
              <input
                className={`finish-form-input${zipErr ? ' error' : ''}`}
                type="text"
                value={homeZip}
                onChange={e => setHomeZip(e.target.value)}
                placeholder="Enter ZIP or postcode"
              />
              {zipErr && <span className="finish-form-error">{zipErr}</span>}
            </div>

            <div className="finish-nav">
              <button className="finish-back-btn" onClick={() => setStep('personal')}>
                ← Back
              </button>
              <button className={`finish-next-btn${canProceed ? ' ready' : ''}`} disabled={!canProceed} onClick={() => saveProgress('employment')}>
                Next
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Employment Step ── */
  if (step === 'employment') {
    const needsEmployerFields = employmentStatus === 'Employed' || (employmentStatus === 'Student' && !!studentProvider);
    const empNameErr = employerName ? validateName(employerName, 'Employer name') : '';
    const empAddrErr = employerAddress ? validateAddress(employerAddress, 'Employer address') : '';
    const empCityErr = employerCity ? validateCityState(employerCity, 'City') : '';
    const empStateErr = employerState ? validateCityState(employerState, 'State') : '';
    const empZipErr = employerZip ? validateZip(employerZip) : '';
    const employerFieldsFilled = !needsEmployerFields || (employerName && !empNameErr && employerAddress && !empAddrErr && employerCity && !empCityErr && employerState && !empStateErr && employerCountry && employerZip && !empZipErr);
    const studentReady = employmentStatus !== 'Student' || !!studentProvider;
    const canProceedEmp = employmentStatus && servedMilitary && employerFieldsFilled && studentReady;

    const employerLabel = employmentStatus === 'Student'
      ? (studentProvider === 'father' ? "Father's employer name" : "Spouse's employer name")
      : "Employer\u2019s name";

    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner">
            <h1 className="finish-heading">{travelers[0]?.firstName} {travelers[0]?.lastName}</h1>
            <CorrectionBanner />
            <p className="finish-subheading">— Employment</p>

            {/* Employment status */}
            <div className="finish-form-group">
              <label className="finish-form-label">Employment status</label>
              <div className="finish-radio-stack">
                {['Employed', 'Unemployed', 'Student', 'Retired'].map(s => (
                  <button key={s} type="button" className={`finish-radio-btn-full${employmentStatus === s ? ' selected' : ''}`} onClick={() => { setEmploymentStatus(s); if (s !== 'Student') setStudentProvider(''); }}>
                    <span className={`finish-radio-circle${employmentStatus === s ? ' active' : ''}`}/>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Student — which statement applies */}
            {employmentStatus === 'Student' && (
              <div className="finish-form-group">
                <label className="finish-form-label">Which statement applies to you?</label>
                <div className="finish-radio-stack">
                  <button type="button" className={`finish-radio-btn-full${studentProvider === 'father' ? ' selected' : ''}`} onClick={() => setStudentProvider('father')}>
                    <span className={`finish-radio-circle${studentProvider === 'father' ? ' active' : ''}`}/>
                    I can provide my father&apos;s employment details.
                  </button>
                  <button type="button" className={`finish-radio-btn-full${studentProvider === 'spouse' ? ' selected' : ''}`} onClick={() => setStudentProvider('spouse')}>
                    <span className={`finish-radio-circle${studentProvider === 'spouse' ? ' active' : ''}`}/>
                    I can provide my spouse&apos;s employment details.
                  </button>
                </div>
              </div>
            )}

            {/* Employer fields — shown for Employed OR Student with provider selected */}
            {needsEmployerFields && (
              <>
                <div className="finish-form-group">
                  <label className="finish-form-label">{employerLabel}</label>
                  <input className={`finish-form-input${empNameErr ? ' error' : ''}`} type="text" value={employerName} onChange={e => setEmployerName(stripNameInput(e.target.value))} placeholder="" />
                  {empNameErr ? <span className="finish-form-error">{empNameErr}</span> : <span className="finish-form-hint">Use letters A to Z only. No special characters.</span>}
                </div>

                <div className="finish-form-group">
                  <label className="finish-form-label">Employer address</label>
                  <input className={`finish-form-input${empAddrErr ? ' error' : ''}`} type="text" value={employerAddress} onChange={e => setEmployerAddress(stripDiacritics(e.target.value))} placeholder="1234 Sesame St. Ste. 100, Springtown, IL 55555" />
                  {empAddrErr && <span className="finish-form-error">{empAddrErr}</span>}
                </div>

                <div className="finish-form-group">
                  <label className="finish-form-label">City or town</label>
                  <input className={`finish-form-input${empCityErr ? ' error' : ''}`} type="text" value={employerCity} onChange={e => setEmployerCity(stripDiacritics(e.target.value))} placeholder="" />
                  {empCityErr && <span className="finish-form-error">{empCityErr}</span>}
                </div>

                <div className="finish-form-group">
                  <label className="finish-form-label">State or province</label>
                  <input className={`finish-form-input${empStateErr ? ' error' : ''}`} type="text" value={employerState} onChange={e => setEmployerState(stripDiacritics(e.target.value))} placeholder="" />
                  {empStateErr && <span className="finish-form-error">{empStateErr}</span>}
                </div>

                <div className="finish-form-group">
                  <label className="finish-form-label">Country</label>
                  <CustomDropdown
                    options={COUNTRIES}
                    value={employerCountry}
                    onChange={setEmployerCountry}
                    placeholder="Select country"
                  />
                </div>

                <div className="finish-form-group">
                  <label className="finish-form-label">ZIP or postcode</label>
                  <input className={`finish-form-input${empZipErr ? ' error' : ''}`} type="text" value={employerZip} onChange={e => setEmployerZip(e.target.value)} placeholder="" />
                  {empZipErr && <span className="finish-form-error">{empZipErr}</span>}
                </div>
              </>
            )}

            {/* Military/police */}
            <div className="finish-form-group">
              <label className="finish-form-label">Have you served in the military or police?</label>
              <div className="finish-radio-row">
                <button type="button" className={`finish-radio-btn${servedMilitary === 'yes' ? ' selected' : ''}`} onClick={() => setServedMilitary('yes')}>
                  <span className={`finish-radio-circle${servedMilitary === 'yes' ? ' active' : ''}`}/>
                  Yes
                </button>
                <button type="button" className={`finish-radio-btn${servedMilitary === 'no' ? ' selected' : ''}`} onClick={() => setServedMilitary('no')}>
                  <span className={`finish-radio-circle${servedMilitary === 'no' ? ' active' : ''}`}/>
                  No
                </button>
              </div>
            </div>

            <div className="finish-nav">
              <button className="finish-back-btn" onClick={() => setStep('address')}>
                ← Back
              </button>
              <button className={`finish-next-btn${canProceedEmp ? ' ready' : ''}`} disabled={!canProceedEmp} onClick={() => saveProgress(stepAfterEmployment)}>
                Next
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Business Visa Step (only when visa is BUSINESS_1Y) ─────────────────
   * Inserted between Employment and Family. The gov form's Step 4 surfaces
   * these fields when the visa purpose is "e-Business — Meetings". All are
   * required at gov-form submit time. We keep address and phone as separate
   * fields here for cleaner UX; the bot recombines them into a single
   * "Address & Phone" string when filling the gov form (which uses one cell). */
  if (step === 'business') {
    const allBizFilled =
      applicantCompanyName.trim() && applicantCompanyAddress.trim() && applicantCompanyPhone.trim() && applicantCompanyWebsite.trim() &&
      indianFirmName.trim() && indianFirmAddress.trim() && indianFirmPhone.trim() && indianFirmWebsite.trim();
    const canProceedBiz = !!allBizFilled;

    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner">
            <h1 className="finish-heading">{travelers[0]?.firstName} {travelers[0]?.lastName}</h1>
            <CorrectionBanner />
            <p className="finish-subheading">— Business Visa Details</p>
            <p className="finish-form-hint" style={{ marginBottom: '1.5rem' }}>
              Required for business visa applicants. Both your company and the Indian firm you&apos;re visiting must be filled in — the Indian government rejects business visa submissions with empty company details.
            </p>

            {/* Applicant's Company */}
            <h3 className="finish-form-label" style={{ fontSize: '0.95rem', marginTop: '0.5rem', marginBottom: '0.5rem' }}>Your Company (Applicant&apos;s Company)</h3>
            <div className="finish-form-group">
              <label className="finish-form-label">Name</label>
              <input className="finish-form-input" value={applicantCompanyName} onChange={e => setApplicantCompanyName(stripDiacritics(e.target.value))} placeholder="e.g. Acme Industries Inc." />
            </div>
            <div className="finish-form-group">
              <label className="finish-form-label">Address</label>
              <input className="finish-form-input" value={applicantCompanyAddress} onChange={e => setApplicantCompanyAddress(stripDiacritics(e.target.value))} placeholder="123 Main St, Springfield, IL 12345" />
            </div>
            <div className="finish-form-group">
              <label className="finish-form-label">Phone number</label>
              <input className="finish-form-input" value={applicantCompanyPhone} onChange={e => setApplicantCompanyPhone(stripDiacritics(e.target.value))} placeholder="+1 555 555 5555" />
            </div>
            <div className="finish-form-group">
              <label className="finish-form-label">Website</label>
              <input className="finish-form-input" value={applicantCompanyWebsite} onChange={e => setApplicantCompanyWebsite(stripDiacritics(e.target.value))} placeholder="https://acme.example.com" />
            </div>

            {/* Indian Firm */}
            <h3 className="finish-form-label" style={{ fontSize: '0.95rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Indian Firm You&apos;re Visiting</h3>
            <div className="finish-form-group">
              <label className="finish-form-label">Name</label>
              <input className="finish-form-input" value={indianFirmName} onChange={e => setIndianFirmName(stripDiacritics(e.target.value))} placeholder="e.g. Tata Consultancy Services" />
            </div>
            <div className="finish-form-group">
              <label className="finish-form-label">Address</label>
              <input className="finish-form-input" value={indianFirmAddress} onChange={e => setIndianFirmAddress(stripDiacritics(e.target.value))} placeholder="9 Nirmal Bldg, Mumbai 400021" />
            </div>
            <div className="finish-form-group">
              <label className="finish-form-label">Phone number</label>
              <input className="finish-form-input" value={indianFirmPhone} onChange={e => setIndianFirmPhone(stripDiacritics(e.target.value))} placeholder="+91 22 1234 5678" />
            </div>
            <div className="finish-form-group">
              <label className="finish-form-label">Website</label>
              <input className="finish-form-input" value={indianFirmWebsite} onChange={e => setIndianFirmWebsite(stripDiacritics(e.target.value))} placeholder="https://example.in" />
            </div>

            <div className="finish-nav">
              <button className="finish-back-btn" onClick={() => setStep('employment')}>
                ← Back
              </button>
              <button className={`finish-next-btn${canProceedBiz ? ' ready' : ''}`} disabled={!canProceedBiz} onClick={() => saveProgress('family')}>
                Next
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Family Step ── */
  if (step === 'family') {
    const isMarried = maritalStatus === 'Married';
    const fatherNameErr = fatherName ? validateName(fatherName, "Father's name") : '';
    const motherNameErr = motherName ? validateName(motherName, "Mother's name") : '';
    const spouseNameErr = spouseName ? validateName(spouseName, "Spouse's name") : '';
    const fatherFilled = fatherName && !fatherNameErr && fatherNationality && fatherPlaceOfBirth && fatherCountryOfBirth;
    const motherFilled = motherName && !motherNameErr && motherNationality && motherPlaceOfBirth && motherCountryOfBirth;
    const parentNamesFilled = knowParents === 'none' ||
      (knowParents === 'both' && fatherFilled && motherFilled) ||
      (knowParents === 'father' && fatherFilled) ||
      (knowParents === 'mother' && motherFilled);
    const spouseFieldsFilled = !isMarried || (spouseName && !spouseNameErr && spouseNationality && spousePlaceOfBirth && spouseCountryOfBirth);
    const canProceedFamily = knowParents && parentNamesFilled && spouseFieldsFilled;

    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner">
            <h1 className="finish-heading">{travelers[0]?.firstName} {travelers[0]?.lastName}</h1>
            <CorrectionBanner />
            <p className="finish-subheading">— Family</p>

            {/* Parents' names */}
            <div className="finish-form-group">
              <label className="finish-form-label">Do you know your parents&apos; names?</label>
              <div className="finish-radio-stack">
                {[
                  { id: 'both', label: 'Yes, both parents' },
                  { id: 'mother', label: 'Only my mother' },
                  { id: 'father', label: 'Only my father' },
                  { id: 'none', label: "No, I don't know their names" },
                ].map(opt => (
                  <button key={opt.id} type="button" className={`finish-radio-btn-full${knowParents === opt.id ? ' selected' : ''}`} onClick={() => setKnowParents(opt.id)}>
                    <span className={`finish-radio-circle${knowParents === opt.id ? ' active' : ''}`}/>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Father's details */}
            {(knowParents === 'both' || knowParents === 'father') && (
              <>
                <div className="finish-form-group">
                  <label className="finish-form-label">Father&apos;s first and last name</label>
                  <input className={`finish-form-input${fatherNameErr ? ' error' : ''}`} type="text" value={fatherName} onChange={e => { setFatherName(stripNameInput(e.target.value)); clearFlag('fatherName'); }} placeholder="" />
                  {fatherNameErr && <span className="finish-form-error">{fatherNameErr}</span>}
                  <FlagHint field="fatherName" />
                </div>
                <div className="finish-form-group">
                  <label className="finish-form-label">Father&apos;s nationality</label>
                  <CustomDropdown options={COUNTRIES} value={fatherNationality} onChange={setFatherNationality} placeholder="Select country" />
                </div>
                <div className="finish-form-group">
                  <label className="finish-form-label">Father&apos;s place of birth</label>
                  <input className="finish-form-input" value={fatherPlaceOfBirth} onChange={e => setFatherPlaceOfBirth(stripDiacritics(e.target.value))} placeholder="Enter city or town" />
                </div>
                <div className="finish-form-group">
                  <label className="finish-form-label">Father&apos;s country of birth</label>
                  <CustomDropdown options={COUNTRIES} value={fatherCountryOfBirth} onChange={setFatherCountryOfBirth} placeholder="Select country" />
                </div>
              </>
            )}

            {/* Mother's details */}
            {(knowParents === 'both' || knowParents === 'mother') && (
              <>
                <div className="finish-form-group">
                  <label className="finish-form-label">Mother&apos;s first and last name</label>
                  <input className={`finish-form-input${motherNameErr ? ' error' : ''}`} type="text" value={motherName} onChange={e => { setMotherName(stripNameInput(e.target.value)); clearFlag('motherName'); }} placeholder="" />
                  {motherNameErr && <span className="finish-form-error">{motherNameErr}</span>}
                  <FlagHint field="motherName" />
                </div>
                <div className="finish-form-group">
                  <label className="finish-form-label">Mother&apos;s nationality</label>
                  <CustomDropdown options={COUNTRIES} value={motherNationality} onChange={setMotherNationality} placeholder="Select country" />
                </div>
                <div className="finish-form-group">
                  <label className="finish-form-label">Mother&apos;s place of birth</label>
                  <input className="finish-form-input" value={motherPlaceOfBirth} onChange={e => setMotherPlaceOfBirth(stripDiacritics(e.target.value))} placeholder="Enter city or town" />
                </div>
                <div className="finish-form-group">
                  <label className="finish-form-label">Mother&apos;s country of birth</label>
                  <CustomDropdown options={COUNTRIES} value={motherCountryOfBirth} onChange={setMotherCountryOfBirth} placeholder="Select country" />
                </div>
              </>
            )}

            {/* Spouse info — only if married */}
            {isMarried && (
              <>
                <div className="finish-form-group">
                  <label className="finish-form-label">Spouse&apos;s first and last name</label>
                  <input className={`finish-form-input${spouseNameErr ? ' error' : ''}`} type="text" value={spouseName} onChange={e => { setSpouseName(stripNameInput(e.target.value)); clearFlag('spouseName'); }} placeholder="" />
                  {spouseNameErr && <span className="finish-form-error">{spouseNameErr}</span>}
                  <FlagHint field="spouseName" />
                </div>

                <div className="finish-form-group">
                  <label className="finish-form-label">Spouse&apos;s nationality</label>
                  <CustomDropdown
                    options={COUNTRIES}
                    value={spouseNationality}
                    onChange={setSpouseNationality}
                    placeholder="Select country"
                  />
                </div>

                <div className="finish-form-group">
                  <label className="finish-form-label">Spouse&apos;s place of birth</label>
                  <input className="finish-form-input" value={spousePlaceOfBirth} onChange={e => setSpousePlaceOfBirth(stripDiacritics(e.target.value))} placeholder="Enter city or town" />
                </div>
                <div className="finish-form-group">
                  <label className="finish-form-label">Spouse&apos;s country of birth</label>
                  <CustomDropdown
                    options={COUNTRIES}
                    value={spouseCountryOfBirth}
                    onChange={setSpouseCountryOfBirth}
                    placeholder="Select country"
                  />
                </div>
              </>
            )}

            <div className="finish-nav">
              <button className="finish-back-btn" onClick={() => setStep(stepBeforeFamily)}>
                ← Back
              </button>
              <button className={`finish-next-btn${canProceedFamily ? ' ready' : ''}`} disabled={!canProceedFamily} onClick={() => saveProgress('photo-guide')}>
                Next
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Photo Guide Step ── */
  if (step === 'photo-guide') {
    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner">
            <h1 className="finish-heading">{travelers[0]?.firstName} {travelers[0]?.lastName}</h1>
            <p className="finish-subheading">— Traveler&apos;s Photo</p>

            <div className="photo-guide-layout">
              <div className="photo-guide-text">
                <p className="photo-guide-intro"><strong>We need a clear, front-facing photo.</strong> Passport photos can&apos;t be used.</p>

                <div className="photo-guide-rules">
                  <div className="photo-guide-rule">
                    <span className="photo-guide-num">1</span>
                    <span>Keep a neutral expression, don&apos;t smile</span>
                  </div>
                  <div className="photo-guide-rule">
                    <span className="photo-guide-num">2</span>
                    <span>Remove glasses, hats, and scarves</span>
                  </div>
                  <div className="photo-guide-rule">
                    <span className="photo-guide-num">3</span>
                    <span>Tuck hair behind ears</span>
                  </div>
                </div>
              </div>

              <div className="photo-guide-examples">
                <div className="photo-example good">
                  <div className="photo-example-placeholder">
                    <span className="photo-example-icon">👤</span>
                  </div>
                  <span className="photo-example-badge good">✓</span>
                </div>
                <div className="photo-example bad">
                  <div className="photo-example-placeholder">
                    <span className="photo-example-icon">🕶️</span>
                  </div>
                  <span className="photo-example-badge bad">✗</span>
                </div>
                <div className="photo-example bad">
                  <div className="photo-example-placeholder">
                    <span className="photo-example-icon">🧢</span>
                  </div>
                  <span className="photo-example-badge bad">✗</span>
                </div>
                <div className="photo-example bad">
                  <div className="photo-example-placeholder">
                    <span className="photo-example-icon">😄</span>
                  </div>
                  <span className="photo-example-badge bad">✗</span>
                </div>
              </div>
            </div>

            <div className="finish-nav">
              <button className="finish-back-btn" onClick={() => setStep('family')}>
                ← Back
              </button>
              <button className="finish-next-btn ready" onClick={() => saveProgress('photo-upload')}>
                Continue
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Photo Upload Step ── */
  if (step === 'photo-upload') {
    const handlePhotoDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        setTravelerPhoto(file);
        setTravelerPhotoPreview(URL.createObjectURL(file));
      }
    };

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.type.startsWith('image/')) {
        setTravelerPhoto(file);
        setTravelerPhotoPreview(URL.createObjectURL(file));
      }
    };

    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner">
            <h1 className="finish-heading">{travelers[0]?.firstName} {travelers[0]?.lastName}</h1>
            <p className="finish-subheading">— Upload Photo</p>

            {!travelerPhotoPreview ? (
              <div
                className="photo-upload-zone"
                onDragOver={e => e.preventDefault()}
                onDrop={handlePhotoDrop}
                onClick={() => document.getElementById('photo-input')?.click()}
              >
                <div className="photo-upload-icon">📷</div>
                <p className="photo-upload-text">Drag and drop your photo here</p>
                <p className="photo-upload-subtext">or click to browse files</p>
                <p className="photo-upload-formats">JPG, PNG — Max 5MB</p>
                <input id="photo-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoSelect} />
              </div>
            ) : (
              <div className="photo-preview-wrap">
                <img src={travelerPhotoPreview} alt="Traveler photo" className="photo-preview-img" />
                <button className="photo-preview-remove" onClick={() => { setTravelerPhoto(null); setTravelerPhotoPreview(null); }}>
                  Remove and re-upload
                </button>
              </div>
            )}

            <div className="finish-nav">
              <button className="finish-back-btn" onClick={() => setStep('photo-guide')}>
                ← Back
              </button>
              <button className={`finish-next-btn${travelerPhoto ? ' ready' : ''}`} disabled={!travelerPhoto} onClick={async () => {
                if (travelerPhoto && !photoUrl) {
                  const url = await uploadFile(travelerPhoto, 'photo');
                  if (url) setPhotoUrl(url);
                }
                saveProgress('passport-bio-guide');
              }}>
                Next
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Passport Bio Guide Step ── */
  if (step === 'passport-bio-guide') {
    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner">
            <h1 className="finish-heading">{travelers[0]?.firstName} {travelers[0]?.lastName}</h1>
            <p className="finish-subheading">— Passport Bio Page</p>

            <div className="photo-guide-text" style={{ marginTop: '1rem' }}>
              <p className="photo-guide-intro"><strong>We need a clear scan of your passport data page.</strong> This is the page with your photo, name, and passport number.</p>

              <div className="photo-guide-rules">
                <div className="photo-guide-rule">
                  <span className="photo-guide-num">1</span>
                  <span>Make sure all text is clearly readable</span>
                </div>
                <div className="photo-guide-rule">
                  <span className="photo-guide-num">2</span>
                  <span>Include the full page — all four corners must be visible</span>
                </div>
                <div className="photo-guide-rule">
                  <span className="photo-guide-num">3</span>
                  <span>Avoid glare, shadows, and blurry images</span>
                </div>
                <div className="photo-guide-rule">
                  <span className="photo-guide-num">4</span>
                  <span>Do not crop or edit the image</span>
                </div>
              </div>
            </div>

            <div className="finish-nav">
              <button className="finish-back-btn" onClick={() => setStep('photo-upload')}>
                ← Back
              </button>
              <button className="finish-next-btn ready" onClick={() => setStep('passport-bio-upload')}>
                Continue
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Passport Bio Upload Step ── */
  if (step === 'passport-bio-upload') {
    const handleBioDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
        setPassportBio(file);
        if (file.type.startsWith('image/')) setPassportBioPreview(URL.createObjectURL(file));
        else setPassportBioPreview('pdf');
      }
    };

    const handleBioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
        setPassportBio(file);
        if (file.type.startsWith('image/')) setPassportBioPreview(URL.createObjectURL(file));
        else setPassportBioPreview('pdf');
      }
    };

    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner">
            <h1 className="finish-heading">{travelers[0]?.firstName} {travelers[0]?.lastName}</h1>
            <p className="finish-subheading">— Upload Passport Bio Page</p>

            {!passportBioPreview ? (
              <div
                className="photo-upload-zone"
                onDragOver={e => e.preventDefault()}
                onDrop={handleBioDrop}
                onClick={() => document.getElementById('bio-input')?.click()}
              >
                <div className="photo-upload-icon">📄</div>
                <p className="photo-upload-text">Drag and drop your passport scan here</p>
                <p className="photo-upload-subtext">or click to browse files</p>
                <p className="photo-upload-formats">JPG, PNG, PDF — Max 5MB</p>
                <input id="bio-input" type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleBioSelect} />
              </div>
            ) : (
              <div className="photo-preview-wrap">
                {passportBioPreview === 'pdf' ? (
                  <div style={{ background: '#f1f5f9', borderRadius: '1rem', padding: '2rem 3rem', textAlign: 'center' }}>
                    <span style={{ fontSize: '2rem' }}>📄</span>
                    <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>{passportBio?.name}</p>
                  </div>
                ) : (
                  <img src={passportBioPreview} alt="Passport bio page" className="photo-preview-img" style={{ maxWidth: '360px', maxHeight: '300px' }} />
                )}
                <button className="photo-preview-remove" onClick={() => { setPassportBio(null); setPassportBioPreview(null); }}>
                  Remove and re-upload
                </button>
              </div>
            )}

            <div className="finish-nav">
              <button className="finish-back-btn" onClick={() => setStep('passport-bio-guide')}>
                ← Back
              </button>
              <button className={`finish-next-btn${passportBio ? ' ready' : ''}`} disabled={!passportBio} onClick={async () => {
                if (passportBio && !passportBioUrl) {
                  const url = await uploadFile(passportBio, 'passport');
                  if (url) setPassportBioUrl(url);
                }
                saveProgress('additional');
              }}>
                Next
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Additional Details Step ── */
  if (step === 'additional') {
    // Gate: every required custom field (in a visible custom, non-builtin section) must have a non-empty value.
    const customOk = customSchema.sections
      .filter(sec => !sec.builtIn && !sec.hidden)
      .every(sec =>
        sec.fields.every(f => f.hidden || !f.required || isFilled(customValues[f.key]))
      );
    const canProceedAdditional = !!(hasOtherPassport &&
      placesToVisit && bookedHotel && exitPort && visitedIndiaBefore && visaRefusedBefore &&
      refNameIndia && refAddressIndia && refStateIndia && refPhoneIndia &&
      refNameHome && refAddressHome && refStateHome && refPhoneHome &&
      everArrested && everRefusedEntry && soughtAsylum && customOk);

    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner">
            <CorrectionBanner />
            <h1 className="finish-heading">Additional Details</h1>

            {/* Passport Details — including fields for "provide later" */}
            <h2 className="finish-section-title">Passport Details</h2>

            <div className="finish-form-group">
              <label className="finish-form-label">Passport number</label>
              <input className="finish-form-input" value={finishPassportNumber} onChange={e => setFinishPassportNumber(e.target.value)} placeholder="Enter passport number" />
            </div>

            <div className="finish-form-group">
              <label className="finish-form-label">Passport date of issue</label>
              <input className="finish-form-input" value={finishPassportIssued} onChange={e => setFinishPassportIssued(e.target.value)} placeholder="e.g. January 15, 2020" />
            </div>

            <div className="finish-form-group">
              <label className="finish-form-label">Passport date of expiry</label>
              <input className="finish-form-input" value={finishPassportExpiry} onChange={e => setFinishPassportExpiry(e.target.value)} placeholder="e.g. January 15, 2030" />
              {finishPassportExpiry && (() => {
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                const match = finishPassportExpiry.match(/^(\w+)\s+(\d+),\s+(\d+)$/);
                if (!match) return null;
                const expDate = new Date(parseInt(match[3]), months.indexOf(match[1]), parseInt(match[2]));
                let refDate = new Date(); refDate.setHours(0,0,0,0);
                if (arrMonth && arrDay && arrYear) {
                  refDate = new Date(parseInt(arrYear), months.indexOf(arrMonth), parseInt(arrDay));
                }
                const sixMonths = new Date(refDate); sixMonths.setMonth(sixMonths.getMonth() + 6);
                if (expDate < sixMonths) return <p className="ap-field-error">Passport must be valid for at least 6 months from your travel date. India will reject applications with insufficient passport validity.</p>;
                return null;
              })()}
            </div>

            <div className="finish-form-group">
              <label className="finish-form-label">Place of issue</label>
              <input className="finish-form-input" value={passportPlaceOfIssue} onChange={e => setPassportPlaceOfIssue(stripDiacritics(e.target.value))} placeholder="e.g. New York" />
            </div>
            <div className="finish-form-group">
              <label className="finish-form-label">Country of issue</label>
              <CustomDropdown options={COUNTRIES} value={passportCountryOfIssue} onChange={setPassportCountryOfIssue} placeholder="Select country" />
            </div>
            <div className="finish-form-group">
              <label className="finish-form-label">Do you hold any other valid passport/identity certificate?</label>
              <div className="finish-radio-row">
                <button type="button" className={`finish-radio-btn${hasOtherPassport === 'yes' ? ' selected' : ''}`} onClick={() => setHasOtherPassport('yes')}>
                  <span className={`finish-radio-circle${hasOtherPassport === 'yes' ? ' active' : ''}`}/>Yes
                </button>
                <button type="button" className={`finish-radio-btn${hasOtherPassport === 'no' ? ' selected' : ''}`} onClick={() => setHasOtherPassport('no')}>
                  <span className={`finish-radio-circle${hasOtherPassport === 'no' ? ' active' : ''}`}/>No
                </button>
              </div>
              {hasOtherPassport === 'yes' && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="finish-form-group" style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Passport/IC Number</label>
                    <input className="finish-form-input" value={otherPassportNumber} onChange={e => setOtherPassportNumber(e.target.value)} placeholder="Enter number" />
                  </div>
                  <div className="finish-form-group" style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Date of issue</label>
                    <input className="finish-form-input" value={otherPassportDateOfIssue} onChange={e => setOtherPassportDateOfIssue(e.target.value)} placeholder="e.g. January 15, 2020" />
                  </div>
                  <div className="finish-form-group" style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Place of issue</label>
                    <input className="finish-form-input" value={otherPassportPlaceOfIssue} onChange={e => setOtherPassportPlaceOfIssue(stripDiacritics(e.target.value))} placeholder="Enter place" />
                  </div>
                </div>
              )}
            </div>

            {/* Travel / Accommodation */}
            <h2 className="finish-section-title" style={{ marginTop: '2rem' }}>Travel &amp; Accommodation</h2>

            <div className={`finish-form-group${flagClass('placesToVisit')}`}>
              <label className="finish-form-label">Places you will visit</label>
              <input className={`finish-form-input${flagClass('placesToVisit')}`} value={placesToVisit} onChange={e => { setPlacesToVisit(stripDiacritics(e.target.value)); clearFlag('placesToVisit'); }} placeholder="e.g. Delhi, Mumbai, Agra" />
              <FlagHint field="placesToVisit" />
            </div>
            <div className={`finish-form-group${flagClass('bookedHotel')}`}>
              <label className="finish-form-label">Have you booked any room in a hotel/resort?</label>
              <div className="finish-radio-row">
                <button type="button" className={`finish-radio-btn${bookedHotel === 'yes' ? ' selected' : ''}`} onClick={() => { setBookedHotel('yes'); clearFlag('bookedHotel'); }}>
                  <span className={`finish-radio-circle${bookedHotel === 'yes' ? ' active' : ''}`}/>Yes
                </button>
                <button type="button" className={`finish-radio-btn${bookedHotel === 'no' ? ' selected' : ''}`} onClick={() => { setBookedHotel('no'); clearFlag('bookedHotel'); }}>
                  <span className={`finish-radio-circle${bookedHotel === 'no' ? ' active' : ''}`}/>No
                </button>
              </div>
              {bookedHotel === 'yes' && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="finish-form-group" style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Name of Hotel/Resort</label>
                    <input className="finish-form-input" value={hotelName} onChange={e => setHotelName(stripDiacritics(e.target.value))} placeholder="Enter hotel name" />
                  </div>
                  <div className="finish-form-group" style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Place of Hotel/Resort</label>
                    <input className="finish-form-input" value={hotelPlace} onChange={e => setHotelPlace(stripDiacritics(e.target.value))} placeholder="Enter city/area" />
                  </div>
                  <div className={`finish-form-group${flagClass('tourOperatorName')}`} style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Name of tour operator (if any)</label>
                    <input className={`finish-form-input${flagClass('tourOperatorName')}`} value={tourOperatorName} onChange={e => { setTourOperatorName(stripDiacritics(e.target.value)); clearFlag('tourOperatorName'); }} placeholder="Enter name or N/A" />
                    <FlagHint field="tourOperatorName" />
                  </div>
                  <div className={`finish-form-group${flagClass('tourOperatorAddress')}`} style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Address of tour operator</label>
                    <input className={`finish-form-input${flagClass('tourOperatorAddress')}`} value={tourOperatorAddress} onChange={e => { setTourOperatorAddress(stripDiacritics(e.target.value)); clearFlag('tourOperatorAddress'); }} placeholder="Enter address or N/A" />
                    <FlagHint field="tourOperatorAddress" />
                  </div>
                </div>
              )}
              <FlagHint field="bookedHotel" />
            </div>
            <div className={`finish-form-group${flagClass('exitPort')}`}>
              <label className="finish-form-label">Expected port of exit from India</label>
              <CustomDropdown options={ALL_INDIA_PORTS} value={exitPort} onChange={setExitPort} placeholder="Select exit port" />
              <FlagHint field="exitPort" />
            </div>
            <div className={`finish-form-group${flagClass('visitedIndiaBefore')}`}>
              <label className="finish-form-label">Have you ever visited India before?</label>
              <div className="finish-radio-row">
                <button type="button" className={`finish-radio-btn${visitedIndiaBefore === 'yes' ? ' selected' : ''}`} onClick={() => { setVisitedIndiaBefore('yes'); clearFlag('visitedIndiaBefore'); }}>
                  <span className={`finish-radio-circle${visitedIndiaBefore === 'yes' ? ' active' : ''}`}/>Yes
                </button>
                <button type="button" className={`finish-radio-btn${visitedIndiaBefore === 'no' ? ' selected' : ''}`} onClick={() => { setVisitedIndiaBefore('no'); clearFlag('visitedIndiaBefore'); }}>
                  <span className={`finish-radio-circle${visitedIndiaBefore === 'no' ? ' active' : ''}`}/>No
                </button>
              </div>
              {visitedIndiaBefore === 'yes' && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="finish-form-group" style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Address during last visit</label>
                    <input className="finish-form-input" value={prevIndiaAddress} onChange={e => setPrevIndiaAddress(stripDiacritics(e.target.value))} placeholder="Enter address in India" />
                  </div>
                  <div className="finish-form-group" style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Cities previously visited</label>
                    <input className="finish-form-input" value={prevIndiaCities} onChange={e => setPrevIndiaCities(stripDiacritics(e.target.value))} placeholder="e.g. Delhi, Mumbai, Agra" />
                  </div>
                  <div className="finish-form-group" style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Last Indian Visa number</label>
                    <input className="finish-form-input" value={prevIndiaVisaNo} onChange={e => setPrevIndiaVisaNo(e.target.value)} placeholder="Enter visa number" />
                  </div>
                  <div className="finish-form-group" style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Type of last visa</label>
                    <CustomDropdown options={['Tourist','Business','Medical','Conference','Student','Entry','Transit','Other']} value={prevIndiaVisaType} onChange={setPrevIndiaVisaType} placeholder="Select visa type" />
                  </div>
                  <div className="finish-form-group" style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Place of issue</label>
                    <input className="finish-form-input" value={prevIndiaVisaPlace} onChange={e => setPrevIndiaVisaPlace(stripDiacritics(e.target.value))} placeholder="Enter place of issue" />
                  </div>
                  <div className="finish-form-group" style={{ marginBottom: 0 }}>
                    <label className="finish-form-label">Date of issue</label>
                    <input className="finish-form-input" value={prevIndiaVisaDate} onChange={e => setPrevIndiaVisaDate(e.target.value)} placeholder="e.g. January 15, 2020" />
                  </div>
                </div>
              )}
              <FlagHint field="visitedIndiaBefore" />
            </div>
            <div className={`finish-form-group${flagClass('visaRefusedBefore')}`}>
              <label className="finish-form-label">Has permission to visit or to extend stay in India previously been refused?</label>
              <div className="finish-radio-row">
                <button type="button" className={`finish-radio-btn${visaRefusedBefore === 'yes' ? ' selected' : ''}`} onClick={() => { setVisaRefusedBefore('yes'); clearFlag('visaRefusedBefore'); }}>
                  <span className={`finish-radio-circle${visaRefusedBefore === 'yes' ? ' active' : ''}`}/>Yes
                </button>
                <button type="button" className={`finish-radio-btn${visaRefusedBefore === 'no' ? ' selected' : ''}`} onClick={() => { setVisaRefusedBefore('no'); clearFlag('visaRefusedBefore'); }}>
                  <span className={`finish-radio-circle${visaRefusedBefore === 'no' ? ' active' : ''}`}/>No
                </button>
              </div>
              <FlagHint field="visaRefusedBefore" />
            </div>

            {/* Reference in India */}
            <h2 className="finish-section-title" style={{ marginTop: '2rem' }}>Reference in India</h2>
            <p className="finish-form-hint" style={{ marginBottom: '1rem' }}>Provide a friend's, family member's, or hotel's info in India. This is required by the Indian government.</p>

            <div className={`finish-form-group${flagClass('refNameIndia')}`}>
              <label className="finish-form-label">Reference name</label>
              <input className={`finish-form-input${flagClass('refNameIndia')}`} value={refNameIndia} onChange={e => { setRefNameIndia(stripDiacritics(e.target.value)); clearFlag('refNameIndia'); }} placeholder="Name of friend, relative, or hotel" />
              <FlagHint field="refNameIndia" />
            </div>
            <div className={`finish-form-group${flagClass('refAddressIndia')}`}>
              <label className="finish-form-label">Reference address</label>
              <input className={`finish-form-input${flagClass('refAddressIndia')}`} value={refAddressIndia} onChange={e => { setRefAddressIndia(stripDiacritics(e.target.value)); clearFlag('refAddressIndia'); }} placeholder="Full address" />
              <FlagHint field="refAddressIndia" />
            </div>
            <div className={`finish-form-group${flagClass('refStateIndia')}`}>
              <label className="finish-form-label">State</label>
              <CustomDropdown options={INDIA_STATES} value={refStateIndia} onChange={setRefStateIndia} placeholder="Select state" />
              <FlagHint field="refStateIndia" />
            </div>
            <div className={`finish-form-group${flagClass('refDistrictIndia')}`}>
              <label className="finish-form-label">District</label>
              {refStateIndia && INDIA_DISTRICTS[refStateIndia] ? (
                <CustomDropdown
                  options={INDIA_DISTRICTS[refStateIndia]}
                  value={refDistrictIndia}
                  onChange={(v) => { setRefDistrictIndia(v); clearFlag('refDistrictIndia'); }}
                  placeholder="Select district"
                />
              ) : (
                <input className={`finish-form-input${flagClass('refDistrictIndia')}`} value={refDistrictIndia} onChange={e => { setRefDistrictIndia(stripDiacritics(e.target.value)); clearFlag('refDistrictIndia'); }} placeholder="Enter district" />
              )}
              <FlagHint field="refDistrictIndia" />
            </div>
            <div className={`finish-form-group${flagClass('refPhoneIndia')}`}>
              <label className="finish-form-label">Phone number</label>
              <input className={`finish-form-input${flagClass('refPhoneIndia')}`} type="tel" maxLength={15} value={refPhoneIndia} onChange={e => { setRefPhoneIndia(e.target.value.replace(/[^0-9]/g, '').slice(0, 15)); clearFlag('refPhoneIndia'); }} placeholder="91XXXXXXXXXX" />
              <FlagHint field="refPhoneIndia" />
            </div>

            {/* Reference in Home Country */}
            <h2 className="finish-section-title" style={{ marginTop: '2rem' }}>Reference in Home Country</h2>
            <p className="finish-form-hint" style={{ marginBottom: '1rem' }}>Provide a friend's or relative's contact info in your home country, to be contacted in case of emergency.</p>

            <div className={`finish-form-group${flagClass('refNameHome')}`}>
              <label className="finish-form-label">Reference name</label>
              <input className={`finish-form-input${flagClass('refNameHome')}`} value={refNameHome} onChange={e => { setRefNameHome(stripDiacritics(e.target.value)); clearFlag('refNameHome'); }} placeholder="Name of friend or relative" />
              <FlagHint field="refNameHome" />
            </div>
            <div className={`finish-form-group${flagClass('refAddressHome')}`}>
              <label className="finish-form-label">Address</label>
              <input className={`finish-form-input${flagClass('refAddressHome')}`} value={refAddressHome} onChange={e => { setRefAddressHome(stripDiacritics(e.target.value)); clearFlag('refAddressHome'); }} placeholder="Full address" />
              <FlagHint field="refAddressHome" />
            </div>
            <div className={`finish-form-group${flagClass('refStateHome')}`}>
              <label className="finish-form-label">State / Province</label>
              <input className={`finish-form-input${flagClass('refStateHome')}`} value={refStateHome} onChange={e => { setRefStateHome(stripDiacritics(e.target.value)); clearFlag('refStateHome'); }} placeholder="Enter state or province" />
              <FlagHint field="refStateHome" />
            </div>
            <div className={`finish-form-group${flagClass('refDistrictHome')}`}>
              <label className="finish-form-label">ZIP or postcode</label>
              <input className={`finish-form-input${flagClass('refDistrictHome')}`} value={refDistrictHome} onChange={e => { setRefDistrictHome(stripDiacritics(e.target.value)); clearFlag('refDistrictHome'); }} placeholder="Enter ZIP or postcode" />
              <FlagHint field="refDistrictHome" />
            </div>
            <div className={`finish-form-group${flagClass('refPhoneHome')}`}>
              <label className="finish-form-label">Phone number</label>
              <input className={`finish-form-input${flagClass('refPhoneHome')}`} type="tel" maxLength={15} value={refPhoneHome} onChange={e => { setRefPhoneHome(e.target.value.replace(/[^0-9]/g, '').slice(0, 15)); clearFlag('refPhoneHome'); }} placeholder="12345678900" />
              <FlagHint field="refPhoneHome" />
            </div>

            {/* Security Questions */}
            <h2 className="finish-section-title" style={{ marginTop: '2rem' }}>Security Questions</h2>

            <div className={`finish-form-group${flagClass('everArrested')}`}>
              <label className="finish-form-label">Have you ever been arrested/prosecuted/convicted by a court of law in any country?</label>
              <div className="finish-radio-row">
                <button type="button" className={`finish-radio-btn${everArrested === 'yes' ? ' selected' : ''}`} onClick={() => { setEverArrested('yes'); clearFlag('everArrested'); }}>
                  <span className={`finish-radio-circle${everArrested === 'yes' ? ' active' : ''}`}/>Yes
                </button>
                <button type="button" className={`finish-radio-btn${everArrested === 'no' ? ' selected' : ''}`} onClick={() => { setEverArrested('no'); clearFlag('everArrested'); }}>
                  <span className={`finish-radio-circle${everArrested === 'no' ? ' active' : ''}`}/>No
                </button>
              </div>
              <FlagHint field="everArrested" />
            </div>
            <div className={`finish-form-group${flagClass('everRefusedEntry')}`}>
              <label className="finish-form-label">Have you ever been refused entry/deported by any country including India?</label>
              <div className="finish-radio-row">
                <button type="button" className={`finish-radio-btn${everRefusedEntry === 'yes' ? ' selected' : ''}`} onClick={() => { setEverRefusedEntry('yes'); clearFlag('everRefusedEntry'); }}>
                  <span className={`finish-radio-circle${everRefusedEntry === 'yes' ? ' active' : ''}`}/>Yes
                </button>
                <button type="button" className={`finish-radio-btn${everRefusedEntry === 'no' ? ' selected' : ''}`} onClick={() => { setEverRefusedEntry('no'); clearFlag('everRefusedEntry'); }}>
                  <span className={`finish-radio-circle${everRefusedEntry === 'no' ? ' active' : ''}`}/>No
                </button>
              </div>
              <FlagHint field="everRefusedEntry" />
            </div>
            <div className={`finish-form-group${flagClass('soughtAsylum')}`}>
              <label className="finish-form-label">Have you sought asylum in any country?</label>
              <div className="finish-radio-row">
                <button type="button" className={`finish-radio-btn${soughtAsylum === 'yes' ? ' selected' : ''}`} onClick={() => { setSoughtAsylum('yes'); clearFlag('soughtAsylum'); }}>
                  <span className={`finish-radio-circle${soughtAsylum === 'yes' ? ' active' : ''}`}/>Yes
                </button>
                <button type="button" className={`finish-radio-btn${soughtAsylum === 'no' ? ' selected' : ''}`} onClick={() => { setSoughtAsylum('no'); clearFlag('soughtAsylum'); }}>
                  <span className={`finish-radio-circle${soughtAsylum === 'no' ? ' active' : ''}`}/>No
                </button>
              </div>
              <FlagHint field="soughtAsylum" />
            </div>

            {/* Admin-defined custom sections — built-in sections are rendered by hardcoded inputs above */}
            {customSchema.sections
              .filter(sec => !sec.builtIn && !sec.hidden && sec.fields.length > 0)
              .map(sec => (
                <CustomSectionRenderer
                  key={sec.key}
                  section={sec}
                  values={customValues}
                  setValue={(k, v) => setCustomValues(prev => ({ ...prev, [k]: v }))}
                />
              ))}

            <div className="finish-nav">
              <button className="finish-back-btn" onClick={() => setStep('passport-bio-upload')}>
                ← Back
              </button>
              <button className={`finish-next-btn${canProceedAdditional ? ' ready' : ''}`} disabled={!canProceedAdditional} onClick={() => saveProgress('verify')}>
                Review &amp; Submit
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Verify Info Step ── */
  if (step === 'verify') {
    const t = travelers[0] || {} as any;
    const sections = [
      { title: 'Trip Details', items: [
        ['Arrival date', arrMonth && arrDay && arrYear ? `${arrMonth} ${arrDay}, ${arrYear}` : '—'],
        ['Arrival point', arrivalPoint || '—'],
        ['Countries visited', visitedCountries.filter(Boolean).join(', ') || '—'],
      ]},
      { title: 'Personal Details', items: [
        ['Name', `${t.firstName || ''} ${t.lastName || ''}`],
        ['Gender', gender || '—'],
        ['Country of birth', countryOfBirth || '—'],
        ['City of birth', cityOfBirth || '—'],
        ['Religion', religion || '—'],
        ['Education', educationalQualification || '—'],
        ['Nationality acquired by', nationalityByBirth || '—'],
        ['Lived 2+ years in applying country', livedTwoYears || '—'],
        ['Phone', phoneNumber || '—'],
        ['Marital status', maritalStatus || '—'],
      ]},
      { title: 'Home Address', items: [
        ['Country of residence', residenceCountry || '—'],
        ['Address', homeAddress || '—'],
        ['City', homeCity || '—'],
        ['State', homeState || '—'],
        ['ZIP', homeZip || '—'],
      ]},
      { title: 'Employment', items: [
        ['Status', employmentStatus || '—'],
        ...(employmentStatus === 'Employed' ? [
          ['Employer', employerName || '—'],
          ['Employer address', `${employerAddress || ''}, ${employerCity || ''}, ${employerState || ''}, ${employerCountry || ''} ${employerZip || ''}`],
        ] : []),
        ['Served in military/police', servedMilitary || '—'],
      ]},
      { title: 'Family', items: [
        ...(knowParents === 'both' || knowParents === 'father' ? [
          ['Father\'s name', fatherName || '—'],
          ['Father\'s nationality', fatherNationality || '—'],
          ['Father\'s place of birth', `${fatherPlaceOfBirth || ''}, ${fatherCountryOfBirth || ''}`],
        ] : []),
        ...(knowParents === 'both' || knowParents === 'mother' ? [
          ['Mother\'s name', motherName || '—'],
          ['Mother\'s nationality', motherNationality || '—'],
          ['Mother\'s place of birth', `${motherPlaceOfBirth || ''}, ${motherCountryOfBirth || ''}`],
        ] : []),
        ...(maritalStatus === 'Married' ? [
          ['Spouse\'s name', spouseName || '—'],
          ['Spouse\'s nationality', spouseNationality || '—'],
          ['Spouse\'s place of birth', `${spousePlaceOfBirth || ''}, ${spouseCountryOfBirth || ''}`],
        ] : []),
      ]},
      { title: 'Travel & Accommodation', items: [
        ['Places to visit', placesToVisit || '—'],
        ['Booked hotel', bookedHotel || '—'],
        ...(bookedHotel === 'yes' ? [['Hotel', `${hotelName || ''}, ${hotelPlace || ''}`]] : []),
        ['Exit airport', exitPort || '—'],
        ['Visited India before', visitedIndiaBefore || '—'],
        ...(visitedIndiaBefore === 'yes' ? [
          ['Previous address in India', prevIndiaAddress || '—'],
          ['Cities visited', prevIndiaCities || '—'],
          ['Last visa number', prevIndiaVisaNo || '—'],
          ['Last visa type', prevIndiaVisaType || '—'],
          ['Last visa place of issue', prevIndiaVisaPlace || '—'],
          ['Last visa date of issue', prevIndiaVisaDate || '—'],
        ] : []),
        ['Visa refused before', visaRefusedBefore || '—'],
      ]},
      { title: 'Reference in India', items: [
        ['Name', refNameIndia || '—'],
        ['Address', refAddressIndia || '—'],
        ['State', refStateIndia || '—'],
        ['Phone', refPhoneIndia || '—'],
      ]},
      { title: 'Reference in Home Country', items: [
        ['Name', refNameHome || '—'],
        ['Address', refAddressHome || '—'],
        ['State', refStateHome || '—'],
        ['Phone', refPhoneHome || '—'],
      ]},
      { title: 'Security', items: [
        ['Arrested/prosecuted/convicted', everArrested || '—'],
        ['Refused entry/deported', everRefusedEntry || '—'],
        ['Sought asylum', soughtAsylum || '—'],
      ]},
      // Admin-defined custom sections (built-in sections are already shown via the hardcoded items above)
      ...customSchema.sections
        .filter(sec => !sec.builtIn && !sec.hidden && sec.fields.length > 0)
        .map(sec => ({
          title: sec.title,
          items: sec.fields
            .filter(f => !f.hidden)
            .map(f => [f.label, formatCustomValue(customValues[f.key])] as [string, string]),
        })),
    ];

    const handleFinalSubmit = async () => {
      await saveProgress('complete');
      // Update order status to UNDER_REVIEW since application is now complete
      try {
        await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'PROCESSING', flaggedFields: '[]', specialistNotes: '' }),
        });
      } catch {}
    };

    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner" style={{ maxWidth: '720px' }}>
            <h1 className="finish-heading">Verify Your Information</h1>
            <p className="finish-subheading" style={{ marginBottom: '1.5rem' }}>Please review all details below before submitting.</p>

            {sections.map(s => (
              <div key={s.title} className="verify-section">
                <h3 className="verify-section-title">{s.title}</h3>
                <div className="verify-rows">
                  {s.items.map(([label, value], i) => (
                    <div key={i} className="verify-row">
                      <span className="verify-label">{label}</span>
                      <span className="verify-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {travelerPhotoPreview && (
              <div className="verify-section">
                <h3 className="verify-section-title">Traveler Photo</h3>
                <img src={travelerPhotoPreview} alt="Traveler" style={{ maxWidth: '120px', borderRadius: '0.75rem', border: '2px solid var(--cloud)' }} />
              </div>
            )}
            {passportBioPreview && passportBioPreview !== 'pdf' && (
              <div className="verify-section">
                <h3 className="verify-section-title">Passport Bio Page</h3>
                <img src={passportBioPreview} alt="Passport" style={{ maxWidth: '200px', borderRadius: '0.75rem', border: '2px solid var(--cloud)' }} />
              </div>
            )}

            <div className="finish-nav" style={{ marginTop: '2rem' }}>
              <button className="finish-back-btn" onClick={() => setStep('additional')}>
                ← Back
              </button>
              <button className="finish-next-btn ready" onClick={handleFinalSubmit} style={{ background: '#10b981' }}>
                ✓ Finish &amp; Submit Application
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Complete Step ── */
  if (step === 'complete') {
    return (
      <div className="finish-page">
        {sidebar}
        <main className="finish-main">
          <div className="finish-main-inner" style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h1 className="finish-heading" style={{ marginBottom: '0.5rem' }}>Application Submitted!</h1>
            <p style={{ color: 'var(--slate)', fontSize: '1rem', maxWidth: '480px', margin: '0 auto 2rem' }}>
              Your information has been received. We&apos;ll review your application and update your status. You can track your progress on the status page.
            </p>
            <a href="/status" className="finish-next-btn ready" style={{ display: 'inline-block', textDecoration: 'none', padding: '0.75rem 2rem' }}>
              View Application Status
            </a>
          </div>
        </main>
      </div>
    );
  }

  return null;
}

export default function FinishPage() {
  return (
    <>
      <Nav />
      <Suspense fallback={<div style={{ paddingTop: '120px', textAlign: 'center' }}>Loading...</div>}>
        <FinishContent />
      </Suspense>
    </>
  );
}

// ── Custom field helpers ─────────────────────────────────────────────────

function isFilled(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'boolean') return true; // checkbox: both true and false are valid answers
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function formatCustomValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ') || '—';
  return String(v);
}

function CustomSectionRenderer({ section, values, setValue }: {
  section: CustomSection;
  values: Record<string, any>;
  setValue: (key: string, value: any) => void;
}) {
  if (section.fields.length === 0) return null;
  return (
    <>
      <h2 className="finish-section-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
        <SectionIcon icon={section.icon} emoji={section.emoji} size={18} strokeWidth={2} />
        <span>{section.title}</span>
      </h2>
      {section.description && (
        <p style={{ fontSize: '0.88rem', color: '#6b7280', marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
          {section.description}
        </p>
      )}
      {section.fields.map(f => (
        <CustomFieldRenderer
          key={f.key}
          field={f}
          value={values[f.key]}
          onChange={v => setValue(f.key, v)}
        />
      ))}
    </>
  );
}

function CustomFieldRenderer({ field, value, onChange }: {
  field: CustomField;
  value: any;
  onChange: (v: any) => void;
}) {
  const reqMark = field.required ? <span style={{ color: '#dc2626' }}> *</span> : null;
  const help = field.helpText ? (
    <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.25rem' }}>{field.helpText}</p>
  ) : null;

  // Textarea
  if (field.type === 'textarea') {
    return (
      <div className="finish-form-group">
        <label className="finish-form-label">{field.label}{reqMark}</label>
        <textarea
          className="finish-form-input"
          rows={4}
          value={value ?? ''}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
        />
        {help}
      </div>
    );
  }

  // Select
  if (field.type === 'select') {
    return (
      <div className="finish-form-group">
        <label className="finish-form-label">{field.label}{reqMark}</label>
        <select
          className="finish-form-input"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">— Select —</option>
          {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {help}
      </div>
    );
  }

  // Radio
  if (field.type === 'radio') {
    return (
      <div className="finish-form-group">
        <label className="finish-form-label">{field.label}{reqMark}</label>
        <div className="finish-radio-group">
          {(field.options || []).map(o => (
            <button
              key={o}
              type="button"
              className={`finish-radio-btn${value === o ? ' selected' : ''}`}
              onClick={() => onChange(o)}
            >
              <span className={`finish-radio-circle${value === o ? ' active' : ''}`} />
              {o}
            </button>
          ))}
        </div>
        {help}
      </div>
    );
  }

  // Checkbox
  if (field.type === 'checkbox') {
    return (
      <div className="finish-form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => onChange(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span className="finish-form-label" style={{ margin: 0 }}>{field.label}{reqMark}</span>
        </label>
        {help}
      </div>
    );
  }

  // Default: text / email / tel / date / number
  return (
    <div className="finish-form-group">
      <label className="finish-form-label">{field.label}{reqMark}</label>
      <input
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
        className="finish-form-input"
        value={value ?? ''}
        placeholder={field.placeholder}
        onChange={e => onChange(e.target.value)}
      />
      {help}
    </div>
  );
}
