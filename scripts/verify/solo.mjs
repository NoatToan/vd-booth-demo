// Solo layers T1–T4, G1–G3, S1–S3, P1–P3, D (IMPL-PLAN §3) plus the §2.1/§2.3 contract (C, NET).
// Expected values: lib/figma.mjs (figma/rest) and figma/screens PNGs only.
import fs from 'node:fs';
import path from 'node:path';
import { expected, refPng, composite } from './lib/figma.mjs';
import { openPage } from './lib/browser.mjs';
import { readPng, decode, writePng, compare, exactDiff, flatten } from './lib/pixel.mjs';
import { ORIGIN } from './serve.mjs';

export const GATES = [
  ['C', true, 'solo contract'], ['NET', true, 'network + console'],
  ['T1', true, 'coverage'], ['T2', true, 'text'], ['T3', true, 'extra text'], ['T4', true, 'font used'],
  ['G1', true, 'geometry'], ['G2', true, 'gross geometry'], ['G3', false, 'parent-relative'],
  ['S1', true, 'typography'], ['S2', true, 'box style'], ['S3', false, 'effects'],
  ['P1', true, 'pixel full ≤3.0%'], ['P1t', false, 'pixel target ≤1.5%'], ['P2', false, 'region offenders'], ['P3', false, 'clip ≤4.0%'],
  ['D', true, 'determinism'],
];
export const HARD = Object.fromEntries(GATES.map(([k, h]) => [k, h]));
const LAYER_GATES = { text: ['T1', 'T2', 'T3', 'T4'], geom: ['G1', 'G2', 'G3'], style: ['S1', 'S2', 'S3'], pixel: ['P1', 'P1t', 'P2', 'P3', 'D'] };

const gate = (k, ok, value, threshold, reason, warnOnly) => ({
  status: ok ? 'PASS' : (HARD[k] && !warnOnly ? 'FAIL' : 'WARN'), hard: HARD[k], value, threshold, ...(reason ? { reason } : {}),
});

// ---------- css parsing ----------
function parseColor(s) {
  if (!s || s === 'transparent') return [0, 0, 0, 0];
  let m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
  m = s.match(/^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
  return null;
}
const splitTop = s => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
function parseShadows(s) {
  if (!s || s === 'none') return [];
  return splitTop(s).map(p => {
    const cm = p.match(/(rgba?\([^)]*\)|color\([^)]*\))/);
    const color = cm ? parseColor(cm[1]) : [0, 0, 0, 1];
    const rest = p.replace(cm ? cm[1] : '', ' ');
    const nums = (rest.match(/-?[\d.]+px|\b0\b/g) || []).map(parseFloat);
    return { color, x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, inset: /\binset\b/.test(rest) };
  });
}
function compositeCss(bgColor, bgImage) {
  // Solid layers: background-color at the bottom, then gradient layers bottom→top (CSS lists top first).
  const layers = [parseColor(bgColor) || [0, 0, 0, 0]];
  if (bgImage && bgImage !== 'none') {
    for (const l of splitTop(bgImage).reverse()) {
      const m = l.match(/^linear-gradient\((.*)\)$/);
      if (!m) { layers.push(null); continue; }
      const stops = splitTop(m[1]).filter(x => !/^(to |-?[\d.]+deg)/.test(x)).map(x => parseColor(x.replace(/\s+[\d.]+(px|%)\s*$/g, '').trim()));
      if (stops.length && stops.every(c => c && stops[0].every((v, i) => Math.abs(v - c[i]) < 0.5))) layers.push(stops[0]); else layers.push(null);
    }
  }
  if (layers.includes(null)) return null;
  let [r, g, b, a] = [0, 0, 0, 0];
  for (const [fr, fg, fb, fa] of layers) { const na = fa + a * (1 - fa); if (na <= 0) continue; r = (fr * fa + r * a * (1 - fa)) / na; g = (fg * fa + g * a * (1 - fa)) / na; b = (fb * fa + b * a * (1 - fa)) / na; a = na; }
  return [r, g, b, a];
}
const colorClose = (e, a, alphaTol = 0.02) => !!a && (e[3] <= alphaTol && a[3] <= alphaTol || (e.slice(0, 3).every((v, i) => Math.abs(v - a[i]) <= 2) && Math.abs(e[3] - a[3]) <= alphaTol));
const fmtC = c => c ? `rgba(${c.slice(0, 3).map(v => Math.round(v)).join(',')},${+c[3].toFixed(3)})` : String(c);
const px = v => (v == null || v === 'normal' ? NaN : parseFloat(v));
const ALIGN = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };

