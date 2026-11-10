#!/usr/bin/env node
// One-off: carry the 2026-11-09 VXBS copy edits into figma/rest/MPq4C2qjwzVdD2gYloQuUu.json.
// The REST pull of that file is rate-limited (View seat on an enterprise plan), but the Framelink pull of
// 2026-11-10 is not, and its diff against 2026-10-29 shows text-only changes. This applies them to the REST
// tree (characters + characterStyleOverrides) and then checks every TEXT node against figma/<key>.json.
//   node scripts/gen/patch-vxbs-2026-11-09.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const KEY = 'MPq4C2qjwzVdD2gYloQuUu';
const restPath = `${ROOT}/figma/rest/${KEY}.json`;
const rest = JSON.parse(readFileSync(restPath, 'utf8'));
const fl = JSON.parse(readFileSync(`${ROOT}/figma/${KEY}.json`, 'utf8'));

// [from, to]; longest first so "Visa Cross-Border Solutions · Concept demo" wins over shorter matches.
const EDITS = [
  ['Visa Cross-Border Solutions · Concept demo', 'Concept demo'],
  ['VXBS concept · ', 'Concept · '],
  ['Your VXBS receiving details', 'Your receiving details'],
  ['Not verified VXBS credentials', 'Not verified credentials'],
  ['VISA / VXBS', 'VISA'],
  ['VISA  / VXBS', 'VISA'],
  ['Vietcombank', 'Vietnam Bank'],
];

/** Replace chars [i, i+len) with `to`; the new characters take the style of the first replaced one. */
function splice(n, i, len, to) {
  n.characters = n.characters.slice(0, i) + to + n.characters.slice(i + len);
  const ov = n.characterStyleOverrides;
  if (ov && ov.length) {
    const k = ov[i] || 0;
    ov.splice(i, Math.min(len, Math.max(0, ov.length - i)), ...(i < ov.length ? Array(to.length).fill(k) : []));
    while (ov.length && !ov[ov.length - 1]) ov.pop(); // Figma trims trailing zeros
    n.characterStyleOverrides = ov;
  }
}

let edits = 0;
const walk = n => {
  if (n.type === 'TEXT') {
    for (const [from, to] of EDITS) {
      let i;
      while ((i = n.characters.indexOf(from)) >= 0) { splice(n, i, from.length, to); edits++; }
    }
  }
  for (const c of n.children || []) walk(c);
};
walk(rest.document);

// ---- check: every REST TEXT node equals the Framelink text of the same id (markup stripped) ----
const plain = s => s.replace(/\{\/?ts\d+\}/g, '').replace(/\*\*/g, '').replace(/\\([()])/g, '$1');
const flText = new Map();
const fwalk = n => {
  const t = n.text ?? fl.elements?.[n.template]?.text; // Framelink keeps shared text on the element template
  if (t !== undefined) flText.set(n.id, plain(t));
  (n.children || []).forEach(fwalk);
};
fl.nodes.forEach(fwalk);
const bad = [];
const rwalk = n => {
  if (n.type === 'TEXT' && flText.has(n.id) && flText.get(n.id) !== n.characters) bad.push(`${n.id}: ${JSON.stringify(n.characters)} != ${JSON.stringify(flText.get(n.id))}`);
  (n.children || []).forEach(rwalk);
};
rwalk(rest.document);
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
rest.lastModified = fl.metadata?.lastModified || rest.lastModified;
writeFileSync(restPath, JSON.stringify(rest));
console.log(`edits: ${edits}, text nodes checked: ${flText.size}, mismatches: 0`);
