// --selftest: prove the harness can tell right from wrong before trusting any report (IMPL-PLAN §4 VERIFY.5).
// Fixtures are generated from figma/rest into in-memory pages under /__selftest/; no app file is read or written.
import { expected, refPng } from './lib/figma.mjs';
import { readPng, compare, shift } from './lib/pixel.mjs';
import { runSolo } from './solo.mjs';
import { ORIGIN } from './serve.mjs';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const css = c => `rgba(${c[0]},${c[1]},${c[2]},${c[3]})`;

/** A "perfect" flat solo page: every required node absolutely placed at its Figma box with Figma styles. */
function fixture(key, { wrongText = null, extraText = false, serifText = null, ready = true, wrongBlock = false, nudge = null, badLh = null } = {}) {
  const X = expected(key);
  const parts = [];
  for (const n of X.required) {
    if (n.id === X.root.id) continue;
    const b = n.box;
    const st = [`position:absolute`, `left:${b.x + (n.id === nudge ? 3 : 0)}px`, `top:${b.y}px`, `width:${b.w}px`, `height:${b.h}px`, 'box-sizing:border-box', 'margin:0'];
    const attrs = [`data-node="${n.id}"`];
    if (n.twin) attrs.push(`data-twin="${n.twin}"`);
    if (n.id === X.scrollId) attrs.push('data-role="scroll"');
    let inner = '';
    if (n.type === 'TEXT') {
      const t = n.text;
      st.push('display:block', `font-family:${n.id === serifText ? 'serif' : 'Inter'}`, `font-size:${t.fontSize}px`, `font-weight:${t.fontWeight}`, `line-height:${t.lineHeightPx + (n.id === badLh ? 1 : 0)}px`,
        `letter-spacing:${t.letterSpacing}px`, `text-align:${{ LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' }[t.align]}`,
        `white-space:${t.autoResize === 'WIDTH_AND_HEIGHT' ? 'nowrap' : 'pre-wrap'}`, 'overflow:visible');
      if (t.color) st.push(`color:${css(t.color)}`);
      inner = esc(n.id === wrongText ? t.chars + 'X' : t.chars);
    } else if (!n.svgRoot) {
      if (n.fills.length) {
        // fills stacked as solid gradient layers (exercises the background composite parser)
        st.push(`background:${n.fills.slice().reverse().map(f => { const c = [Math.round(f.color.r * 255), Math.round(f.color.g * 255), Math.round(f.color.b * 255), (f.color.a ?? 1) * (f.opacity ?? 1)]; return `linear-gradient(${css(c)},${css(c)})`; }).join(',')}`);
      }
      if (n.type === 'ELLIPSE') st.push('border-radius:50%'); else st.push(`border-radius:${n.radii.map(r => r + 'px').join(' ')}`);
      const sh = [];
      if (n.stroke) { const [t, r, bb, l] = n.stroke.widths, c = css(n.stroke.color); if (t === r && r === bb && bb === l) sh.push(`inset 0 0 0 ${t}px ${c}`); else { if (t) sh.push(`inset 0 ${t}px 0 0 ${c}`); if (bb) sh.push(`inset 0 -${bb}px 0 0 ${c}`); if (l) sh.push(`inset ${l}px 0 0 0 ${c}`); if (r) sh.push(`inset -${r}px 0 0 0 ${c}`); } }
      for (const e of n.effects) sh.push(`${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread || 0}px ${css([Math.round(e.color.r * 255), Math.round(e.color.g * 255), Math.round(e.color.b * 255), e.color.a])}`);
      if (sh.length) st.push(`box-shadow:${sh.join(',')}`);
    }
    parts.push(`<div ${attrs.join(' ')} style="${st.join(';')}">${inner}</div>`);
  }
  const root = X.required.find(n => n.id === X.root.id);
  const rootBg = root.fills.length ? `background:${css([Math.round(root.fills[0].color.r * 255), Math.round(root.fills[0].color.g * 255), Math.round(root.fills[0].color.b * 255), 1])};` : '';
  return `<!doctype html><html lang="en" class="solo"><head><meta charset="utf-8"><link rel="stylesheet" href="/vendor/inter.css">
<style>body{margin:0;background:#fff;width:402px}.solo *{animation:none!important;transition:none!important}</style></head><body>
<div class="fr" data-node="${X.root.id}" data-screen="${key}"${X.s.twin ? ` data-twin="${X.s.twin}"` : ''} style="position:relative;width:402px;height:${X.frameH}px;overflow:hidden;border-radius:${root.radii.map(r => r + 'px').join(' ')};${rootBg}">${parts.join('')}</div>
${wrongBlock ? '<div style="position:absolute;left:0;top:300px;width:402px;height:40px;background:#f00"></div>' : ''}
${extraText ? '<div style="position:absolute;left:10px;top:10px">stray shell text</div>' : ''}
<script>${ready ? 'document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{document.documentElement.dataset.ready="1"})))' : ''}</script></body></html>`;
}

