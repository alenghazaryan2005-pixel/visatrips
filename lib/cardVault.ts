/**
 * Encrypted credit-card vault for the bot.
 *
 * Stores the company card that the Playwright bot fills onto gov visa
 * application sites (Aruba ED Card, India eVisa). Saved as a Setting
 * row keyed `bot.payment.creditCard`. The full card number and CVV
 * are encrypted at rest with AES-256-GCM; only `last4` and the
 * expiration date are stored in plaintext.
 *
 * Encryption key MUST be provided via env var BOT_PAYMENT_ENC_KEY
 * (32-byte key, hex- or base64-encoded). Without it:
 *   - `encrypt()` throws so we never persist plaintext by accident.
 *   - `decrypt()` throws so a misconfigured deployment can't
 *     accidentally leak whatever it can read.
 *
 * ⚠️  COMPLIANCE NOTE
 * PCI-DSS forbids storing CVV/CVC even encrypted. Building this
 * was a deliberate trade-off — the user is automating their OWN
 * company card for their own visa-purchasing workflow, not handling
 * cardholder data on behalf of third parties. If this product ever
 * expands to handle customer cards, REMOVE THIS VAULT and switch
 * to a tokenised vault provider (Stripe / Adyen / Spreedly).
 */

import * as crypto from 'node:crypto';
import { prisma } from './prisma';

const SETTING_KEY = 'bot.payment.creditCard';
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;       // 96-bit IV, GCM-recommended
const TAG_LEN = 16;      // 128-bit auth tag
const KEY_LEN = 32;      // 256-bit key

export interface StoredCard {
  /** Name as printed on the card. Stored plaintext (not sensitive on its own). */
  cardholderName: string;
  /** AES-GCM ciphertext of the full PAN. Base64 of `iv || cipher || tag`. */
  encryptedNumber: string;
  /** Last 4 digits of PAN. Plaintext — used for masked display. */
  last4: string;
  /** Two-digit month "01"–"12". Plaintext — not sensitive without PAN. */
  expirationMonth: string;
  /** Four-digit year "2025"+. Plaintext. */
  expirationYear: string;
  /** AES-GCM ciphertext of CVV. Same format as encryptedNumber. */
  encryptedCvv: string;
  /** ISO timestamp of last save — for the admin UI's "last updated". */
  updatedAt: string;
  /** Free-form note ("Express Visa LLC Amex", etc.). Plaintext. */
  note?: string;
}

export interface DecryptedCard extends Omit<StoredCard, 'encryptedNumber' | 'encryptedCvv'> {
  /** Full PAN — only exists transiently in the bot process while typing. */
  cardNumber: string;
  /** CVV / security code — only exists transiently. */
  cvv: string;
}

/**
 * Load the raw 32-byte encryption key from env. Throws if missing
 * or wrong length — fail loud rather than fall back to a hardcoded
 * default that defeats the whole point.
 */
function getKey(): Buffer {
  const raw = process.env.BOT_PAYMENT_ENC_KEY;
  if (!raw) {
    throw new Error(
      'BOT_PAYMENT_ENC_KEY is not set. Generate one with: ' +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
      'and add it to .env.local.',
    );
  }
  // Accept hex (64 chars) or base64 (44 chars with padding).
  let key: Buffer;
  if (/^[a-f0-9]+$/i.test(raw) && raw.length === KEY_LEN * 2) {
    key = Buffer.from(raw, 'hex');
  } else {
    try { key = Buffer.from(raw, 'base64'); } catch { key = Buffer.alloc(0); }
  }
  if (key.length !== KEY_LEN) {
    throw new Error(`BOT_PAYMENT_ENC_KEY must decode to ${KEY_LEN} bytes — got ${key.length}.`);
  }
  return key;
}

/** Encrypt a string (e.g. PAN, CVV). Returns base64(iv || cipher || tag). */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString('base64');
}

