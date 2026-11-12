#!/usr/bin/env node
// Lists everything the kiosk needs offline into sw-assets.json; sw.js precaches it on install.
//   node scripts/gen/build-sw-assets.mjs        (run after build-screens.mjs, before deploy)
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const walk = d => readdirSync(d).flatMap(f => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : [p]; });
const keep = p => !/\.DS_Store$|kv-reference\.jpg$|\.md$/.test(p);
const files = [
  'index.html', 'app.js', 'lead/index.html',
  ...walk(`${ROOT}/screens`), ...walk(`${ROOT}/vendor`), ...walk(`${ROOT}/brand`),
  ...readdirSync(`${ROOT}/figma/assets`).flatMap(k => { try { return walk(`${ROOT}/figma/assets/${k}/fills`); } catch { return []; } }),
].map(p => (p.startsWith('/') ? relative(ROOT, p) : p)).filter(keep).sort();
// the version changes whenever any precached file changes, so the service worker installs a fresh cache
const h = createHash('sha256'); for (const f of files) h.update(f).update(readFileSync(`${ROOT}/${f}`));
const version = h.digest('hex').slice(0, 12);
writeFileSync(`${ROOT}/sw-assets.json`, JSON.stringify({ version, files }, null, 1) + '\n');
const bytes = files.reduce((a, f) => a + statSync(`${ROOT}/${f}`).size, 0);
console.log(`sw-assets.json: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB, version ${version}`);
