// All-day running: offline cache, error recovery, heartbeat. (The soak test is soak.spec.mjs.)
import { test, expect } from '@playwright/test';
import { result } from './lib.mjs';

test('offline: after one online visit the kiosk opens and plays with the network down', async ({ page, context }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html?sw=1');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready.then(r => !!r.active));
  await page.waitForFunction(async () => (await caches.keys()).some(k => /^vd-booth-[0-9a-f]{12}$/.test(k)), null, { timeout: 30_000 });
  await page.reload(); // the page is now controlled by the service worker
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await expect(page.locator('.idle .kv-title')).toBeVisible();
  // a journey with photos (travel) and the Visa fonts, all from the cache
  await page.goto('/index.html?sw=1&goto=travel:1');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  const photo = await page.evaluate(() => new Promise(res => { const el = document.querySelector('.viewport .scr:last-child [style*="background-image"], .viewport .scr:last-child .fr *');
    const url = [...document.querySelectorAll('.viewport .scr:last-child *')].map(e => getComputedStyle(e).backgroundImage).find(b => b.includes('fills/'));
    if (!url) return res('no photo'); const img = new Image(); img.onload = () => res('ok'); img.onerror = () => res('failed'); img.src = url.slice(5, -2); }));
  expect(photo).toBe('ok');
  expect(await page.evaluate(() => document.fonts.check('16px "Visa Dialect"'))).toBe(true);
  await context.setOffline(false);
  result('check', 'offline', { name: 'Offline: after one visit the kiosk reloads and plays (photos, fonts) with the network down', pass: true });
});

test('errors during a journey send the kiosk back to the attract screen', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html?goto=send:3');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  for (let i = 0; i < 3; i++) await page.evaluate(() => setTimeout(() => { throw new Error('simulated failure'); }));
  await expect.poll(() => page.evaluate(() => window.VD.state().view), { timeout: 5000 }).toBe('idle');
  result('check', 'errors', { name: 'Error recovery: 3 errors within a minute during a journey return to the attract screen', pass: true });
});

test('heartbeat reports the screen every minute', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  let body = null;
  await page.route('**/api/heartbeat', r => { body = JSON.parse(r.request().postData()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await page.goto('/index.html?beat=1&zone=aft-travel&device=led-travel');
  await expect.poll(() => body, { timeout: 12_000 }).not.toBeNull();
  expect(body).toMatchObject({ device: 'led-travel', zone: 'travel', view: 'idle', errors: 0, online: true });
  expect(typeof body.uptimeS).toBe('number');
  result('check', 'heartbeat', { name: 'Heartbeat: device, zone, view, uptime, errors posted to /api/heartbeat', pass: true });
});

test.describe('on a TV browser', () => {
  test.use({ userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.0 TV Safari/537.36' });
  test('a Samsung Tizen TV gets the light mode automatically', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html');
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    expect(await page.evaluate(() => document.documentElement.classList.contains('lowfx'))).toBe(true);
    // no full-screen blur on the attract screen, fewer streaks
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.idle')).animationName)).toBe('kv-in-low');
    expect(await page.locator('.idle .kv-streaks span:visible').count()).toBe(4);
    result('check', 'tv', { name: 'TV browser (Tizen UA): light mode on, no full-screen blur, 4 streaks', pass: true });
  });
});
