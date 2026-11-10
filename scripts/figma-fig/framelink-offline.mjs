#!/usr/bin/env node
// Run Framelink's get_figma_data on figma/rest/<key>.json instead of the Figma API (no token, no quota).
//   node scripts/figma-fig/framelink-offline.mjs <fileKey> [out.json]   default out: figma/<key>.json
// Uses the pinned figma-developer-mcp in this folder, so the output has the same shape as the API pull.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const [, , key, out = `${ROOT}/figma/${key}.json`] = process.argv;
const bin = `${HERE}/node_modules/figma-developer-mcp/dist/bin.js`;
const p = spawn(process.execPath, ['--import', `${HERE}/mock-fetch.mjs`, bin, '--stdio', '--json'], {
  env: { ...process.env, VD_ROOT: ROOT, FIGMA_API_KEY: 'offline', FRAMELINK_TELEMETRY: 'off', DO_NOT_TRACK: '1' }, stdio: ['pipe', 'pipe', 'inherit'],
});
let buf = '', id = 0; const pending = {};
p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; try { const m = JSON.parse(line); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } } catch {} } });
const rpc = (method, params) => new Promise(r => { const i = ++id; pending[i] = r; p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });
await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'offline', version: '1' } });
p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const res = await rpc('tools/call', { name: 'get_figma_data', arguments: { fileKey: key } });
p.kill();
const text = res.result?.content?.[0]?.text;
if (!text || res.result.isError) { console.error(text || JSON.stringify(res.error)); process.exit(1); }
writeFileSync(out, JSON.stringify(JSON.parse(text), null, 1));
console.log(`${key}: Framelink (offline) -> ${out}`);
