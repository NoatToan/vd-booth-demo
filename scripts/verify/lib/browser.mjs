// Chrome via puppeteer-core with the plan's flags (IMPL-PLAN §2.3).
// headless:true is puppeteer's "new" headless; the literal 'new' value was removed from puppeteer.
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { ORIGIN } from '../serve.mjs';

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const FLAGS = ['--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'];

export async function launch() {
  try {
    return await puppeteer.launch({ executablePath: CHROME, headless: true, args: FLAGS, defaultViewport: null });
  } catch (e) {
    let v = '?'; try { v = execFileSync(CHROME, ['--version']).toString().trim(); } catch {}
    throw new Error(`Chrome launch failed (${v}): ${e.message}`);
  }
}

const LOCAL = u => u.startsWith(ORIGIN + '/') || u === ORIGIN || /^(data|blob|about):/.test(u);

/** New page with network blocking + console/error/request accounting. */
export async function openPage(browser, { width, height, dpr = 1 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr });
  const log = { aborted: [], consoleErrors: [], requests: [] };
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (LOCAL(u)) { log.requests.push({ url: u, type: r.resourceType() }); r.continue().catch(() => {}); }
    else { log.aborted.push(u); r.abort('blockedbyclient').catch(() => {}); }
  });
  page.on('console', m => { if (m.type() === 'error') log.consoleErrors.push(m.text()); });
  page.on('pageerror', e => log.consoleErrors.push('pageerror: ' + (e?.message || e)));
  page.on('requestfailed', r => { if (LOCAL(r.url())) log.consoleErrors.push('requestfailed: ' + r.url()); });
  page.on('response', r => { if (r.status() >= 400 && LOCAL(r.url())) log.consoleErrors.push(`HTTP ${r.status()}: ${r.url()}`); });
  return { page, log };
}
