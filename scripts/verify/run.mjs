// pnpm --dir scripts/verify verify [--only <key>] [--layer text|geom|style|pixel|flow] [--selftest]
// Exit code 1 on any HARD failure (IMPL-PLAN §3 Output), 2 on a harness crash.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { MANIFEST, byKey, REPO } from './lib/figma.mjs';
import { startServer } from './serve.mjs';
import { launch } from './lib/browser.mjs';
import { runSolo, GATES } from './solo.mjs';
import { runFlow } from './flow.mjs';
import { writeReport } from './report.mjs';
import { selftest } from './selftest.mjs';

const argv = process.argv.slice(2);
const arg = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const only = arg('--only'), layerArg = arg('--layer');
const LAYERS = ['text', 'geom', 'style', 'pixel', 'flow'];
if (layerArg && !LAYERS.includes(layerArg)) { console.error(`--layer must be one of ${LAYERS.join('|')}`); process.exit(2); }
if (only && !byKey[only]) { console.error(`--only: unknown screen "${only}". Keys: ${MANIFEST.map(s => s.key).join(', ')}`); process.exit(2); }
const layers = new Set(layerArg ? [layerArg] : LAYERS);

// The CODING agent edits the app concurrently: fingerprint the app files before and after, and flag a mixed run.
function appFingerprint() {
  const h = crypto.createHash('sha1');
  const walk = d => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { h.update(f); h.update(fs.readFileSync(f)); } } };
  for (const f of ['index.html', 'app.js']) { try { h.update(f); h.update(fs.readFileSync(path.join(REPO, f))); } catch {} }
  walk(path.join(REPO, 'screens')); walk(path.join(REPO, 'vendor'));
  return h.digest('hex').slice(0, 12);
}
const OUT = path.join(REPO, 'docs/verify'), IMG = path.join(OUT, 'img');
fs.mkdirSync(path.join(IMG, 'flow'), { recursive: true });

let srv, browser, code = 0;
const cleanup = async () => { await browser?.close().catch(() => {}); await srv?.close().catch(() => {}); };
process.on('SIGINT', () => cleanup().then(() => process.exit(130)));

try {
  srv = await startServer();
  browser = await launch();
  console.log(`Chrome ${await browser.version()}`);

  if (argv.includes('--selftest')) {
    const r = await selftest(browser, srv.virtual);
    code = r.ok ? 0 : 1;
  } else {
    let commit = '?';
    try { commit = execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD']).toString().trim(); if (execFileSync('git', ['-C', REPO, 'status', '--porcelain', '--', '.', ':!docs/verify', ':!scripts/verify']).toString().trim()) commit += '+dirty'; } catch {}
    const fp0 = appFingerprint();
    const keys = only ? [only] : MANIFEST.map(s => s.key);
    const soloLayers = new Set([...layers].filter(l => l !== 'flow'));
    const screens = [];
    if (soloLayers.size) {
      const queue = keys.slice(); const CONC = 1; // sequential: rAF only runs in the foreground tab
      await Promise.all(Array.from({ length: CONC }, async () => {
        for (let k; (k = queue.shift());) {
          const t0 = Date.now();
          let r;
          try { r = await runSolo(browser, k, { layers: soloLayers, imgDir: IMG }); }
          catch (e) { r = { key: k, node: byKey[k].node, gates: { C: { status: 'FAIL', hard: true, reason: 'harness error: ' + e.message } }, offenders: [], text: {}, geom: {}, style: {}, pixel: {} }; }
          screens.push(r);
          const g = Object.entries(r.gates).map(([n, v]) => `${n}:${v.status[0]}`).join(' ');
          console.log(`${k.padEnd(11)} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${g}${r.noSolo ? '  ← ' + r.noSolo : ''}`);
        }
      }));
      screens.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
    }
    let flow = null;
    if (layers.has('flow') && (!only || layerArg === 'flow')) {
      flow = await runFlow(browser, { zones: only ? [byKey[only].zone] : ['send', 'receive', 'collect'], imgDir: path.join(IMG, 'flow') });
      console.log(`flow: ${flow.pass ? 'PASS' : 'FAIL'} — ${flow.fails.length} failing assertion(s) of ${flow.asserts}`);
    }
    const fp1 = appFingerprint();
    const appChanged = fp0 !== fp1;
    if (appChanged) console.log('WARNING: app files changed during this run; results mix two builds. Re-run.');
    const rep = writeReport({ commit, screens, flow, only, layer: layerArg, outDir: OUT, gateDefs: GATES, app: { before: fp0, after: fp1, changedDuringRun: appChanged } });
    console.log(`\n${rep.summary.line}\nreport: ${path.relative(process.cwd(), path.join(OUT, 'report.html'))}`);
    code = rep.summary.hardFail ? 1 : 0;
  }
} catch (e) {
  console.error('harness crashed:', e.stack || e);
  code = 2;
} finally {
  await cleanup();
}
process.exit(code);
