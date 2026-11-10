// After the run: compare/index.html, a self-contained local page to review Figma vs build for every screen
// (side by side, a before/after slider, the pixel diff) plus each journey's kiosk shots.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, ZONES, SCREENS, THRESHOLD } from './lib.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default () => {
  const dir = path.join(OUT, 'results');
  if (!fs.existsSync(dir)) return;
  const all = fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const scr = Object.fromEntries(all.filter(r => r.key && r.pct !== undefined).map(r => [r.key, r]));
  const flows = Object.fromEntries(all.filter(r => r.steps).map(r => [r.zone, r]));
  const checks = all.filter(r => r.name && !r.steps);
  const ran = SCREENS.filter(s => scr[s.key]);
  const passed = ran.filter(s => scr[s.key].pass).length;
  const fPass = Object.values(flows).filter(f => f.pass).length;
  const when = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });

  const card = s => {
    const r = scr[s.key]; if (!r) return '';
    const flowShot = fs.existsSync(path.join(OUT, `flow/${s.key}.png`));
    return `<article class="card ${r.pass ? 'ok' : 'bad'}" data-zone="${s.zone}" data-pass="${r.pass}">
  <header><b>${esc(s.key)}</b><span class="t">${esc(SCREENS.find(x => x.key === s.key)?.title || '')}</span>
    <span class="node">node ${esc(r.node)}</span><span class="pct">${r.pct}% diff</span><span class="badge">${r.pass ? 'PASS' : 'FAIL'}</span></header>
  <nav><button class="on" data-v="side">Side by side</button><button data-v="slide">Before / after</button>${flowShot ? '<button data-v="kiosk">On the kiosk</button>' : ''}</nav>
  <div class="v side on"><figure><figcaption>Figma</figcaption><img loading="lazy" src="img/${s.key}-figma.png"></figure>
    <figure><figcaption>Build</figcaption><img loading="lazy" src="img/${s.key}-build.png"></figure>
    <figure><figcaption>Diff (red = differs · yellow = anti-aliasing, not counted)</figcaption><img loading="lazy" src="img/${s.key}-diff.png"></figure></div>
  <div class="v slide"><div class="ba" style="--w:${r.w}px"><img loading="lazy" src="img/${s.key}-build.png"><div class="top"><img loading="lazy" src="img/${s.key}-figma.png"></div><i></i>
    <input type="range" min="0" max="100" value="50" aria-label="Figma / build"></div><p class="hint">← Figma · drag · Build →</p></div>
  ${flowShot ? `<div class="v kiosk"><img loading="lazy" src="flow/${s.key}.png"></div>` : ''}
</article>`;
  };

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Booth e2e · Figma vs build</title>
<style>
:root{--bg:#f5f6fa;--card:#fff;--ink:#16192b;--muted:#6b7085;--line:#e3e5ee;--ok:#16a34a;--bad:#dc2626;--blue:#1434cb}
@media (prefers-color-scheme:dark){:root{--bg:#0e1020;--card:#171a2e;--ink:#eef0ff;--muted:#9aa0c0;--line:#2a2e4a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 Inter,system-ui,sans-serif}
.top-bar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:16px 24px}
h1{margin:0 0 4px;font-size:22px}.sum{color:var(--muted)}.sum b{color:var(--ink)}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.filters button,nav button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:99px;padding:6px 12px;font:inherit;cursor:pointer}
.filters button.on,nav button.on{background:var(--blue);border-color:var(--blue);color:#fff}
main{padding:20px 24px 60px;max-width:1500px;margin:0 auto}
section h2{font-size:18px;margin:28px 0 6px}section .meta{color:var(--muted);margin:0 0 12px}
.ok-t{color:var(--ok);font-weight:700}.bad-t{color:var(--bad);font-weight:700}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin:12px 0}
.card header{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline}
.card .t{font-weight:600}.card .node,.card .pct{color:var(--muted);font-size:12px}
.badge{margin-left:auto;font-size:11px;font-weight:800;letter-spacing:1px;padding:3px 8px;border-radius:6px;color:#fff;background:var(--ok)}
.bad .badge{background:var(--bad)}.bad{border-color:var(--bad)}
nav{display:flex;gap:6px;margin:10px 0}
.v{display:none}.v.on{display:flex}
.side{gap:14px;overflow-x:auto;align-items:flex-start}
figure{margin:0;flex:0 0 auto}figcaption{font-size:12px;color:var(--muted);margin-bottom:4px}
.side img{width:300px;height:auto;border:1px solid var(--line);border-radius:10px;display:block;background:#fff}
.slide{flex-direction:column;align-items:flex-start}
.ba{position:relative;width:min(var(--w),100%);border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff;--p:50%}
.ba>img{display:block;width:100%}
.ba .top{position:absolute;inset:0;width:var(--p);overflow:hidden}
.ba .top img{display:block;width:calc(100% * 100 / var(--pn, 50) * 1)}
.ba i{position:absolute;top:0;bottom:0;left:var(--p);width:2px;background:var(--blue);pointer-events:none}
.ba input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:ew-resize;margin:0}
.hint{color:var(--muted);font-size:12px;margin:6px 0 0}
.kiosk img{max-width:100%;border-radius:10px;border:1px solid var(--line)}
.strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px}.strip img{height:150px;border-radius:8px;border:1px solid var(--line)}
.checks li{margin:4px 0}
</style></head><body>
<div class="top-bar"><h1>Booth e2e · Figma vs build</h1>
<div class="sum">Run ${esc(when)} (ICT) · Screens <b>${passed}/${ran.length}</b> match Figma (≤ ${THRESHOLD}% pixel diff, same size) · Journeys <b>${fPass}/${Object.keys(flows).length}</b> clicked through to Done</div>
<div class="filters"><button class="on" data-f="all">All</button><button data-f="fail">Failed only</button>${ZONES.map(z => `<button data-f="${z.zone}">${esc(z.name)}</button>`).join('')}</div></div>
<main>
${checks.length ? `<section><h2>Checks</h2><ul class="checks">${checks.map(c => `<li><span class="${c.pass ? 'ok-t' : 'bad-t'}">${c.pass ? 'PASS' : 'FAIL'}</span> ${esc(c.name)}</li>`).join('')}</ul></section>` : ''}
${ZONES.map(z => {
    const f = flows[z.zone], list = SCREENS.filter(s => s.zone === z.zone);
    return `<section data-zone="${z.zone}"><h2>${esc(z.name)}</h2>
<p class="meta">Lock link <code>?zone=${z.link}</code> · ${list.length} steps · journey ${f ? `<span class="${f.pass ? 'ok-t' : 'bad-t'}">${f.pass ? 'PASS' : 'FAIL'}</span> · Done QR <code>${esc(f.qr)}</code>${f.errors.length ? ` · errors: ${esc(f.errors.join(' | '))}` : ''}` : 'not run'}</p>
${f ? `<div class="strip">${f.steps.map(s => `<img loading="lazy" title="${s.key}" src="flow/${s.key}.png">`).join('')}<img loading="lazy" title="Done" src="flow/${z.zone}-done.png"></div>` : ''}
${list.map(card).join('')}</section>`;
  }).join('')}
</main>
<script>
document.querySelectorAll('.card nav').forEach(n => n.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const c = n.closest('.card');
  n.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  c.querySelectorAll('.v').forEach(v => v.classList.toggle('on', v.classList.contains(b.dataset.v)));
}));
document.querySelectorAll('.ba').forEach(ba => {
  const r = ba.querySelector('input'), top = ba.querySelector('.top img');
  const set = () => { ba.style.setProperty('--p', r.value + '%'); top.style.width = ba.clientWidth + 'px'; };
  r.addEventListener('input', set); new ResizeObserver(set).observe(ba); set();
});
const F = document.querySelector('.filters');
F.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; F.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  const f = b.dataset.f;
  document.querySelectorAll('main section[data-zone]').forEach(s => s.hidden = !(f === 'all' || f === 'fail' || f === s.dataset.zone));
  document.querySelectorAll('.card').forEach(c => c.hidden = f === 'fail' && c.dataset.pass === 'true');
});
</script></body></html>`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  console.log(`\ncompare page: ${path.join(OUT, 'index.html')}  (screens ${passed}/${ran.length}, journeys ${fPass}/${Object.keys(flows).length})`);
};