// ---------- page probe ----------
async function probe(page, key, ids, textIds) {
  return page.evaluate((key, ids, textIds) => {
    const R = r => ({ x: r.x, y: r.y, w: r.width, h: r.height });
    const frame = document.querySelector(`.fr[data-node][data-screen="${key}"]`);
    const counts = {}; for (const el of document.querySelectorAll('[data-node]')) counts[el.dataset.node] = (counts[el.dataset.node] || 0) + 1;
    const P = ['font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'text-align', 'background-color', 'background-image',
      'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
      'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-style', 'outline-width', 'outline-color', 'box-shadow',
      'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];
    const els = {};
    for (const id of ids) {
      const el = document.querySelector(`[data-node="${id}"]`);
      if (!el) continue;
      const cs = getComputedStyle(el);
      const o = { rect: R(el.getBoundingClientRect()), css: Object.fromEntries(P.map(p => [p, cs.getPropertyValue(p)])), twin: el.dataset.twin ?? null };
      if (textIds.includes(id)) o.text = el.textContent;
      els[id] = o;
    }
    const tset = new Set(textIds), extra = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      if (!n.nodeValue.trim() || !n.parentElement) continue;
      if (getComputedStyle(n.parentElement).visibility === 'hidden') continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      if (![...rg.getClientRects()].some(r => r.width > 0 && r.height > 0)) continue;
      const host = n.parentElement.closest('[data-node]');
      if (!host || !tset.has(host.dataset.node)) extra.push({ text: n.nodeValue.trim().slice(0, 80), in: host ? host.dataset.node : n.parentElement.tagName.toLowerCase() + (n.parentElement.className ? '.' + String(n.parentElement.className).split(' ')[0] : '') });
    }
    const scrolls = [...document.querySelectorAll('[data-role="scroll"]')].map(e => e.dataset.node || null);
    return {
      frame: frame ? { rect: R(frame.getBoundingClientRect()), node: frame.dataset.node } : null,
      counts, els, extra, scrolls,
      htmlSolo: document.documentElement.classList.contains('solo'),
      fx: document.querySelectorAll('[data-fx]').length, lang: document.querySelectorAll('.lang').length,
      htmlLang: document.documentElement.lang,
      unknownIds: Object.keys(counts).filter(i => !ids.includes(i)).length,
    };
  }, key, ids, textIds);
}

async function fontsUsed(page, textIds) {
  const s = await page.createCDPSession();
  await s.send('DOM.enable'); await s.send('CSS.enable');
  const { root } = await s.send('DOM.getDocument', { depth: -1 });
  const out = {};
  for (const id of textIds) {
    const sel = `[data-node="${id}"], [data-node="${id}"] *`;
    let nodeIds = [];
    try { ({ nodeIds } = await s.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: sel })); } catch {}
    if (!nodeIds.length) { out[id] = null; continue; }
    const fams = new Set();
    for (const nid of nodeIds) {
      try { const { fonts } = await s.send('CSS.getPlatformFontsForNode', { nodeId: nid }); fonts.forEach(f => fams.add(f.familyName)); } catch {}
    }
    out[id] = [...fams];
  }
  await s.detach().catch(() => {});
  return out;
}

