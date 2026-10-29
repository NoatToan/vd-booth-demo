// docs/verify/report.json + report.html (IMPL-PLAN §3 Output).
import fs from 'node:fs';
import path from 'node:path';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function writeReport({ commit, screens, flow, only, layer, outDir, gateDefs, app }) {
  const hardFailScreens = screens.filter(s => Object.values(s.gates).some(g => g.hard && g.status === 'FAIL'));
  const perGate = {};
  for (const [k, hard] of gateDefs) {
    const v = screens.map(s => s.gates[k]).filter(Boolean);
    if (v.length) perGate[k] = { hard, pass: v.filter(g => g.status === 'PASS').length, fail: v.filter(g => g.status === 'FAIL').length, warn: v.filter(g => g.status === 'WARN').length, of: v.length };
  }
  // cross-screen issue counts, so the CODING loop can fix by "count of failing nodes across screens"
  const issues = {};
  const bump = (k, id) => { (issues[k] ||= new Set()).add(id); };
  for (const s of screens) {
    for (const id of s.text?.missing || []) bump('T1 missing node', s.key + ' ' + id);
    for (const id of s.text?.dup || []) bump('T1 duplicated id', s.key + ' ' + id);
    for (const m of s.text?.mismatch || []) bump('T2 text differs', s.key + ' ' + m.id);
    for (const e of s.text?.extra || []) bump('T3 extra text', s.key + ' ' + e.text);
    for (const f of s.fonts || []) bump('T4 non-Inter font', s.key + ' ' + f.id);
    for (const g of s.geom?.worst || []) if (g.actual !== 'missing') bump(`G1 ${g.type || ''} geometry`.replace('  ', ' '), s.key + ' ' + g.id);
    for (const f of s.style?.fails || []) if (f.actual !== 'missing') bump(`${f.layer} ${f.prop}`, s.key + ' ' + f.id);
    if (s.noSolo) bump('no solo', s.key);
  }
  const topIssues = Object.entries(issues).map(([k, v]) => ({ issue: k, nodes: v.size })).sort((a, b) => b.nodes - a.nodes).slice(0, 20);
  const flowFail = flow ? !flow.pass : false;
  const summary = {
    screens: screens.length,
    screensHardPass: screens.length - hardFailScreens.length,
    hardFailScreens: hardFailScreens.map(s => s.key),
    perGate, topIssues,
    flow: flow ? { pass: flow.pass, asserts: flow.asserts, fails: flow.fails.length, aborted: flow.aborted } : 'not run',
    hardFail: hardFailScreens.length > 0 || flowFail,
    partial: only || layer ? { only, layer } : undefined,
    app,
  };
  summary.line = `${summary.hardFail ? 'HARD FAIL' : 'ALL HARD GATES GREEN'} — screens ${summary.screensHardPass}/${summary.screens} hard-green` + (flow ? `, flow ${flow.pass ? 'PASS' : `FAIL (${flow.fails.length}/${flow.asserts})`}` : ', flow not run');
  const clean = s => { const { offendersAll, ...rest } = s; return rest; };
  const json = { commit, at: new Date().toISOString(), summary, screens: screens.map(clean), flow: flow ? { steps: flow.steps, fails: flow.fails, runs: flow.runs, asserts: flow.asserts, aborted: flow.aborted, checks: flow.checks } : null };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(json, null, 1));
  fs.writeFileSync(path.join(outDir, 'report.html'), html(json, gateDefs));
  return json;
}

function badge(k, g) {
  if (!g) return `<span class="b nr" title="not run">${k}</span>`;
  const cls = { PASS: 'ok', FAIL: 'bad', WARN: 'warn', 'N/A': 'nr' }[g.status] || 'nr';
  const tip = [g.status, g.hard ? 'HARD' : 'advisory', g.value != null ? `value ${g.value}` : '', g.threshold ? `threshold ${g.threshold}` : '', g.reason || ''].filter(Boolean).join(' · ');
  return `<span class="b ${cls}${g.hard ? '' : ' adv'}" title="${esc(tip)}">${k}</span>`;
}
const img = (src, cap) => src ? `<figure><figcaption>${cap}</figcaption><a href="${esc(src)}" target="_blank"><img loading="lazy" src="${esc(src)}" alt="${cap}"></a></figure>` : `<figure><figcaption>${cap}</figcaption><div class="noimg">no image</div></figure>`;

