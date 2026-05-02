/* ── Field validation helpers ──
   Returns an error message string, or '' if valid.
   Strict level: blocks gibberish, random typing, enforces real-looking data. */

// Detects repeated characters like "aaaa", "111", "xxx"
const isRepeatedChars = (s: string) => /^(.)\1{2,}$/.test(s.replace(/\s/g, ''));

// Detects keyboard-mash patterns (5+ consonants in a row within a single word).
// Preserve word boundaries (don't strip spaces/punctuation) so multi-word
// place names like "North Miami" or "St. Charles" don't falsely join consonants.
const isKeyboardMash = (s: string) => /[bcdfghjklmnpqrstvwxz]{5,}/i.test(s);

// Detects random character sequences — low vowel ratio
const hasLowVowelRatio = (s: string): boolean => {
  const letters = s.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) return false;
  const vowels = (letters.match(/[aeiouAEIOU]/g) || []).length;
  return vowels / letters.length < 0.15;
};

// Detects gibberish patterns
const isGibberish = (s: string): boolean => {
  const clean = s.replace(/\s/g, '').toLowerCase();
  if (clean.length < 2) return false;
  if (isRepeatedChars(clean)) return true;
  const unique = new Set(clean).size;
  if (clean.length >= 4 && unique <= 2) return true;
  if (clean.length >= 3 && hasLowVowelRatio(clean) && isKeyboardMash(clean)) return true;
  // Check for alternating pattern like "ababab"
  if (clean.length >= 6 && /^(.{1,2})\1{2,}$/.test(clean)) return true;
  return false;
};

// Check if string looks like a real word (has vowels, reasonable length)
const looksLikeRealText = (s: string): boolean => {
  const letters = s.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 2) return false;
  // Must have at least one vowel per 5 consonants (relaxed for short words)
  const vowels = (letters.match(/[aeiouAEIOU]/g) || []).length;
  if (letters.length >= 4 && vowels === 0) return false;
  return true;
};

/**
 * Convert accented/diacritic characters to their plain ASCII equivalents.
 * "São Paulo" → "Sao Paulo", "María" → "Maria", "Müller" → "Muller".
 *
 * The India eVisa gov form only accepts ASCII letters in text fields, so
 * we strip diacritics on every customer-facing text input. Uses NFD
 * normalization which decomposes "ã" into "a" + U+0303 (combining tilde),
 * then drops the combining mark.
 */
export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* ── Name validation ──
 * Two gov-form constraints baked in:
 *   1. ASCII letters only — no diacritics (São → Sao). NFD-stripped on input.
 *   2. No special characters of any kind — no dashes (Jean-Luc), no
 *      apostrophes (O'Connor), no digits. Letters and spaces only.
 */
export function validateName(value: string, label = 'Name'): string {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required`;
  if (trimmed.length < 2) return `${label} must be at least 2 characters`;
  // ASCII letters + spaces only — keeps the gov form happy.
  if (!/^[a-zA-Z ]+$/.test(trimmed)) return 'Enter letters and spaces only';
  if (!/[a-zA-Z]{2,}/.test(trimmed)) return `${label} must contain at least 2 letters`;
  if (isGibberish(trimmed)) return `Please enter a valid ${label.toLowerCase()}`;
  if (isKeyboardMash(trimmed)) return `Please enter a valid ${label.toLowerCase()}`;
  if (!looksLikeRealText(trimmed)) return `Please enter a valid ${label.toLowerCase()}`;
  return '';
}

/**
 * Strip every disallowed character from a name string. Use as an onChange
 * filter on customer-facing name inputs:
 *   - First, convert diacritics to plain ASCII (São → Sao)
 *   - Then drop anything that isn't a letter or space
 * The validation message is a fallback for paste/autofill cases.
 */
export function stripNameInput(value: string): string {
  return stripDiacritics(value).replace(/[^a-zA-Z ]/g, '');
}

/* ── Email validation ── */
export function validateEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return 'Please enter a valid email address';
  // Check domain has valid TLD
  const domain = trimmed.split('@')[1];
  if (!domain || domain.length < 4) return 'Please enter a valid email domain';
  if (!/\.[a-zA-Z]{2,}$/.test(domain)) return 'Please enter a valid email domain';
  return '';
}

/* ── Phone validation ── */
export function validatePhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Phone number is required';
  const digits = trimmed.replace(/[\s\-().+]/g, '');
  if (!/^\d{7,15}$/.test(digits)) return 'Please enter a valid phone number (7-15 digits)';
  if (isRepeatedChars(digits)) return 'Please enter a valid phone number';
  // Check for sequential numbers like 1234567890
  if (/^(0123456789|1234567890|9876543210|0000000|1111111)/.test(digits)) return 'Please enter a real phone number';
  return '';
}

/* ── Passport number validation ── */
export function validatePassportNumber(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Passport number is required';
  if (trimmed.length < 6) return 'Passport number must be at least 6 characters';
  if (trimmed.length > 20) return 'Passport number is too long';
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) return 'Passport number should only contain letters and numbers';
  if (isRepeatedChars(trimmed)) return 'Please enter a valid passport number';
  if (/^(.)\1+$/.test(trimmed)) return 'Please enter a valid passport number';
  // Must have at least one letter and one number
  if (!/[A-Za-z]/.test(trimmed) || !/\d/.test(trimmed)) return 'Passport number should contain both letters and numbers';
  return '';
}

/* ── Address validation ── */
export function validateAddress(value: string, label = 'Address'): string {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required`;
  if (trimmed.length < 5) return `${label} must be at least 5 characters`;
  if (/^\d+$/.test(trimmed)) return `${label} cannot be only numbers`;
  if (!/[a-zA-Z]{2,}/.test(trimmed)) return `${label} must contain words`;
  if (isGibberish(trimmed)) return `Please enter a valid ${label.toLowerCase()}`;
  return '';
}

/* ── City / State validation ── */
export function validateCityState(value: string, label = 'City'): string {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required`;
  if (trimmed.length < 2) return `${label} must be at least 2 characters`;
  if (/^\d+$/.test(trimmed)) return `${label} cannot be all numbers`;
  if (/\d/.test(trimmed)) return `${label} should not contain numbers`;
  if (!/[a-zA-Z]{2,}/.test(trimmed)) return `${label} must contain letters`;
  if (isGibberish(trimmed)) return `Please enter a valid ${label.toLowerCase()}`;
  if (isKeyboardMash(trimmed)) return `Please enter a valid ${label.toLowerCase()}`;
  if (!looksLikeRealText(trimmed)) return `Please enter a valid ${label.toLowerCase()}`;
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
  if (isGibberish(trimmed)) return 'Please enter a valid value';
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
