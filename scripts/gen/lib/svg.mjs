// IMAGE-SVG roots -> inline <svg>. Assets are exported once per name with a fixed colour and size,
// so single-colour icons are recoloured (currentColor) and resized per instance (rule 11).
import { readFileSync, existsSync } from 'node:fs';
import { rgba, solidPaints } from './figma.mjs';

export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const cache = new Map();
function loadAsset(root, fileKey, name) {
  const path = `${root}/figma/assets/${fileKey}/${slug(name)}.svg`;
  if (cache.has(path)) return cache.get(path);
  if (!existsSync(path)) throw new Error(`missing SVG asset ${path} (node name "${name}")`);
  const src = readFileSync(path, 'utf8').trim();
  const open = src.match(/^<svg\b[^>]*>/);
  if (!open) throw new Error(`not an svg: ${path}`);
  const vb = open[0].match(/viewBox="([^"]+)"/);
  const [, , vbW, vbH] = vb ? vb[1].split(/\s+/).map(Number) : [0, 0, +open[0].match(/width="([\d.]+)"/)[1], +open[0].match(/height="([\d.]+)"/)[1]];
  const inner = src.slice(open[0].length).replace(/<\/svg>\s*$/, '').trim();
  const colours = new Set();
  let usesStroke = false, usesFill = false;
  for (const m of inner.matchAll(/\b(fill|stroke)="([^"]+)"/g)) {
    if (m[2] === 'none' || m[2].startsWith('url(')) continue;
    // a clipPath/mask rect painted white is not a visible colour
    colours.add(m[2].toLowerCase());
    if (m[1] === 'stroke') usesStroke = true; else usesFill = true;
  }
  // colours used only inside <defs>/<mask> do not count as artwork colours
  const art = inner.replace(/<defs>[\s\S]*?<\/defs>/g, '').replace(/<mask\b[\s\S]*?<\/mask>/g, '');
  const artColours = new Set([...art.matchAll(/\b(?:fill|stroke)="([^"]+)"/g)].map(m => m[1].toLowerCase()).filter(v => v !== 'none' && !v.startsWith('url(')));
  const a = { path, vbW, vbH, viewBox: vb ? vb[1] : `0 0 ${vbW} ${vbH}`, inner, single: artColours.size === 1, artColour: [...artColours][0], usesStroke, usesFill };
  cache.set(path, a);
  return a;
}

function firstVector(n) {
  if (n.type === 'VECTOR') return n;
  return (n.children || []).find(c => c.type === 'VECTOR' && (solidPaints(c.strokes).length || solidPaints(c.fills).length)) || (n.children || [])[0];
}

/**
 * Returns { inner, viewBox, color|null } for an IMAGE-SVG root node drawn in a w×h box.
 * A FRAME root was exported at its frame bounds, so its asset is scaled to the instance box.
 * A VECTOR root was exported at its render bounds, which can differ from the layout box
 * (e.g. "International route": box 160×72, artwork 50×72), so the artwork is centred on the render bounds.
 */
export function svgFor(root, fileKey, node, w, h, assetName = node.name) {
  const a = loadAsset(root, fileKey, assetName);
  const [vbX, vbY] = a.viewBox.split(/\s+/).map(Number);
  let viewBox = a.viewBox, scale = w / a.vbW;
  if (node.type === 'VECTOR') {
    const bb = node.absoluteBoundingBox, rb = node.absoluteRenderBounds || bb;
    scale = Math.abs(a.vbW - rb.width) < 4 && Math.abs(a.vbH - rb.height) < 4 ? 1 : rb.width / a.vbW;
    const cx = rb.x + rb.width / 2 - bb.x, cy = rb.y + rb.height / 2 - bb.y;
    const r = v => +v.toFixed(4);
    viewBox = `${r(vbX + a.vbW / 2 - cx / scale)} ${r(vbY + a.vbH / 2 - cy / scale)} ${r(w / scale)} ${r(h / scale)}`;
  }
  let inner = a.inner;
  // ids must be unique per document (clip paths inside hidden screens would otherwise resolve to the wrong copy)
  const suffix = `_${node.id.replace(/[^0-9a-z]/gi, '_')}`;
  inner = inner.replace(/\bid="([^"]+)"/g, (_, id) => `id="${id}${suffix}"`).replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${id}${suffix})`);
  let color = null;
  if (a.single) {
    const v = firstVector(node);
    const strokes = solidPaints(v.strokes), fills = solidPaints(v.fills);
    const paint = (a.usesStroke && strokes[0]) || (a.usesFill && fills[0]) || strokes[0] || fills[0];
    if (!paint) throw new Error(`no paint on vector of ${node.id} ${node.name}`);
    color = rgba(paint.color, paint.opacity);
    const art = a.artColour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    inner = inner.replace(new RegExp(`\\b(fill|stroke)="${art}"`, 'gi'), '$1="currentColor"');
    // Stroke width: REST gives the instance's real weight in px; express it in viewBox units.
    if (a.usesStroke && strokes.length && v.strokeWeight) {
      const sw = +(v.strokeWeight / scale).toFixed(4);
      inner = inner.replace(/<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*?)(\/?)>/g, (m, tag, attrs, close) => {
        if (!/\bstroke="currentColor"/.test(attrs)) return m;
        attrs = /\bstroke-width="/.test(attrs) ? attrs.replace(/\bstroke-width="[^"]*"/, `stroke-width="${sw}"`) : `${attrs} stroke-width="${sw}"`;
        return `<${tag}${attrs}${close}>`;
      });
    }
  }
  return { inner, viewBox, color };
}
