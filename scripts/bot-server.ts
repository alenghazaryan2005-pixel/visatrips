/**
 * VisaTrips Bot Server
 *
 * Runs locally alongside pnpm dev.
 * Listens for requests from the admin panel to process visa applications.
 *
 * Usage: npx tsx scripts/bot-server.ts
 */

import http from 'http';
import { exec, ChildProcess } from 'child_process';
import path from 'path';

const PORT = 3001;
const projectDir = path.resolve(__dirname, '..');

// Track the currently running bot process so we can kill it before starting a new one
let currentBot: ChildProcess | null = null;

function killCurrentBot(): Promise<void> {
  return new Promise((resolve) => {
    if (!currentBot || currentBot.exitCode !== null) {
      currentBot = null;
      return resolve();
    }
    console.log(`\n⛔ Killing previous bot process (PID ${currentBot.pid})...`);
    const pid = currentBot.pid;
    // Kill process tree — the Chromium child of tsx also needs to die
    try {
      if (pid) {
        // On macOS/Linux, kill the entire process group
        process.kill(-pid, 'SIGKILL');
      }
    } catch {}
    // Also try direct kill as fallback
    try { currentBot.kill('SIGKILL'); } catch {}
    // As a last resort, kill any lingering Chromium processes spawned by Playwright
    exec(`pkill -9 -f "tsx scripts/process-visa" 2>/dev/null; pkill -9 -f "Chromium.*--remote-debugging" 2>/dev/null`, () => {
      currentBot = null;
      setTimeout(resolve, 500); // brief delay to let processes fully die
    });
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
        const { orderNumber } = JSON.parse(body);
        if (!orderNumber) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'orderNumber is required' }));
          return;
        }

        // Kill any running bot first
        await killCurrentBot();

        console.log(`\n🚀 Processing order #${orderNumber}...`);

        // Launch the bot in a new process group so we can kill the whole tree
        const child = exec(
          `npx tsx scripts/process-visa.ts ${orderNumber}`,
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
        res.end(JSON.stringify({ success: true, message: `Bot launched for order #${orderNumber}` }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/stop') {
    // New endpoint to explicitly stop the running bot
    killCurrentBot().then(() => {
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Bot stopped' }));
    });
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🤖 VisaTrips Bot Server running on http://localhost:${PORT}`);
  console.log(`   Send POST to http://localhost:${PORT}/process with { "orderNumber": "00001" }`);
  console.log(`   Waiting for requests...\n`);
});
