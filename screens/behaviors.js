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
  const op = frames.map(f => ({ opacity: f.opacity ?? 1, offset: f.offset }));
  const tf = frames.map(f => ({ transform: f.transform ?? 'none', offset: f.offset }));
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
  // Face ID scan, about 1.5 s, then advance
  go(fr, api, scr, done) {
    const em = q(fr, '2:4774') || q(fr, '2:4772');
    const check = q(fr, '2:5138');
    const r = api.rel(em, scr);
    const ring = api.fx(scr, 'fx-scan run');
    Object.assign(ring.style, { left: `${r.x - 6}px`, top: `${r.y - 6}px`, width: `${r.w + 12}px`, height: `${r.h + 12}px` });
    if (check) anim(check, [{ opacity: 0, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1)', offset: .7 }, { opacity: 1, transform: 'scale(1.3)', offset: .85 }, { opacity: 1, transform: 'scale(1)' }], { duration: 1500 });
    api.later(() => { ring.remove(); done(); }, 1500);
  }
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
  }
};

// RECEIVE
B['receive-1'] = { enter(fr, api) { countUp(q(fr, '2:5518'), api, 1100); draw(q(fr, '2:5538'), 300, 1400); } };
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
})();
