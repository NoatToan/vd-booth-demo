// Every journey, clicked through as a visitor would on the booth screen (1920×1080): lock link → attract → each step
// by its own CTA, the kiosk Next / Finish, or the auto-advance → Done with the lead-form QR. One kiosk shot per step.
import { test, expect } from '@playwright/test';
import { SCREENS, ZONES, write, result } from './lib.mjs';

const screenKey = page => page.locator('#phone').getAttribute('data-screen');

for (const z of ZONES) {
  test(`journey ${z.zone}: ?zone=${z.link} runs start to Done`, async ({ page }) => {
    const steps = SCREENS.filter(s => s.zone === z.zone);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/index.html?zone=${z.link}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await page.locator('[data-a="start"]').click();
    const shots = [];
    for (const [i, s] of steps.entries()) {
      await expect.poll(() => screenKey(page), { message: `step ${i + 1} should be ${s.key}`, timeout: 12_000 }).toBe(s.key);
      await page.waitForTimeout(700); // push transition + entry motion
      write(`flow/${s.key}.png`, await page.screenshot());
      shots.push({ key: s.key, n: s.n, go: s.go });
      // where to tap: the CTA carries a pulse ring (or Next / Finish pulse); a CTA below the fold has the scroll cue
      const cue = await expect.poll(() => page.evaluate(go => {
        const scr = document.querySelector('.viewport .scr:last-child'), cue = document.querySelector('#scroll-cue');
        const cueOn = cue && !cue.hidden && cue.getBoundingClientRect().height > 0;
        if (go === 'kiosk-next') return document.querySelector('#kiosk-next.pulse') ? 'ok' : 'no pulse on Next';
        if (go === 'kiosk-finish') return document.querySelector('#kiosk-finish.pulse') ? 'ok' : 'no pulse on Finish';
        if (go.startsWith('auto:')) return 'ok';
        const hot = scr.querySelector('[data-hotspot]'), sc = scr.querySelector('[data-role="scroll"]');
        const h = hot.getBoundingClientRect(), v = (sc && sc.contains(hot) ? sc : scr).getBoundingClientRect();
        const inView = h.top >= v.top - 1 && h.bottom <= v.bottom + 1;
        const ring = scr.querySelector('.hot-ring');
        if (inView) return ring && !ring.hidden ? 'ok' : 'CTA in view but no ring';
        return cueOn ? 'ok' : 'CTA below the fold and no scroll cue';
      }, s.go), { message: `${s.key}: tap target is indicated`, timeout: 8_000 }).toBe('ok');
      // the scroll cue never sits on the phone
      const overlap = await page.evaluate(() => {
        const cue = document.querySelector('#scroll-cue'); if (!cue || cue.hidden) return false;
        const a = cue.getBoundingClientRect(), b = document.querySelector('#phone').getBoundingClientRect();
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      });
      expect(overlap, `${s.key}: scroll cue overlaps the phone`).toBe(false);
      // the kiosk Next / Finish buttons appear exactly on the steps without a CTA
      await expect(page.locator('#kiosk-next')).toBeVisible({ visible: s.go === 'kiosk-next' });
      await expect(page.locator('#kiosk-finish')).toBeVisible({ visible: s.go === 'kiosk-finish' });
      if (s.go === 'kiosk-next') await page.locator('#kiosk-next').click();
      else if (s.go === 'kiosk-finish') await page.locator('#kiosk-finish').click();
      else if (s.go.startsWith('auto:')) { /* status screen moves on by itself */ }
      else await page.locator(`.viewport .scr:last-child [data-hotspot]`).click();
    }
    await expect.poll(() => page.evaluate(() => window.VD.state().view), { timeout: 12_000 }).toBe('done');
    const qr = await page.locator('#qr').getAttribute('title');
    write(`flow/${z.zone}-done.png`, await page.screenshot());
    result('flow', z.zone, { zone: z.zone, name: z.name, link: z.link, steps: shots, qr, errors, pass: !errors.length && qr === `https://vd-booth-demo.vercel.app/lead/?exp=${z.zone}` });
    expect(qr).toBe(`https://vd-booth-demo.vercel.app/lead/?exp=${z.zone}`);
    expect(errors).toEqual([]);
  });
}

test('buttons without an action give no press feedback', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html?goto=receive:3');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.waitForTimeout(600);
  // "Copy" on Receiving details looks like a button but does nothing in the demo
  const copy = page.locator('.viewport .scr:last-child span', { hasText: /^Copy$/ }).first();
  const box = await copy.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const pressed = await page.locator('.viewport .pressed').count();
  await page.mouse.up();
  result('check', 'inert', { name: 'Inert button (receive-3 "Copy") shows no press feedback', pass: pressed === 0 });
  expect(pressed).toBe(0);
});
