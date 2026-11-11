(() => {
const $ = (s, r = document) => r.querySelector(s);
const P = new URLSearchParams(location.search);
const SCREENS = window.FIGMA_SCREENS || [];
const BY_KEY = Object.fromEntries(SCREENS.map(s => [s.key, s]));
// Five experiences (client brief 2026-11-10): SEND 1, RECEIVE 4. Keys are the screen-key prefixes in screens/gen.
const ZONES = ['send', 'receive', 'collect', 'family', 'travel'];
const GROUPS = [{ name: 'SEND', zones: ['send'] }, { name: 'RECEIVE', zones: ['receive', 'collect', 'family', 'travel'] }];
// readable lock links, e.g. ?zone=aft-travel (the short keys keep working)
const ALIAS = { 'vxbs-individual': 'receive', 'vxbs-seller': 'collect', 'aft-family': 'family', 'aft-travel': 'travel' };
const SIZE = { family: '414x896', travel: '414x896' }; // Figma device size; others are 402x874
// Visa marks: vector from the Figma Make "Payments in Motion: Money Movement Edition" (shared/visa/wordmark and
// demo/VisaDirectLockup), read through the Figma MCP 2026-11-11
const BRAND_LOGO = 'brand/visa-wordmark.svg', BRAND_DIRECT = 'brand/visa-direct-lockup.svg';
const FLOW = Object.fromEntries(ZONES.map(z => [z, SCREENS.filter(s => s.zone === z).sort((a, b) => a.n - b.n)]));
const raf2 = fn => requestAnimationFrame(() => requestAnimationFrame(fn));
const markReady = () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => raf2(() => { document.documentElement.dataset.ready = '1'; }));

/* ---------- solo mode: one phone screen, nothing else (IMPL-PLAN.md §2.1) ---------- */
if (P.has('solo')) {
  document.documentElement.classList.add('solo');
  const s = BY_KEY[P.get('solo')];
  document.body.innerHTML = !s ? '' : P.get('clip') === '1' ? `<div class="kiosk solo-clip" style="--pw:${s.w}px;--ph:${s.w === 414 ? 896 : 874}px">${s.html}</div>` : s.html;
  if (s && P.get('clip') === '1') { const sc = $('[data-role="scroll"]'); if (sc) sc.scrollTop = 0; }
  window.VD = { state: () => ({ view: 'solo', zone: s ? s.zone : null, step: s ? s.n - 1 : null, screen: s ? s.key : null, node: s ? s.node : null }) };
  markReady();
  return;
}

/* ---------- kiosk ---------- */
const LOCK = (z => (ZONES.includes(z) ? z : null))(ALIAS[P.get('zone')] || P.get('zone'));
const IDLE_MS = (+P.get('idle') || 60) * 1000;
// Done-screen QR: the lead form (lead/index.html) tagged with the experience; ?qr= overrides it for every journey
const QR_URL = z => P.get('qr') || `https://vd-booth-demo.vercel.app/lead/?exp=${z}`;
const RELOAD_MS = (P.has('reload') ? +P.get('reload') : 2) * 3600e3;
const LOW_FX = P.get('fx') === 'low';
const LOADED = Date.now();

document.documentElement.lang = 'en';
document.body.insertAdjacentHTML('afterbegin', '<div id="stage"><div id="kv"><i></i><i></i><i></i><i></i><i></i><i></i></div><canvas id="bg" width="1920" height="1080"></canvas><div id="shade"></div><div id="app"></div></div>');
if (P.get('fx') === 'low') document.documentElement.classList.add('lowfx');
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
  collect: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="27" r="6"/><path d="M6 7l11 11M42 7 31 18M24 46V37"/></svg>',
  family: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 28a8 8 0 0 1 0-11l6-6a8 8 0 0 1 11 11l-3 3M28 20a8 8 0 0 1 0 11l-6 6a8 8 0 0 1-11-11l3-3"/></svg>',
  travel: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 30 42 14M14 26l-4-10 6-2 8 8M22 22l8 18 6-3-2-17"/></svg>'
};
const META = {
  send: {
    name: 'SEND', color: '#b38cff', brand: ['VISA Direct', '× Vietnam Pioneer Bank'], title: 'Send abroad', via: 'via Visa Direct',
    intent: 'I want to send money abroad.',
    hero: 'Send money abroad, securely.', sub: 'Vietnam Pioneer Bank → Visa Direct → NAB · Vietnam → Australia',
    route: 'Vietnam → Australia',
    verb: 'You just sent money abroad, securely.',
    summary: 'Purpose, documents, a locked rate and Face ID. Then AUD 2,900 landed in Emily’s NAB account within minutes.',
    powered: 'Powered by Visa Direct', product: 'Visa Direct',
    explain: 'Visa Direct helps banks like Vietnam Pioneer Bank push funds across borders to bank accounts, cards and wallets in near real time, with compliance and FX built into the flow.'
  },
  receive: {
    name: 'RECEIVE', color: '#f7b600', brand: ['VISA', ''], title: 'Individual receiver', via: 'via VXBS',
    intent: 'I want to get paid from overseas.',
    hero: 'Receive from overseas.', sub: 'United States → Vietnam Bank, Vietnam',
    route: 'United States → Vietnam',
    verb: 'You just received money from overseas.',
    summary: 'Linh shared her USD receiving details, Daniel paid from the US, and 63,295,800 ₫ reached Vietnam Bank the same day.',
    powered: 'Powered by Visa Cross-Border Solutions', product: 'VXBS Global Receiving',
    explain: 'Visa Cross-Border Solutions give people in Vietnam a global receiving account, a transparent quote before the money moves, live tracking and local settlement in VND.'
  },
  collect: {
    name: 'RECEIVE', color: '#22d3ae', brand: ['VISA', ''], title: 'E-seller withdrawal', via: 'via VXBS',
    intent: 'I want to collect my sales from the world.',
    hero: 'Your sales, connected.', sub: 'Seller · Amazon / Shopify / invoices → Vietnam',
    route: 'Amazon · Shopify · Invoices → Vietnam',
    verb: 'You just collected your global sales.',
    summary: 'Linh Studio held five currencies, connected its sales channels, and withdrew USD to Vietnam Bank with the rate and fee shown up front.',
    powered: 'Powered by Visa Cross-Border Solutions', product: 'VXBS for sellers',
    explain: 'Visa Cross-Border Solutions help online sellers, SMEs and freelancers collect from marketplaces and clients abroad, hold multiple currencies, and settle locally in Vietnam.'
  },
  // AFT copy: scenario facts are the Figma texts (storyboard header, receipts); the explainers paraphrase the
  // designs' own "About Visa Direct XB AFT" notes until Visa supplies approved marketing copy.
  family: {
    name: 'RECEIVE', color: '#8fd3ff', brand: ['VISA Direct', ''], title: 'Friends & family', via: 'Cross-border AFT · me-to-you',
    hero: 'Request with a link. Pay with Visa.', sub: 'NovaBank · United States → Vietnam',
    route: 'United States → Vietnam',
    verb: 'You just got paid from overseas with a link.',
    summary: 'Minh Anh shared a secure link, Sarah paid USD 202 with her Visa Debit card, and 4,900,000 VND reached Minh Anh’s bank account in 2m 28s.',
    powered: 'Powered by Visa Direct', product: 'Visa Direct cross-border AFT',
    explain: 'A secure payment link lets family abroad pay with an eligible Visa card, with no account at the receiver’s bank, and the money lands directly in the receiver’s bank account.'
  },
  travel: {
    name: 'RECEIVE', color: '#ff6b7a', brand: ['VISA Direct', ''], title: 'Travel wallet', via: 'Cross-border AFT · me-to-me',
    hero: 'Bring your money to Vietnam in seconds.', sub: 'XinChaoVietnam · Australia → Vietnam',
    route: 'Australia → Vietnam',
    verb: 'You just funded your trip from your own Visa card.',
    summary: 'James linked his Australian Visa Debit, added AUD 500 as 8,500,000 ₫ to his Vietnam wallet, and paid Lotus Coffee in Hanoi by QR.',
    powered: 'Powered by Visa Direct', product: 'Visa Direct cross-border AFT',
    explain: 'Cross-Border Account Funding Transactions let an overseas card fund a wallet in another country: one card debit in AUD, one wallet credit in VND.'
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
  stage.classList.toggle('idle-view', view === 'idle');
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
function phoneScale() { const vp = $('.viewport'); return vp ? vp.getBoundingClientRect().width / vp.offsetWidth : 1; }
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
  const lane = $('#lane');
  if (lane) { lane.hidden = !s.lane; if (s.lane) lane.innerHTML = `<span>${s.lane.role}</span><b>${s.lane.name}</b>`; }
  const fr = $('.fr', el);
  if (window.VD_WIRE) window.VD_WIRE(el, s, api);
  const b = (window.BEHAVIORS || {})[s.key];
  if (b && b.enter) { try { b.enter(fr, api, el); } catch (e) { console.warn(e); } }
  if (s.auto) later(nextStep, s.auto);
  const cue = $('#scroll-cue'); if (cue) cue.hidden = true;
  setTimeout(() => scrollHint(el, s), dir ? 340 : 0);
  armRing(el, s);
}

// ink of each app's primary buttons (Figma), for the scroll hint and the hotspot ring
const INK = { send: '#5b2d90', receive: '#1434cb', collect: '#1434cb', family: '#2563eb', travel: '#8e1c2d' };
const CHEVRON = '<svg viewBox="0 0 22 14" fill="none"><path d="M3 3l8 8 8-8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/* scroll cue: outside the phone, in the bottom-right column above Next, so it never covers the app's content.
   Shown while the screen's scroll node has more below; tapping it scrolls the phone; hidden at the bottom. */
function scrollHint(scr, s) {
  const cue = $('#scroll-cue');
  if (!cue || !scr.isConnected || s.zone === 'collect') return;
  const sc = $('[data-role="scroll"]', scr);
  if (!sc || sc.scrollHeight <= sc.clientHeight + 1) { cue.hidden = true; return; }
  $('b', cue).textContent = s.key === 'receive-2' ? 'Scroll to continue' : 'Scroll for more';
  cue.style.setProperty('--hint-ink', INK[s.zone]);
  const upd = () => { if (cur() === s) cue.hidden = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1; };
  sc.addEventListener('scroll', upd, { passive: true });
  cue.onclick = () => sc.scrollBy({ top: sc.clientHeight * 0.7, behavior: 'smooth' });
  upd();
}

/* CTA indicator: from ~1.2 s after entry (later on auto-populate screens, see behaviors.js ctaAt) the screen's
   call to action carries a continuous pulse ring, and the kiosk Next / Finish pulse, so visitors see where to tap.
   A CTA below the fold carries it too and comes into view with it; the scroll cue leads there. */
function armRing(scr, s) {
  clearTimeout(ringTimer);
  const k = $('#kiosk-next'), f = $('#kiosk-finish');
  [k, f].forEach(b => b && b.classList.remove('pulse'));
  const at = Math.max(1200, +(scr.dataset.ctaAt || 0));
  ringTimer = setTimeout(() => {
    if (!scr.isConnected) return;
    if (s.go === 'kiosk-next' && k) return k.classList.add('pulse');
    if (s.go === 'kiosk-finish' && f) return f.classList.add('pulse');
    const hot = $('[data-hotspot]', scr);
    if (!hot) return;
    // the indicator is a class on the CTA itself (an outline), so it scrolls with the button natively: no overlay to
    // reposition on scroll, no lag when the visitor flicks the page
    hot.style.setProperty('--ring', INK[S.zone]);
    ctaFit(hot, scr);
    hot.classList.add('fx-cta');
  }, at);
}

/* Fit the CTA ring into the room the design leaves: the ring (2 px wide) breathes 2 px between offsets a and a+2, and
   must not reach a clipping ancestor (a footer, a card, the phone). Room is measured once at arm time, in phone px; a
   scroll container only limits the sides (it scrolls). With no room outside, the ring is drawn inside the button, in
   white on a dark fill, in the app's ink otherwise. */
function ctaFit(hot, scr) {
  const k = hot.getBoundingClientRect().width / hot.offsetWidth || 1, h = hot.getBoundingClientRect();
  let room = 4; // the most the ring ever needs outside: offset 2 + 2 px of breath
  for (let a = hot.parentElement; a && a !== scr; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const c = a.getBoundingClientRect(), side = Math.min(h.left - c.left, c.right - h.right) / k;
    room = Math.min(room, a.dataset.role === 'scroll' ? side : Math.min(side, (h.top - c.top) / k, (c.bottom - h.bottom) / k));
  }
  const inside = room < 4;
  const a = inside ? -6 : 0; // outside: offsets 0 → 2 (ring at 0-4 px out); inside: -6 → -4 (ring at 2-6 px in)
  // white only on a dark fill (a blue button); on a light card the app's ink stays readable
  const m = getComputedStyle(hot).backgroundColor.match(/[\d.]+/g) || [];
  const dark = m.length >= 3 && (m[3] === undefined || +m[3] > 0.5) && (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 140;
  hot.style.setProperty('--cta-a', `${a}px`);
  hot.style.setProperty('--cta-b', `${a + 2}px`);
  if (inside && dark) hot.style.setProperty('--ring', 'rgba(255,255,255,.85)');
  hot.dataset.ctaFit = inside ? 'inside' : 'outside';
}

/* touch feedback on the phone's actionable elements */
function pressTarget(t) {
  const fr = t.closest && t.closest('.fr');
  if (!fr) return null;
  // only elements wired to an action (hotspot, back) give touch feedback: a button that looks tappable but does
  // nothing in the demo stays still, so visitors are not led to think it worked
  for (let n = t; n && n !== fr; n = n.parentElement) {
    if (n.dataset.role === 'scroll') break;
    if (n.hasAttribute('data-a')) return n;
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
  // the Visa mark is an image (brand/logo.svg, a test image until Visa supplies the approved logo); the product
  // name ("Direct") and the co-brand stay text
  const direct = /^VISA Direct$/.test(b[0]);
  return `<div class="brand${b[1].startsWith('×') ? ' co' : ''}"><span class="mark">${direct ? `<img class="lockup" src="${BRAND_DIRECT}" alt="Visa Direct">` : `<img class="logo" src="${BRAND_LOGO}" alt="Visa">`}</span><span class="vd">${b[1]}</span></div>`;
};
function drawRail() {
  const rail = $('#rail');
  if (!rail) return;
  const list = FLOW[S.zone], s = cur();
  rail.className = `steps${list.length > 12 ? ' compact dense' : list.length > 8 ? ' compact' : ''}`;
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
      <img class="kv-logo" src="${BRAND_LOGO}" alt="Visa">
      <img class="kv-title" src="brand/kv-title.png" alt="Payments in Motion · Money Movement Edition">
      <div class="kv-city">Ho Chi Minh, Vietnam</div><i class="kv-sweep"></i>
      <div class="kv-start"><div class="src"><b style="--c:#ffd66b">SEND</b><i></i><b style="--c:#ffd66b">RECEIVE</b></div>
      <div class="touch">${LOCK ? `Touch to start · <b>${m.name} · ${m.title}</b>` : 'Touch anywhere to start'}</div></div></div>`;
  } else if (S.view === 'home') {
    const card = k => { const g = META[k]; return `<button class="zc" style="--z:${g.color}" data-a="pick" data-v="${k}">
        <div class="ic">${ICON[k]}</div><h2>${g.title}</h2><div class="via">${g.via}</div><q>${g.hero}</q>
        <div class="go">Start<span>→</span></div></button>`; };
    html = brand() + `<div class="home"><h1>Choose your journey</h1><div class="k">Tap a card to try a live Visa money-movement experience</div>
      <div class="groups">${GROUPS.map(gr => `<section class="grp g${gr.zones.length}"><h3>${gr.name}</h3><div class="cards">${gr.zones.map(card).join('')}</div></section>`).join('')}</div></div>`;
  } else if (S.view === 'flow') {
    html = brand(z) + `<div class="flow">
      <div class="left"><div class="zone-pill"><span class="ic">${ICON[z]}</span>${m.name}<em>${m.title}</em></div>
        <h1 class="hero">${m.hero}</h1><div class="prod">${m.sub}</div>
        <div id="rail" class="steps"></div></div>
      <div class="knav s${(SIZE[z] || '402x874').slice(0, 3)}"><button id="scroll-cue" class="scroll-cue" type="button" hidden><b>Scroll for more</b><i>${CHEVRON}</i></button>
        <button id="kiosk-next" class="kbtn" data-a="next" hidden>Next <span>→</span></button>
        <button id="kiosk-finish" class="kbtn" data-a="finish" hidden>Finish <span>✓</span></button></div>
      <div class="route"><span>Live journey</span><b>${m.route}</b></div>
      <div id="lane" class="lane" hidden></div>
      <div id="phone" data-zone="${z}" data-size="${SIZE[z] || '402x874'}"><div class="viewport kiosk"></div></div>
      <div class="nav">${LOCK ? '' : '<button class="ghost" data-a="home">‹ All journeys</button>'}<button class="ghost" data-a="restart">↺ Start over</button></div></div>`;
  } else if (S.view === 'done') {
    html = brand(z) + `<div class="done"><div class="done-l">
      <div class="zone-pill"><span class="ic">${ICON[z]}</span>${m.name}<em>${m.title}</em></div>
      <h1 class="hero">${m.verb}</h1><p class="lead">${m.summary}</p>
      <div class="pw"><span>${m.powered}</span><b>${m.product}</b><p>${m.explain}</p></div>
      <div class="btns"><button class="btn primary" data-a="again">${LOCK ? 'Try it again' : 'Try another journey'}</button><button class="btn" data-a="restart">Finish</button></div></div>
      <div class="qr-card"><div id="qr"></div><h3>Scan to keep in touch</h3><ul><li>Leave your details on your phone</li><li>Learn more about ${m.product}</li><li>Request a demo with the Visa team</li></ul></div></div>`;
  }
  app.innerHTML = html;
  if (S.view === 'done') {
    const el = $('#qr');
    const url = QR_URL(S.zone);
    if (window.QRCode) new QRCode(el, { text: url, width: 300, height: 300, colorDark: '#0b1240', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    else { el.title = url; el.textContent = url; }
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
  if (/^[1-5]$/.test(e.key)) openFlow(ZONES[+e.key - 1]);
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
  else if (m === 'receive' || m === 'family' || m === 'travel') for (let i = 0; i < 7; i++) routes.push(route(far(430), C, META[m].color));
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
// ?goto=home | send:3 (1-based step) | done:collect | travel:5
const go = P.get('goto');
if (go === 'home') show('home');
else if (go && go.startsWith('done:') && META[go.slice(5)]) { S.zone = go.slice(5); show('done'); }
else if (go && META[go.split(':')[0]]) openFlow(go.split(':')[0], (+go.split(':')[1] || 1) - 1);
else show('idle');
markReady();
})();
