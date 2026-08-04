/**
 * Customer document storage (passport scans, ID photos, issued e-Visas).
 *
 * ── Why this exists ───────────────────────────────────────────────────
 * Uploads used to be written to `public/uploads/<orderId>/<originalName>`
 * with `fs.writeFile`. That works on a developer's laptop and silently
 * fails in production: Vercel's filesystem is read-only outside /tmp, each
 * request may land on a different container, and Next only serves files
 * from `public/` as they existed at BUILD time — while `public/uploads/`
 * is gitignored, so it is never in the build at all. Net effect: every
 * document uploaded through the live site was lost, and the DB was left
 * pointing at paths that only ever resolved on one machine.
 *
 * Documents now go to Vercel Blob with `access: 'private'`, which means
 * they are NOT reachable by URL — the only way in is through
 * `GET /api/documents/...`, which checks the session first. That matches
 * what the published privacy policy promises customers ("access restricted
 * to authorized employees on a strict need-to-know basis"); the previous
 * scheme served passport bio pages from guessable, unauthenticated,
 * sequential URLs.
 *
 * ── The stored reference ──────────────────────────────────────────────
 * We deliberately store a URL-SHAPED string in the traveler JSON:
 *
 *     /api/documents/orders/00042/photo-a7f3c2e1.jpg
 *      └── route ──────┘ └── blob pathname ───────┘
 *
 * so every existing consumer (`<img src={t.photoUrl}>` in the admin panel
 * and the customer status page) keeps working untouched — the browser
 * simply fetches an authenticated route instead of a static file. Storing
 * a raw blob URL instead would have meant either public blobs or teaching
 * every consumer to mint signed URLs before each render.
 *
 * ── Legacy values ─────────────────────────────────────────────────────
 * Rows written before this change hold `/uploads/<id>/<name>`. Everything
 * here treats that shape as legacy and resolves it from local disk, so
 * old orders keep working on a machine that still has the files. See
 * `scripts/backfill-documents.ts` to migrate them into Blob.
 */

import { put, get, del, list } from '@vercel/blob';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export const DOCUMENTS_ROUTE_PREFIX = '/api/documents/';
export const LEGACY_UPLOADS_PREFIX = '/uploads/';

export type DocumentRef =
  | { kind: 'blob'; pathname: string }
  | { kind: 'legacy'; publicPath: string }
  | { kind: 'unknown'; raw: string };

/**
 * Classify a stored document reference. Both shapes coexist indefinitely —
 * we never rewrite rows implicitly, only via the explicit backfill script.
 */
export function parseDocumentRef(raw: string | null | undefined): DocumentRef {
  const value = (raw ?? '').trim();
  if (!value) return { kind: 'unknown', raw: '' };
  if (value.startsWith(DOCUMENTS_ROUTE_PREFIX)) {
    return { kind: 'blob', pathname: decodeURIComponent(value.slice(DOCUMENTS_ROUTE_PREFIX.length)) };
  }
  if (value.startsWith(LEGACY_UPLOADS_PREFIX)) {
    return { kind: 'legacy', publicPath: value };
  }
  return { kind: 'unknown', raw: value };
}

/** Build the stored reference for a blob pathname. */
export function refForBlobPathname(pathname: string): string {
  // Encode each segment but keep the slashes readable in the DB.
  return DOCUMENTS_ROUTE_PREFIX + pathname.split('/').map(encodeURIComponent).join('/');
}

/**
 * Derive a safe blob pathname. Two problems in the old code this fixes:
 *
 *  1. PATH TRAVERSAL — the old route sanitised `orderId` but then used
 *     `file.name` verbatim, so an upload named `../00042/passport.jpg`
 *     wrote into a different order's folder, replacing a document an
 *     admin had already approved. We take only the basename and strip
 *     everything that isn't a safe character.
 *  2. COLLISIONS — the old route used the customer's original filename
 *     as-is, so two travelers on one order who both uploaded `IMG_0042.jpg`
 *     (the iPhone default) silently overwrote each other, leaving both
 *     traveler records pointing at one image. A random suffix makes
 *     collisions impossible.
 */
export function buildBlobPathname(orderId: string, type: string, originalName: string): string {
  const safeOrder = orderId.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 64) || 'unknown';
  const safeType = type.replace(/[^a-z]/gi, '').toLowerCase().slice(0, 16) || 'file';

  const base = path.basename(originalName || '');
  const ext = (base.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const suffix = randomBytes(4).toString('hex');

  return `orders/${safeOrder}/${safeType}-${suffix}${ext ? '.' + ext : ''}`;
}

