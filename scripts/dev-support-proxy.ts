/**
 * Dev-only reverse proxy that simulates support.visatrips.com locally.
 *
 * Listens on http://localhost:3002 and forwards every request to the
 * Next dev server on :3000 with the Host header rewritten to
 * support.localhost. Middleware.ts sees that host and applies the
 * CRM subdomain rewrites (`/tickets` → `/admin/crm`, etc.), so the
 * dev workflow becomes:
 *
 *   Terminal 1:  pnpm dev                          # primary site (:3000)
 *   Terminal 2:  pnpm tsx scripts/dev-support-proxy.ts  # CRM (:3002)
 *   Browser:     http://localhost:3002/tickets     # rendered CRM
 *
 * Handles WebSocket upgrades too so Turbopack / Next HMR still hot-
 * reloads through the proxy — otherwise every edit would need a full
 * page refresh in the CRM tab.
 */

import http from 'node:http';

const TARGET_HOST   = '127.0.0.1';
const TARGET_PORT   = 3000;
const PROXY_PORT    = 3002;
const FORWARD_HOST  = 'support.localhost';

const server = http.createServer((req, res) => {
  const proxyReq = http.request({
    hostname: TARGET_HOST,
    port:     TARGET_PORT,
    path:     req.url,
    method:   req.method,
    headers:  { ...req.headers, host: FORWARD_HOST },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    console.error('[dev-support-proxy] upstream error:', err.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`Upstream (:${TARGET_PORT}) not responding — is 'pnpm dev' running?`);
  });
  req.pipe(proxyReq);
});

// Turbopack / Next HMR uses WebSockets. Without this handler, edits
// would require a full page refresh in the CRM tab.
server.on('upgrade', (req, clientSocket, head) => {
  const proxyReq = http.request({
    hostname: TARGET_HOST,
    port:     TARGET_PORT,
    path:     req.url,
    method:   req.method,
    headers:  { ...req.headers, host: FORWARD_HOST },
  });
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    // Replay the 101 Switching Protocols response to the client.
    const headerLines = Object.entries(proxyRes.headers).flatMap(([k, v]) =>
      Array.isArray(v) ? v.map(vv => `${k}: ${vv}`) : v != null ? [`${k}: ${v}`] : []
    );
    clientSocket.write(`HTTP/1.1 101 Switching Protocols\r\n${headerLines.join('\r\n')}\r\n\r\n`);
    if (proxyHead.length) proxySocket.write(proxyHead);
    if (head.length)      proxySocket.write(head);
    proxySocket.pipe(clientSocket);
    clientSocket.pipe(proxySocket);
    proxySocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => proxySocket.destroy());
  });
  proxyReq.on('error', () => clientSocket.destroy());
  proxyReq.end();
});

server.listen(PROXY_PORT, () => {
  console.log(`🎫 CRM dev proxy → http://localhost:${PROXY_PORT}  (forwards to :${TARGET_PORT} with Host: ${FORWARD_HOST})`);
  console.log(`   Try:  http://localhost:${PROXY_PORT}/tickets`);
});
