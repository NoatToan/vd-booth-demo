// Long-run soak: the kiosk plays the five journeys back to back, as visitors would all day, and samples Chrome's
// metrics after every journey (JS heap after GC, DOM nodes, event listeners, documents, CPU time). It fails when the
// heap or the DOM keeps growing, which is what would take a booth screen down after hours.
//   SOAK=10 pnpm --dir tests/e2e test soak      (minutes; skipped without SOAK)    -> compare/soak.json + soak.csv
import { test, expect } from '@playwright/test';
import { SCREENS, ZONES, write } from './lib.mjs';

test('soak: journeys back to back, no heap or DOM growth', async ({ page }) => {
  const minutes = +process.env.SOAK || 0;
  test.skip(!minutes, 'set SOAK=<minutes>');
  test.setTimeout((minutes + 5) * 60_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const sample = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2), nodes: m.Nodes, listeners: m.JSEventListeners, documents: m.Documents, cpuS: +(m.TaskDuration).toFixed(1) };
  };
  await page.goto('/index.html?idle=600');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  const rows = [], t0 = Date.now();
  let cycle = 0;
  while (Date.now() - t0 < minutes * 60_000) {
    const z = ZONES[cycle % ZONES.length].zone;
    await page.evaluate(() => window.VD && document.querySelector('[data-a="restart"]')?.click());
    await page.locator('[data-a="start"]').click();
    await page.locator(`[data-a="pick"][data-v="${z}"]`).click();
    for (const s of SCREENS.filter(x => x.zone === z)) {
      await expect.poll(() => page.locator('#phone').getAttribute('data-screen'), { timeout: 15_000 }).toBe(s.key);
      await page.waitForTimeout(450);
      if (s.go === 'kiosk-next') await page.locator('#kiosk-next').click();
      else if (s.go === 'kiosk-finish') await page.locator('#kiosk-finish').click();
      else if (!s.go.startsWith('auto:')) await page.locator('.viewport .scr:last-child [data-hotspot]').click();
    }
    await expect.poll(() => page.evaluate(() => window.VD.state().view), { timeout: 15_000 }).toBe('done');
    await page.locator('[data-a="restart"]').click(); // back to the attract screen, as after a visitor leaves
    await page.waitForTimeout(1500);
    rows.push({ cycle: ++cycle, zone: z, t: Math.round((Date.now() - t0) / 1000), ...(await sample()) });
  }
  const first = rows[Math.min(2, rows.length - 1)], last = rows.at(-1); // skip warm-up cycles
  const summary = { minutes, cycles: rows.length, errors, warm: first, last,
    heapGrowthMB: +(last.heapMB - first.heapMB).toFixed(2), nodeGrowth: last.nodes - first.nodes, listenerGrowth: last.listeners - first.listeners };
  write('soak.json', JSON.stringify({ summary, rows }, null, 1));
  write('soak.csv', ['cycle,zone,t,heapMB,nodes,listeners,documents,cpuS', ...rows.map(r => [r.cycle, r.zone, r.t, r.heapMB, r.nodes, r.listeners, r.documents, r.cpuS].join(','))].join('\n') + '\n');
  console.log(JSON.stringify(summary));
  expect(errors).toEqual([]);
  expect(summary.heapGrowthMB).toBeLessThan(5);
  expect(summary.nodeGrowth).toBeLessThan(500);
  expect(summary.listenerGrowth).toBeLessThan(100);
});
