// Static server for the repo root on 127.0.0.1:4317 (IMPL-PLAN §2.3).
// `virtual` lets the selftest serve in-memory fixture pages under /__selftest/ without touching app files.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO } from './lib/figma.mjs';

export const HOST = '127.0.0.1', PORT = 4317, ORIGIN = `http://${HOST}:${PORT}`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

export function startServer({ root = REPO, virtual = new Map(), port = PORT } = {}) {
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, ORIGIN).pathname); } catch { res.writeHead(400).end(); return; }
    if (virtual.has(p)) { res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(virtual.get(p)); return; }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root + path.sep) && f !== root) { res.writeHead(403).end(); return; }
    fs.readFile(f, (err, buf) => {
      // Chrome fetches /favicon.ico on its own; that is not a page error, so answer 204 when the repo has none.
      if (err && p === '/favicon.ico') { res.writeHead(204).end(); return; }
      if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }).end(buf);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => resolve({ server, virtual, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }) }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { close } = await startServer();
  console.log(`serving ${REPO} on ${ORIGIN}`);
  const stop = () => close().then(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
