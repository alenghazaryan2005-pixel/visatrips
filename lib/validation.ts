/* ── Field validation helpers ──
   Returns an error message string, or '' if valid.
   "Reasonable" level: blocks gibberish, enforces basic formats,
   allows through anything that looks plausible. */

// Detects repeated characters like "aaaa", "1111", "xxxx"
const isRepeatedChars = (s: string) => /^(.)\1{3,}$/.test(s.replace(/\s/g, ''));

// Detects keyboard-mash patterns (4+ consonants in a row with no vowels)
const isKeyboardMash = (s: string) => /[^aeiou\s]{5,}/i.test(s);

// Detects all-same character with minor variation like "aabaa"
const isGibberish = (s: string): boolean => {
  const clean = s.replace(/\s/g, '').toLowerCase();
  if (clean.length < 3) return false;
  if (isRepeatedChars(clean)) return true;
  // Count unique characters — if very low ratio, likely gibberish
  const unique = new Set(clean).size;
  if (clean.length >= 5 && unique <= 2) return true;
  return false;
};

/* ── Name validation ── */
export function validateName(value: string, label = 'Name'): string {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required`;
  if (trimmed.length < 2) return `${label} must be at least 2 characters`;
  if (/^\d+$/.test(trimmed)) return `${label} cannot be all numbers`;
  if (!/[a-zA-Z]/.test(trimmed)) return `${label} must contain letters`;
  if (isGibberish(trimmed)) return `Please enter a valid ${label.toLowerCase()}`;
  if (isKeyboardMash(trimmed)) return `Please enter a valid ${label.toLowerCase()}`;
  if (/[!@#$%^&*()_+=\[\]{};:"\\|<>?/~`]/.test(trimmed)) return `${label} should not contain special characters`;
  return '';
}

/* ── Email validation ── */
export function validateEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return 'Please enter a valid email address';
  return '';
}

/* ── Phone validation ── */
export function validatePhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Phone number is required';
  // Strip spaces, dashes, parens for checking
  const digits = trimmed.replace(/[\s\-().+]/g, '');
  if (!/^\d{7,15}$/.test(digits)) return 'Please enter a valid phone number (7-15 digits)';
  return '';
}

/* ── Passport number validation ── */
export function validatePassportNumber(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Passport number is required';
  if (trimmed.length < 5) return 'Passport number must be at least 5 characters';
  if (trimmed.length > 20) return 'Passport number is too long';
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) return 'Passport number should only contain letters and numbers';
  if (isRepeatedChars(trimmed)) return 'Please enter a valid passport number';
  if (/^(.)\1+$/.test(trimmed)) return 'Please enter a valid passport number';
  return '';
}

/* ── Address validation ── */
export function validateAddress(value: string, label = 'Address'): string {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required`;
  if (trimmed.length < 3) return `${label} must be at least 3 characters`;
  if (/^\d+$/.test(trimmed)) return `${label} cannot be only numbers`;
  if (isGibberish(trimmed)) return `Please enter a valid ${label.toLowerCase()}`;
  return '';
}

/* ── City / State validation ── */
export function validateCityState(value: string, label = 'City'): string {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required`;
  if (trimmed.length < 2) return `${label} must be at least 2 characters`;
  if (/^\d+$/.test(trimmed)) return `${label} cannot be all numbers`;
  if (!/[a-zA-Z]/.test(trimmed)) return `${label} must contain letters`;
  if (isGibberish(trimmed)) return `Please enter a valid ${label.toLowerCase()}`;
  if (isKeyboardMash(trimmed)) return `Please enter a valid ${label.toLowerCase()}`;
  return '';
}

/* ── ZIP / Postcode validation ── */
export function validateZip(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'ZIP/Postcode is required';
  if (trimmed.length < 3) return 'ZIP/Postcode must be at least 3 characters';
  if (trimmed.length > 10) return 'ZIP/Postcode is too long';
  if (!/^[A-Za-z0-9\s\-]{3,10}$/.test(trimmed)) return 'ZIP/Postcode contains invalid characters';
  if (isRepeatedChars(trimmed.replace(/[\s\-]/g, ''))) return 'Please enter a valid ZIP/Postcode';
  return '';
}

/* ── Generic required text field ── */
export function validateRequired(value: string, label = 'This field'): string {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required`;
  if (trimmed.length < 2) return `${label} must be at least 2 characters`;
  if (isGibberish(trimmed)) return `Please enter a valid value`;
  return '';
}

/* ── ID / National ID validation ── */
export function validateId(value: string, label = 'ID'): string {
  const trimmed = value.trim();
  if (!trimmed) return ''; // Optional field
  if (trimmed.length < 3) return `${label} must be at least 3 characters`;
  if (isRepeatedChars(trimmed)) return `Please enter a valid ${label}`;
  return '';
}
