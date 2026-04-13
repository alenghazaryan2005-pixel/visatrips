/**
 * VisaTrips Bot Server
 *
 * Runs locally alongside pnpm dev.
 * Listens for requests from the admin panel to process visa applications.
 *
 * Usage: npx tsx scripts/bot-server.ts
 */

import http from 'http';
import { exec } from 'child_process';
import path from 'path';

const PORT = 3001;
const projectDir = path.resolve(__dirname, '..');

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
    req.on('end', () => {
      try {
        const { orderNumber } = JSON.parse(body);
        if (!orderNumber) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'orderNumber is required' }));
          return;
        }

        console.log(`\n🚀 Processing order #${orderNumber}...`);

        // Launch the bot in a separate process
        const child = exec(
          `npx tsx scripts/process-visa.ts ${orderNumber}`,
          { cwd: projectDir },
          (error, stdout, stderr) => {
            if (error) console.error('Bot error:', error.message);
            if (stdout) console.log(stdout);
            if (stderr) console.error(stderr);
          }
        );

        child.stdout?.pipe(process.stdout);
        child.stderr?.pipe(process.stderr);

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: `Bot launched for order #${orderNumber}` }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
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
