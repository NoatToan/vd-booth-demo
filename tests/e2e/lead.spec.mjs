// Lead form (lead/index.html): layout, field validation, server errors, success; plus an opt-in live run that submits
// to production, reads the row back from Postgres through the export API, and saves the export.
//   pnpm --dir tests/e2e test lead                 UI checks against the local page (/api/lead mocked)
//   LIVE=1 pnpm --dir tests/e2e test lead          + real submissions to https://vd-booth-demo.vercel.app
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { write, result } from './lib.mjs';

const LIVE = 'https://vd-booth-demo.vercel.app';
const fill = async (page, v) => {
  for (const [name, val] of Object.entries(v)) if (val !== undefined) await page.locator(`[name="${name}"]`).fill(val);
};

test.describe('lead form UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
  });

  test('header and form share one panel, no empty "you tried" pill', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/lead/');
    const h = await page.locator('header').boundingBox(), m = await page.locator('main').boundingBox(), w = await page.locator('#wrap').boundingBox();
    expect(Math.abs(h.x - w.x)).toBeLessThan(1); expect(Math.abs(h.width - w.width)).toBeLessThan(1);
    expect(Math.abs(m.x - h.x)).toBeLessThan(1); expect(Math.abs(m.width - h.width)).toBeLessThan(1);
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor), panelBg = await page.evaluate(() => getComputedStyle(document.querySelector('main')).backgroundColor);
    expect(panelBg).not.toBe(bodyBg);
    await expect(page.locator('#tried')).toBeHidden();
    write('lead/desktop.png', await page.screenshot({ fullPage: true }));
    result('check', 'lead-layout', { name: 'Lead form: header and form panel aligned, distinct backdrop, no empty pill', pass: true });
  });

  test('field errors: bad name, email, phone, missing consent', async ({ page }) => {
    let posted = 0;
    await page.route('**/api/lead', r => { posted++; return r.fulfill({ status: 201, body: '{"ok":true}' }); });
    await page.goto('/lead/?exp=travel');
    await expect(page.locator('#tried')).toHaveText('You tried: Travel wallet · cross-border AFT');
    await fill(page, { fullName: '123123', email: '123123123', phone: 'abc' });
    await page.locator('#send').click();
    await expect(page.locator('.err[data-for="fullName"]')).toHaveText('Please enter your name using letters.');
    await expect(page.locator('.err[data-for="email"]')).toContainText('valid email address');
    await expect(page.locator('.err[data-for="phone"]')).toContainText('7 to 15 digits');
    await expect(page.locator('.err[data-for="consent"]')).toHaveText('Please agree so we can contact you.');
    await expect(page.locator('[name="email"]')).toHaveAttribute('aria-invalid', 'true');
    expect(posted).toBe(0);
    write('lead/errors.png', await page.screenshot({ fullPage: true }));
    // fixing a field clears its error as the visitor types
    await fill(page, { email: 'linh@example.com' });
    await expect(page.locator('.err[data-for="email"]')).toBeHidden();
    result('check', 'lead-errors', { name: 'Lead form: invalid name / email / phone / consent are refused before sending', pass: true });
  });

  test('server errors are shown on the field', async ({ page }) => {
    await page.route('**/api/lead', r => r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ errors: { email: 'Server says no.' } }) }));
    await page.goto('/lead/');
    await fill(page, { fullName: 'Nguyễn Thị Linh', email: 'linh@example.com' });
    await page.locator('#consent').check();
    await page.waitForTimeout(2600); // the form refuses sends faster than a person (2.5 s)
    await page.locator('#send').click();
    await expect(page.locator('.err[data-for="email"]')).toHaveText('Server says no.');
  });

  test('a valid lead is sent with the right payload and thanks the visitor', async ({ page }) => {
    let body = null;
    await page.route('**/api/lead', async r => { body = JSON.parse(r.request().postData()); return r.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true,"id":"1"}' }); });
    await page.goto('/lead/?exp=family');
    await fill(page, { fullName: '  Nguyễn   Thị Linh ', email: 'Linh@Example.com', company: 'Linh Studio', jobTitle: 'Founder', phone: '+84 912 345 678', message: 'Looking at AFT for our family remittance app.' });
    await page.locator('label.chip:has-text("A product demo")').click();
    await page.locator('#consent').check();
    await page.waitForTimeout(2600);
    await page.locator('#send').click();
    await expect(page.locator('#h1')).toHaveText('Thank you!');
    expect(body).toMatchObject({ experience: 'family', consent: true, consentVersion: 'v1', source: 'booth-qr:family' });
    expect(body.interests.sort()).toEqual(['cross-border-aft', 'demo']);
    write('lead/thanks.png', await page.screenshot({ fullPage: true }));
    result('check', 'lead-success', { name: 'Lead form: a valid lead posts experience, interests, consent v1 and shows the thank-you', pass: true });
  });
});