/** True when Blob is configured. Lets callers fail with a clear message. */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Store a document and return the reference to persist on the traveler.
 * Throws if Blob isn't configured — silently falling back to local disk is
 * what caused the original data loss, so we surface it instead.
 */
export async function storeDocument(
  orderId: string,
  type: string,
  originalName: string,
  body: Buffer,
  contentType: string,
): Promise<{ ref: string; pathname: string }> {
  if (!isBlobConfigured()) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is not set. Create a Blob store in the Vercel dashboard ' +
      '(Storage → Create → Blob) and add the token to the project env + .env.local.',
    );
  }
  const pathname = buildBlobPathname(orderId, type, originalName);
  const result = await put(pathname, body, {
    access: 'private',
    contentType,
    // We already add our own random suffix and want the pathname we
    // computed to be exactly what's stored, so the DB ref stays stable.
    addRandomSuffix: false,
  });
  return { ref: refForBlobPathname(result.pathname), pathname: result.pathname };
}

/**
 * Open a document for streaming to an ALREADY-AUTHORISED caller.
 * Returns null when the blob is missing. Callers must do their own
 * authorisation — this function intentionally performs none.
 */
export async function openDocumentStream(pathname: string) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200) return null;
  return result;
}

/** Best-effort delete. Never throws — used on cleanup paths. */
export async function deleteDocument(pathname: string): Promise<void> {
  try { await del(pathname); } catch { /* non-fatal */ }
}

/**
 * Newest document for an order whose extension is in `extensions`.
 *
 * This preserves a heuristic the Aruba bot relied on when documents were
 * files on disk: it scanned the order's upload DIRECTORY and picked the
 * most recently modified image rather than trusting the stored reference,
 * which handles three real cases —
 *   1. customer re-uploaded (stored ref updated — exact ref would do)
 *   2. an admin replaced `passportBioUrl` but not `passportFile`, so the
 *      traveler's own field is stale
 *   3. customer uploaded a PDF first, then an image; Aruba's form rejects
 *      PDFs, so the bot must pick the image
 * Cases 2 and 3 would regress if we only ever resolved the exact ref, so
 * we reproduce the scan against the blob prefix instead.
 *
 * Returns the newest matching blob pathname, or null.
 */
export async function findNewestOrderDocument(
  orderId: string,
  extensions: string[],
): Promise<string | null> {
  if (!isBlobConfigured()) return null;
  const safeOrder = orderId.replace(/[^a-zA-Z0-9\-_]/g, '');
  if (!safeOrder) return null;
  const wanted = new Set(extensions.map(e => e.toLowerCase().replace(/^\./, '')));
  try {
    const { blobs } = await list({ prefix: `orders/${safeOrder}/`, limit: 1000 });
    const matches = blobs
      .filter(b => wanted.has((b.pathname.split('.').pop() || '').toLowerCase()))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    return matches[0]?.pathname ?? null;
  } catch {
    return null;
  }
}

/** Order segment of a blob pathname (`orders/<orderId>/…`), if present. */
export function orderIdFromBlobPathname(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  return parts.length >= 3 && parts[0] === 'orders' ? parts[1] : null;
}

/**
 * Resolve a stored reference to a real file on local disk, downloading
 * from Blob when necessary. This exists for the Playwright bots, which
 * need a filesystem path to hand to `setInputFiles`.
 *
 * Legacy `/uploads/...` refs resolve against `public/` exactly as before,
 * so a machine that still holds those files keeps working unchanged.
 *
 * Returns null when the document can't be resolved. Temp files are written
 * under the OS temp dir; callers may delete them but don't have to.
 */
export async function resolveDocumentToLocalFile(
  raw: string | null | undefined,
  opts?: { projectRoot?: string },
): Promise<string | null> {
  const ref = parseDocumentRef(raw);
  const root = opts?.projectRoot ?? process.cwd();

  if (ref.kind === 'legacy') {
    const local = path.join(root, 'public', ref.publicPath.replace(/^\//, ''));
    return fs.existsSync(local) ? local : null;
  }

  if (ref.kind === 'unknown') {
    // Could be an absolute path an admin pasted into a bot override.
    if (ref.raw.startsWith('/') && fs.existsSync(ref.raw)) return ref.raw;
    const asPublic = path.join(root, 'public', ref.raw.replace(/^\//, ''));
    return fs.existsSync(asPublic) ? asPublic : null;
  }

  // Blob — download to a temp file.
  try {
    const result = await openDocumentStream(ref.pathname);
    if (!result) return null;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visatrips-doc-'));
    const dest = path.join(dir, path.basename(ref.pathname));
    const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
    fs.writeFileSync(dest, buf);
    return dest;
  } catch {
    return null;
  }
}
