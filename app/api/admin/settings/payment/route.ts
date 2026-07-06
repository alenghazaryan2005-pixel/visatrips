/**
 * Admin-only API for the bot's saved credit card.
 *
 * Endpoints:
 *   GET  → masked view (cardholder, last4, expiry, last-updated).
 *          Plaintext PAN/CVV are NEVER returned.
 *   POST → save / replace the stored card. Body accepts the full
 *          card details; encryption happens server-side in
 *          `cardVault.saveCard()`. Caller must be owner-level.
 *   DELETE → clear the stored card.
 *
 * The plaintext PAN + CVV are read ONLY by the bot scripts via
 * `getDecryptedCard()`, never through any HTTP route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, isErrorResponse } from '@/lib/auth';
import { getStoredCard, maskCard, saveCard, deleteCard } from '@/lib/cardVault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  try {
    const stored = await getStoredCard();
    return NextResponse.json({ card: maskCard(stored) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to read vault' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  const admin = auth;
  try {
    const body = await req.json();
    const required = ['cardholderName', 'cardNumber', 'expirationMonth', 'expirationYear', 'cvv'];
    for (const k of required) {
      if (typeof body?.[k] !== 'string' || !body[k].trim()) {
        return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
      }
    }
    const stored = await saveCard({
      cardholderName:   body.cardholderName,
      cardNumber:       body.cardNumber,
      expirationMonth:  body.expirationMonth,
      expirationYear:   body.expirationYear,
      cvv:              body.cvv,
      note:             typeof body.note === 'string' ? body.note : undefined,
      updatedBy:        admin.name,
    });
    return NextResponse.json({ card: maskCard(stored) });
  } catch (err: any) {
    // Validation + env errors come through here. Don't leak stack
    // traces — just the message (which is admin-only audience anyway).
    return NextResponse.json({ error: err?.message || 'Failed to save card' }, { status: 400 });
  }
}

export async function DELETE() {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;
  try {
    await deleteCard();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete card' }, { status: 500 });
  }
}