/** Decrypt a previously-encrypted blob. Throws on tampering / wrong key. */
export function decrypt(blob: string): string {
  if (!blob) return '';
  const key = getKey();
  const data = Buffer.from(blob, 'base64');
  if (data.length < IV_LEN + TAG_LEN) {
    throw new Error('Ciphertext too short — vault entry is corrupted.');
  }
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(data.length - TAG_LEN);
  const enc = data.subarray(IV_LEN, data.length - TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

/**
 * Save a card to the vault. Pass the plaintext PAN and CVV — they
 * get encrypted here, not in the caller.
 */
export async function saveCard(input: {
  cardholderName: string;
  cardNumber: string;          // full PAN, no spaces
  expirationMonth: string;     // "01"–"12"
  expirationYear: string;      // "2025"+
  cvv: string;
  note?: string;
  updatedBy?: string;
}): Promise<StoredCard> {
  const cleanPan = input.cardNumber.replace(/\D/g, '');
  if (cleanPan.length < 13 || cleanPan.length > 19) {
    throw new Error(`Card number must be 13–19 digits — got ${cleanPan.length}.`);
  }
  const cleanCvv = input.cvv.replace(/\D/g, '');
  if (cleanCvv.length < 3 || cleanCvv.length > 4) {
    throw new Error(`CVV must be 3 or 4 digits — got ${cleanCvv.length}.`);
  }
  const month = String(input.expirationMonth).padStart(2, '0');
  if (!/^(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(`Expiration month must be 01–12 — got "${input.expirationMonth}".`);
  }
  const year = String(input.expirationYear);
  if (!/^\d{4}$/.test(year)) {
    throw new Error(`Expiration year must be 4 digits — got "${input.expirationYear}".`);
  }
  const stored: StoredCard = {
    cardholderName: (input.cardholderName || '').trim(),
    encryptedNumber: encrypt(cleanPan),
    last4: cleanPan.slice(-4),
    expirationMonth: month,
    expirationYear: year,
    encryptedCvv: encrypt(cleanCvv),
    updatedAt: new Date().toISOString(),
    note: input.note?.trim() || undefined,
  };
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: {
      key: SETTING_KEY,
      category: 'payment',
      value: JSON.stringify(stored),
      updatedBy: input.updatedBy,
    },
    update: {
      value: JSON.stringify(stored),
      updatedBy: input.updatedBy,
    },
  });
  return stored;
}

/**
 * Load the card record (with encrypted blobs still encrypted). Returns
 * null if no card is stored. Safe to call from any admin context;
 * `getDecryptedCard()` is the one that actually decrypts.
 */
export async function getStoredCard(): Promise<StoredCard | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
    if (!row) return null;
    return JSON.parse(row.value) as StoredCard;
  } catch {
    return null;
  }
}

/**
 * Load the card AND decrypt the sensitive bits. Bot-only path —
 * never expose this through any HTTP route. Throws if no card is
 * stored or the encryption key is misconfigured.
 */
export async function getDecryptedCard(): Promise<DecryptedCard | null> {
  const stored = await getStoredCard();
  if (!stored) return null;
  return {
    cardholderName: stored.cardholderName,
    cardNumber: decrypt(stored.encryptedNumber),
    last4: stored.last4,
    expirationMonth: stored.expirationMonth,
    expirationYear: stored.expirationYear,
    cvv: decrypt(stored.encryptedCvv),
    updatedAt: stored.updatedAt,
    note: stored.note,
  };
}

/**
 * Public-safe view: masks the PAN as `**** **** **** 1234`. Used by
 * admin UI so the form can show what's currently saved without ever
 * roundtripping the full number.
 */
export function maskCard(stored: StoredCard | null): {
  cardholderName: string;
  maskedNumber: string;
  last4: string;
  expirationMonth: string;
  expirationYear: string;
  updatedAt: string;
  note?: string;
} | null {
  if (!stored) return null;
  return {
    cardholderName: stored.cardholderName,
    maskedNumber: `•••• •••• •••• ${stored.last4}`,
    last4: stored.last4,
    expirationMonth: stored.expirationMonth,
    expirationYear: stored.expirationYear,
    updatedAt: stored.updatedAt,
    note: stored.note,
  };
}

/** Delete the stored card. */
export async function deleteCard(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: SETTING_KEY } });
}
