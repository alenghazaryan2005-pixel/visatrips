import { describe, it, expect } from 'vitest';
import {
  validateName,
  stripNameInput,
  stripDiacritics,
  validateEmail,
  validatePhone,
  validatePassportNumber,
  validateAddress,
  validateCityState,
  validateZip,
  validateRequired,
  validateId,
} from '@/lib/validation';

describe('validateName', () => {
  it('accepts plain ASCII names', () => {
    expect(validateName('John')).toBe('');
    expect(validateName('Maria Garcia')).toBe('');
    expect(validateName('Anna Maria Theresa')).toBe('');
  });

  it('rejects names with diacritics — stripDiacritics is supposed to clean them on input', () => {
    expect(validateName('María García')).toBe('Enter letters and spaces only');
    expect(validateName('Søren Müller')).toBe('Enter letters and spaces only');
    expect(validateName('São')).toBe('Enter letters and spaces only');
  });

  it('rejects hyphens (gov form constraint — Jean-Luc not allowed)', () => {
    expect(validateName('Jean-Luc')).toBe('Enter letters and spaces only');
    expect(validateName('Mary-Jane')).toBe('Enter letters and spaces only');
  });

  it('rejects apostrophes (gov form constraint — O\'Connor not allowed)', () => {
    expect(validateName("O'Connor")).toBe('Enter letters and spaces only');
    expect(validateName("D'Angelo")).toBe('Enter letters and spaces only');
  });

  it('rejects digits anywhere in the name', () => {
    expect(validateName('John123')).toBe('Enter letters and spaces only');
    expect(validateName('12345')).toBe('Enter letters and spaces only');
  });

  it('rejects empty / whitespace', () => {
    expect(validateName('')).toMatch(/required/);
    expect(validateName('   ')).toMatch(/required/);
  });

  it('rejects too-short names', () => {
    expect(validateName('A')).toMatch(/at least 2/);
  });

  it('rejects repeated-char gibberish', () => {
    expect(validateName('aaaa')).not.toBe('');
    expect(validateName('zzzzz')).not.toBe('');
  });

  it('rejects keyboard mash', () => {
    expect(validateName('qwrtpbxk')).not.toBe('');
    expect(validateName('bcdfghjkl')).not.toBe('');
  });

  it('rejects special characters with the same letters-and-spaces error', () => {
    expect(validateName('John@Doe')).toBe('Enter letters and spaces only');
    expect(validateName('John!')).toBe('Enter letters and spaces only');
    expect(validateName('John.Doe')).toBe('Enter letters and spaces only');
    expect(validateName('John/Doe')).toBe('Enter letters and spaces only');
  });

  it('uses the supplied label in non-format error messages', () => {
    expect(validateName('', 'First name')).toMatch(/First name is required/);
    expect(validateName('A', 'Last name')).toMatch(/Last name must be at least 2/);
  });
});

describe('stripNameInput', () => {
  it('strips dashes', () => {
    expect(stripNameInput('Jean-Luc')).toBe('JeanLuc');
    expect(stripNameInput('Mary-Jane')).toBe('MaryJane');
  });

  it('strips apostrophes', () => {
    expect(stripNameInput("O'Connor")).toBe('OConnor');
  });

  it('strips digits and special chars', () => {
    expect(stripNameInput('John123!@#')).toBe('John');
    expect(stripNameInput('A.B.C.')).toBe('ABC');
  });

  it('strips diacritics to plain ASCII', () => {
    expect(stripNameInput('María García')).toBe('Maria Garcia');
    // ü decomposes via NFD (u + combining diaeresis) so it strips to "u".
    // ø does NOT decompose — it's a single character — so the strict
    // letters-only filter drops it entirely.
    expect(stripNameInput('Søren Müller')).toBe('Sren Muller');
    expect(stripNameInput('São Paulo')).toBe('Sao Paulo');
    expect(stripNameInput('José')).toBe('Jose');
  });

  it('preserves spaces (no trimming)', () => {
    expect(stripNameInput('  Anna  Maria  ')).toBe('  Anna  Maria  ');
  });

  it('returns empty for input with nothing valid', () => {
    expect(stripNameInput('---')).toBe('');
    expect(stripNameInput('123')).toBe('');
  });
});

describe('stripDiacritics', () => {
  it('converts common Latin-script accented characters to ASCII', () => {
    expect(stripDiacritics('São Paulo')).toBe('Sao Paulo');
    expect(stripDiacritics('María')).toBe('Maria');
    expect(stripDiacritics('Müller')).toBe('Muller');
    expect(stripDiacritics('café')).toBe('cafe');
    expect(stripDiacritics('Łódź')).toBe('Łodz'); // Ł has no NFD decomposition; only acute on o + dot on z
  });

  it('preserves digits, dashes, spaces, and other non-diacritic characters', () => {
    expect(stripDiacritics('123 Main St.')).toBe('123 Main St.');
    expect(stripDiacritics('Apt-4B')).toBe('Apt-4B');
  });

  it('is a no-op for plain ASCII', () => {
    expect(stripDiacritics('John Smith')).toBe('John Smith');
    expect(stripDiacritics('')).toBe('');
  });
});

