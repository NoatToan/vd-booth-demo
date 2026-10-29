// PNG helpers + pixelmatch (v7, classic YIQ threshold semantics as assumed by IMPL-PLAN §3 P1).
import fs from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const readPng = f => PNG.sync.read(fs.readFileSync(f));
export const decode = buf => PNG.sync.read(buf);
export const writePng = (f, img) => fs.writeFileSync(f, PNG.sync.write(img));

/** Flatten onto #fff and fit to w×h (crop, or pad with white). */
export function flatten(img, w = img.width, h = img.height) {
  const out = new PNG({ width: w, height: h });
  out.data.fill(255);
  const cw = Math.min(w, img.width), ch = Math.min(h, img.height);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = (y * img.width + x) * 4, o = (y * w + x) * 4, a = img.data[i + 3] / 255;
    out.data[o] = Math.round(img.data[i] * a + 255 * (1 - a));
    out.data[o + 1] = Math.round(img.data[i + 1] * a + 255 * (1 - a));
    out.data[o + 2] = Math.round(img.data[i + 2] * a + 255 * (1 - a));
    out.data[o + 3] = 255;
  }
  return out;
}

/** P1 measurement: mismatch % = diff / (w·h). Returns the diff image and a 1-byte-per-pixel mask. */
export function compare(refImg, buildImg, w = refImg.width, h = refImg.height) {
  const a = flatten(refImg, w, h), b = flatten(buildImg, w, h);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.1, includeAA: false, diffColor: [255, 0, 0], aaColor: [255, 255, 0] });
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (diff.data[i * 4] === 255 && diff.data[i * 4 + 1] === 0 && diff.data[i * 4 + 2] === 0) mask[i] = 1;
  return { pct: (n / (w * h)) * 100, n, diff, mask, ref: a, build: b, w, h };
}

/** Exact pixel difference count (determinism gate D), with the bounding box of the differing pixels. */
export function exactDiff(a, b, withBox = false) {
  if (a.width !== b.width || a.height !== b.height) { const n = Math.max(a.width * a.height, b.width * b.height); return withBox ? { n, box: 'size differs' } : n; }
  let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let i = 0; i < a.data.length; i += 4)
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
      n++; const p = i / 4, x = p % a.width, y = (p - x) / a.width;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  return withBox ? { n, box: n ? `${x0},${y0} ${x1 - x0 + 1}×${y1 - y0 + 1}` : null } : n;
}

/** Shift an image by dx,dy (fills with white). Selftest only. */
export function shift(img, dx, dy) {
  const out = new PNG({ width: img.width, height: img.height });
  out.data.fill(255);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const sx = x - dx, sy = y - dy;
    if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
    img.data.copy(out.data, (y * img.width + x) * 4, (sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4);
  }
  return out;
}