async function load(browser, url, w, h, readyTimeout) {
  const { page, log } = await openPage(browser, { width: w, height: h });
  let err = null;
  try {
    // Background tabs get no requestAnimationFrame, and the ready signal needs 2 rAFs: keep the page in front.
    await page.bringToFront();
    await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: readyTimeout, polling: 50 });
  } catch (e) { err = e.message.split('\n')[0]; }
  return { page, log, err };
}
const shot = async (page, w, h) => (await page.bringToFront(), decode(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: w, height: h }, captureBeyondViewport: false })));

// ---------- checks ----------
function geomDelta(e, a) { return { dx: a.x - e.x, dy: a.y - e.y, dw: a.w - e.w, dh: a.h - e.h }; }
function geomPass(n, d) {
  const ab = Math.abs;
  if (n.rotated) return [ab(d.dx), ab(d.dy), ab(d.dw), ab(d.dh)].every(v => v <= 3);
  if (n.type === 'TEXT') {
    const wt = n.text.autoResize === 'WIDTH_AND_HEIGHT' ? Math.max(3, 0.03 * n.box.w) : 2;
    return ab(d.dx) <= 2 && ab(d.dy) <= 2 && ab(d.dh) <= 2 && ab(d.dw) <= wt;
  }
  return [ab(d.dx), ab(d.dy), ab(d.dw), ab(d.dh)].every(v => v <= 2);
}
const maxAbs = d => Math.max(...Object.values(d).map(Math.abs));
const r1 = v => Math.round(v * 10) / 10;
const fmtBox = b => b ? `${r1(b.x)},${r1(b.y)} ${r1(b.w)}×${r1(b.h)}` : 'missing';

function strokeCandidates(css) {
  const c = [];
  const bw = ['top', 'right', 'bottom', 'left'].map(s => (css[`border-${s}-style`] !== 'none' ? px(css[`border-${s}-width`]) : 0) || 0);
  if (bw.some(v => v > 0)) { const side = ['top', 'right', 'bottom', 'left'][bw.findIndex(v => v > 0)]; c.push({ via: 'border', widths: bw, color: parseColor(css[`border-${side}-color`]) }); }
  if (css['outline-style'] !== 'none' && px(css['outline-width']) > 0) { const w = px(css['outline-width']); c.push({ via: 'outline', widths: [w, w, w, w], color: parseColor(css['outline-color']) }); }
  const ins = parseShadows(css['box-shadow']).filter(s => s.inset && s.blur === 0);
  const byColor = new Map();
  for (const s of ins) {
    const k = fmtC(s.color);
    const w = byColor.get(k) || { via: 'inset box-shadow', widths: [0, 0, 0, 0], color: s.color };
    w.widths = [Math.max(w.widths[0], s.y + s.spread), Math.max(w.widths[1], -s.x + s.spread), Math.max(w.widths[2], -s.y + s.spread), Math.max(w.widths[3], s.x + s.spread)].map(v => Math.max(0, v));
    byColor.set(k, w);
  }
  c.push(...byColor.values());
  return c;
}