describe('validateEmail', () => {
  it('accepts well-formed emails', () => {
    expect(validateEmail('user@example.com')).toBe('');
    expect(validateEmail('x.y+tag@sub.domain.co.uk')).toBe('');
  });

  it('rejects empty', () => {
    expect(validateEmail('')).toMatch(/required/);
    expect(validateEmail('   ')).toMatch(/required/);
  });

  it('rejects missing @', () => {
    expect(validateEmail('userexample.com')).not.toBe('');
  });

  it('rejects missing TLD', () => {
    expect(validateEmail('user@example')).not.toBe('');
  });

  it('rejects too-short domain', () => {
    expect(validateEmail('a@b.c')).not.toBe('');
  });

  it('rejects whitespace in local part', () => {
    expect(validateEmail('a b@example.com')).not.toBe('');
  });
});

describe('validatePhone', () => {
  it('accepts international formats', () => {
    expect(validatePhone('+1 (555) 123-4567')).toBe('');
    expect(validatePhone('5551234567')).toBe('');
    expect(validatePhone('+91 98765 43210')).toBe('');
  });

  it('rejects empty', () => {
    expect(validatePhone('')).toMatch(/required/);
  });

  it('rejects too few digits', () => {
    expect(validatePhone('12345')).not.toBe('');
  });

  it('rejects too many digits', () => {
    expect(validatePhone('123456789012345678')).not.toBe('');
  });

  it('rejects repeated-char spam', () => {
    expect(validatePhone('1111111111')).not.toBe('');
  });

  it('rejects obvious keyboard smashes', () => {
    expect(validatePhone('1234567890')).not.toBe('');
    expect(validatePhone('0123456789')).not.toBe('');
  });
});

describe('validatePassportNumber', () => {
  it('accepts realistic passport numbers', () => {
    expect(validatePassportNumber('A12345678')).toBe('');
    expect(validatePassportNumber('P7654321Z')).toBe('');
  });

  it('rejects empty', () => {
    expect(validatePassportNumber('')).toMatch(/required/);
  });

  it('rejects too short / too long', () => {
    expect(validatePassportNumber('A123')).toMatch(/at least 6/);
    expect(validatePassportNumber('A'.repeat(25))).toMatch(/too long/);
  });

  it('rejects non-alphanumeric characters', () => {
    expect(validatePassportNumber('A1234-678')).toMatch(/letters and numbers/);
  });

  it('requires both letters and numbers', () => {
    expect(validatePassportNumber('ABCDEFGH')).toMatch(/both letters and numbers/);
    expect(validatePassportNumber('12345678')).toMatch(/both letters and numbers/);
  });
});

describe('validateAddress', () => {
  it('accepts realistic addresses', () => {
    expect(validateAddress('123 Main Street')).toBe('');
    expect(validateAddress('Flat 4B, Elm Avenue')).toBe('');
  });

  it('rejects empty', () => {
    expect(validateAddress('')).toMatch(/required/);
  });

  it('rejects too short', () => {
    expect(validateAddress('123')).toMatch(/at least 5/);
  });

  it('rejects all-numeric', () => {
    expect(validateAddress('12345')).toMatch(/cannot be only numbers/);
  });
});

describe('validateCityState', () => {
  it('accepts real city names', () => {
    expect(validateCityState('New York')).toBe('');
    expect(validateCityState('São Paulo')).toBe('');
  });

  it('rejects cities with numbers', () => {
    expect(validateCityState('Paris 75')).toMatch(/should not contain numbers/);
  });

  it('rejects gibberish', () => {
    expect(validateCityState('xxxxxx')).not.toBe('');
    expect(validateCityState('zzzzz')).not.toBe('');
  });
});

describe('validateZip', () => {
  it('accepts US / UK / CA postcodes', () => {
    expect(validateZip('90210')).toBe('');
    expect(validateZip('SW1A 1AA')).toBe('');
    expect(validateZip('K1A-0B1')).toBe('');
  });

  it('rejects empty', () => {
    expect(validateZip('')).toMatch(/required/);
  });

  it('rejects too short / too long', () => {
    expect(validateZip('12')).toMatch(/at least 3/);
    expect(validateZip('12345678901')).toMatch(/too long/);
  });

  it('rejects repeated-char spam', () => {
    expect(validateZip('00000')).not.toBe('');
  });
});

describe('validateRequired', () => {
  it('accepts reasonable text', () => {
    expect(validateRequired('Hello')).toBe('');
  });

  it('rejects empty, too short, gibberish', () => {
    expect(validateRequired('')).toMatch(/required/);
    expect(validateRequired('A')).toMatch(/at least 2/);
    expect(validateRequired('xxxx')).not.toBe('');
  });
});

describe('validateId', () => {
  it('treats empty as valid (optional)', () => {
    expect(validateId('')).toBe('');
  });

  it('rejects too short', () => {
    expect(validateId('ab')).toMatch(/at least 3/);
  });

  it('rejects repeated-char spam', () => {
    expect(validateId('aaaaaa')).not.toBe('');
  });

  it('accepts reasonable IDs', () => {
    expect(validateId('ABC-12345')).toBe('');
  });
});
