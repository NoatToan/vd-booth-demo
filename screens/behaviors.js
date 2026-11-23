// Hotspots, back, and per-screen motion for the generated Figma screens (docs/workflow.html ZONES[].motion).
// Contract (IMPL-PLAN.md §1 "Motion rule"): this file adds attributes, classes, listeners and [data-fx]
// decoration only. Temporary states use Web Animations with fill:'backwards' (or are restored in a timer),
// so every screen ends exactly on the generated DOM and the Figma text. Solo mode never calls any of this.
(() => {
const q = (root, id) => root.querySelector(`[data-node="${id}"]`);
const qa = (root, ids) => ids.map(id => q(root, id)).filter(Boolean);
const kids = (root, id) => { const p = q(root, id); return p ? [...p.children] : []; };
const EASE = 'cubic-bezier(.2,.8,.2,1)';
// opacity replaces, transform adds onto the element's own (e.g. the banknote's Figma rotation)
function anim(el, frames, opts) {
  const op = frames.map(f => ({ opacity: f.opacity === undefined ? 1 : f.opacity, offset: f.offset }));
  const tf = frames.map(f => ({ transform: f.transform === undefined ? 'none' : f.transform, offset: f.offset }));
  if (frames.some(f => 'opacity' in f)) el.animate(op.map(f => (f.offset === undefined ? { opacity: f.opacity } : f)), opts);
  if (frames.some(f => 'transform' in f)) return el.animate(tf.map(f => (f.offset === undefined ? { transform: f.transform } : f)), { ...opts, composite: 'add' });
}

/* ---------- motion helpers ---------- */
// fade + rise in, one after another; before its turn each element shows the first keyframe
function stagger(els, { delay = 120, step = 140, dur = 420, dy = 12 } = {}) {
  els.forEach((el, i) => anim(el, [{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: dur, delay: delay + i * step, easing: EASE, fill: 'backwards' }));
}
// a pending → done timeline: dimmed until its turn, then its check pops
function ticks(stages, { delay = 250, step = 500, check = el => el.querySelector('svg') } = {}) {
  stages.forEach((st, i) => {
    const t = delay + i * step;
    st.animate([{ opacity: .32 }, { opacity: 1 }], { duration: 260, delay: t, easing: 'ease-out', fill: 'backwards' });
    const c = check(st);
    if (c) anim(c, [{ transform: 'scale(0)' }, { transform: 'scale(1.25)', offset: .6 }, { transform: 'scale(1)' }],
      { duration: 380, delay: t, easing: 'ease-out', fill: 'backwards' });
  });
}
function pop(el, delay = 0, dur = 420) {
  if (el) anim(el, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.18)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: dur, delay, easing: 'ease-out', fill: 'backwards' });
}
// reveal left → right (charts, route arcs)
function draw(el, delay = 150, dur = 1100) {
  if (el) el.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: dur, delay, easing: 'ease-in-out', fill: 'backwards' });
}
// count a figure up from zero, keeping its format; ends on the exact Figma characters
function countUp(el, api, dur = 900) {
  if (!el) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let tn; while ((tn = walker.nextNode()) && !/\d/.test(tn.nodeValue));
  if (!tn) return;
  const orig = tn.nodeValue, m = orig.match(/\d[\d,]*(\.\d+)?/);
  if (!m) return;
  const dec = m[1] ? m[1].length - 1 : 0, target = parseFloat(m[0].replace(/,/g, ''));
  const fmt = v => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const t0 = performance.now();
  const frame = now => {
    if (!el.isConnected) return;
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    if (p < 1) { tn.nodeValue = orig.replace(m[0], fmt(target * e)); requestAnimationFrame(frame); }
    else tn.nodeValue = orig;
  };
  requestAnimationFrame(frame);
  api.later(() => { tn.nodeValue = orig; }, dur + 200);
}
const cls = (el, c) => el && el.classList.add(c);
// auto-populate (client brief 2026-11-10): each field types itself in, one after another, from empty to its Figma
// value; the screen then ends on the generated DOM (innerHTML restored), and the CTA pops so the visitor taps on.
function typeIn(fr, api, ids, { delay = 350, total = 2800, gap = 160 } = {}) {
  const els = qa(fr, ids);
  const chars = els.reduce((a, e) => a + e.textContent.length, 0) || 1;
  const per = Math.max(18, Math.min(70, (total - gap * els.length) / chars));
  let t = delay;
  for (const el of els) {
    const html = el.innerHTML, text = el.textContent;
    el.textContent = ''; el.classList.add('fx-caret');
    for (let i = 1; i <= text.length; i++) api.later(() => { el.textContent = text.slice(0, i); }, t + i * per);
    t += text.length * per;
    api.later(() => { el.innerHTML = html; el.classList.remove('fx-caret'); }, t + 1);
    t += gap;
  }
  return t;
}
// simulated entry (client brief: "bước 11 simulate số thẻ"): an empty card form gets sample values typed in, in the
// filled-field colour of the same design (#152345, F&F recovery state B). Values come from the journey itself:
// Sarah Nguyen and the card ending 4812 shown on step 12. Unlike typeIn, the screen keeps the typed values.
function simulate(fr, api, pairs, { delay = 400, total = 3000, gap = 160, color = '#152345', cta } = {}) {
  const els = pairs.map(([id, v]) => [q(fr, id), v]).filter(([e]) => e);
  const chars = els.reduce((a, [, v]) => a + v.length, 0) || 1;
  const per = Math.max(18, Math.min(70, (total - gap * els.length) / chars));
  let t = delay;
  for (const [el, v] of els) {
    api.later(() => { el.textContent = ''; el.style.color = color; el.classList.add('fx-caret'); }, t);
    for (let i = 1; i <= v.length; i++) api.later(() => { el.textContent = v.slice(0, i); }, t + i * per);
    t += v.length * per;
    api.later(() => el.classList.remove('fx-caret'), t + 1);
    t += gap;
  }
  fr.parentElement.dataset.ctaAt = Math.round(t + 400);
  const b = cta && q(fr, cta); if (b) api.later(() => pop(b.closest('[data-hotspot]') || b, 0, 380), t);
}
// the CTA ring (app.js armRing) waits for the typing: fr.parentElement is the .scr, which reads data-cta-at
const autofill = (ids, cta, opts) => (fr, api) => { const end = typeIn(fr, api, ids, opts); fr.parentElement.dataset.ctaAt = Math.round(end + 400); const b = q(fr, cta); if (b) api.later(() => pop(b.closest('[data-hotspot]') || b, 0, 380), end); };
// the n-th "Step segment" of SEND's 6-part journey progress fills in
function progress(fr, i) {
  const bar = [...fr.querySelectorAll('div')].find(d => d.children.length === 6 && [...d.children].every(c => !c.children.length && c.offsetHeight <= 6));
  const seg = bar && bar.children[i];
  if (!seg) return;
  seg.style.transformOrigin = '0 50%';
  seg.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 520, delay: 180, easing: EASE, fill: 'backwards' })
    .finished.then(() => seg.style.removeProperty('transform-origin'), () => {});
}
function toast(api, scr, near, text) {
  const t = api.fx(scr, 'fx-toast', text), r = api.rel(near, scr);
  t.style.left = `${Math.max(8, Math.min(330, r.x + r.w / 2 - 28))}px`;
  t.style.top = `${r.y - 26}px`;
  setTimeout(() => t.remove(), 1300);
}
// Animations from the Figma Make "Payments in Motion" (client feedback 2026-11-18: the videos were recorded from it),
// played from the Make's own Lottie files (brand/lottie, vendor/lottie_light.min.js) with the Make's timings.
const LOTTIE = {};
for (const k of ['face-id', 'visa-white', 'visa-blue']) fetch(`brand/lottie/${k}.json`).then(r => r.json()).then(d => { LOTTIE[k] = d; }, () => {});
function lottie(el, key, speed = 1) {
  if (!el || !window.lottie || !LOTTIE[key]) return null;
  const a = window.lottie.loadAnimation({ container: el, renderer: 'svg', loop: false, autoplay: true, animationData: LOTTIE[key], rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } });
  a.setSpeed(speed);
  return a;
}
// a Lottie's length in ms at a speed: (op - ip) / fr
const LEN = { 'face-id': 150 / 25 * 1000, 'visa-white': 50 / 30 * 1000, 'visa-blue': 40 / 30 * 1000 };
const TICK = '<svg class="tick" viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="62"/><path d="M42 72L62 92L98 52"/></svg>';
// Securing (VdaUsa07): Visa Lottie, then the circle and tick, 1.4 s later done; dark for the wallet top-up
const secMs = dark => LEN[dark ? 'visa-white' : 'visa-blue'] + 1400;
function securing(api, scr, dark) {
  const key = dark ? 'visa-white' : 'visa-blue';
  const el = api.fx(scr, 'fx-sec' + (dark ? ' dark' : ''), '<div class="lt"></div>');
  lottie(el.firstChild, key);
  api.later(() => { el.innerHTML = TICK; }, LEN[key]);
  return el;
}
// Face ID over the screen (NewPaymentMethod FaceIDScreen): Lottie at 2×, 1.5 s after it ends
const FID_MS = LEN['face-id'] / 2 + 1500;
function faceId(api, scr, text) {
  const el = api.fx(scr, 'fx-fid', `<div class="card"><div class="lt"></div><div><b>Verify with Face ID</b><p>${text}</p></div></div>`);
  lottie(el.querySelector('.lt'), 'face-id', 2);
  return el;
}
// Face ID alone, then the next step (Send: the Visa tick moved after Transfer Progress, client 2026-11-23)
function faceIdThen(api, scr, text, done) {
  const f = faceId(api, scr, text);
  api.later(() => { f.remove(); done(); }, FID_MS);
}
// Face ID, then Securing, then the next step (client: F&F, like the travel wallet)
function faceIdThenSecuring(api, scr, text, done) {
  const f = faceId(api, scr, text);
  api.later(() => { securing(api, scr, false); api.later(() => f.remove(), 400); }, FID_MS);
  api.later(done, FID_MS + secMs(false));
}

