// Ground truth from figma/rest/*.json only (IMPL-PLAN §3). Never reads screens/gen/*.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERIFY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(VERIFY_DIR, '../..');

export const MANIFEST = JSON.parse(fs.readFileSync(path.join(VERIFY_DIR, 'screens.json'), 'utf8')).screens;
export const byKey = Object.fromEntries(MANIFEST.map(s => [s.key, s]));

const SCROLL_NAMES = new Set(['Screen content', 'Scroll content', 'Content']);
const CONTAINER = new Set(['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT', 'BOOLEAN_OPERATION']);

const files = {};
function loadFile(key) {
  if (files[key]) return files[key];
  const doc = JSON.parse(fs.readFileSync(path.join(REPO, 'figma/rest', key + '.json'), 'utf8'));
  const idx = new Map();
  (function walk(n, parent) {
    idx.set(n.id, { n, parent });
    for (const c of n.children || []) walk(c, n);
  })(doc.document, null);
  return (files[key] = { doc, idx });
}

export function refPng(s, which = 'full') {
  const f = which === 'clip' ? s.clipPng : s.png;
  return f ? path.join(REPO, 'figma/screens', s.file, f) : null;
}

const vis = p => p && p.visible !== false;
const alphaOf = p => (p.color?.a ?? 1) * (p.opacity ?? 1);
// Mirrors Framelink's IMAGE-SVG collapse: a container whose descendants are all VECTORs, or a lone VECTOR.
function allVector(n) {
  const ch = n.children || [];
  return ch.length > 0 && ch.every(c => c.type === 'VECTOR' || (CONTAINER.has(c.type) && allVector(c)));
}
export function rgba(p) {
  const c = p.color;
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), alphaOf(p)];
}
// Source-over composite of a fill stack (first = bottom, Figma order) into one rgba.
export function composite(fills) {
  let [r, g, b, a] = [0, 0, 0, 0];
  for (const f of fills) {
    const [fr, fg, fb, fa] = rgba(f);
    const na = fa + a * (1 - fa);
    if (na <= 0) continue;
    r = (fr * fa + r * a * (1 - fa)) / na; g = (fg * fa + g * a * (1 - fa)) / na; b = (fb * fa + b * a * (1 - fa)) / na; a = na;
  }
  return [r, g, b, a];
}

function radii(n) {
  if (n.rectangleCornerRadii) return n.rectangleCornerRadii.slice(); // tl tr br bl
  const r = n.cornerRadius || 0;
  return [r, r, r, r];
}

function strokeSpec(n) {
  const s = (n.strokes || []).filter(p => vis(p) && p.type === 'SOLID' && alphaOf(p) > 0);
  if (!s.length) return null;
  const w = n.individualStrokeWeights
    ? [n.individualStrokeWeights.top, n.individualStrokeWeights.right, n.individualStrokeWeights.bottom, n.individualStrokeWeights.left]
    : [n.strokeWeight, n.strokeWeight, n.strokeWeight, n.strokeWeight];
  if (!w.some(x => x > 0)) return null;
  return { color: rgba(s[0]), widths: w, align: n.strokeAlign };
}

/**
 * Expected model for one manifest screen.
 * ids are the data-node ids (2:* for RECEIVE); geometry and style come from the twin when there is one.
 */
const cache = {};
export function expected(key) {
  if (cache[key]) return cache[key];
  const s = byKey[key];
  if (!s) throw new Error('unknown screen ' + key);
  const { idx } = loadFile(s.file);
  const root = idx.get(s.node).n;
  const geoRoot = s.twin ? idx.get(s.twin).n : root;
  const pre = (n, out = []) => { out.push(n); for (const c of n.children || []) pre(c, out); return out; };
  const A = pre(root), B = pre(geoRoot);
  if (A.length !== B.length) throw new Error(`${key}: twin pre-order length ${A.length} != ${B.length}`);
  const twinOf = new Map(A.map((n, i) => [n.id, B[i]]));
  for (let i = 0; i < A.length; i++) {
    if (A[i].type !== B[i].type || (A[i].characters ?? null) !== (B[i].characters ?? null))
      if (i > 0) throw new Error(`${key}: twin mismatch at pre-order ${i} (${A[i].id} vs ${B[i].id})`);
  }
  const ox = geoRoot.absoluteBoundingBox.x, oy = geoRoot.absoluteBoundingBox.y;
  const topIds = new Set((root.children || []).map(c => c.id));
  const scroll = (root.children || []).find(c => SCROLL_NAMES.has(c.name));

  const nodes = [];
  const byId = new Map();
  (function walk(n, parentId, inSvg) {
    if (n.visible === false) return;
    const g = twinOf.get(n.id);
    const svgRoot = !inSvg && n.id !== root.id && ((CONTAINER.has(n.type) && allVector(n)) || n.type === 'VECTOR');
    const fills = (g.fills || []).filter(p => vis(p) && p.type === 'SOLID' && alphaOf(p) > 0);
    const stroke = strokeSpec(g);
    const rad = radii(g);
    const effects = (g.effects || []).filter(e => vis(e) && e.type === 'DROP_SHADOW');
    let required = false, why = '';
    if (!inSvg) {
      if (n.id === root.id) { required = true; why = 'frame'; }
      else if (n.type === 'TEXT') { required = true; why = 'text'; }
      else if (svgRoot) { required = true; why = 'svg'; }
      else if (topIds.has(n.id)) { required = true; why = 'top'; }
      else if (['FRAME', 'RECTANGLE', 'ELLIPSE'].includes(n.type) && (fills.length || stroke || rad.some(r => r > 0) || effects.length)) { required = true; why = 'box'; }
    }
    const bb = g.absoluteBoundingBox;
    const e = {
      id: n.id, twin: s.twin ? g.id : null, name: n.name, type: n.type, parentId, required, why, svgRoot,
      rotated: !!(g.rotation && Math.abs(g.rotation) > 1e-6),
      box: bb ? { x: bb.x - ox, y: bb.y - oy, w: bb.width, h: bb.height } : null,
      fills, stroke, radii: rad, effects,
      // a partial ELLIPSE (arc or ring) cannot be a flat background; S2 then checks its paint colour instead
      arc: n.type === 'ELLIPSE' && g.arcData && (g.arcData.innerRadius > 0 || Math.abs(g.arcData.endingAngle - g.arcData.startingAngle) < 2 * Math.PI - 1e-3) ? g.arcData : null,
    };
    if (n.type === 'TEXT') {
      const st = g.style;
      const tf = (g.fills || []).filter(vis);
      e.text = {
        chars: n.characters, autoResize: st.textAutoResize, fontSize: st.fontSize, fontWeight: st.fontWeight,
        lineHeightPx: st.lineHeightPx, letterSpacing: st.letterSpacing ?? 0, align: st.textAlignHorizontal,
        color: tf[0] ? rgba(tf[0]) : null,
      };
    }
    nodes.push(e); byId.set(n.id, e);
    const kids = svgRoot || inSvg;
    for (const c of n.children || []) walk(c, required ? n.id : parentId, kids);
  })(root, null, false);

  return (cache[key] = {
    s, root: { id: root.id, name: root.name }, frameH: geoRoot.absoluteBoundingBox.height,
    scrollId: scroll ? scroll.id : null, nodes, byId,
    required: nodes.filter(n => n.required),
    texts: nodes.filter(n => n.type === 'TEXT' && n.required),
  });
}

export function nodeName(key, id) { return expected(key).byId.get(id)?.name ?? ''; }
