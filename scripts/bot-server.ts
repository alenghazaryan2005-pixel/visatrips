/**
 * VisaTrips Bot Server
 *
 * Runs locally alongside pnpm dev.
 * Listens for requests from the admin panel to process visa applications.
 *
 * Usage: npx tsx scripts/bot-server.ts
 */

// Side-effect import: populates process.env from .env.local + .env
// before anything below reads BOT_PAYMENT_ENC_KEY or other secrets.
// Must stay at the very top of the import list.
import '../lib/loadDotEnv';
import http from 'http';
import { exec, ChildProcess } from 'child_process';
import path from 'path';
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';

const PORT = 3001;
const projectDir = path.resolve(__dirname, '..');

// Per-destination bot script. Default is India's process-visa.ts (the
// original / oldest entry point — kept as the fallback so any new
// country routes through it until we add a dedicated bot). Add a row
// here when a new country gets its own bot script.
const BOT_SCRIPTS: Record<string, string> = {
  india: 'scripts/process-visa.ts',
  aruba: 'scripts/process-aruba.ts',
};

// Prisma instance is reused across requests — opening a fresh client
// per /process request would leak Postgres connections under load.
const prisma = new PrismaClient();

// Track the currently running bot process so we can kill it before starting a new one
let currentBot: ChildProcess | null = null;

/**
 * Kill the currently running bot + its browser cleanly.
 *
 * Strategy:
 *   1. SIGTERM the bot's process group → bot's signal handler calls
 *      `browser.close()`, which Chrome interprets correctly and shuts down
 *      its renderer/GPU/utility subprocesses with it.
 *   2. Wait up to 2 s for the bot to exit on its own.
 *   3. If still alive, SIGKILL the process group + run a pkill sweep that
 *      matches Playwright's Chrome (NOT just "Chromium" — the bot uses
 *      `channel: 'chrome'` which spawns the system Google Chrome binary,
 *      identifiable by the `--remote-debugging-pipe` flag Playwright always
 *      passes and `--enable-automation`).
 */
