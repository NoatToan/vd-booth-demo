// Every screen, Figma vs build: the phone screen alone (?solo=<key>, unscaled, full Figma height) is screenshotted
// and compared pixel by pixel with the Figma render of the same frame. Before/after images go to compare/img/.
// The comparison runs on the Figma build (global-setup: no client palette, no client edits); the client's colour
// changes (scripts/gen/palette.json) and content edits (scripts/gen/client-edits.json) are checked separately below.
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { SCREENS, KIOSK_SCREENS, EDITS, figmaPng, compare, write, result, THRESHOLD, PALETTE, FIGMA_BUILD } from './lib.mjs';

for (const s of SCREENS) {
  test(`screen ${s.key} matches Figma`, async ({ page }) => {
    const ref = figmaPng(s);
    await page.setViewportSize({ width: s.w || 402, height: Math.round(s.h) });
    await page.route(/\/screens\/gen\/screens\.(css|js)$/, r => r.fulfill({
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

test('client edits are in the kiosk build', async ({ page }) => {
  const kiosk = new Set(KIOSK_SCREENS.map(s => s.key)), fails = [];
  for (const e of EDITS) {
    if (e.op === 'drop') { if (kiosk.has(e.screen)) fails.push(`${e.screen} still in the journey`); continue; }
    if (e.op === 'go') { const s = KIOSK_SCREENS.find(x => x.key === e.screen); if (!s || s.go !== e.go) fails.push(`${e.screen}: go ${s && s.go}`); continue; }
    await page.goto(`/index.html?solo=${e.screen}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    const got = await page.evaluate(e => {
      const q = id => document.querySelector(`[data-node="${id}"]`);
      if (e.op === 'text') return q(e.node) && q(e.node).textContent === e.text;
      if (e.op === 'remove') return !q(e.node);
      if (e.op === 'visaMark') return !!(q(e.node) && q(e.node).querySelector('svg.visa-mark') && !/VISA/.test(q(e.node).textContent));
      if (e.op === 'swap') { const [a, b] = e.nodes.map(q); return !!(a && b && (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING)); }
      if (e.op === 'cloneAfter') return Object.entries(e.texts).every(([id, t]) => { const c = q(`${id}~${e.suffix}`); return c && c.textContent === t; });
      return false;
    }, e);
    if (!got) fails.push(`${e.screen} ${e.op} ${e.node || e.nodes}`);
  }
  result('check', 'client-edits', { name: `Client edits (${EDITS.length}, feedback 2026-11-16) all present in the kiosk build`, pass: !fails.length });
  expect(fails).toEqual([]);
});

for (const [zone, pal] of Object.entries(PALETTE)) test(`zone ${zone} carries the client palette`, async ({ page }) => {
  const hex = c => '#' + c.match(/\d+/g).slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('');
  const bgs = new Set(), inks = new Set();
  for (const s of KIOSK_SCREENS.filter(x => x.zone === zone)) {
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