// Payment success as in the Make (RemittanceSuccess / DadPaymentSuccess / kira AftSuccess): the check circle springs in
// (scale 0.4 → 1, damping 14, stiffness 200) with two rings pulsing out behind it in its colour (1.5 px, scale 0.9 → 1.8,
// opacity 0 → 0.5 → 0, 2.4 s, the second 1.2 s later, repeating)
function successPulse(fr, api, scr, id) {
  const c = q(fr, id); if (!c) return;
  // measured before the spring starts it at 0.4×
  const r = api.rel(c, scr), bg = getComputedStyle(c).backgroundColor;
  c.classList.add('fx-okpop');
  for (const i of [0, 1]) {
    const ring = api.fx(scr, 'fx-ring');
    Object.assign(ring.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, borderColor: bg, animationDelay: `${i * 1.2}s` });
  }
}
// the bank's SMS on the wallet top-up's success (kira AftSuccess): 0.9 s in, an iOS banner springs down; a tap hides it
function bankSms(api, scr, bank, text) {
  api.later(() => {
    const b = api.fx(scr, 'fx-sms', `<span class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3C6.9 3 3 6.34 3 10.5c0 2.02.93 3.86 2.46 5.22-.13 1.2-.6 2.4-1.32 3.28-.2.24-.02.6.28.56 1.6-.2 3.02-.78 4.06-1.5.78.2 1.62.31 2.52.31 5.1 0 9-3.34 9-7.5S17.1 3 12 3z" fill="#fff"/></svg></span><div class="tx"><p class="hd"><b>${bank}</b><i>now</i></p><p>${text}</p></div>`);
    b.addEventListener('click', () => b.classList.add('out'));
  }, 900);
}

