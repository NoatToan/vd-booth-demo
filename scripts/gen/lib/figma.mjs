// Figma REST JSON helpers: loading, indexing, pre-order twin mapping, colour formatting.
import { readFileSync } from 'node:fs';

export function loadFile(root, fileKey) {
  const json = JSON.parse(readFileSync(`${root}/figma/rest/${fileKey}.json`, 'utf8'));
  const byId = new Map(), parent = new Map();
  const walk = (n, p) => {
    byId.set(n.id, n);
    if (p) parent.set(n.id, p);
    for (const c of n.children || []) walk(c, n);
  };
  walk(json.document, null);
  return { fileKey, json, byId, parent };
}

export function preorder(n, out = []) {
  out.push(n);
  for (const c of n.children || []) preorder(c, out);
  return out;
}

/** Map twin (11:*) id -> app (2:*) id by pre-order index. Throws if the trees disagree. */
export function twinMap(appFrame, twinFrame) {
  const a = preorder(appFrame), b = preorder(twinFrame);
  if (a.length !== b.length) throw new Error(`twin ${twinFrame.id}: ${b.length} nodes vs ${a.length} in ${appFrame.id}`);
  const m = new Map();
  b.forEach((n, i) => {
    if (i > 0 && (n.type !== a[i].type || n.name !== a[i].name)) throw new Error(`twin mismatch at ${i}: ${n.id} ${n.name} vs ${a[i].id} ${a[i].name}`);
    if (i > 0 && n.characters !== a[i].characters) throw new Error(`twin text mismatch ${n.id} vs ${a[i].id}`);
    m.set(n.id, a[i].id);
  });
  return m;
}

/** An IMAGE-SVG root: a VECTOR, or a non-vector node whose direct children are all VECTORs (Framelink's collapse rule). */
export const isSvgRoot = n => n.type === 'VECTOR' || (n.type !== 'VECTOR' && !!n.children && n.children.length > 0 && n.children.every(c => c.type === 'VECTOR'));

const r6 = v => Math.round(v * 1e4) / 1e4;
export const px = v => `${r6(v)}px`;

/** CSS colour from a Figma colour + paint opacity. */
export function rgba(c, opacity = 1) {
  const a = r6((c.a ?? 1) * opacity);
  const ch = v => Math.round(v * 255);
  if (a >= 1) {
    const h = x => ch(x).toString(16).padStart(2, '0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  }
  return `rgba(${ch(c.r)},${ch(c.g)},${ch(c.b)},${a})`;
}

/** Visible SOLID paints in paint order (bottom first). Non-solid paints are a generator error: the data has none. */
export function solidPaints(paints = []) {
  return paints.filter(p => p.visible !== false).map(p => {
    if (p.type !== 'SOLID') throw new Error(`unsupported paint ${p.type}`);
    return { color: p.color, opacity: p.opacity ?? 1 };
  }).filter(p => (p.color.a ?? 1) * p.opacity > 0);
}

// REST `rotation` maps to CSS rotate() with the same sign: 2:6228 (-0.209 rad) is tilted counter-clockwise
// in 2-6212_funds-arrived-success.png, which is what rotate(-12deg) draws.
export const deg = rad => rad * 180 / Math.PI;

export const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escAttr = s => esc(s).replace(/"/g, '&quot;');
