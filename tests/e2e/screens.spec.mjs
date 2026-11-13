// Every screen, Figma vs build: the phone screen alone (?solo=<key>, unscaled, full Figma height) is screenshotted
// and compared pixel by pixel with the Figma render of the same frame. Before/after images go to compare/img/.
// A zone the client recoloured (scripts/gen/palette.json) is compared on the Figma build (global-setup) and its
// deployed colours are checked separately below.
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { SCREENS, figmaPng, compare, write, result, THRESHOLD, PALETTE, FIGMA_BUILD } from './lib.mjs';

for (const s of SCREENS) {
  test(`screen ${s.key} matches Figma`, async ({ page }) => {
    const ref = figmaPng(s);
    await page.setViewportSize({ width: s.w || 402, height: Math.round(s.h) });
    if (PALETTE[s.zone]) await page.route(/\/screens\/gen\/screens\.(css|js)$/, r => r.fulfill({
      path: path.join(FIGMA_BUILD, path.basename(new URL(r.request().url()).pathname)) }));
    await page.goto(`/index.html?solo=${s.key}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    const build = PNG.sync.read(await page.screenshot({ fullPage: false }));
    const c = compare(ref, build);
    write(`img/${s.key}-figma.png`, PNG.sync.write(ref));
    write(`img/${s.key}-build.png`, PNG.sync.write(build));
    write(`img/${s.key}-diff.png`, PNG.sync.write(c.diff));
    result('screen', s.key, { key: s.key, zone: s.zone, n: s.n, node: s.node, file: s.file, w: build.width, h: build.height, figmaW: ref.width, figmaH: ref.height, pct: c.pct, sizeOk: c.sizeOk, pass: c.sizeOk && c.pct <= THRESHOLD });
    expect(c.sizeOk, `build ${build.width}×${build.height} vs Figma ${ref.width}×${ref.height}`).toBe(true);
    expect(c.pct, `pixel mismatch vs Figma`).toBeLessThanOrEqual(THRESHOLD);
  });
}

for (const [zone, pal] of Object.entries(PALETTE)) test(`zone ${zone} carries the client palette`, async ({ page }) => {
  const hex = c => '#' + c.match(/\d+/g).slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('');
  const bgs = new Set(), inks = new Set();
  for (const s of SCREENS.filter(x => x.zone === zone)) {
    await page.setViewportSize({ width: s.w || 402, height: Math.round(s.h) });
    await page.goto(`/index.html?solo=${s.key}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    for (const g of await page.evaluate(() => [...document.querySelectorAll('.fr *')].map(e => {
      const st = getComputedStyle(e); return { bg: st.backgroundColor, color: st.color, text: !!e.textContent.trim() && !e.children.length };
    }))) {
      if (!/^rgba\(.*, 0\)$|^transparent$/.test(g.bg)) bgs.add(hex(g.bg));
      if (g.text) inks.add(hex(g.color));
    }
  }
  const accent = pal.fill[pal.accent];
  expect([...bgs], 'new accent fill in use').toContain(accent);
  for (const old of Object.keys(pal.fill)) expect([...bgs], `Figma fill ${old} left`).not.toContain(old);
  for (const old of Object.keys(pal.ink)) expect([...inks], `Figma ink ${old} left`).not.toContain(old);
  result('check', `palette-${zone}`, { name: `Zone ${zone}: client palette (accent ${accent}) on every deployed screen, no Figma colour left`, pass: true });
});