/* ---------- wiring: hotspot, back ---------- */
window.VD_WIRE = (scr, s, api) => {
  if (s.hot) { const h = q(scr, s.hot); if (h) { h.setAttribute('data-a', 'next'); h.setAttribute('data-hotspot', ''); } }
  if (s.back) { const b = q(scr, s.back); if (b) b.setAttribute('data-a', 'back'); }
};

/* ---------- per screen ---------- */
const B = window.BEHAVIORS = {};

// SEND
B['send-1'] = { enter(fr) { cls(q(fr, '2:4256'), 'fx-breathe'); } };
for (let n = 2; n <= 7; n++) B[`send-${n}`] = { enter(fr) { progress(fr, n - 2); } };
{ const fill = autofill(['2:4411', '2:4415', '2:4419', '2:4424', '2:4429', '2:4433', '2:4437', '2:4441'], '2:4457', { total: 3200 }); B['send-3'].enter = (fr, api) => { progress(fr, 1); fill(fr, api); }; }
B['send-4'].enter = (fr, api) => {
  progress(fr, 2);
  const cards = qa(fr, ['2:4517', '2:4554']);
  stagger(cards, { delay: 200, step: 500 });
  qa(fr, ['2:4528', '2:4565']).forEach((b, i) => pop(b, 650 + i * 500));
  const status = q(fr, '2:4572'), badge = q(fr, '2:4570');
  if (status && badge) {
    const html = status.innerHTML, w = status.style.width;
    status.textContent = 'Checking…'; status.style.width = 'auto';
    badge.animate([{ opacity: .55 }, { opacity: 1 }], { duration: 600, iterations: 2, direction: 'alternate' });
    api.later(() => { status.innerHTML = html; status.style.width = w; pop(badge, 0, 360); }, 1900);
  }
};
B['send-5'].enter = (fr, api) => { progress(fr, 3); countUp(q(fr, '2:4615'), api); countUp(q(fr, '2:4627'), api); cls(q(fr, '2:5081'), 'fx-breathe'); };
B['send-7'] = {
  enter(fr, api, scr) {
    progress(fr, 5);
    const block = q(fr, '2:4772');
    if (block) block.setAttribute('data-a', 'next'); // tapping the Face ID block also authorises
  },
  // client feedback 2026-11-18 (Hoa): the Face ID scan from the video, then advance; the Visa tick is on send-10 (2026-11-23)
  go(fr, api, scr, done) { faceIdThen(api, scr, 'Authenticate to securely authorize this transfer', done); }
};
B['send-8'] = {
  enter(fr, api, scr) {
    cls(q(fr, '4:338'), 'fx-spin');
    qa(fr, ['4:259', '4:267']).forEach(e => cls(e, 'fx-blink'));
    const foot = q(fr, '4:273');
    if (foot) { const bar = api.fx(scr, 'fx-auto-bar'); bar.style.top = `${api.rel(foot, scr).y - 10}px`; bar.style.setProperty('--dur', '5s'); }
  }
};
B['send-9'] = { enter(fr) { pop(q(fr, '4:350'), 150); qa(fr, ['4:353', '4:356']).forEach((c, i) => pop(c, 450 + i * 380)); } };
B['send-10'] = {
  enter(fr) {
    ticks(kids(fr, '2:4842'), { delay: 300, step: 500 });
    cls(q(fr, '2:4830'), 'fx-halo');
    draw(q(fr, '2:4887'), 400, 2600);
    stagger(kids(fr, '2:4888'), { delay: 500, step: 600, dy: 6 });
  },
  // client 2026-11-23 (Hoa): the Visa tick goes after Transfer Progress; View Transfer Receipt plays it, then Transfer complete
  go(fr, api, scr, done) { securing(api, scr, false); api.later(done, secMs(false)); }
};

