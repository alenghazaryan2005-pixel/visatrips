/**
 * One-off migration: move legacy on-disk documents into private Blob storage
 * and rewrite the traveler JSON to point at them.
 *
 * WHY
 * Documents used to be written to `public/uploads/<orderId>/<name>` and the
 * traveler JSON stored `/uploads/...`. That path only ever resolved on the
 * machine that received the upload — on Vercel the write either failed or
 * landed in an ephemeral container, and `public/` is only served as built.
 * So production 404s on every one of those URLs while the files sit on a
 * single laptop. This lifts whatever that laptop still has into Blob.
 *
 * USAGE
 *   pnpm tsx scripts/backfill-documents.ts            # dry run (default)
 *   pnpm tsx scripts/backfill-documents.ts --apply    # actually migrate
 *
 * Requires BLOB_READ_WRITE_TOKEN. Safe to re-run: refs already pointing at
 * /api/documents/ are skipped, so a partial run can simply be repeated.
 *
 * The DB write is per-order and only happens after every file for that order
 * uploaded successfully, so a failure mid-way leaves that order untouched
 * rather than half-rewritten.
 */

import '../lib/loadDotEnv';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseDocumentRef,
  storeDocument,
  isBlobConfigured,
} from '../lib/documents';

const prisma = new PrismaClient();

/** Traveler keys that hold a document reference. */
const DOC_KEYS = ['photoUrl', 'passportBioUrl', 'passportFile', 'evisaUrl'] as const;

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', pdf: 'application/pdf', gif: 'image/gif', heic: 'image/heic',
};

function contentTypeFor(file: string): string {
  const ext = (file.split('.').pop() || '').toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

async function main() {
  const apply = process.argv.includes('--apply');
  const projectRoot = path.resolve(__dirname, '..');

  console.log(apply ? '🚚 APPLY mode — will upload and rewrite the DB\n' : '🔍 DRY RUN — nothing will be changed. Pass --apply to migrate.\n');

  if (apply && !isBlobConfigured()) {
    console.error('❌ BLOB_READ_WRITE_TOKEN is not set.');
    console.error('   Create a Blob store in the Vercel dashboard (Storage → Create → Blob),');
    console.error('   then add the token to .env.local before running with --apply.');
    process.exit(1);
  }

  const orders = await prisma.order.findMany({
    select: { id: true, orderNumber: true, travelers: true },
    orderBy: { orderNumber: 'asc' },
  });

  let scanned = 0, migrated = 0, missing = 0, skipped = 0, failed = 0;

  for (const order of orders) {
    let travelers: any[];
    try {
      travelers = JSON.parse(order.travelers);
      if (!Array.isArray(travelers)) continue;
    } catch { continue; }

    const orderLabel = String(order.orderNumber).padStart(5, '0');
    let orderChanged = false;
    let orderFailed = false;

    for (const traveler of travelers) {
      if (!traveler || typeof traveler !== 'object') continue;

      for (const key of DOC_KEYS) {
        const raw = traveler[key];
        if (!raw || typeof raw !== 'string') continue;
        scanned++;

        const ref = parseDocumentRef(raw);
        if (ref.kind === 'blob') { skipped++; continue; }

        // Resolve to a real file on this machine.
        const rel = ref.kind === 'legacy' ? ref.publicPath : raw;
        const local = path.join(projectRoot, 'public', rel.replace(/^\//, ''));
        const decoded = decodeURIComponent(local);
        const onDisk = fs.existsSync(local) ? local : (fs.existsSync(decoded) ? decoded : null);

        if (!onDisk) {
          console.log(`  ⚠️  #${orderLabel} ${key}: file not on this machine — ${rel}`);
          missing++;
          continue;
        }

        if (!apply) {
          console.log(`  → #${orderLabel} ${key}: would migrate ${path.basename(onDisk)} (${Math.round(fs.statSync(onDisk).size / 1024)} KB)`);
          migrated++;
          continue;
        }

        try {
          const buf = fs.readFileSync(onDisk);
          const { ref: newRef } = await storeDocument(
            orderLabel, key.replace(/Url$|File$/, ''), path.basename(onDisk), buf, contentTypeFor(onDisk),
          );
          traveler[key] = newRef;
          orderChanged = true;
          migrated++;
          console.log(`  ✅ #${orderLabel} ${key}: ${path.basename(onDisk)} → ${newRef}`);
        } catch (e: any) {
          console.error(`  ❌ #${orderLabel} ${key}: ${e?.message || e}`);
          failed++;
          orderFailed = true;
        }
      }
    }

    // Only persist when every file for this order succeeded — avoids leaving
    // an order half-pointing at Blob and half at paths that don't resolve.
    if (apply && orderChanged && !orderFailed) {
      await prisma.order.update({
        where: { id: order.id },
        data: { travelers: JSON.stringify(travelers) },
      });
      console.log(`  💾 #${orderLabel} traveler JSON updated`);
    } else if (apply && orderChanged && orderFailed) {
      console.log(`  ⏭️  #${orderLabel} NOT updated — at least one file failed; re-run to retry`);
    }
  }

  console.log('\n──────── summary ────────');
  console.log(`  refs scanned:        ${scanned}`);
  console.log(`  already in Blob:     ${skipped}`);
  console.log(apply ? `  migrated:            ${migrated}` : `  would migrate:       ${migrated}`);
  console.log(`  file not on disk:    ${missing}`);
  console.log(`  failed:              ${failed}`);
  if (!apply && migrated > 0) console.log('\n  Re-run with --apply to perform the migration.');
  if (missing > 0) console.log('\n  Note: "not on disk" refs point at files no machine here has.');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
