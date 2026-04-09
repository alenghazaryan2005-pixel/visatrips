export const formatOrderNum = (n: number) => {
  if (n <= 99999) return String(n).padStart(5, '0');
  return `${String(Math.floor(n / 100000)).padStart(5, '0')}-${String(n % 100000).padStart(5, '0')}`;
};

export const parseOrderNumber = (formatted: string): number => {
  if (formatted.includes('-')) {
    const [hi, lo] = formatted.split('-');
    return parseInt(hi, 10) * 100000 + parseInt(lo, 10);
  }
  return parseInt(formatted, 10);
};

export const VISA_LABELS: Record<string, string> = {
  TOURIST_30:  'Tourist – 30 days',
  TOURIST_1Y:  'Tourist – 1 year',
  TOURIST_5Y:  'Tourist – 5 years',
  BUSINESS_1Y: 'Business – 1 year',
  MEDICAL_60:  'Medical – 60 days',
  'tourist-30':  'Tourist – 30 days',
  'tourist-1y':  'Tourist – 1 year',
  'tourist-5y':  'Tourist – 5 years',
  'business-1y': 'Business – 1 year',
  'medical-60':  'Medical – 60 days',
};

export const STATUS_COLORS: Record<string, string> = {
  PENDING:      'status-pending',
  UNDER_REVIEW: 'status-review',
  APPROVED:     'status-approved',
  REJECTED:     'status-rejected',
  REFUNDED:     'status-refunded',
  ON_HOLD:      'status-onhold',
  NEEDS_CORRECTION: 'status-correction',
};

export const VISA_COLORS: Record<string, string> = {
  TOURIST_30:    'visa-tourist',
  TOURIST_1Y:    'visa-tourist',
  TOURIST_5Y:    'visa-tourist',
  'tourist-30':  'visa-tourist',
  'tourist-1y':  'visa-tourist',
  'tourist-5y':  'visa-tourist',
  BUSINESS_1Y:   'visa-business',
  'business-1y': 'visa-business',
  MEDICAL_60:    'visa-medical',
  'medical-60':  'visa-medical',
};

export const COUNTRY_FLAGS: Record<string, string> = {
  'India':          '🇮🇳',
  'Brazil':         '🇧🇷',
  'United States':  '🇺🇸',
  'United Kingdom': '🇬🇧',
  'Canada':         '🇨🇦',
  'Australia':      '🇦🇺',
  'Germany':        '🇩🇪',
  'France':         '🇫🇷',
  'Japan':          '🇯🇵',
  'China':          '🇨🇳',
  'South Korea':    '🇰🇷',
  'Thailand':       '🇹🇭',
  'UAE':            '🇦🇪',
  'Saudi Arabia':   '🇸🇦',
  'Turkey':         '🇹🇷',
  'Mexico':         '🇲🇽',
  'Singapore':      '🇸🇬',
  'Indonesia':      '🇮🇩',
  'Malaysia':       '🇲🇾',
  'Vietnam':        '🇻🇳',
};
