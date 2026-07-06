/**
 * Side-effect loader for `.env.local` (and `.env`) — for use in tsx
 * scripts that aren't run through Next.js. Next.js auto-loads
 * `.env.local`; Prisma auto-loads `.env`. Nobody auto-loads
 * `.env.local` for raw `npx tsx scripts/foo.ts` invocations, which
 * is exactly the case for our bot server + per-country bots.
 *
 * Zero deps: parses a minimal subset of dotenv syntax (KEY=value,
 * KEY="value", # comment lines, blank lines). Existing process.env
 * keys WIN — we never overwrite something the operator passed in
 * via `BOT_PAYMENT_ENC_KEY=… npx tsx scripts/bot-server.ts`.
 *
 * Usage: `import './lib/loadDotEnv';` at the top of any tsx entry
 * point (bot-server, process-aruba, process-visa). The import side
 * effect populates process.env before anything else reads it.
 */

import fs from 'node:fs';
import path from 'node:path';

function loadFile(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  let added = 0;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes ("…" or '…') if present.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
      added++;
    }
  }
  return added;
}

// Resolve relative to the project root (one level up from /lib).
const projectRoot = path.resolve(__dirname, '..');
// Load order mirrors Next.js precedence: .env.local wins over .env.
// (Both ultimately defer to anything already in process.env.)
const localAdded = loadFile(path.join(projectRoot, '.env.local'));
const baseAdded = loadFile(path.join(projectRoot, '.env'));

// Stay quiet unless explicitly debugging — bot scripts have lots of
// signal-bearing output and we don't want to pollute it.
if (process.env.DOTENV_DEBUG) {
  console.log(`[loadDotEnv] .env.local → ${localAdded} vars, .env → ${baseAdded} vars`);
}
