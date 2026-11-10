// Every screen, Figma vs build: the phone screen alone (?solo=<key>, unscaled, full Figma height) is screenshotted
// and compared pixel by pixel with the Figma render of the same frame. Before/after images go to compare/img/.
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { SCREENS, figmaPng, compare, write, result, THRESHOLD } from './lib.mjs';

for (const s of SCREENS) {
  test(`screen ${s.key} matches Figma`, async ({ page }) => {
    const ref = figmaPng(s);
    await page.setViewportSize({ width: s.w || 402, height: Math.round(s.h) });
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
