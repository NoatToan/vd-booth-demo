// E Flow / E2E (IMPL-PLAN §3 "E Flow"): real kiosk at 1920×1080, network blocked. Every assertion is HARD.
import path from 'node:path';
import jsQR from 'jsqr';
import { MANIFEST, expected } from './lib/figma.mjs';
import { openPage } from './lib/browser.mjs';
import { decode } from './lib/pixel.mjs';
import { ORIGIN } from './serve.mjs';

const QR_DEFAULT = 'https://vd-booth-demo.vercel.app/';
const QR_OVERRIDE = 'https://example.org/vd-booth-selfcheck';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const win = s => { const m = /^(?:auto|scan):(\d+)-(\d+)/.exec(s || ''); return m ? [+m[1], +m[2]] : null; };

export async function runFlow(browser, { zones = ['send', 'receive', 'collect'], imgDir } = {}) {
  const F = { steps: [], fails: [], checks: [], asserts: 0, runs: [] };
  const allLogs = [];

  async function session(id, zone, query, { shots = false, deep = false, steps: limitSteps = null, idleAfter = false, qr = null, fxlow = false } = {}) {
    const run = { id, zone, url: `${ORIGIN}/index.html${query}`, ok: true, entry: null };
    F.runs.push(run);
    const { page, log } = await openPage(browser, { width: 1920, height: 1080 });
    allLogs.push(log);
    const A = (step, name, ok, detail) => {
      F.asserts++;
      const rec = { run: id, step, name, ok: !!ok, ...(detail != null ? { detail: String(detail).slice(0, 300) } : {}) };
      F.checks.push(rec);
      if (!ok) { F.fails.push(rec); run.ok = false; }
      return !!ok;
    };
    const state = () => page.evaluate(() => { try { return window.VD && typeof VD.state === 'function' ? VD.state() : null; } catch (e) { return { error: e.message }; } });
    const key = () => page.evaluate(() => { const p = document.querySelector('#phone'); return p ? p.getAttribute('data-screen') : null; });
    const visible = sel => page.evaluate(sel => {
      const e = document.querySelector(sel); if (!e) return false;
      const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
      for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return false; }
      return true;
    }, sel);
    const english = async label => {
      const r = await page.evaluate(() => {
        // Plan regex /[À-ỹ]/ minus × U+00D7 and ÷ U+00F7: math signs, not diacritics (Q7 mandates "VISA Direct × TPBank").
        const vi = /(?![×÷])[À-ỹ]/, bad = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n; (n = w.nextNode());) {
          if (!vi.test(n.nodeValue) || !n.parentElement || n.parentElement.closest('#phone')) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          if ([...rg.getClientRects()].some(r => r.width > 0 && r.height > 0) && getComputedStyle(n.parentElement).visibility !== 'hidden') bad.push(n.nodeValue.trim().slice(0, 60));
        }
        return { lang: document.documentElement.lang, langEl: document.querySelectorAll('.lang').length, bad };
      });
      A(label, 'E7 html[lang=en]', r.lang === 'en', `lang="${r.lang}"`);
      A(label, 'E7 no .lang element', r.langEl === 0, `${r.langEl}`);
      A(label, 'E7 no Vietnamese outside #phone', !r.bad.length, r.bad.slice(0, 3).join(' | '));
    };
    const shot = async name => { if (!shots || !imgDir) return null; const f = `${id}-${name}.png`; await page.screenshot({ path: path.join(imgDir, f) }); return `img/flow/${f}`; };
    const waitFor = async (fn, timeout, poll = 40) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return Date.now() - t0; if (Date.now() - t0 > timeout) return null; await sleep(poll); } };
    // waits for #phone[data-screen] === k (and VD.state().screen === k); records any other key seen on the way
    const waitKey = async (k, from, timeout) => {
      const seen = new Set(); const t0 = Date.now();
      for (;;) {
        const cur = await key();
        if (cur === k) { const s = await state(); if (s && s.screen === k) return { ms: Date.now() - t0, seen: [...seen] }; }
        if (cur && cur !== k && cur !== from) seen.add(cur);
        if (Date.now() - t0 > timeout) return { ms: null, seen: [...seen], cur, st: await state() };
        await sleep(30);
      }
    };
    const handle = (k, id) => page.evaluateHandle((k, id) => {
      const fr = [...document.querySelectorAll(`#phone .fr[data-screen="${k}"]`)].pop();
      return fr ? fr.querySelector(`[data-node="${id}"]`) : null;
    }, k, id);
    const clickNode = async (step, k, nodeId, need) => {
      const h = await handle(k, nodeId);
      const el = h.asElement();
      if (!A(step, `click target ${nodeId} exists in #phone .fr[data-screen=${k}]`, !!el)) return false;
      const a = await el.evaluate((e, need) => { const x = e.closest(need); return x ? x.getAttribute('data-a') : null; }, need);
      if (!A(step, `${nodeId} has a ${need} ancestor`, a !== null, `data-a=${a}`)) return false;
      await el.evaluate(e => e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
      await sleep(80);
      try { await el.click(); } catch (e) { return A(step, `click ${nodeId}`, false, e.message); }
      return true;
    };
    const goAction = async (step, s) => {
      if (s.go === 'kiosk-next' || s.go === 'kiosk-finish') {
        const sel = '#' + s.go;
        if (!A(step, `${sel} visible to click`, await visible(sel))) return false;
        const a = await page.$eval(sel, e => e.closest('[data-a]')?.getAttribute('data-a') ?? null).catch(() => null);
        A(step, `${sel} has [data-a]`, a !== null, `data-a=${a}`);
        await page.click(sel); return true;
      }
      if (s.go.startsWith('auto:')) return true;
      return clickNode(step, s.key, s.go, '[data-a]');
    };
    const advanceTimeout = s => (win(s.go) || win(s.then) || [0, 2500])[1] + 1500;

    try {
      await page.goto(run.url, { waitUntil: 'load', timeout: 20000 });
      await sleep(500);
      if (fxlow) A('entry', 'E9 ?fx=low canvas present', await page.$('canvas') !== null);
      let st = await state();
      if (!A('entry', 'window.VD.state() available', st && !st.error, st ? JSON.stringify(st) : 'window.VD missing')) { await english('idle'); return run; }
      await english(st.view);
      await shot('00-' + st.view);
      if (!idleAfter && id.startsWith('home')) A('entry', 'starts on idle', st.view === 'idle', st.view);
      // idle → home/flow
      if (st.view === 'idle') {
        const has = await page.$('[data-a="start"]');
        run.entry = has ? 'click [data-a=start]' : 'click #stage centre';
        if (has) await has.click(); else await page.mouse.click(960, 540);
        await waitFor(async () => (await state())?.view !== 'idle', 2000);
        st = await state();
      }
      if (st.view === 'home') {
        await english('home'); await shot('01-home');
        const pick = await page.$(`[data-a="pick"][data-v="${zone}"]`) || await page.$(`[data-a][data-v="${zone}"]`) || await page.$(`[data-a][data-zone="${zone}"]`);
        if (pick) { run.entry += ` → click ${await pick.evaluate(e => e.outerHTML.match(/^<[^>]*>/)[0].slice(0, 80))}`; await pick.click(); }
        else { run.entry += ` → key ${['send', 'receive', 'collect'].indexOf(zone) + 1}`; await page.keyboard.press(String(['send', 'receive', 'collect'].indexOf(zone) + 1)); }
      }
      const steps = MANIFEST.filter(s => s.zone === zone).slice(0, limitSteps ?? undefined);
      let w = await waitKey(steps[0].key, null, 3000);
      if (!A(steps[0].key, `E1 enters ${steps[0].key} (${run.entry})`, w.ms !== null, `#phone[data-screen]=${w.cur ?? 'none'} state=${JSON.stringify(w.st)}`)) return run;
      let lastTouch = Date.now();

      for (let i = 0; i < steps.length; i++) {
        const s = steps[i], k = s.key, rec = { run: id, i: i + 1, key: k, shot: null };
        F.steps.push(rec);
        let entered = Date.now();
        await sleep(400); // 320 ms push transition
        rec.shot = await shot(String(i + 2).padStart(2, '0') + '-' + k);
        const autoW = win(s.go);
        // kiosk buttons
        A(k, 'E1 #kiosk-next visible only on its steps', (await visible('#kiosk-next')) === (s.go === 'kiosk-next'));
        A(k, 'E1 #kiosk-finish visible only on its steps', (await visible('#kiosk-finish')) === (s.go === 'kiosk-finish'));
        if (deep) {
          await english(k);
          if (s.zone === 'send') { const b = await page.evaluate(() => { const l = document.querySelector('.left'); return l ? l.getBoundingClientRect().bottom : null; }); if (b !== null) A(k, 'SEND rail .left bottom ≤ 1016', b <= 1016, `bottom=${b}`); }
          // Back, then forward again (first on auto steps so the auto window is measured on the re-entry)
          if (s.back) {
            const prev = steps[i - 1];
            if (await clickNode(k, k, s.back, '[data-a="back"]')) {
              const wb = await waitKey(prev.key, k, 2500);
              if (A(k, `E2 back → ${prev.key}`, wb.ms !== null, `got ${wb.cur}`)) {
                await sleep(400);
                await goAction(k + ' (forward again)', prev);
                const wf = await waitKey(k, prev.key, advanceTimeout(prev));
                A(k, `E2 forward again ${prev.key} → ${k}`, wf.ms !== null, `got ${wf.cur}`);
                entered = Date.now(); await sleep(400);
              }
            }
            lastTouch = Date.now();
          }
          const budget = autoW ? Math.max(0, autoW[0] - (Date.now() - entered) - 1200) : 4500;
          // motion rule: settled kiosk text equals the Figma text
          const X = expected(k);
          const texts = X.texts.map(n => [n.id, n.text.chars]);
          let mism = null;
          await waitFor(async () => {
            mism = await page.evaluate((k, texts) => {
              const fr = [...document.querySelectorAll(`#phone .fr[data-screen="${k}"]`)].pop(); if (!fr) return ['no frame'];
              return texts.filter(([id, c]) => fr.querySelector(`[data-node="${id}"]`)?.textContent !== c).map(([id]) => id);
            }, k, texts);
            return !mism.length;
          }, budget, 150);
          A(k, 'motion settles on Figma text', !mism.length, `${mism.length} text node(s) differ, e.g. ${mism.slice(0, 5).join(', ')}`);
          // scroll hint
          const h = await page.evaluate((k) => {
            const ph = document.querySelector('#phone'), fr = [...document.querySelectorAll(`#phone .fr[data-screen="${k}"]`)].pop();
            const sc = fr && fr.querySelector('[data-role="scroll"]');
            const hints = [...(ph?.querySelectorAll('[data-fx].scroll-hint') || [])];
            const vis = () => hints.filter(e => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return false; } return true; });
            const v = vis();
            return { hasScroll: !!sc, overflow: sc ? sc.scrollHeight > sc.clientHeight + 1 : null, px: sc ? sc.scrollHeight - sc.clientHeight : null, visible: v.length > 0, text: v.map(e => e.textContent.trim()).join(' ') };
          }, k);
          if (s.zone === 'collect') A(k, 'E4 no scroll hint on COLLECT', !h.visible, h.text);
          else {
            A(k, 'E4 scroll node overflows in kiosk', h.overflow === true, `hasScroll=${h.hasScroll} overflow=${h.px}px`);
            const ovf = `scroll overflow ${h.px}px in kiosk; Figma implies ${X.frameH - 874}px (frame ${X.frameH} − 874)`;
            A(k, 'E4 scroll hint visible on entry', h.visible, ovf);
            if (k === 'receive-2') A(k, 'E4 hint reads "Scroll to continue"', /Scroll to continue/.test(h.text), h.text);
            await page.evaluate(k => { const sc = [...document.querySelectorAll(`#phone .fr[data-screen="${k}"]`)].pop()?.querySelector('[data-role="scroll"]'); if (sc) sc.scrollTop = sc.scrollHeight; }, k);
            await sleep(600);
            const after = await page.evaluate(() => [...document.querySelectorAll('#phone [data-fx].scroll-hint')].some(e => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return false; } return true; }));
            A(k, 'E4 scroll hint hidden at bottom', !after);
            await page.evaluate(k => { const sc = [...document.querySelectorAll(`#phone .fr[data-screen="${k}"]`)].pop()?.querySelector('[data-role="scroll"]'); if (sc) sc.scrollTop = 0; }, k);
          }
          // inert TEXT nodes
          const pts = await page.evaluate((k, ids) => {
            const fr = [...document.querySelectorAll(`#phone .fr[data-screen="${k}"]`)].pop(); if (!fr) return [];
            const cand = ids.map(id => fr.querySelector(`[data-node="${id}"]`)).filter(e => e && !e.closest('[data-a]'));
            const order = [0, Math.floor(cand.length / 2), cand.length - 1, ...cand.keys()];
            const out = [], used = new Set();
            for (const i of order) {
              if (out.length >= 3 || i < 0 || used.has(i) || !cand[i]) continue; used.add(i);
              const e = cand[i]; e.scrollIntoView({ block: 'center', behavior: 'instant' });
              const r = e.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
              const hit = document.elementFromPoint(x, y);
              if (hit && (hit === e || e.contains(hit)) && !hit.closest('[data-a]')) out.push({ id: e.dataset.node, x, y });
            }
            return out;
          }, k, X.texts.map(n => n.id));
          A(k, 'E3 found 3 inert TEXT nodes to click', pts.length === 3, pts.length);
          for (const p of pts) {
            await page.mouse.click(p.x, p.y); await sleep(350);
            const now = await key(), sv = (await state())?.view;
            if (autoW && Date.now() - entered >= autoW[0]) break;
            A(k, `E3 inert click on ${p.id} keeps ${k}`, now === k && sv === 'flow', `screen=${now} view=${sv}`);
          }
          lastTouch = Date.now();
        }
        // go
        if (autoW) {
          const next = steps[i + 1];
          const wn = await waitKey(next.key, k, autoW[1] + 1500);
          const elapsed = wn.ms === null ? null : Date.now() - entered;
          A(k, `E1 auto-advance ${k} → ${next.key} inside ${autoW[0]}–${autoW[1]} ms`, elapsed !== null && elapsed >= autoW[0] - 50 && elapsed <= autoW[1] + 400, elapsed === null ? `no advance (screen ${wn.cur})` : `${elapsed} ms`);
          if (wn.ms === null) return run;
          w = wn; continue;
        }
        if (!(await goAction(k, s))) return run;
        const tClick = Date.now(); lastTouch = tClick;
        if (s.then === 'done' || s.go === 'kiosk-finish') {
          const d = await waitFor(async () => (await state())?.view === 'done', 3000);
          if (!A(k, `E1 ${k} → Done (VD.state().view==='done')`, d !== null, JSON.stringify(await state()))) return run;
          break;
        }
        const next = steps[i + 1];
        if (!next) break; // limited run
        const wn = await waitKey(next.key, k, advanceTimeout(s));
        A(k, `E1 sequence ${k} → ${next.key}`, wn.ms !== null && !wn.seen.length, wn.ms === null ? `got ${wn.cur} state=${JSON.stringify(wn.st)}` : `unexpected screens on the way: ${wn.seen.join(',')}`);
        const sw = win(s.then);
        if (sw && wn.ms !== null) { const el = Date.now() - tClick; A(k, `E1 scan ${k} advances inside ${sw[0]}–${sw[1]} ms`, el >= sw[0] - 50 && el <= sw[1] + 400, `${el} ms`); }
        if (wn.ms === null) return run;
        w = wn;
      }

      st = await state();
      if (st?.view === 'done') {
        await sleep(600);
        run.doneShot = await shot('99-done');
        if (deep || qr) await english('done');
        const want = qr || QR_DEFAULT;
        const q = await page.evaluate(() => { const e = document.querySelector('#qr'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, title: e.getAttribute('title') }; });
        if (A('done', 'E5 #qr present', !!q)) {
          A('done', 'E5 #qr title is the URL', q.title === want, q.title);
          const m = 24, clip = { x: Math.max(0, q.x - m), y: Math.max(0, q.y - m), width: Math.min(1920, q.w + 2 * m), height: Math.min(1080, q.h + 2 * m) };
          const img = decode(await page.screenshot({ type: 'png', clip }));
          const code = jsQR(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length), img.width, img.height);
          A('done', `E5 QR decodes to ${want}`, code?.data === want, code ? code.data : 'not decodable');
        }
      } else if (!limitSteps) A('done', 'E1 journey ends on Done', false, JSON.stringify(st));

      if (idleAfter) {
        const t = await waitFor(async () => (await state())?.view === 'idle', 12000, 100);
        const el = t === null ? null : Date.now() - lastTouch;
        A(st?.view === 'done' ? 'done' : 'mid', `E6 ?idle=6 returns to idle in 6–9 s (${st?.view === 'done' ? 'on Done' : 'mid-journey'})`, el !== null && el >= 6000 && el <= 9000, el === null ? 'never returned to idle' : `${el} ms`);
      }
      if (fxlow) A('end', 'E9 ?fx=low journey with 0 console errors', !log.consoleErrors.length, log.consoleErrors.slice(0, 3).join(' | '));
      return run;
    } catch (e) {
      A('crash', 'flow harness error', false, e.message);
      return run;
    } finally {
      run.aborted = log.aborted.length; run.consoleErrors = log.consoleErrors.slice(0, 10);
      await page.close().catch(() => {});
    }
  }

  const go = (id, zone, query, o) => session(id, zone, query, o);

  for (const z of zones) await go(`home-${z}`, z, '', { shots: true, deep: true });
  for (const z of zones) await go(`zone-${z}`, z, `?zone=${z}${z === 'receive' ? '&qr=' + encodeURIComponent(QR_OVERRIDE) : ''}`, { qr: z === 'receive' ? QR_OVERRIDE : null });
  if (zones.includes('receive')) {
    await go('idle-mid', 'receive', '?zone=receive&idle=6', { steps: 2, idleAfter: true });
    await go('idle-done', 'receive', '?zone=receive&idle=6', { idleAfter: true });
    await go('fx-low', 'receive', '?zone=receive&fx=low', { fxlow: true });
  }

  // E8 offline: across every page of the flow
  const aborted = allLogs.flatMap(l => l.aborted), fonts = allLogs.flatMap(l => l.requests.filter(r => r.type === 'font'));
  const A8 = (name, ok, detail) => { F.asserts++; const rec = { run: 'all', step: 'offline', name, ok: !!ok, detail }; F.checks.push(rec); if (!ok) F.fails.push(rec); };
  A8('E8 0 non-local requests', !aborted.length, aborted.slice(0, 5).join(' | '));
  A8('E8 fonts load from vendor/', fonts.length > 0 && fonts.every(r => new URL(r.url).pathname.startsWith('/vendor/')), fonts.length ? fonts.filter(r => !new URL(r.url).pathname.startsWith('/vendor/')).map(r => r.url).slice(0, 3).join(' | ') || 'ok' : 'no font requests seen');
  F.aborted = aborted.length;
  F.pass = !F.fails.length;
  return F;
}