// client 2026-11-18: payment success from the Make
B['send-11'] = { enter(fr, api, scr) { successPulse(fr, api, scr, '22:153'); } };

// RECEIVE
B['receive-1'] = { enter(fr, api) { countUp(q(fr, '2:5518'), api, 1100); draw(q(fr, '2:5538'), 300, 1400); } };
// client feedback 2026-11-18 (Hoa): the amount types itself in, then the fee, the amount to convert and the VND
// figure count up to their values
B['receive-2'] = {
  enter(fr, api) {
    const figs = qa(fr, ['2:5681', '2:5684', '2:5688']);
    figs.forEach(el => { el.style.visibility = 'hidden'; });
    const end = typeIn(fr, api, ['2:5676'], { delay: 450, total: 900 });
    api.later(() => figs.forEach((el, i) => api.later(() => { el.style.visibility = ''; countUp(el, api, 900); }, i * 220)), end);
    fr.parentElement.dataset.ctaAt = Math.round(end + 2 * 220 + 900 + 300);
    const b = q(fr, '2:5702'); if (b) api.later(() => pop(b.closest('[data-hotspot]') || b, 0, 380), end + 1300);
  }
};
B['receive-3'] = {
  enter(fr, api, scr) {
    for (const id of ['2:6390', '2:6393', '2:6396', '2:6399', '2:6402', '2:5767']) {
      const el = q(fr, id);
      if (el) el.addEventListener('click', () => toast(api, scr, el, 'Copied'));
    }
  }
};
B['receive-4'] = {
  enter(fr) {
    const st = kids(fr, '2:6044');
    ticks(st.slice(0, 4), { delay: 300, step: 450 });
    st.slice(4).forEach((s, i) => s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 300 + (4 + i) * 450, fill: 'backwards' }));
    cls(q(fr, '2:6079'), 'fx-spin');
    cls(q(fr, '2:6042'), 'fx-blink');
  }
};
B['receive-6'] = {
  enter(fr, api, scr) {
    const note = q(fr, '2:6228');
    if (note) anim(note, [{ transform: 'translateY(-120px)', opacity: 0 }, { transform: 'translateY(8px)', opacity: 1, offset: .75 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: 900, delay: 150, easing: 'ease-out', fill: 'backwards' });
    pop(q(fr, '2:6235'), 950, 480);
    qa(fr, ['2:6237', '2:6238', '2:6239', '2:6240']).forEach((c, i) => pop(c, 1050 + i * 70, 400));
    // confetti burst (decoration, removed when done)
    const ill = q(fr, '2:6225');
    if (!ill || api.lowFx) return;
    const r = api.rel(ill, scr), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const colors = ['#1434cb', '#f7b600', '#20a36b', '#7d95ff', '#e05a2a'];
    for (let i = 0; i < 26; i++) {
      const p = api.fx(scr, 'fx-confetti');
      const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 110;
      Object.assign(p.style, { left: `${cx}px`, top: `${cy}px`, background: colors[i % colors.length] });
      p.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 60}px) rotate(${Math.random() * 540}deg)`, opacity: 0 }],
        { duration: 1300 + Math.random() * 500, delay: 1000, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'both' }).finished.then(() => p.remove(), () => {});
    }
  }
};

// COLLECT
B['collect-1'] = { enter(fr, api) { draw(q(fr, '15:5018'), 300, 1300); countUp(q(fr, '15:4999'), api, 1000); countUp(q(fr, '15:5013'), api, 1000); } };
B['collect-2'] = {
  enter(fr) {
    qa(fr, ['15:5097', '15:5109', '15:5121']).forEach((el, i) => anim(el, [{ opacity: 0, transform: 'translateX(40px)' }, { opacity: 1, transform: 'translateX(0)' }],
      { duration: 420, delay: 150 + i * 160, easing: EASE, fill: 'backwards' }));
  }
};
B['collect-3'] = {
  enter(fr) {
    const box = q(fr, '15:5180');
    if (box) [...box.querySelectorAll('div')].filter(d => d.offsetWidth <= 8 && d.offsetHeight <= 8 && getComputedStyle(d).borderRadius !== '0px').forEach(d => cls(d, 'fx-blink'));
  }
};
B['collect-4'] = { enter(fr) { stagger(kids(fr, '15:5291'), { delay: 150, step: 120 }); } };
B['collect-6'] = { enter(fr) { stagger(qa(fr, ['15:5470', '15:5472', '15:5475', '15:5478', '15:5479']), { delay: 200, step: 260, dy: 8 }); } };
B['collect-7'] = { enter(fr) { const st = kids(fr, '15:5522'); ticks(st.slice(0, 4), { delay: 300, step: 650 }); st.slice(4).forEach(s => s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 300 + 4 * 650, fill: 'backwards' })); } };
B['collect-8'] = { enter(fr) { stagger(kids(fr, '15:5615'), { delay: 150, step: 150 }); } };

// AFT · travel wallet (XinChaoVietnam)
B['travel-2'] = { enter: autofill(['2:15860', '2:15864', '2:15869', '2:15874'], '2:15884') };
// client feedback 2026-11-18 (Hoa, video Card link verification.mp4) as in the Make (kira/screens/add-money-card-details):
// the 16th digit brings the Visa wordmark into the field (0.35 s), "Validating card…" for 0.8 s, then "Card eligible
// for funding" and where the card is billed (the Make's bank for AUD); 150 ms later the security code types in
B['travel-5'] = {
  enter(fr, api) {
    let t = typeIn(fr, api, ['2:16027', '2:16027~addr', '2:16031'], { total: 2200 });
    const box = q(fr, '2:16030'), group = q(fr, '2:16028'), icon = q(fr, '2:16959');
    api.later(() => {
      if (icon) icon.style.display = 'none';
      if (box) box.insertAdjacentHTML('beforeend', '<i class="fx-cardvisa" role="img" aria-label="Visa"></i>');
      if (group) group.insertAdjacentHTML('beforeend', '<div class="fx-cardcheck"><p class="run"><i class="sp"></i>Validating card…</p></div>');
    }, t);
    api.later(() => {
      const c = group && group.querySelector('.fx-cardcheck');
      if (c) c.innerHTML = '<p class="ok"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="7" fill="#17DA9A"/><path d="M4 7.3l2.1 2 4-4.3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Card eligible for funding</p>' +
        '<p class="sub"><span class="fl">🇦🇺</span>This card is billed in AUD · <b>Outback Bank, Sydney</b></p>';
    }, t + 800);
    t = typeIn(fr, api, ['2:16043'], { delay: t + 800 + 150, total: 165 });
    fr.parentElement.dataset.ctaAt = Math.round(t + 400);
    const b = q(fr, '2:16053'); if (b) api.later(() => pop(b.closest('[data-hotspot]') || b, 0, 380), t);
  }
};
B['travel-7'] = { enter: autofill(['2:16131'], '2:16174', { total: 900 }) };
// client feedback 2026-11-16 (Hoa #6): "Funding in progress" is left out (scripts/gen/client-edits.json). After the
// issuer approves, the Visa completion animation from the client's video (Travel wallet screen.mp4) plays over the
// phone: a deep indigo screen, the VISA wordmark wiped in left to right, then a circle drawn around a check; then
// Top-up complete. Timings read from the video at 30 fps.
B['travel-9'] = { go(fr, api, scr, done) { securing(api, scr, true); api.later(done, secMs(true)); } };
// client feedback 2026-11-18 (Hoa): "Verify it's you", a Face ID step after Card linked (client-edits.json step op);
// the screen is the Face ID scene and moves on by itself (auto)
// (AftFaceId): the Lottie at 1.3×, then "Face ID confirmed", 0.9 s later the next step (the step's auto)
B['travel-6v'] = {
  enter(fr, api) {
    lottie(fr.querySelector('.lt'), 'face-id', 1.3);
    api.later(() => { fr.classList.add('ok'); const l = fr.querySelector('.lbl'); if (l) l.textContent = 'Face ID confirmed'; }, LEN['face-id'] / 1.3);
  }
};
// client 2026-11-18: success from the Make (AftSuccess): the check springs in with pulsing rings, the bank's SMS
B['travel-11'] = {
  enter(fr, api, scr) {
    successPulse(fr, api, scr, '2:16359');
    bankSms(api, scr, 'Outback Bank, Sydney', 'You spent <b>AUD 500.00</b> on your Visa card ending 4242 at XinChaoVietnam. Wallet top-up of 8,500,000 ₫ confirmed.');
  }
};
// AFT · friends and family (NovaBank)
B['family-3'] = { enter: autofill(['2:46985', '2:46993', '2:46999'], '2:47014', { total: 2600 }) };
// client feedback 2026-11-18 (Hoa): Authorize Payment plays the Face ID scan, then the Visa authorisation; since
// 2026-11-23 Sending your money (family-14) is gone, so the Visa tick sits right before Payment Sent
B['family-13'] = { go(fr, api, scr, done) { faceIdThenSecuring(api, scr, 'Authenticate to securely approve this payment', done); } };
// client 2026-11-18: Payment Sent springs in as the Make's DadPaymentSuccess (the Figma screen has an illustration
// where the Make has the check circle, so the illustration takes the spring)
B['family-15'] = { enter(fr) { const t = q(fr, '2:47933'), ill = t && t.previousElementSibling; if (ill) ill.classList.add('fx-okpop'); } };
B['family-11'] = { enter: (fr, api) => simulate(fr, api, [['2:47654', '4111 1234 5678 4812'], ['2:47660', '08/29'], ['2:47664', '•••'], ['2:47669', 'Sarah Nguyen'], ['2:47673', '1 Market St, San Francisco, CA']], { cta: '2:47683' }) };
})();
