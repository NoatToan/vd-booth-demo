// Shared helpers: the screen manifest, Figma reference PNGs, pixel comparison, result files for the compare page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../..');
export const OUT = path.join(HERE, 'compare');
export const SCREENS = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/verify/screens.json'), 'utf8')).screens;
export const ZONES = [
  { zone: 'send', link: 'send', name: 'SEND · Send abroad (Visa Direct)' },
  { zone: 'receive', link: 'vxbs-individual', name: 'RECEIVE · Individual receiver (VXBS)' },
  { zone: 'collect', link: 'vxbs-seller', name: 'RECEIVE · E-seller withdrawal (VXBS)' },
  { zone: 'family', link: 'aft-family', name: 'RECEIVE · Friends & family (cross-border AFT)' },
  { zone: 'travel', link: 'aft-travel', name: 'RECEIVE · Travel wallet (cross-border AFT)' },
];
export const THRESHOLD = 3; // % of pixels, the verify harness's P1 gate

/** Figma PNG composited on white (renders have transparent rounded corners). */
export function figmaPng(s) {
  const src = PNG.sync.read(fs.readFileSync(path.join(REPO, 'figma/screens', s.file, s.png)));
  const out = new PNG({ width: src.width, height: src.height });
  for (let i = 0; i < src.data.length; i += 4) {
    const a = src.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(src.data[i + c] * a + 255 * (1 - a));
    out.data[i + 3] = 255;
  }
  return out;
}

/** Mismatch % of two same-size PNGs and the diff image (pixelmatch threshold 0.1, anti-aliasing ignored: as the harness's P1). */
export function compare(a, b) {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  const crop = img => { if (img.width === w && img.height === h) return img; const o = new PNG({ width: w, height: h }); PNG.bitblt(img, o, 0, 0, w, h, 0, 0); return o; };
  const A = crop(a), B = crop(b), diff = new PNG({ width: w, height: h });
  const n = pixelmatch(A.data, B.data, diff.data, w, h, { threshold: 0.1, includeAA: false, alpha: 0.25 });
  return { pct: +(100 * n / (w * h)).toFixed(3), diff, sizeOk: a.width === b.width && a.height === b.height };
}

export const write = (rel, data) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
export const result = (kind, key, obj) => write(`results/${kind}-${key}.json`, JSON.stringify(obj, null, 1));