export function analyse(key, X, P, fonts) {
  const req = X.required, out = { missing: [], dup: [], mismatch: [], extra: P.extra, geom: [], style: [], s1: [], s2: { n: 0, fail: [] }, s3: [], g3: [] };
  for (const n of req) { const c = P.counts[n.id] || 0; if (!c) out.missing.push(n.id); else if (c > 1) out.dup.push(n.id); }
  for (const [id, c] of Object.entries(P.counts)) if (c > 1 && !out.dup.includes(id)) out.dup.push(id);
  const F = P.frame?.rect || { x: 0, y: 0 };
  const rel = id => { const a = P.els[id]; return a && { x: a.rect.x - F.x, y: a.rect.y - F.y, w: a.rect.w, h: a.rect.h }; };

  for (const n of X.texts) {
    const a = P.els[n.id];
    if (a && a.text !== n.text.chars) out.mismatch.push({ id: n.id, name: n.name, expected: n.text.chars, actual: a.text });
  }
  // geometry
  for (const n of req) {
    const a = rel(n.id);
    if (!a || !n.box) { out.geom.push({ id: n.id, name: n.name, pass: false, gross: false, expected: fmtBox(n.box), actual: 'missing', max: Infinity }); continue; }
    const d = geomDelta(n.box, a);
    out.geom.push({ id: n.id, name: n.name, type: n.type, pass: geomPass(n, d), gross: maxAbs(d) <= 8, d: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, r1(v)])), max: r1(maxAbs(d)), expected: fmtBox(n.box), actual: fmtBox(a) });
    if (n.parentId && rel(n.parentId)) {
      const pe = X.byId.get(n.parentId).box, pa = rel(n.parentId);
      const dp = { dx: (a.x - pa.x) - (n.box.x - pe.x), dy: (a.y - pa.y) - (n.box.y - pe.y), dw: d.dw, dh: d.dh };
      if (maxAbs(dp) > 2) out.g3.push({ id: n.id, name: n.name, parent: n.parentId, d: Object.fromEntries(Object.entries(dp).map(([k, v]) => [k, r1(v)])), max: r1(maxAbs(dp)) });
    }
  }
  // S1 typography
  for (const n of X.texts) {
    const a = P.els[n.id], t = n.text, f = (prop, exp, act) => out.s1.push({ id: n.id, name: n.name, prop, expected: exp, actual: act });
    if (!a) { f('element', 'present', 'missing'); continue; }
    const c = a.css;
    if (!(Math.abs(px(c['font-size']) - t.fontSize) < 0.01)) f('font-size', t.fontSize + 'px', c['font-size']);
    if (+c['font-weight'] !== t.fontWeight) f('font-weight', t.fontWeight, c['font-weight']);
    if (!(Math.abs(px(c['line-height']) - t.lineHeightPx) <= 0.5)) f('line-height', r1(t.lineHeightPx * 100) / 100 + 'px', c['line-height']);
    const ls = c['letter-spacing'] === 'normal' ? 0 : px(c['letter-spacing']);
    if (!(Math.abs(ls - t.letterSpacing) <= 0.05)) f('letter-spacing', t.letterSpacing + 'px', c['letter-spacing']);
    if (t.color && !colorClose(t.color, parseColor(c.color), 2 / 255)) f('color', fmtC(t.color), c.color);
    if (t.autoResize === 'HEIGHT') { const al = c['text-align'] === 'start' ? 'left' : c['text-align'] === 'end' ? 'right' : c['text-align']; if (al !== ALIGN[t.align]) f('text-align', ALIGN[t.align], c['text-align']); }
  }
  // S2 box style + S3 effects
  for (const n of req) {
    if (n.type === 'TEXT' || n.svgRoot) continue;
    const a = P.els[n.id], f = (prop, exp, act) => out.s2.fail.push({ id: n.id, name: n.name, prop, expected: exp, actual: act });
    const props = 2 + (n.stroke ? 2 : 0);
    out.s2.n += props;
    if (!a) { for (const p of ['background', 'border-radius', ...(n.stroke ? ['stroke-color', 'stroke-width'] : [])]) f(p, 'present', 'missing'); continue; }
    const c = a.css;
    const expBg = n.fills.length ? composite(n.fills) : [0, 0, 0, 0];
    if (n.arc) {
      // arc/ring: every non-transparent paint (background-color, gradient stops) must be the fill colour, and one must exist
      const paints = [c['background-color'], ...(c['background-image'].match(/(rgba?\([^)]*\)|color\([^)]*\))/g) || [])].map(parseColor).filter(p => p && p[3] > 0.02);
      if (!paints.length || !paints.every(p => colorClose(expBg, p))) f('background', `arc paint ${fmtC(expBg)}`, `${c['background-color']} / ${c['background-image']}`);
    } else {
      const actBg = compositeCss(c['background-color'], c['background-image']);
      if (!colorClose(expBg, actBg)) f('background', fmtC(expBg), actBg ? fmtC(actBg) : `${c['background-color']} / ${c['background-image']}`);
    }
    const corner = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];
    const rr = corner.map(k => { const v = c[k]; const first = v.split(' ')[0]; return first.endsWith('%') ? parseFloat(first) / 100 * a.rect.w : px(first); });
    if (n.type === 'ELLIPSE') { const need = Math.min(n.box.w, n.box.h) / 2 - 0.5; if (!rr.every(v => v >= need)) f('border-radius', '≥' + r1(need + 0.5) + 'px (ellipse)', rr.map(r1).join(' ')); }
    else if (!rr.every((v, i) => Math.abs(v - n.radii[i]) <= 0.5)) f('border-radius', n.radii.map(r1).join(' '), rr.map(r1).join(' '));
    if (n.stroke) {
      const cands = strokeCandidates(c);
      const wOk = x => x.widths.every((v, i) => Math.abs(v - n.stroke.widths[i]) <= 0.5);
      const best = cands.find(x => wOk(x) && colorClose(n.stroke.color, x.color)) || cands.find(wOk) || cands[0];
      if (!best) { f('stroke-color', fmtC(n.stroke.color), 'none'); f('stroke-width', n.stroke.widths.join(' '), 'none'); }
      else {
        if (!colorClose(n.stroke.color, best.color)) f('stroke-color', fmtC(n.stroke.color), `${fmtC(best.color)} (${best.via})`);
        if (!wOk(best)) f('stroke-width', n.stroke.widths.join(' '), `${best.widths.map(r1).join(' ')} (${best.via})`);
      }
    }
    if (n.effects.length) {
      const sh = parseShadows(c['box-shadow']).filter(s => !s.inset);
      for (const e of n.effects) {
        const ok = sh.some(s => Math.abs(s.x - e.offset.x) <= 0.5 && Math.abs(s.y - e.offset.y) <= 0.5 && Math.abs(s.blur - e.radius) <= 0.5 && Math.abs(s.spread - (e.spread || 0)) <= 0.5 && colorClose([e.color.r * 255, e.color.g * 255, e.color.b * 255, e.color.a], s.color));
        if (!ok) out.s3.push({ id: n.id, name: n.name, prop: 'box-shadow', expected: `${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread || 0}px ${fmtC([e.color.r * 255, e.color.g * 255, e.color.b * 255, e.color.a])}`, actual: c['box-shadow'] });
      }
    }
  }
  // T4
  out.fonts = [];
  if (fonts) for (const n of X.texts) {
    const fl = fonts[n.id];
    if (fl === null || fl === undefined) { if (P.els[n.id]) out.fonts.push({ id: n.id, name: n.name, actual: 'no CDP node' }); else out.fonts.push({ id: n.id, name: n.name, actual: 'missing' }); continue; }
    const bad = fl.filter(f => !/^Inter\b/i.test(f));
    if (bad.length) out.fonts.push({ id: n.id, name: n.name, expected: 'Inter', actual: fl.join(', '), chars: n.text.chars.slice(0, 40) });
  }
  return out;
}

