#!/usr/bin/env node
// Vector geometry from a .fig -> one SVG per IMAGE-SVG name, the same files GET /v1/images?format=svg would give.
//   node scripts/figma-fig/fig2svg.mjs <fileKey> [outDir]      default outDir: figma/assets/<fileKey>
// Needs figma/rest/<key>.json + figma/fig/<key>.geometry.json from fig2rest.mjs. An IMAGE-SVG root is a VECTOR, or a
// frame whose children are all VECTORs (Framelink's collapse rule; isSvgRoot in scripts/gen/lib/figma.mjs).
// The viewBox is the root's layout box. Strokes are written as filled outlines (Figma's strokeGeometry), which
// draws the same pixels as Figma's own stroke export; fills keep their winding rule.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const r4 = v => +v.toFixed(4);

/** Figma path blob: [u8 cmd][f32 LE ...]: 0 close, 1 move(x,y), 2 line(x,y), 3 quad(x1,y1,x,y), 4 cubic(x1,y1,x2,y2,x,y). */
export function blobToPath(b64, dx, dy) {
  const b = Buffer.from(b64, 'base64'); let o = 0, d = '';
  const f = () => { const v = b.readFloatLE(o); o += 4; return v; };
  const pt = () => `${r4(f() + dx)} ${r4(f() + dy)}`;
  while (o < b.length) {
    const c = b[o++];
    if (c === 0) d += 'Z';
    else if (c === 1) d += `M${pt()}`;
    else if (c === 2) d += `L${pt()}`;
    else if (c === 3) d += `Q${pt()} ${pt()}`;
    else if (c === 4) d += `C${pt()} ${pt()} ${pt()}`;
    else throw new Error(`path command ${c} at ${o - 1}`);
  }
  return d;
}

const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
/** fill attributes for the top visible paint: SOLID -> colour, GRADIENT_LINEAR -> a <linearGradient> in defs. */
function paintAttrs(paints, n, dx, dy, defs) {
  const p = (paints || []).filter(x => x.visible !== false);
  if (!p.length) return null;
  if (p.length > 1) throw new Error(`${n.id}: multiple paints on one shape`);
  const q = p[0], po = q.opacity ?? 1;
  if (q.type === 'SOLID') { const a = (q.color.a ?? 1) * po; return `fill="${hex(q.color)}"${a < 1 ? ` fill-opacity="${r4(a)}"` : ''}`; }
  if (q.type === 'GRADIENT_LINEAR') {
    const { width: w, height: h } = n.absoluteBoundingBox, [a, b] = q.gradientHandlePositions, id = `g${n.id.replace(/\W/g, '_')}_${defs.length}`;
    const stops = q.gradientStops.map(s => `<stop offset="${r4(s.position)}" stop-color="${hex(s.color)}"${(s.color.a ?? 1) * po < 1 ? ` stop-opacity="${r4((s.color.a ?? 1) * po)}"` : ''}/>`).join('');
    defs.push(`<linearGradient id="${id}" x1="${r4(dx + a.x * w)}" y1="${r4(dy + a.y * h)}" x2="${r4(dx + b.x * w)}" y2="${r4(dy + b.y * h)}" gradientUnits="userSpaceOnUse">${stops}</linearGradient>`);
    return `fill="url(#${id})"`;
  }
  throw new Error(`${n.id}: ${q.type} paint in an SVG`);
}

export function svgFor(root, geometry) {
  const bb = root.absoluteBoundingBox, parts = [], defs = [];
  // paint order: a node's own fill, then its stroke, then its children (Figma's layer order)
  const draw = n => {
    if (n.visible === false) return;
    const g = geometry[n.id];
    if (n.type === 'VECTOR' && !g) throw new Error(`no geometry for ${n.id}`);
    if (g) {
      const dx = n.absoluteBoundingBox.x - bb.x, dy = n.absoluteBoundingBox.y - bb.y;
      const op = n.opacity !== undefined && n.opacity !== 1 ? ` opacity="${r4(n.opacity)}"` : '';
      const fill = paintAttrs(n.fills, n, dx, dy, defs);
      if (fill) for (const p of g.fill) parts.push(`<path d="${blobToPath(p.blob, dx, dy)}"${p.rule === 'EVENODD' ? ' fill-rule="evenodd"' : ''} ${fill}${op}/>`);
      const stroke = paintAttrs(n.strokes, n, dx, dy, defs);
      if (stroke) for (const p of g.stroke) parts.push(`<path d="${blobToPath(p.blob, dx, dy)}"${p.rule === 'EVENODD' ? ' fill-rule="evenodd"' : ''} ${stroke}${op}/>`);
    }
    (n.children || []).forEach(draw);
  };
  if (root.type === 'VECTOR') draw(root); else (root.children || []).forEach(draw);
  const w = r4(bb.width), h = r4(bb.height);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg">\n${parts.join('\n')}${defs.length ? `\n<defs>${defs.join('')}</defs>` : ''}\n</svg>\n`;
}

const isSvgRoot = n => n.type === 'VECTOR' || (n.type !== 'VECTOR' && !!n.children && n.children.length > 0 && n.children.every(c => c.type === 'VECTOR'));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , key, outDir = `${ROOT}/figma/assets/${key}`] = process.argv;
  const rest = JSON.parse(readFileSync(`${ROOT}/figma/rest/${key}.json`, 'utf8'));
  const geometry = JSON.parse(readFileSync(`${ROOT}/figma/fig/${key}.geometry.json`, 'utf8'));
  mkdirSync(outDir, { recursive: true });
  const done = new Set(); let written = 0, kept = 0;
  const emit = n => {
    const name = slug(n.name);
    if (done.has(name)) return;
    done.add(name);
    const path = `${outDir}/${name}.svg`;
    if (existsSync(path) && process.argv.includes('--keep')) kept++;
    else { writeFileSync(path, svgFor(n, geometry)); written++; }
  };
  // one asset per name for both rules: the generator's isSvgRoot, and every IMAGE-SVG node of the Framelink pull
  // (figma/<key>.json), whose collapse rule also folds whole illustrations into one SVG
  const byId = new Map(), index = n => { byId.set(n.id, n); (n.children || []).forEach(index); };
  index(rest.document);
  const fl = JSON.parse(readFileSync(`${ROOT}/figma/${key}.json`, 'utf8'));
  const flSvg = n => { const t = { ...(fl.elements?.[n.template] || {}), ...n }; if (t.type === 'IMAGE-SVG') { const r = byId.get(n.id); if (!r) throw new Error(`Framelink IMAGE-SVG ${n.id} not in REST`); emit(r); } (n.children || []).forEach(flSvg); };
  fl.nodes.forEach(flSvg);
  const walk = n => { if (n.type !== 'DOCUMENT' && n.type !== 'CANVAS' && isSvgRoot(n)) return emit(n); (n.children || []).forEach(walk); };
  walk(rest.document);
  console.log(`${key}: ${done.size} svg names, ${written} written${kept ? `, ${kept} kept` : ''} -> ${outDir}`);
}