function killCurrentBot(): Promise<void> {
  return new Promise((resolve) => {
    if (!currentBot || currentBot.exitCode !== null) {
      currentBot = null;
      return resolve();
    }
    const pid = currentBot.pid;
    console.log(`\n⛔ Stopping bot process (PID ${pid})...`);

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      currentBot = null;
      // Sweep any orphan Chrome instances Playwright spawned. Match by the
      // flags Playwright always sets so we don't kill the user's normal
      // Chrome browser.
      exec(
        'pkill -9 -f "Google Chrome.*--remote-debugging-pipe" 2>/dev/null; ' +
        'pkill -9 -f "Google Chrome.*--enable-automation" 2>/dev/null; ' +
        // Match every per-country bot script we ship — process-visa
        // (India), process-aruba (Aruba), and any future process-*
        // siblings. Without the wildcard, /stop would only kill the
        // India bot and leave a runaway Aruba bot behind.
        'pkill -9 -f "tsx scripts/process-" 2>/dev/null',
        () => setTimeout(resolve, 300),
      );
    };

    // Listen for clean exit so we can resolve as soon as it happens.
    currentBot.once('exit', () => { console.log('   ✓ bot exited cleanly'); cleanup(); });

    // Phase 1 — graceful: SIGTERM the process group so the bot's signal
    // handler closes Playwright's browser before exiting.
    try { if (pid) process.kill(-pid, 'SIGTERM'); } catch {}
    try { currentBot.kill('SIGTERM'); } catch {}

    // Phase 2 — escalate to SIGKILL if the bot didn't exit within 2 s.
    setTimeout(() => {
      if (done) return;
      console.log('   ⚠️  bot did not exit on SIGTERM — escalating to SIGKILL');
      try { if (pid) process.kill(-pid, 'SIGKILL'); } catch {}
      try { currentBot?.kill('SIGKILL'); } catch {}
      cleanup();
    }, 2000);
  });
}

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/process') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { orderNumber, travelerIndex } = JSON.parse(body);
        if (!orderNumber) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'orderNumber is required' }));
          return;
        }

        // Look up the order to find which country bot to dispatch to.
        // We accept formatted numbers (e.g. "00037") as well as the raw
        // number, so strip non-digits for the lookup.
        const numeric = parseInt(String(orderNumber).replace(/[^0-9]/g, ''), 10);
        if (!numeric || isNaN(numeric)) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid orderNumber' }));
          return;
        }
        const order = await prisma.order.findFirst({ where: { orderNumber: numeric } });
        if (!order) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: `Order #${orderNumber} not found` }));
          return;
        }

        const dest = (order.destination || 'India').toLowerCase();
        const script = BOT_SCRIPTS[dest] || BOT_SCRIPTS.india;

        // Optional traveler index — currently only used by the India
        // bot, where each traveler on a multi-applicant order needs
        // its own full Step 1–11 flow with its own payment. Aruba
        // handles multi-traveler inside a single application, so it
        // ignores this arg. Validated as non-negative integer if
        // provided; when omitted the bot script defaults to
        // travelers[0] (single-traveler orders).
        let tIdxArg = '';
        if (travelerIndex !== undefined && travelerIndex !== null) {
          const tIdx = Number(travelerIndex);
          if (!Number.isInteger(tIdx) || tIdx < 0) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'travelerIndex must be a non-negative integer' }));
            return;
          }
          tIdxArg = ` ${tIdx}`;
        }

        // Kill any running bot first
        await killCurrentBot();

        const humanIdx = tIdxArg ? ` (traveler #${Number(tIdxArg.trim()) + 1})` : '';
        console.log(`\n🚀 Processing order #${orderNumber}${humanIdx} (${order.destination}) → ${script}...`);

        // Launch the bot in a new process group so we can kill the whole tree
        const child = exec(
          `npx tsx ${script} ${orderNumber}${tIdxArg}`,
          { cwd: projectDir, detached: true } as any,
          (error, stdout, stderr) => {
            if (error && error.signal !== 'SIGKILL') console.error('Bot error:', error.message);
            if (stdout) console.log(stdout);
            if (stderr) console.error(stderr);
          }
        );

        currentBot = child;
        child.on('exit', () => { if (currentBot === child) currentBot = null; });

        child.stdout?.pipe(process.stdout);
        child.stderr?.pipe(process.stderr);

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: `Bot launched for order #${orderNumber} (${order.destination})` }));
      } catch (err: any) {
        console.error('Process request failed:', err?.message || err);
        res.writeHead(400);
        res.end(JSON.stringify({ error: err?.message || 'Invalid request' }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/stop') {
    // New endpoint to explicitly stop the running bot
    killCurrentBot().then(() => {
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Bot stopped' }));
    });
  } else if (req.method === 'POST' && req.url === '/test-selector') {
    // Validate a gov-site CSS selector against the live India eVisa Step 1 registration page.
    // Launches a fresh headless Chromium, navigates, checks if the selector resolves to any
    // element, and returns whether it found something + basic info.
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let browser: any = null;
      try {
        const { selector, url } = JSON.parse(body);
        if (!selector || typeof selector !== 'string') {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'selector is required' }));
          return;
        }
        // Reject selectors we can't test statically (positional placeholders from the catalog).
        if (/^(Input|Select|Textarea)\[\d+\]/.test(selector.trim())) {
          res.writeHead(200);
          res.end(JSON.stringify({
            ok: false,
            skipped: true,
            reason: 'Positional selectors (e.g. "Input[0]") can only be validated during a full bot run — not via a static test.',
          }));
          return;
        }

        const testUrl = url || 'https://indianvisaonline.gov.in/evisa/Registration';
        console.log(`\n🔍 Testing selector: ${selector}`);

        const startedAt = Date.now();
        browser = await chromium.launch({ headless: true });
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(testUrl, { timeout: 25_000, waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 1500));

        // The gov site shows an intro popup BEFORE the Step 1 form renders.
        // Mirror the bot's flow: Tab 34 times, then Enter to click "Apply Here for E-Visa".
        // Without this, no Step 1 field selectors will ever resolve on the initial page.
        let dismissedPopup = false;
        try {
          for (let i = 0; i < 34; i++) {
            await page.keyboard.press('Tab');
            await new Promise(r => setTimeout(r, 40));
          }
          await page.keyboard.press('Enter');
          // Wait for the registration form to appear
          await page.waitForSelector('#nationality_id', { timeout: 20_000, state: 'visible' }).catch(() => {});
          await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
          dismissedPopup = true;
        } catch {}

        let info: any = null;
        let found = false;
        let error: string | null = null;
        try {
          const el = await page.$(selector);
          if (el) {
            found = true;
            info = await el.evaluate((e: Element) => {
              const htmlE = e as HTMLElement;
              return {
                tag: htmlE.tagName,
                id: (htmlE as any).id || null,
                name: (htmlE as any).name || null,
                type: (htmlE as any).type || null,
                visible: !!(htmlE.offsetParent !== null),
              };
            });
          }
        } catch (e: any) {
          error = e?.message || 'evaluation error';
        }

        await browser.close();
        browser = null;

        const elapsedMs = Date.now() - startedAt;
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: found,
          selector,
          url: testUrl,
          elapsedMs,
          info,
          error,
          note: found
            ? 'Selector resolved on the Step 1 registration form.'
            : dismissedPopup
              ? 'Selector did not match on Step 1. This is expected for later-step selectors — gov site requires CAPTCHA to progress past Step 1.'
              : 'Could not dismiss the intro popup — gov site may be slow or have changed. Selector could not be validated.',
        }));
      } catch (err: any) {
        if (browser) { try { await browser.close(); } catch {} }
        res.writeHead(500);
        res.end(JSON.stringify({ error: err?.message || 'test failed' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Friendly error on port-already-in-use (a zombie bot-server from a
// crashed previous run is the most common cause). Without this the
// raw Node EADDRINUSE stack trace fires and looks alarming.
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n⛔ Port ${PORT} is already in use — another bot-server (or some other process) is listening on it.`);
    console.error(`   Free it up:`);
    console.error(`     pkill -f "tsx scripts/bot-server" ; pkill -f "tsx scripts/process-"`);
    console.error(`   …then start this again.\n`);
    process.exit(1);
  }
  console.error('\n⛔ Bot server failed:', err.message);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n🤖 VisaTrips Bot Server running on http://localhost:${PORT}`);
  console.log(`   Send POST to http://localhost:${PORT}/process with { "orderNumber": "00001" }`);
  console.log(`   Waiting for requests...\n`);
});