function html(r, gateDefs) {
  const S = r.summary;
  const gateHead = gateDefs.map(([k, hard, label]) => `<li>${badge(k, { status: 'N/A', hard })} ${esc(label)}${hard ? ' <em>HARD</em>' : ''}</li>`).join('');
  const rows = r.screens.map(s => {
    const hardBad = Object.values(s.gates).some(g => g.hard && g.status === 'FAIL');
    const gates = gateDefs.map(([k]) => badge(k, s.gates[k])).join('');
    const vals = gateDefs.filter(([k]) => s.gates[k]).map(([k]) => { const g = s.gates[k]; return `<tr><th>${k}</th><td class="${g.status}">${g.status}</td><td>${esc(g.value ?? '')}</td><td>${esc(g.threshold ?? '')}</td><td>${esc(g.reason ?? '')}</td></tr>`; }).join('');
    const off = (s.offenders || []).map(o => `<tr><td>${esc(o.layer)}</td><td><code>${esc(o.id)}</code></td><td>${esc(o.name)}</td><td>${esc(o.expected)}</td><td>${esc(o.actual)}</td></tr>`).join('');
    const im = s.img || {};
    return `<section class="screen ${hardBad ? 'red' : 'green'}" id="${s.key}">
<h2>${s.key} <small><code>${esc(s.node)}</code>${s.twin ? ` · twin <code>${esc(s.twin)}</code>` : ''} · H ${s.h ?? ''}</small> <span class="verdict">${hardBad ? 'HARD FAIL' : 'hard green'}</span></h2>
<div class="gates">${gates}</div>
<div class="imgs">${img(im.figma, 'figma')}${img(im.build, 'build')}${img(im.diff, `diff${s.pixel?.pct != null ? ' ' + s.pixel.pct + '%' : ''}`)}${im.clipBuild ? img(im.clipFigma, 'figma 874') + img(im.clipBuild, 'build clip=1') + img(im.clipDiff, `clip diff ${s.pixel?.clipPct ?? ''}%`) : ''}</div>
<details><summary>gate values</summary><table class="t"><tr><th>gate</th><th>status</th><th>value</th><th>threshold</th><th>reason</th></tr>${vals}</table></details>
${off ? `<h3>Top offenders</h3><table class="t"><tr><th>layer</th><th>node</th><th>name</th><th>expected</th><th>actual</th></tr>${off}</table>` : ''}
</section>`;
  }).join('\n');
  let flow = '<p>Flow not run.</p>';
  if (r.flow) {
    const fails = r.flow.fails.map(f => `<tr><td>${esc(f.run)}</td><td>${esc(f.step)}</td><td>${esc(f.name)}</td><td>${esc(f.detail ?? '')}</td></tr>`).join('');
    const runs = r.flow.runs.map(x => `<tr><td>${esc(x.id)}</td><td class="${x.ok ? 'PASS' : 'FAIL'}">${x.ok ? 'PASS' : 'FAIL'}</td><td><code>${esc(x.url.replace(/^https?:\/\/[^/]+/, ''))}</code></td><td>${esc(x.entry ?? '')}</td><td>${x.aborted ?? ''}</td><td>${esc((x.consoleErrors || []).join(' | '))}</td></tr>`).join('');
    const shots = r.flow.steps.filter(s => s.shot).map(s => `<figure class="fs"><figcaption>${esc(s.run)} · ${s.i} · ${esc(s.key)}</figcaption><a href="${esc(s.shot)}" target="_blank"><img loading="lazy" src="${esc(s.shot)}" alt="${esc(s.key)}"></a></figure>`).join('')
      + r.flow.runs.filter(x => x.doneShot).map(x => `<figure class="fs"><figcaption>${esc(x.id)} · Done</figcaption><a href="${esc(x.doneShot)}" target="_blank"><img loading="lazy" src="${esc(x.doneShot)}" alt="done"></a></figure>`).join('');
    flow = `<p class="${r.flow.fails.length ? 'FAIL' : 'PASS'}">${r.flow.fails.length ? 'FAIL' : 'PASS'}: ${r.flow.asserts - r.flow.fails.length}/${r.flow.asserts} assertions, ${r.flow.aborted} non-local request(s) aborted.</p>
<table class="t"><tr><th>run</th><th>result</th><th>url</th><th>entry</th><th>aborted</th><th>console errors</th></tr>${runs}</table>
${fails ? `<h3>Failing assertions</h3><table class="t"><tr><th>run</th><th>step</th><th>assertion</th><th>detail</th></tr>${fails}</table>` : ''}
<h3>Per-step screenshots</h3><div class="flowshots">${shots || '<p>No step screenshots (the journey did not start).</p>'}</div>`;
  }
  const issues = (S.topIssues || []).map(i => `<tr><td>${esc(i.issue)}</td><td>${i.nodes}</td></tr>`).join('');
  const pg = Object.entries(S.perGate || {}).map(([k, v]) => `<tr><th>${k}</th><td>${v.hard ? 'HARD' : 'advisory'}</td><td>${v.pass}</td><td>${v.fail}</td><td>${v.warn}</td><td>${v.of}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Figma Verify Report</title>
<style>
:root{--bg:#f6f7f9;--fg:#16181d;--mut:#5f6673;--card:#fff;--line:#dfe3ea;--ok:#1f7a4d;--okb:#e2f4ea;--bad:#b42318;--badb:#fde7e5;--warn:#8a5a00;--warnb:#fdf1d8;--nr:#6b7280;--nrb:#eceef2}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#111317;--fg:#e8eaee;--mut:#9aa1ad;--card:#1a1d23;--line:#2c313a;--ok:#5fd39a;--okb:#123524;--bad:#ff8a80;--badb:#3d1714;--warn:#f5c25b;--warnb:#3a2c0c;--nr:#a0a6b0;--nrb:#262a31}}
:root[data-theme=dark]{--bg:#111317;--fg:#e8eaee;--mut:#9aa1ad;--card:#1a1d23;--line:#2c313a;--ok:#5fd39a;--okb:#123524;--bad:#ff8a80;--badb:#3d1714;--warn:#f5c25b;--warnb:#3a2c0c;--nr:#a0a6b0;--nrb:#262a31}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;padding:24px 16px}
main{max-width:1400px;margin:0 auto}h1{margin:0 0 4px;font-size:24px}h2{font-size:18px;margin:0 0 8px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}h2 small{color:var(--mut);font-weight:400;font-size:13px}
.meta{color:var(--mut);margin-bottom:16px}.screen{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--ok);border-radius:10px;padding:16px;margin:16px 0}
.screen.red{border-left-color:var(--bad)}.verdict{font-size:12px;font-weight:600;padding:2px 8px;border-radius:99px;background:var(--okb);color:var(--ok)}.red .verdict{background:var(--badb);color:var(--bad)}
.gates{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px}.b{display:inline-block;font:600 11px/1 ui-monospace,Menlo,monospace;padding:4px 6px;border-radius:5px;border:1px solid transparent}
.b.ok{background:var(--okb);color:var(--ok)}.b.bad{background:var(--badb);color:var(--bad)}.b.warn{background:var(--warnb);color:var(--warn)}.b.nr{background:var(--nrb);color:var(--nr)}.b.adv{border-style:dashed;border-color:currentColor}
.imgs{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px}figure{margin:0;flex:0 0 auto}figcaption{font-size:12px;color:var(--mut);margin-bottom:4px}
.imgs img{width:201px;height:auto;display:block;border:1px solid var(--line);border-radius:6px;background:#fff}.noimg{width:201px;height:120px;display:grid;place-items:center;border:1px dashed var(--line);border-radius:6px;color:var(--mut)}
table.t{border-collapse:collapse;width:100%;margin:8px 0;font-size:12.5px;display:block;overflow-x:auto}table.t th,table.t td{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}
td code,h2 code{font-size:12px}.PASS{color:var(--ok);font-weight:600}.FAIL{color:var(--bad);font-weight:600}.WARN{color:var(--warn);font-weight:600}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}
.legend{columns:3 220px;padding-left:0;list-style:none;margin:0}.legend li{margin:3px 0;font-size:12.5px}
.flowshots{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}.fs img{width:100%;height:auto;border:1px solid var(--line);border-radius:6px}
details summary{cursor:pointer;color:var(--mut);margin:8px 0}
</style></head><body><main>
<h1>Figma verify report</h1>
<div class="meta">commit <code>${esc(r.commit)}</code> · ${esc(r.at)}${S.app ? ` · app <code>${esc(S.app.after)}</code>` : ''}${S.app?.changedDuringRun ? ' · <strong class="FAIL">app files changed during the run: results mix two builds</strong>' : ''}${S.partial ? ` · partial run ${esc(JSON.stringify(S.partial))}` : ''}</div>
<div class="cards">
<div class="card"><h2 class="${S.hardFail ? 'FAIL' : 'PASS'}">${esc(S.line)}</h2>${S.hardFailScreens.length ? `<p>Hard-failing screens: ${S.hardFailScreens.map(k => `<a href="#${k}">${k}</a>`).join(', ')}</p>` : ''}
<table class="t"><tr><th>gate</th><th>kind</th><th>pass</th><th>fail</th><th>warn</th><th>of</th></tr>${pg}</table></div>
<div class="card"><h2>Top issues across screens</h2><table class="t"><tr><th>issue</th><th>nodes</th></tr>${issues || '<tr><td colspan=2>none</td></tr>'}</table></div>
<div class="card"><h2>Gates</h2><ul class="legend">${gateHead}</ul><p style="color:var(--mut);font-size:12px">Dashed badge = advisory. Hover a badge for value and threshold.</p></div>
</div>
${rows}
<section class="screen ${r.flow && r.flow.fails.length ? 'red' : 'green'}" id="flow"><h2>E Flow (1920×1080 kiosk)</h2>${flow}</section>
</main></body></html>`;
}