function regionOffenders(X, P, cmp) {
  if (!P?.frame) return [];
  const F = P.frame.rect, list = [];
  for (const n of X.required) {
    const a = P.els[n.id]; if (!a) continue;
    const x0 = Math.max(0, Math.floor(a.rect.x - F.x)), y0 = Math.max(0, Math.floor(a.rect.y - F.y));
    const x1 = Math.min(cmp.w, Math.ceil(a.rect.x - F.x + a.rect.w)), y1 = Math.min(cmp.h, Math.ceil(a.rect.y - F.y + a.rect.h));
    if (x1 <= x0 || y1 <= y0) continue;
    let d = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d += cmp.mask[y * cmp.w + x];
    const dens = d / ((x1 - x0) * (y1 - y0));
    if (dens > 0.2) list.push({ id: n.id, name: n.name, density: Math.round(dens * 1000) / 10, diffPx: d, box: `${x0},${y0} ${x1 - x0}×${y1 - y0}` });
  }
  return list.sort((a, b) => b.diffPx - a.diffPx).slice(0, 10);
}

/**
 * Run all solo layers for one screen.
 * opts: { layers:Set, imgDir, url?(key, clip)=>string, readyTimeout }
 */
export async function runSolo(browser, key, opts = {}) {
  const X = expected(key), s = X.s, H = s.h, W = 402;
  const layers = opts.layers || new Set(['text', 'geom', 'style', 'pixel']);
  const url = opts.url || ((k, clip) => `${ORIGIN}/index.html?solo=${k}${clip ? '&clip=1' : ''}`);
  const readyTimeout = opts.readyTimeout ?? 10000;
  const imgDir = opts.imgDir;
  const R = { key, node: s.node, twin: s.twin || null, h: H, gates: {}, text: { missing: [], extra: [], mismatch: [] }, geom: { n: 0, passPct: 0, worst: [] }, style: { fails: [] }, pixel: { pct: null, diff: null }, offenders: [], net: { aborted: 0, consoleErrors: [] } };
  const want = g => Object.entries(LAYER_GATES).some(([l, gs]) => layers.has(l) && gs.includes(g));
  const img = {};
  if (imgDir) {
    const ref = refPng(s); img.figma = `img/${key}-figma.png`; writePng(path.join(imgDir, `${key}-figma.png`), flatten(readPng(ref)));
  }
  R.img = img;

  const L1 = await load(browser, url(key, false), W, H, readyTimeout);
  const closeAll = [L1.page];
  try {
    let P = null;
    if (!L1.err) { P = await probe(L1.page, key, X.required.map(n => n.id), X.texts.map(n => n.id)); }
    if (L1.err || !P.frame) {
      const reason = 'no solo' + (L1.err ? ` (data-ready="1" not set: ${L1.err})` : ` (no .fr[data-node][data-screen="${key}"])`);
      for (const [k] of GATES) if (k === 'C' || k === 'NET' || want(k)) R.gates[k] = { status: 'FAIL', hard: HARD[k], reason };
      R.noSolo = reason;
      R.net = { aborted: L1.log.aborted.length, consoleErrors: L1.log.consoleErrors.slice(0, 20) };
      if (imgDir) { const b = await shot(L1.page, W, H); writePng(path.join(imgDir, `${key}-build.png`), b); img.build = `img/${key}-build.png`; }
      R.offenders = [{ id: s.node, name: X.root.name, layer: 'C', expected: 'solo mode', actual: reason }];
      return R;
    }
    const fonts = want('T4') ? await fontsUsed(L1.page, X.texts.map(n => n.id)) : null;
    const A = analyse(key, X, P, fonts);

    // C: §2.1/§2.2 structural contract
    const c = [];
    if (!P.htmlSolo) c.push('html.solo missing');
    if (Math.abs(P.frame.rect.x) > 0.01 || Math.abs(P.frame.rect.y) > 0.01) c.push(`frame at ${P.frame.rect.x},${P.frame.rect.y} not 0,0`);
    if (P.frame.node !== s.node) c.push(`frame data-node ${P.frame.node} != ${s.node}`);
    if (P.fx) c.push(`${P.fx} [data-fx] element(s) in solo`);
    if (P.lang) c.push(`${P.lang} .lang element(s)`);
    if (P.scrolls.length !== 1 || P.scrolls[0] !== X.scrollId) c.push(`[data-role=scroll] on ${JSON.stringify(P.scrolls)}, expected ["${X.scrollId}"]`);
    if (s.twin) { const bad = X.required.filter(n => P.els[n.id] && P.els[n.id].twin !== n.twin); if (bad.length) c.push(`${bad.length} data-twin mismatch (e.g. ${bad[0].id}: ${P.els[bad[0].id].twin} != ${bad[0].twin})`); }
    R.gates.C = gate('C', !c.length, c.length, 0, c.join('; ') || undefined);
    R.contract = c;
    // NET
    R.net = { aborted: L1.log.aborted.length, abortedUrls: L1.log.aborted.slice(0, 10), consoleErrors: L1.log.consoleErrors.slice(0, 20) };
    R.gates.NET = gate('NET', !L1.log.aborted.length && !L1.log.consoleErrors.length, `${L1.log.aborted.length} aborted, ${L1.log.consoleErrors.length} console errors`, '0 / 0');

    const nReq = X.required.length, nText = X.texts.length;
    R.text = { missing: A.missing, dup: A.dup, extra: A.extra, mismatch: A.mismatch };
    if (want('T1')) R.gates.T1 = gate('T1', !A.missing.length && !A.dup.length, `${nReq - A.missing.length}/${nReq} present, ${A.dup.length} duplicated`, '100%, each once');
    if (want('T2')) { const bad = A.mismatch.length + X.texts.filter(n => !P.els[n.id]).length; R.gates.T2 = gate('T2', !bad, `${nText - bad}/${nText}`, '100%'); }
    if (want('T3')) R.gates.T3 = gate('T3', !A.extra.length, A.extra.length, 0);
    if (want('T4')) R.gates.T4 = gate('T4', !A.fonts.length, `${nText - A.fonts.length}/${nText} Inter-only`, '100%');
    R.fonts = A.fonts;

    const gp = A.geom.filter(g => g.pass).length, gross = A.geom.filter(g => !g.gross);
    const fh = P.frame.rect.h;
    R.geom = { n: A.geom.length, pass: gp, passPct: Math.round(gp / A.geom.length * 1000) / 10, frameH: { expected: X.frameH, actual: fh },
      worst: A.geom.filter(g => !g.pass).sort((a, b) => b.max - a.max).slice(0, 25), grossFails: gross.length, g3: A.g3.sort((a, b) => b.max - a.max).slice(0, 25) };
    if (want('G1')) R.gates.G1 = gate('G1', gp / A.geom.length >= 0.95, `${R.geom.passPct}%`, '≥95%');
    if (want('G2')) R.gates.G2 = gate('G2', !gross.length && Math.abs(fh - X.frameH) <= 4, `${gross.length} node(s) >8px; frame h ${r1(fh)} vs ${X.frameH}`, '0, ±4px');
    if (want('G3')) R.gates.G3 = { status: A.g3.length ? 'WARN' : 'PASS', hard: false, value: `${A.g3.length} node(s) drift >2px vs parent` };

    R.style = { fails: [...A.s1.map(f => ({ ...f, layer: 'S1' })), ...A.s2.fail.map(f => ({ ...f, layer: 'S2' }))], s3: A.s3, s2props: A.s2.n };
    if (want('S1')) R.gates.S1 = gate('S1', !A.s1.length, `${A.s1.length} failing propert${A.s1.length === 1 ? 'y' : 'ies'} on ${new Set(A.s1.map(f => f.id)).size} text node(s)`, '100%');
    if (want('S2')) { const pct = A.s2.n ? (1 - A.s2.fail.length / A.s2.n) * 100 : 100; R.gates.S2 = gate('S2', pct >= 98, `${Math.round(pct * 10) / 10}% (${A.s2.n - A.s2.fail.length}/${A.s2.n})`, '≥98%'); }
    if (want('S3')) R.gates.S3 = { status: A.s3.length ? 'WARN' : 'PASS', hard: false, value: `${A.s3.length} shadow mismatch(es)` };

    let regions = [];
    if (layers.has('pixel')) {
      const b1 = await shot(L1.page, W, H);
      const cmp = compare(readPng(refPng(s)), b1, W, H);
      R.pixel = { pct: Math.round(cmp.pct * 1000) / 1000, diffPx: cmp.n };
      if (imgDir) { writePng(path.join(imgDir, `${key}-build.png`), cmp.build); writePng(path.join(imgDir, `${key}-diff.png`), cmp.diff); img.build = `img/${key}-build.png`; img.diff = `img/${key}-diff.png`; R.pixel.diff = img.diff; }
      R.gates.P1 = gate('P1', cmp.pct <= 3.0, `${R.pixel.pct}%`, '≤3.0%');
      R.gates.P1t = { status: cmp.pct <= 1.5 ? 'PASS' : 'WARN', hard: false, value: `${R.pixel.pct}%`, threshold: '≤1.5%' };
      regions = regionOffenders(X, P, cmp);
      R.pixel.regions = regions;
      R.gates.P2 = { status: regions.length ? 'WARN' : 'PASS', hard: false, value: `${regions.length} box(es) >20% mismatch (top 10)` };
      // D: a second, independent load
      const L2 = await load(browser, url(key, false), W, H, readyTimeout); closeAll.push(L2.page);
      if (L2.err) R.gates.D = gate('D', false, null, '0 px', 'second load not ready: ' + L2.err);
      else { const { n, box } = exactDiff(b1, await shot(L2.page, W, H), true); R.gates.D = gate('D', n === 0, `${n} px`, '0 px', box ? `differs in ${box}` : undefined); }
      // P3: kiosk clip vs the 874 PNG (RECEIVE and COLLECT)
      if (s.clipPng) {
        const L3 = await load(browser, url(key, true), W, 874, readyTimeout); closeAll.push(L3.page);
        if (L3.err) R.gates.P3 = { status: 'WARN', hard: false, reason: 'clip=1 not ready: ' + L3.err };
        else {
          const c3 = compare(readPng(refPng(s, 'clip')), await shot(L3.page, W, 874), W, 874);
          R.pixel.clipPct = Math.round(c3.pct * 1000) / 1000;
          if (imgDir) { writePng(path.join(imgDir, `${key}-clip-figma.png`), c3.ref); writePng(path.join(imgDir, `${key}-clip-build.png`), c3.build); writePng(path.join(imgDir, `${key}-clip-diff.png`), c3.diff); Object.assign(img, { clipFigma: `img/${key}-clip-figma.png`, clipBuild: `img/${key}-clip-build.png`, clipDiff: `img/${key}-clip-diff.png` }); }
          R.gates.P3 = { status: c3.pct <= 4 ? 'PASS' : 'WARN', hard: false, value: `${R.pixel.clipPct}%`, threshold: '≤4.0%' };
        }
      } else R.gates.P3 = { status: 'N/A', hard: false, reason: 'SEND has no 874 reference' };
    }

    // top-10 offenders, most fundamental first
    const off = [];
    for (const id of A.missing) off.push({ id, name: X.byId.get(id).name, layer: 'T1', expected: 'present', actual: 'missing' });
    for (const id of A.dup) off.push({ id, name: X.byId.get(id)?.name ?? '', layer: 'T1', expected: '1 element', actual: `${P.counts[id]} elements` });
    for (const m of A.mismatch) off.push({ ...m, layer: 'T2' });
    for (const e of A.extra) off.push({ id: e.in, name: '', layer: 'T3', expected: '(none)', actual: e.text });
    for (const f of A.fonts) off.push({ id: f.id, name: f.name, layer: 'T4', expected: 'Inter', actual: f.actual });
    for (const g of R.geom.worst) if (g.actual !== 'missing') off.push({ id: g.id, name: g.name, layer: g.gross ? 'G1' : 'G2', expected: g.expected, actual: `${g.actual} (Δ ${JSON.stringify(g.d)})` });
    for (const f of R.style.fails) if (f.actual !== 'missing') off.push({ id: f.id, name: f.name, layer: f.layer, expected: `${f.prop}: ${f.expected}`, actual: f.actual });
    for (const r of regions) off.push({ id: r.id, name: r.name, layer: 'P2', expected: '≤20% mismatch', actual: `${r.density}% of ${r.box}` });
    R.offenders = off.slice(0, 10);
    R.offendersAll = off.length;
    return R;
  } finally {
    for (const p of closeAll) await p.close().catch(() => {});
  }
}
