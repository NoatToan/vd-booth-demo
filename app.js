(() => {
const $ = (s, r = document) => r.querySelector(s);
const P = new URLSearchParams(location.search);
const SCREENS = window.FIGMA_SCREENS || [];
const BY_KEY = Object.fromEntries(SCREENS.map(s => [s.key, s]));
const ZONES = ['send', 'receive', 'collect'];
const FLOW = Object.fromEntries(ZONES.map(z => [z, SCREENS.filter(s => s.zone === z).sort((a, b) => a.n - b.n)]));
const raf2 = fn => requestAnimationFrame(() => requestAnimationFrame(fn));
const markReady = () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => raf2(() => { document.documentElement.dataset.ready = '1'; }));

/* ---------- solo mode: one phone screen, nothing else (IMPL-PLAN.md §2.1) ---------- */
if (P.has('solo')) {
  document.documentElement.classList.add('solo');
  const s = BY_KEY[P.get('solo')];
  document.body.innerHTML = !s ? '' : P.get('clip') === '1' ? `<div class="kiosk solo-clip">${s.html}</div>` : s.html;
  if (s && P.get('clip') === '1') { const sc = $('[data-role="scroll"]'); if (sc) sc.scrollTop = 0; }
  window.VD = { state: () => ({ view: 'solo', zone: s ? s.zone : null, step: s ? s.n - 1 : null, screen: s ? s.key : null, node: s ? s.node : null }) };
  markReady();
  return;
}

/* ---------- kiosk ---------- */
const LOCK = ZONES.includes(P.get('zone')) ? P.get('zone') : null;
const IDLE_MS = (+P.get('idle') || 60) * 1000;
const QR_URL = P.get('qr') || 'https://vd-booth-demo.vercel.app/';
const RELOAD_MS = (P.has('reload') ? +P.get('reload') : 2) * 3600e3;
const LOW_FX = P.get('fx') === 'low';
const LOADED = Date.now();

document.documentElement.lang = 'en';
document.body.insertAdjacentHTML('afterbegin', '<div id="stage"><canvas id="bg" width="1920" height="1080"></canvas><div id="shade"></div><div id="app"></div></div>');
const stage = $('#stage'), app = $('#app');

// Portrait phone → rotate the 16:9 stage 90° so it always reads landscape (browsers can't lock orientation outside fullscreen).
function fit() {
  const portrait = innerHeight > innerWidth;
  const s = portrait ? Math.min(innerHeight / 1920, innerWidth / 1080) : Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(-50%,-50%)${portrait ? ' rotate(90deg)' : ''} scale(${s})`;
}
addEventListener('resize', fit); fit();
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
});

/* ---------- journeys (shell copy, English only; headlines from docs/workflow.html) ---------- */
const ICON = {
  send: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 38 38 10M18 10h20v20"/></svg>',
  receive: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M38 10 10 38M30 38H10V18"/></svg>',
  collect: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="27" r="6"/><path d="M6 7l11 11M42 7 31 18M24 46V37"/></svg>'
};
const META = {
  send: {
    name: 'SEND', color: '#b38cff', brand: ['VISA Direct', '× TPBank'],
    intent: 'I want to send money abroad.',
    hero: 'Send money abroad, securely.', sub: 'TPBank → Visa Direct → NAB · Vietnam → Australia',
    route: 'Vietnam → Australia',
    verb: 'You just sent money abroad, securely.',
    summary: 'Purpose, documents, a locked rate and Face ID. Then AUD 2,900 landed in Emily’s NAB account within minutes.',
    powered: 'Powered by Visa Direct', product: 'Visa Direct',
    explain: 'Visa Direct helps banks like TPBank push funds across borders to bank accounts, cards and wallets in near real time, with compliance and FX built into the flow.'
  },
  receive: {
    name: 'RECEIVE', color: '#f7b600', brand: ['VISA', '/ VXBS'],
    intent: 'I want to get paid from overseas.',
    hero: 'Receive from overseas.', sub: 'VXBS · United States → Vietcombank, Vietnam',
    route: 'United States → Vietnam',
    verb: 'You just received money from overseas.',
    summary: 'Linh shared her USD receiving details, Daniel paid from the US, and 63,295,800 ₫ reached Vietcombank the same day.',
    powered: 'Powered by Visa Cross-Border Solutions', product: 'VXBS Global Receiving',
    explain: 'Visa Cross-Border Solutions give people in Vietnam a global receiving account, a transparent quote before the money moves, live tracking and local settlement in VND.'
  },
  collect: {
    name: 'COLLECT', color: '#22d3ae', brand: ['VISA', '/ VXBS'],
    intent: 'I want to collect my sales from the world.',
    hero: 'Your sales, connected.', sub: 'VXBS seller · Amazon / Shopify / invoices → Vietnam',
    route: 'Amazon · Shopify · Invoices → Vietnam',
    verb: 'You just collected your global sales.',
    summary: 'Linh Studio held five currencies, connected its sales channels, and withdrew USD to Vietcombank with the rate and fee shown up front.',
    powered: 'Powered by Visa Cross-Border Solutions', product: 'VXBS for sellers',
    explain: 'Visa Cross-Border Solutions help online sellers, SMEs and freelancers collect from marketplaces and clients abroad, hold multiple currencies, and settle locally in Vietnam.'
  }
};

/* ---------- state + timers ---------- */
const S = { view: 'idle', zone: LOCK, step: 0, busy: false };
let timers = [];
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
const cur = () => S.view === 'flow' ? FLOW[S.zone][S.step] : null;

window.VD = {
  state: () => { const s = cur(); return { view: S.view, zone: S.zone, step: S.view === 'flow' ? S.step : null, screen: s ? s.key : null, node: s ? s.node : null }; }
};

function show(view) {
  clearTimers();
  S.view = view; S.busy = false;
  if (view === 'idle') { S.zone = LOCK; scene('idle', 960, 540); }
  if (view === 'home') scene('home', 960, 540);
  if (view === 'done') scene(S.zone, 1500, 520);
  draw();
  if (view === 'flow') { scene(S.zone, 1245, 540); mount(0); }
}
function openFlow(z, step = 0) { S.zone = z; S.step = Math.max(0, Math.min(step, FLOW[z].length - 1)); show('flow'); }
function nextStep() {
  if (S.view !== 'flow') return;
  if (S.step >= FLOW[S.zone].length - 1) return show('done');
  S.step++; mount(1);
}
function prevStep() { if (S.view === 'flow' && S.step > 0) { S.step--; mount(-1); } }

/* ---------- the phone ---------- */
let lastTouch = Date.now(), ringTimer = null;
function phoneScale() { const vp = $('.viewport'); return vp ? vp.getBoundingClientRect().width / 402 : 1; }
function relRect(el, scr) {
  const k = phoneScale(), a = el.getBoundingClientRect(), b = scr.getBoundingClientRect();
  return { x: (a.left - b.left) / k, y: (a.top - b.top) / k, w: a.width / k, h: a.height / k, bottom: (a.bottom - b.top) / k };
}
const api = {
  later, next: () => nextStep(), lowFx: LOW_FX, rel: relRect,
  fx(scr, cls, html = '') { const d = document.createElement('div'); d.className = cls; d.setAttribute('data-fx', ''); d.innerHTML = html; scr.appendChild(d); return d; }
};

function mount(dir) {
  clearTimers(); S.busy = false;
  const s = cur(), vp = $('.viewport');
  const old = [...vp.querySelectorAll('.scr')];
  const el = document.createElement('div');
  el.className = 'scr';
  el.innerHTML = s.html;
  for (const o of old) {
    if (!dir || o.dataset.key === s.key) { o.remove(); continue; }
    o.style.pointerEvents = 'none';
    o.classList.add(dir > 0 ? 'out-fwd' : 'out-back');
    setTimeout(() => o.remove(), 340);
  }
  el.dataset.key = s.key;
  if (dir) el.classList.add(dir > 0 ? 'in-fwd' : 'in-back');
  vp.appendChild(el);
  $('#phone').dataset.screen = s.key;
  drawRail();
  const fr = $('.fr', el);
  if (window.VD_WIRE) window.VD_WIRE(el, s, api);
  const b = (window.BEHAVIORS || {})[s.key];
  if (b && b.enter) { try { b.enter(fr, api, el); } catch (e) { console.warn(e); } }
  if (s.auto) later(nextStep, s.auto);
  setTimeout(() => scrollHint(el, s), dir ? 340 : 0);
  armRing(el, s);
}

/* scroll hint: fade + chevron over the bottom of the scroll node, until the bottom is reached */
const CHEVRON = '<svg viewBox="0 0 22 14" fill="none"><path d="M3 3l8 8 8-8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function scrollHint(scr, s) {
  if (!scr.isConnected || s.zone === 'collect') return;
  const sc = $('[data-role="scroll"]', scr);
  if (!sc || sc.scrollHeight <= sc.clientHeight + 1) return;
  const bg = getComputedStyle($('.fr', scr)).backgroundColor;
  const hint = api.fx(scr, 'scroll-hint', `${s.key === 'receive-2' ? '<b>Scroll to continue</b>' : ''}<i>${CHEVRON}</i>`);
  const r = relRect(sc, scr);
  hint.style.top = `${r.bottom - 64}px`;
  hint.style.setProperty('--hint-bg', bg.replace(/^rgb\(([^)]+)\)$/, 'rgba($1,.96)'));
  hint.style.setProperty('--hint-ink', s.zone === 'send' ? '#5b2d90' : '#1434cb');
  const cta = s.key === 'receive-2' && s.hot ? $(`[data-node="${s.hot}"]`, scr) : null;
  const upd = () => {
    hint.classList.toggle("off", sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1);
    if (cta) {
      const a = cta.getBoundingClientRect(), b = sc.getBoundingClientRect();
      const label = $('b', hint);
      if (label) label.style.display = a.top < b.bottom && a.bottom > b.top ? 'none' : '';
    }
  };
  sc.addEventListener('scroll', upd, { passive: true });
  upd();
}

/* hotspot pulse ring after 4 s without a touch */
function armRing(scr, s) {
  clearTimeout(ringTimer);
  const k = $('#kiosk-next'), f = $('#kiosk-finish');
  [k, f].forEach(b => b && b.classList.remove('pulse'));
  ringTimer = setTimeout(() => {
    if (!scr.isConnected) return;
    if (Date.now() - lastTouch < 3900) return armRing(scr, s);
    if (s.go === 'kiosk-next' && k) return k.classList.add('pulse');
    if (s.go === 'kiosk-finish' && f) return f.classList.add('pulse');
    const hot = $('[data-hotspot]', scr);
    if (!hot) return;
    const ring = api.fx(scr, 'hot-ring');
    ring.style.setProperty('--ring', S.zone === 'send' ? 'rgba(91,45,144,.85)' : 'rgba(20,52,203,.85)');
    ring.style.borderRadius = getComputedStyle(hot).borderRadius;
    const place = () => { const r = relRect(hot, scr); Object.assign(ring.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }); };
    place();
    const sc = $('[data-role="scroll"]', scr);
    if (sc) sc.addEventListener('scroll', place, { passive: true });
    const clear = () => { ring.remove(); removeEventListener('pointerdown', clear, true); if (scr.isConnected && S.view === 'flow' && cur() === s) armRing(scr, s); };
    addEventListener('pointerdown', clear, true);
  }, 4000);
}

/* touch feedback on anything that looks tappable */
function pressTarget(t) {
  const fr = t.closest && t.closest('.fr');
  if (!fr) return null;
  for (let n = t; n && n !== fr; n = n.parentElement) {
    if (n.dataset.role === 'scroll') break;
    if (n.hasAttribute('data-a')) return n;
    const cs = getComputedStyle(n);
    if (cs.borderTopLeftRadius !== '0px' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && n.parentElement !== fr) return n;
  }
  return null;
}
app.addEventListener('pointerdown', e => {
  const n = pressTarget(e.target);
  if (!n) return;
  n.classList.add('pressed');
  const up = () => { setTimeout(() => n.classList.remove('pressed'), 90); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); };
  addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
});

/* ---------- actions ---------- */
function act(a, v, el) {
  switch (a) {
    case 'start': LOCK ? openFlow(LOCK) : show('home'); break;
    case 'pick': openFlow(v); break;
    case 'next': {
      if (S.view !== 'flow' || S.busy) break;
      const s = cur(), b = (window.BEHAVIORS || {})[s.key];
      if (el && el.id === 'kiosk-next' && s.go !== 'kiosk-next') break;
      if (b && b.go) { S.busy = true; b.go($('.viewport .scr:last-child .fr'), api, $('.viewport .scr:last-child'), () => { S.busy = false; nextStep(); }); }
      else nextStep();
      break;
    }
    case 'back': if (!S.busy) prevStep(); break;
    case 'finish': if (S.view === 'flow' && cur().go === 'kiosk-finish') show('done'); break;
    case 'home': show(LOCK ? 'idle' : 'home'); break;
    case 'again': LOCK ? openFlow(LOCK) : show('home'); break;
    case 'restart': show('idle'); break;
  }
}
app.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (el && !el.disabled) act(el.dataset.a, el.dataset.v, el);
});

/* ---------- views ---------- */
const brand = z => {
  const b = z ? META[z].brand : ['VISA', 'Direct'];
  return `<div class="brand"><span class="vw">${b[0]}</span><span class="vd">${b[1]}</span></div>`;
};
function drawRail() {
  const rail = $('#rail');
  if (!rail) return;
  const list = FLOW[S.zone], s = cur();
  rail.className = `steps${list.length > 8 ? ' compact' : ''}`;
  rail.innerHTML = list.map((x, i) => `<div class="step ${i < S.step ? 'ok' : i === S.step ? 'on' : ''}"><span class="n">${i < S.step ? '✓' : i + 1}</span>${x.title}</div>`).join('');
  $('#kiosk-next').hidden = s.go !== 'kiosk-next';
  $('#kiosk-finish').hidden = s.go !== 'kiosk-finish';
}
function draw() {
  const z = S.zone, m = META[z];
  stage.style.setProperty('--z', m ? m.color : '#2f9bff');
  let html = '';
  if (S.view === 'idle') {
    html = `<div class="idle" data-a="start">
      <div class="mm">MOVE MONEY WITH</div><div class="vw">VISA</div>
      <div class="src"><b style="--c:#b38cff">SEND</b><i></i><b style="--c:#f7b600">RECEIVE</b><i></i><b style="--c:#22d3ae">COLLECT</b></div>
      <div class="touch">${LOCK ? `Touch to start · <b>${m.name}</b>` : 'Touch anywhere to start'}</div></div>`;
  } else if (S.view === 'home') {
    html = brand() + `<div class="home"><h1>Choose your journey</h1><div class="k">Tap a card to try a live Visa money-movement experience</div>
      <div class="cards">${ZONES.map(k => { const g = META[k]; return `<button class="zc" style="--z:${g.color}" data-a="pick" data-v="${k}">
        <div class="ic">${ICON[k]}</div><h2>${g.name}</h2><q>${g.hero}</q><div class="pr">${g.powered}<br><b style="color:#fff">${g.brand.join(' ')}</b></div>
        <div class="go">Start<span>→</span></div></button>`; }).join('')}</div></div>`;
  } else if (S.view === 'flow') {
    html = brand(z) + `<div class="flow">
      <div class="left"><div class="zone-pill"><span class="ic">${ICON[z]}</span>${m.name}</div>
        <h1 class="hero">${m.hero}</h1><div class="prod">${m.sub}</div>
        <div id="rail" class="steps"></div>
        <button id="kiosk-next" class="kbtn" data-a="next" hidden>Next <span>→</span></button>
        <button id="kiosk-finish" class="kbtn" data-a="finish" hidden>Finish <span>✓</span></button></div>
      <div class="route"><span>Live journey</span><b>${m.route}</b></div>
      <div id="phone" data-zone="${z}"><div class="viewport kiosk"></div></div>
      <div class="nav">${LOCK ? '' : '<button class="ghost" data-a="home">‹ All journeys</button>'}<button class="ghost" data-a="restart">↺ Start over</button></div></div>`;
  } else if (S.view === 'done') {
    html = brand(z) + `<div class="done"><div class="done-l">
      <div class="zone-pill"><span class="ic">${ICON[z]}</span>${m.name}</div>
      <h1 class="hero">${m.verb}</h1><p class="lead">${m.summary}</p>
      <div class="pw"><span>${m.powered}</span><b>${m.product}</b><p>${m.explain}</p></div>
      <div class="btns"><button class="btn primary" data-a="again">${LOCK ? 'Try it again' : 'Try another journey'}</button><button class="btn" data-a="restart">Finish</button></div></div>
      <div class="qr-card"><div id="qr"></div><h3>Scan to continue</h3><ul><li>Learn more about ${m.product}</li><li>Request a demo</li><li>Connect with the Visa team</li></ul></div></div>`;
  }
  app.innerHTML = html;
  if (S.view === 'done') {
    const el = $('#qr');
    if (window.QRCode) new QRCode(el, { text: QR_URL, width: 300, height: 300, colorDark: '#0b1240', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    else { el.title = QR_URL; el.textContent = QR_URL; }
  }
}

/* ---------- idle timeout ---------- */
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => { lastTouch = Date.now(); }, true));
setInterval(() => {
  const quiet = Date.now() - lastTouch;
  if (S.view !== 'idle' && quiet > IDLE_MS) show('idle');
  // Periodic reload frees memory on long shows; only on the attract screen so no visitor is interrupted.
  else if (RELOAD_MS && S.view === 'idle' && quiet > 30e3 && Date.now() - LOADED > RELOAD_MS) location.reload();
}, 1000);

// Keep the display awake (Screen Wake Lock needs https or localhost; harmless elsewhere).
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
addEventListener('pointerdown', keepAwake);
keepAwake();
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if (e.key === 'f' || e.key === 'F') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {});
  if (e.key === 'Escape') show('idle');
  if (['1', '2', '3'].includes(e.key)) openFlow(ZONES[+e.key - 1]);
});

/* ---------- background money-movement animation ---------- */
const g = $('#bg').getContext('2d');
const W = 1920, H = 1080;
const DOTS = [];
for (let y = 24; y < H; y += 26) for (let x = 24; x < W; x += 26) {
  const n = Math.sin(x * .0042 + 1.3) * Math.cos(y * .0061 - .4) + .55 * Math.sin(x * .0113 + y * .0079) + .3 * Math.cos(x * .021 - y * .017);
  if (n > .42) DOTS.push([x, y, Math.random()]);
}
let mode = 'idle', C = { x: 960, y: 540 }, routes = [];
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; };
const dot = () => { const d = DOTS[Math.random() * DOTS.length | 0]; return { x: d[0], y: d[1] }; };
function far(min) { let p; for (let i = 0; i < 60; i++) { p = dot(); if (Math.hypot(p.x - C.x, p.y - C.y) > min) break; } return p; }
function route(a, b, color, label) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
  return { a, b, c: { x: mx - dy * .25, y: my + dx * .25 - Math.hypot(dx, dy) * .08 }, color, label, seed: Math.random(),
    parts: [Math.random(), Math.random()], sp: .0022 + Math.random() * .002 };
}
function scene(m, x, y) {
  mode = m; C = { x, y }; routes = [];
  const pal = ['#2f9bff', '#f7b600', '#22d3ae', '#b38cff'];
  if (m === 'idle' || m === 'home') {
    for (let i = 0; routes.length < (m === 'idle' ? 12 : 7) && i < 100; i++) {
      const a = dot(), b = dot();
      if (Math.hypot(a.x - b.x, a.y - b.y) > 350) routes.push(route(a, b, pal[routes.length % 4]));
    }
  } else if (m === 'send') for (let i = 0; i < 7; i++) routes.push(route(C, far(430), META.send.color));
  else if (m === 'receive') for (let i = 0; i < 7; i++) routes.push(route(far(430), C, META.receive.color));
  else if (m === 'collect') ['$', '€', '£', 'S$', 'A$', '₫'].forEach(l => routes.push(route(far(400), C, META.collect.color, l)));
}
const bez = (r, t) => { const u = 1 - t; return { x: u * u * r.a.x + 2 * u * t * r.c.x + t * t * r.b.x, y: u * u * r.a.y + 2 * u * t * r.c.y + t * t * r.b.y }; };
let lastFrame = 0;
const TRAIL = LOW_FX ? 6 : 12;
function frame(t) {
  requestAnimationFrame(frame);
  if (LOW_FX && t - lastFrame < 32) return; // ~30fps on weak players
  lastFrame = t;
  g.clearRect(0, 0, W, H);
  for (const d of DOTS) { g.fillStyle = `rgba(120,160,255,${.09 + .07 * Math.sin(t * .001 + d[2] * 6.28)})`; g.fillRect(d[0] - 1.5, d[1] - 1.5, 3, 3); }
  const zoneMode = META[mode];
  if (zoneMode) for (let i = 0; i < 3; i++) {
    const ph = (t * .00035 + i / 3) % 1, out = mode === 'send';
    const rad = out ? 300 + ph * 300 : 600 - ph * 300;
    g.strokeStyle = rgba(zoneMode.color, (out ? 1 - ph : ph) * .3); g.lineWidth = 2;
    g.beginPath(); g.arc(C.x, C.y, rad, 0, 7); g.stroke();
  }
  for (const r of routes) {
    g.strokeStyle = rgba(r.color, .2); g.lineWidth = 2;
    g.beginPath(); g.moveTo(r.a.x, r.a.y); g.quadraticCurveTo(r.c.x, r.c.y, r.b.x, r.b.y); g.stroke();
    const ends = mode === 'send' ? [r.b] : zoneMode ? [r.a] : [r.a, r.b];
    for (const e of ends) {
      const ph = (t * .0008 + r.seed) % 1;
      g.fillStyle = rgba(r.color, .9); g.beginPath(); g.arc(e.x, e.y, 5, 0, 7); g.fill();
      g.strokeStyle = rgba(r.color, 1 - ph); g.beginPath(); g.arc(e.x, e.y, 6 + ph * 22, 0, 7); g.stroke();
    }
    if (r.label) { g.font = '700 26px Inter,sans-serif'; g.textAlign = 'center'; g.fillStyle = rgba(r.color, .95); g.fillText(r.label, r.a.x, r.a.y - 24); }
    for (let i = 0; i < r.parts.length; i++) {
      r.parts[i] = (r.parts[i] + r.sp * (LOW_FX ? 2 : 1)) % 1;
      for (let k = 0; k < TRAIL; k++) {
        const tt = r.parts[i] - k * (.132 / TRAIL); if (tt < 0) break;
        const p = bez(r, tt);
        g.fillStyle = rgba(r.color, (1 - k / TRAIL) * .95);
        if (!LOW_FX) { g.shadowBlur = k ? 0 : 18; g.shadowColor = r.color; }
        g.beginPath(); g.arc(p.x, p.y, 5.5 - k * (4.5 / TRAIL), 0, 7); g.fill();
      }
      g.shadowBlur = 0;
    }
  }
}
requestAnimationFrame(frame);

/* ---------- start ---------- */
// ?goto=home | send:3 (1-based step) | done:collect
const go = P.get('goto');
if (go === 'home') show('home');
else if (go && go.startsWith('done:') && META[go.slice(5)]) { S.zone = go.slice(5); show('done'); }
else if (go && META[go.split(':')[0]]) openFlow(go.split(':')[0], (+go.split(':')[1] || 1) - 1);
else show('idle');
markReady();
})();
