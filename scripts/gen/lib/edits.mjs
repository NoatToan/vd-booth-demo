// Client content changes on top of the rendered Figma HTML (scripts/gen/client-edits.json). String-level edits on
// the generated markup, addressed by data-node, so the Figma translator stays untouched.
import { readFileSync } from 'node:fs';

const TAG = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;

/** [start, end) of the element whose opening tag carries data-node="id" (first match). */
function bounds(html, id) {
  const at = html.indexOf(`data-node="${id}"`);
  if (at < 0) return null;
  const start = html.lastIndexOf('<', at);
  TAG.lastIndex = start;
  let depth = 0, m;
  while ((m = TAG.exec(html))) {
    const empty = m[3] === '/' || (!m[1] && /^(img|br|input)$/i.test(m[2]));
    if (empty) { if (depth === 0) return [start, TAG.lastIndex]; continue; }
    depth += m[1] ? -1 : 1;
    if (depth === 0) return [start, TAG.lastIndex];
  }
  throw new Error(`unbalanced markup at ${id}`);
}

const need = (html, id, key) => { const b = bounds(html, id); if (!b) throw new Error(`${key}: node ${id} not found`); return b; };
/** replace the text of a leaf element (its content after the opening tag) */
function setText(el, text) {
  const open = el.indexOf('>') + 1, close = el.lastIndexOf('</');
  return el.slice(0, open) + text + el.slice(close);
}

export function loadEdits(root) {
  const { edits } = JSON.parse(readFileSync(`${root}/scripts/gen/client-edits.json`, 'utf8'));
  for (const e of edits) if (!e.screen || !e.op || !e.reason) throw new Error(`client edit needs screen, op and reason: ${JSON.stringify(e)}`);
  // the Visa wordmark (brand/visa-wordmark.svg) in the text's own colour, sized to its cap height
  const mark = readFileSync(`${root}/brand/visa-wordmark.svg`, 'utf8')
    .replace(/<svg[^>]*viewBox="([^"]+)"[^>]*>/, '<svg class="visa-mark" viewBox="$1" style="display:inline-block;height:.74em;width:auto;vertical-align:-.02em;overflow:visible" fill="currentColor" role="img" aria-label="Visa" xmlns="http://www.w3.org/2000/svg">')
    .replace(/ fill="#fff"/g, '').trim();
  const forScreen = key => edits.filter(e => e.screen === key);
  return {
    dropped: new Set(edits.filter(e => e.op === 'drop').map(e => e.screen)),
    // new steps with no Figma frame: { screen, after, title, sub, auto }; the screen's behaviour draws the scene
    steps: edits.filter(e => e.op === 'step'),
    goFor: key => { const e = forScreen(key).find(x => x.op === 'go'); return e ? e.go : null; },
    apply(key, html) {
      for (const e of forScreen(key)) {
        if (e.op === 'text') { const [a, b] = need(html, e.node, key); html = html.slice(0, a) + setText(html.slice(a, b), e.text) + html.slice(b); }
        else if (e.op === 'remove') { const [a, b] = need(html, e.node, key); html = html.slice(0, a) + html.slice(b); }
        else if (e.op === 'visaMark') {
          const [a, b] = need(html, e.node, key), el = html.slice(a, b);
          if (!/>\s*VISA\b/.test(el)) throw new Error(`${key}: ${e.node} has no VISA text`);
          html = html.slice(0, a) + el.replace(/>(\s*)VISA\b/, `>$1${mark}`) + html.slice(b);
        } else if (e.op === 'swap') {
          const [x, y] = e.nodes.map(id => need(html, id, key));
          const [p, q] = x[0] < y[0] ? [x, y] : [y, x];
          html = html.slice(0, p[0]) + html.slice(q[0], q[1]) + html.slice(p[1], q[0]) + html.slice(p[0], p[1]) + html.slice(q[1]);
        } else if (e.op === 'cloneAfter') {
          const [a, b] = need(html, e.node, key);
          let copy = html.slice(a, b);
          for (const [id, t] of Object.entries(e.texts || {})) { const [c, d] = need(copy, id, key); copy = copy.slice(0, c) + setText(copy.slice(c, d), t) + copy.slice(d); }
          copy = copy.replace(/data-node="([^"]+)"/g, `data-node="$1~${e.suffix}"`).replace(/ data-twin="[^"]+"/g, '');
          html = html.slice(0, b) + copy + html.slice(b);
        } else if (!['go', 'drop', 'step'].includes(e.op)) throw new Error(`${key}: unknown op ${e.op}`);
      }
      return html;
    },
  };
}