test.describe('lead form LIVE (production + Postgres)', () => {
  test.skip(!process.env.LIVE, 'set LIVE=1 to submit to production');
  test('submit on production, read it back from the database, export', async ({ page, request }) => {
    test.setTimeout(120_000);
    const token = fs.readFileSync(`${process.env.HOME}/.vd-booth-leads-token`, 'utf8').trim();
    const auth = { Authorization: `Bearer ${token}` };
    const run = `e2e-test:${Date.now()}`;
    // 1) the real page, a real visitor flow (source tagged so the run can be cleaned up)
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto(`${LIVE}/lead/?exp=travel&src=${encodeURIComponent(run)}`);
    await fill(page, { fullName: 'Booth Test Visitor', email: `e2e+${Date.now()}@example.com`, company: 'Booth QA', jobTitle: 'Tester', phone: '+84 912 345 678', message: 'Automated end-to-end submission.' });
    await page.locator('#consent').check();
    await page.waitForTimeout(2600);
    await page.locator('#send').click();
    await expect(page.locator('#h1')).toHaveText('Thank you!', { timeout: 15_000 });
    // 2) the API refuses bad input on the server too (no browser)
    const bad = await request.post(`${LIVE}/api/lead`, { data: { fullName: '123123', email: '123123123', consent: true, consentVersion: 'v1', source: run } });
    expect(bad.status()).toBe(422);
    // 3) the same email again within 10 minutes is not stored twice
    const email2 = `e2e-dup+${Date.now()}@example.com`, once = { fullName: 'Booth Test Duplicate', email: email2, consent: true, consentVersion: 'v1', source: run };
    expect((await request.post(`${LIVE}/api/lead`, { data: once })).status()).toBe(201);
    expect(await (await request.post(`${LIVE}/api/lead`, { data: once })).json()).toMatchObject({ duplicate: true });
    // 4) read back from Postgres through the export API
    const j = await (await request.get(`${LIVE}/api/leads?format=json`, { headers: auth })).json();
    const mine = j.leads.filter(l => l.source === run);
    expect(mine.map(l => l.full_name).sort()).toEqual(['Booth Test Duplicate', 'Booth Test Visitor']);
    expect(mine.find(l => l.full_name === 'Booth Test Visitor')).toMatchObject({ phone: '+84912345678', experience: 'travel', consent: true, consent_version: 'v1' });
    const csv = await (await request.get(`${LIVE}/api/leads`, { headers: auth })).text();
    write('lead/export.csv', csv);
    write('lead/export.json', JSON.stringify(j, null, 1));
    expect((await request.get(`${LIVE}/api/leads`)).status()).toBe(401);
    // 5) clean up this run's rows
    if (!process.env.KEEP) {
      const del = await (await request.delete(`${LIVE}/api/leads?source=${encodeURIComponent(run)}`, { headers: auth })).json();
      expect(del.deleted).toBe(2);
    }
    result('check', 'lead-live', { name: `Lead LIVE: production submit → Postgres → export (${mine.length} rows, run ${run}${process.env.KEEP ? ', kept' : ', cleaned up'})`, pass: true });
  });
});
