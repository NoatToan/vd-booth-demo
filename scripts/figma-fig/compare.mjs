#!/usr/bin/env node
// Compare two Framelink JSONs node by node, with templates and globalVars references resolved.
//   node scripts/figma-fig/compare.mjs <a.json> <b.json> [--show N]
import { readFileSync } from 'node:fs';
const [, , A, B] = process.argv;
let show = +(process.argv[process.argv.indexOf('--show') + 1] || 12);
const load = p => {
  const d = JSON.parse(readFileSync(p, 'utf8')), gv = d.globalVars?.styles || {}, el = d.elements || {}, out = new Map();
  const res = v => (typeof v === 'string' && v in gv ? gv[v] : v);
  const walk = n => {
    const m = { ...(el[n.template] || {}), ...n };
    const r = {};
    for (const [k, v] of Object.entries(m)) if (!['children', 'template', 'id'].includes(k)) r[k] = res(v);
    out.set(n.id, r); (n.children || []).forEach(walk);
  };
  d.nodes.forEach(walk); return out;
};
const a = load(A), b = load(B);
const byKey = {}; let same = 0, diff = 0; const ex = [];
for (const [id, x] of a) {
  const y = b.get(id); if (!y) { (byKey['<missing in b>'] ||= 0); byKey['<missing in b>']++; continue; }
  let ok = true;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) { ok = false; byKey[k] = (byKey[k] || 0) + 1; if (ex.length < 400) ex.push([id, k, x[k], y[k]]); }
  }
  ok ? same++ : diff++;
}
for (const id of b.keys()) if (!a.has(id)) { byKey['<missing in a>'] = (byKey['<missing in a>'] || 0) + 1; }
console.log(`nodes ${a.size} vs ${b.size} | identical ${same} | differing ${diff}`);
console.log('differences by field:', JSON.stringify(byKey));
const seen = {};
for (const [id, k, x, y] of ex) { if ((seen[k] = (seen[k] || 0) + 1) > 3 || show-- <= 0) continue; console.log(` ${id} ${k}\n   a: ${JSON.stringify(x)?.slice(0, 220)}\n   b: ${JSON.stringify(y)?.slice(0, 220)}`); }