export async function selftest(browser, virtual) {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

  // pixel
  const ref = readPng(refPng(expected('send-1').s));
  const same = compare(ref, ref);
  check('P: reference vs itself = 0%', same.pct === 0, `${same.pct}%`);
  const sh = compare(ref, shift(ref, 1, 0));
  check('P: reference vs 1px shift > 0%', sh.pct > 0, `${sh.pct.toFixed(3)}%`);
  const shy = compare(ref, shift(ref, 0, 1));
  check('P: reference vs 1px vertical shift > 0%', shy.pct > 0, `${shy.pct.toFixed(3)}%`);

  const page = (key, name, o) => { const p = `/__selftest/${name}-${key}.html`; virtual.set(p, fixture(key, o)); return `${ORIGIN}${p}`; };
  const all = new Set(['text', 'geom', 'style']);

  for (const key of ['send-2', 'receive-3', 'collect-4']) {
    const good = page(key, 'good', {});
    const r = await runSolo(browser, key, { layers: all, url: () => good, readyTimeout: 5000 });
    const want = ['C', 'NET', 'T1', 'T2', 'T3', 'G1', 'G2', 'S1', 'S2'];
    const bad = want.filter(g => r.gates[g]?.status !== 'PASS');
    check(`fixture ${key}: perfect page passes ${want.join(',')}`, !bad.length, bad.map(g => `${g}=${r.gates[g]?.status} ${r.gates[g]?.value ?? ''} ${r.gates[g]?.reason ?? ''}`).join(' | ') || `G1 ${r.geom.passPct}%, S2 ${r.gates.S2.value}`);
  }

  const X = expected('send-2');
  const victim = X.texts[3];
  const wrong = page('send-2', 'wrongtext', { wrongText: victim.id });
  const rw = await runSolo(browser, 'send-2', { layers: all, url: () => wrong, readyTimeout: 5000 });
  check('T2: fake page with one wrong text fails T2', rw.gates.T2.status === 'FAIL' && rw.text.mismatch.length === 1 && rw.text.mismatch[0].id === victim.id, `${rw.gates.T2.value}; mismatch ${JSON.stringify(rw.text.mismatch.map(m => m.id))}`);
  check('T2: wrong-text page still passes T1', rw.gates.T1.status === 'PASS', rw.gates.T1.value);

  const nud = page('send-2', 'nudge', { nudge: X.texts[5].id, badLh: X.texts[6].id });
  const rg = await runSolo(browser, 'send-2', { layers: all, url: () => nud, readyTimeout: 5000 });
  check('G1: a text moved 3px is a geometry failure', rg.geom.worst.some(g => g.id === X.texts[5].id) && rg.geom.pass === rg.geom.n - 1, `${rg.geom.pass}/${rg.geom.n}, worst ${JSON.stringify(rg.geom.worst.map(g => g.id))}`);
  check('S1: line-height off by 1px fails S1', rg.gates.S1.status === 'FAIL' && rg.style.fails.some(f => f.id === X.texts[6].id && f.prop === 'line-height'), rg.gates.S1.value);

  const stray = page('send-2', 'stray', { extraText: true, serifText: X.texts[0].id });
  const rs = await runSolo(browser, 'send-2', { layers: all, url: () => stray, readyTimeout: 5000 });
  check('T3: stray shell text fails T3', rs.gates.T3.status === 'FAIL' && rs.text.extra.some(e => e.text === 'stray shell text'), rs.gates.T3.value);
  check('T4: a text rendered in a non-Inter font fails T4', rs.gates.T4.status === 'FAIL' && rs.fonts.some(f => f.id === X.texts[0].id), rs.fonts.map(f => `${f.id}:${f.actual}`).join(', '));

  const nos = page('send-2', 'nosolo', { ready: false });
  const rn = await runSolo(browser, 'send-2', { layers: new Set(['text', 'geom', 'style', 'pixel']), url: () => nos, readyTimeout: 1500 });
  const gates = Object.values(rn.gates);
  check('missing solo = FAIL "no solo", never skipped', rn.noSolo && gates.length >= 15 && gates.every(g => g.status === 'FAIL' && g.reason.startsWith('no solo')), `${gates.length} gates, statuses ${[...new Set(gates.map(g => g.status))]}, reason "${rn.noSolo}"`);

  const good = page('send-2', 'det', {});
  const rd = await runSolo(browser, 'send-2', { layers: new Set(['pixel']), url: () => good, readyTimeout: 5000 });
  check('D: two loads of a static page are identical', rd.gates.D.status === 'PASS', rd.gates.D.value);
  console.log(`INFO  P1 of the box-only fixture (exact boxes + text, no icons): ${rd.gates.P1.value}`);
  const blk = page('send-2', 'block', { wrongBlock: true });
  const rb = await runSolo(browser, 'send-2', { layers: new Set(['pixel']), url: () => blk, readyTimeout: 5000 });
  const delta = rb.pixel.pct - rd.pixel.pct;
  check('P1: one wrong 402×40 block raises mismatch by ≥ its area and fails P1', rb.gates.P1.status === 'FAIL' && delta >= (402 * 40) / (402 * 941) * 100 * 0.9, `${rd.gates.P1.value} → ${rb.gates.P1.value}`);

  const ok = results.every(r => r.ok);
  console.log(`\nselftest: ${results.filter(r => r.ok).length}/${results.length} ${ok ? 'PASS' : 'FAIL'}`);
  return { ok, results };
}
