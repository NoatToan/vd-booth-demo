// The animations from the Figma Make "Payments in Motion" (client feedback 2026-11-18): each one is played on the booth,
// recorded on video, and checked for timing, centring on the phone and the texts the Make shows.
//   pnpm --dir tests/e2e test animations      videos land in tests/e2e/test-results/ and docs/feedback/2026-11-18-pm/video/
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './lib.mjs';

const VIDEO_DIR = path.join(REPO, 'docs/feedback/2026-11-18-pm/video');
test.use({ viewport: { width: 1920, height: 1080 }, video: { mode: 'on', size: { width: 1920, height: 1080 } } });
test.afterEach(async ({ page }, info) => {
  const v = page.video(); if (!v) return;
  await page.close();
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  await v.saveAs(path.join(VIDEO_DIR, `${info.title.split(':')[0]}.webm`));
});

const open = async (page, step) => {
  await page.goto(`/index.html?goto=${step}&idle=999&nobeat=1&nosw=1`);
  await page.waitForFunction(() => window.VD && window.VD.state().view === 'flow');
  await page.waitForTimeout(1200);
};
const tap = page => page.locator('.viewport .scr:last-child [data-hotspot]').click();
const screen = page => page.evaluate(() => window.VD.state().screen);
// how far the drawn content of an element sits from the centre of the phone screen, in px
const offCentre = (page, sel) => page.evaluate(sel => {
  const host = document.querySelector('.viewport .scr:last-child'), el = document.querySelector(sel);
  if (!host || !el) return null;
  const parts = [...el.querySelectorAll('path, circle')].map(e => e.getBoundingClientRect()).filter(r => r.width);
  if (!parts.length) return null;
  const s = host.getBoundingClientRect();
  const cx = (Math.min(...parts.map(r => r.left)) + Math.max(...parts.map(r => r.right))) / 2;
  const cy = (Math.min(...parts.map(r => r.top)) + Math.max(...parts.map(r => r.bottom))) / 2;
  return { dx: Math.round(cx - (s.left + s.width / 2)), dy: Math.round(cy - (s.top + s.height / 2)) };
}, sel);

for (const [title, step, next, text] of [
  ['family-13: Face ID then Visa securing (light)', 'family:13', 'family-14', 'Authenticate to securely approve this payment'],
  ['send-7: Face ID then Visa securing (light)', 'send:7', 'send-8', 'Authenticate to securely authorize this transfer'],
]) test(title, async ({ page }) => {
  await open(page, step);
  await tap(page);
  // Face ID over the screen (Make NewPaymentMethod FaceIDScreen): the card, the Lottie drawing, the texts
  await expect(page.locator('.fx-fid .card')).toBeVisible();
  await expect(page.locator('.fx-fid b')).toHaveText('Verify with Face ID');
  await expect(page.locator('.fx-fid p')).toHaveText(text);
  await expect(page.locator('.fx-fid .lt svg')).toBeVisible();
  // then Securing (Make VdaUsa07, light): the Visa Lottie centred, then the tick, then the next step
  await expect(page.locator('.fx-sec:not(.dark) .lt svg')).toBeVisible({ timeout: 6000 });
  await page.waitForTimeout(900);
  const c = await offCentre(page, '.fx-sec .lt');
  expect(c, 'Visa wordmark centred on the phone').not.toBeNull();
  expect(Math.abs(c.dx)).toBeLessThanOrEqual(6);
  expect(Math.abs(c.dy)).toBeLessThanOrEqual(6);
  await expect(page.locator('.fx-sec .tick')).toBeVisible({ timeout: 3000 });
  const t = await offCentre(page, '.fx-sec');
  expect(Math.abs(t.dx)).toBeLessThanOrEqual(2);
  await expect.poll(() => screen(page), { timeout: 4000 }).toBe(next);
});

test('travel-6v: Verify it’s you, Face ID step (dark)', async ({ page }) => {
  await open(page, 'travel:6');
  await tap(page);
  await expect.poll(() => screen(page)).toBe('travel-6v');
  const fr = page.locator('.viewport .scr:last-child .fid-screen');
  await expect(fr.locator('h2')).toHaveText('Verify it’s you');
  await expect(fr.locator('.bar')).toHaveText('Verification');
  await expect(fr.locator('.lbl')).toHaveText('Scanning…');
  await expect(fr.locator('.lt svg')).toBeVisible();
  // the Lottie at 1.3× ends after about 4.6 s: "Face ID confirmed", then the next step by itself
  await expect(fr.locator('.lbl')).toHaveText('Face ID confirmed', { timeout: 6000 });
  await expect.poll(() => screen(page), { timeout: 3000 }).toBe('travel-7');
});

test('travel-9: Visa securing (dark) after the issuer approval', async ({ page }) => {
  await open(page, 'travel:10');
  expect(await screen(page)).toBe('travel-9');
  await tap(page);
  await expect(page.locator('.fx-sec.dark .lt svg')).toBeVisible();
  await page.waitForTimeout(1000);
  const c = await offCentre(page, '.fx-sec .lt');
  expect(Math.abs(c.dx)).toBeLessThanOrEqual(6);
  expect(Math.abs(c.dy)).toBeLessThanOrEqual(6);
  await expect(page.locator('.fx-sec.dark .tick')).toBeVisible({ timeout: 2000 });
  await expect.poll(() => screen(page), { timeout: 4000 }).toBe('travel-11');
});

test('travel-5: card check while the card is added', async ({ page }) => {
  await open(page, 'travel:4');
  await tap(page);
  await expect.poll(() => screen(page)).toBe('travel-5');
  const fr = page.locator('.viewport .scr:last-child');
  await expect(fr.locator('.fx-cardcheck .run')).toHaveText('Validating card…', { timeout: 5000 });
  await expect(fr.locator('.fx-cardvisa')).toBeVisible();
  await expect(fr.locator('.fx-cardcheck .ok')).toHaveText('Card eligible for funding', { timeout: 2000 });
  await expect(fr.locator('.fx-cardcheck .sub')).toHaveText('🇦🇺This card is billed in AUD · Outback Bank, Sydney');
  await expect(fr.locator('[data-node="2:16043"]')).toHaveText('•••', { timeout: 2000 });
});

test('receive-2: the numbers populate', async ({ page }) => {
  await page.goto('/index.html?goto=receive:1&idle=999&nobeat=1&nosw=1');
  await page.waitForFunction(() => window.VD && window.VD.state().view === 'flow');
  await page.waitForTimeout(1200);
  await tap(page);
  await expect.poll(() => screen(page)).toBe('receive-2');
  const amt = page.locator('.viewport .scr:last-child [data-node="2:5676"]');
  await page.waitForTimeout(700);
  expect((await amt.textContent()).length, 'the amount is still typing in').toBeLessThan('2,500.00'.length);
  await expect(page.locator('.viewport .scr:last-child [data-node="2:5688"]')).toHaveText('63,295,800', { timeout: 5000 });
  await expect(amt).toHaveText('2,500.00');
});
