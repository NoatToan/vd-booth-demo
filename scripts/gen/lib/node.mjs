// One Figma node -> one element (IMPL-PLAN.md §1 "Generator translation rules").
import { px, rgba, solidPaints, deg, esc, escAttr, isSvgRoot } from './figma.mjs';
import { svgFor } from './svg.mjs';

const JUSTIFY = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' };
const ALIGN = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', BASELINE: 'baseline' };

/** Unrotated w×h of a box whose axis-aligned bounding box is W×H at rotation θ (rule 5). */
function unrotate(W, H, rad) {
  if (!rad) return [W, H];
  const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad)), d = c * c - s * s;
  return [(W * c - H * s) / d, (H * c - W * s) / d];
}

const st0 = n => n.style || {};

export class Translator {
  /**
   * @param ctx { root, fileKey, idOf(node)->{node, twin}, classFor(styleString)->className, overrides: Map(id -> css), scrollId, frameId, screenKey }
   */
  constructor(ctx) { this.ctx = ctx; this.used = new Set(); }

  /** World rotation (radians, Figma sign) of a node incl. its ancestors, tracked during the walk. */
  render(n, parent, parentRot = 0) {
    const ctx = this.ctx;
    const rot = parentRot + (n.rotation || 0);
    const s = [];                 // declarations, in a stable order
    const add = (k, v) => s.push(`${k}:${v}`);
    const bb = n.absoluteBoundingBox;
    const isRoot = !parent;
    const isText = n.type === 'TEXT';
    const svgRoot = !isRoot && isSvgRoot(n);
    const pl = parent && parent.layoutMode && parent.layoutMode !== 'NONE' ? parent.layoutMode : null;
    const absolute = !isRoot && (n.layoutPositioning === 'ABSOLUTE' || !pl);
    const [w, h] = unrotate(bb.width, bb.height, rot);

    // ---- placement in the parent ----
    if (isRoot) {
      add('width', px(bb.width));
      if (n.layoutSizingVertical === 'FIXED') add('height', px(bb.height));
      else if (n.minHeight) add('min-height', px(n.minHeight));
    } else if (absolute) {
      add('position', 'absolute');
      const pbb = parent.absoluteBoundingBox;
      const [pw, ph] = unrotate(pbb.width, pbb.height, parentRot);
      const dx = (bb.x + bb.width / 2) - (pbb.x + pbb.width / 2), dy = (bb.y + bb.height / 2) - (pbb.y + pbb.height / 2);
      // World offset = R(φ) · local offset with φ = the parent's CSS angle (y-down, clockwise positive),
      // so local = R(-φ) · world.
      const ca = Math.cos(parentRot), sa = Math.sin(parentRot);
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      add('left', px(pw / 2 + lx - w / 2));
      add('top', px(ph / 2 + ly - h / 2));
      add('width', px(w));
      if (!isText) add('height', px(h));
      if (n.rotation) add('transform', `rotate(${+deg(n.rotation).toFixed(4)}deg)`);
    } else {
      add('flex-shrink', '0');
      const H = n.layoutSizingHorizontal, V = n.layoutSizingVertical;
      const primH = pl === 'HORIZONTAL';
      const fixedW = H === 'FIXED' || (svgRoot && H !== 'FILL'), fixedH = V === 'FIXED' || (svgRoot && V !== 'FILL');
      if (H === 'FILL') { if (primH) { add('flex', '1 1 0'); add('min-width', '0'); } else add('align-self', 'stretch'); }
      if (V === 'FILL') { if (!primH) { add('flex', '1 1 0'); add('min-height', '0'); } else add('align-self', 'stretch'); }
      if (fixedW) add('width', px(w));
      if (fixedH && !isText) add('height', px(h));
      if (isText && V === 'FIXED') add('height', px(h));
      // Auto-width text: Figma snaps the box to whole pixels (979 of 981 boxes are integers), which a
      // shrink-to-fit CSS box cannot reproduce; use the Figma box so HUG parents and siblings line up.
      if (isText && st0(n).textAutoResize === 'WIDTH_AND_HEIGHT' && H !== 'FILL') add('width', px(w));
    }

    if (!isRoot) {
      if (n.minHeight) add('min-height', px(n.minHeight));
      if (n.minWidth) add('min-width', px(n.minWidth));
      if (n.maxHeight) add('max-height', px(n.maxHeight));
      if (n.maxWidth) add('max-width', px(n.maxWidth));
    }

    // ---- own layout ----
    const hasAbsKids = (n.children || []).some(c => c.layoutPositioning === 'ABSOLUTE') || (!svgRoot && n.children && n.children.length && !(n.layoutMode && n.layoutMode !== 'NONE'));
    if (hasAbsKids && !absolute) add('position', 'relative');
    if (!svgRoot && !isText && n.layoutMode && n.layoutMode !== 'NONE') {
      add('display', 'flex');
      add('flex-direction', n.layoutMode === 'HORIZONTAL' ? 'row' : 'column');
      const jc = n.primaryAxisAlignItems || 'MIN';
      if (jc !== 'MIN') add('justify-content', JUSTIFY[jc]);
      const ai = n.counterAxisAlignItems || 'MIN';
      add('align-items', ALIGN[ai]);
      if (n.itemSpacing && jc !== 'SPACE_BETWEEN') add('gap', px(n.itemSpacing));
      if (n.layoutWrap === 'WRAP') { add('flex-wrap', 'wrap'); if (n.counterAxisSpacing) add('row-gap', px(n.counterAxisSpacing)); if (n.itemSpacing) add('column-gap', px(n.itemSpacing)); }
      const p = [n.paddingTop || 0, n.paddingRight || 0, n.paddingBottom || 0, n.paddingLeft || 0];
      if (p.some(Boolean)) add('padding', p.map(px).join(' '));
    }

    // ---- paint ----
    if (!isText && !svgRoot) {
      const fills = solidPaints(n.fills);
      const arc = n.type === 'ELLIPSE' && n.arcData && (n.arcData.innerRadius > 0 || Math.abs(n.arcData.endingAngle - n.arcData.startingAngle - 2 * Math.PI) > 1e-3);
      if (fills.length && !arc) {
        const top = fills.slice(1).reverse().map(f => `linear-gradient(${rgba(f.color, f.opacity)},${rgba(f.color, f.opacity)})`);
        add('background-color', rgba(fills[0].color, fills[0].opacity));
        if (top.length) add('background-image', top.join(','));
      }
      if (arc && fills.length) {
        // partial ring (e.g. the settlement spinner): conic sweep + radial hole. Figma angles run clockwise from 3 o'clock.
        const { startingAngle: a0, endingAngle: a1, innerRadius: ir } = n.arcData;
        const c = rgba(fills[0].color, fills[0].opacity);
        const d0 = +(a0 * 180 / Math.PI).toFixed(3), d1 = +(a1 * 180 / Math.PI).toFixed(3);
        add('background', `conic-gradient(from 90deg,transparent 0deg ${d0}deg,${c} ${d0}deg ${d1}deg,transparent ${d1}deg)`);
        if (ir > 0) { const m = `radial-gradient(closest-side,transparent ${+(ir * 100).toFixed(2)}%,#000 ${+(ir * 100).toFixed(2)}%)`; add('-webkit-mask', m); add('mask', m); }
      }
      if (n.type === 'ELLIPSE') add('border-radius', '50%');
      else if (n.rectangleCornerRadii) add('border-radius', n.rectangleCornerRadii.map(px).join(' '));
      else if (n.cornerRadius) add('border-radius', px(n.cornerRadius));
      const shadows = [];
      let outline = null;
      const strokes = solidPaints(n.strokes);
      if (strokes.length) {
        const c = rgba(strokes[0].color, strokes[0].opacity);
        const iw = n.individualStrokeWeights;
        if (n.strokeAlign === 'INSIDE' || !n.strokeAlign) {
          if (iw) {
            if (iw.top) shadows.push(`inset 0 ${px(iw.top)} 0 0 ${c}`);
            if (iw.bottom) shadows.push(`inset 0 ${px(-iw.bottom)} 0 0 ${c}`);
            if (iw.left) shadows.push(`inset ${px(iw.left)} 0 0 0 ${c}`);
            if (iw.right) shadows.push(`inset ${px(-iw.right)} 0 0 0 ${c}`);
          } else shadows.push(`inset 0 0 0 ${px(n.strokeWeight)} ${c}`);
        } else if (n.strokeAlign === 'OUTSIDE') shadows.push(`0 0 0 ${px(n.strokeWeight)} ${c}`);
        else outline = [`${px(n.strokeWeight)} solid ${c}`, px(-n.strokeWeight / 2)];
      }
      for (const e of n.effects || []) {
        if (e.visible === false) continue;
        if (e.type !== 'DROP_SHADOW') throw new Error(`unsupported effect ${e.type} on ${n.id}`);
        shadows.push(`${px(e.offset.x)} ${px(e.offset.y)} ${px(e.radius)} ${px(e.spread || 0)} ${rgba(e.color)}`);
      }
      if (shadows.length) add('box-shadow', shadows.join(','));
      if (outline) { add('outline', outline[0]); add('outline-offset', outline[1]); }
      if (n.clipsContent) add('overflow', 'hidden');
    }

    // ---- text ----
    let inner = '';
    if (isText) {
      const st = n.style;
      add('font-size', px(st.fontSize));
      add('font-weight', String(st.fontWeight));
      if (st.italic || /italic/i.test(st.fontStyle)) add('font-style', 'italic');
      // Figma lays text out on whole-pixel lines: a text box is lines × round(lineHeightPx) tall
      // (e.g. 2 lines at 17.4px -> 34px). Within S1's ±0.5px of lineHeightPx by construction.
      add('line-height', px(Math.round(st.lineHeightPx)));
      if (st.letterSpacing) add('letter-spacing', px(st.letterSpacing));
      const fills = solidPaints(n.fills);
      if (fills.length) add('color', rgba(fills[0].color, fills[0].opacity));
      if (st.textAlignHorizontal && st.textAlignHorizontal !== 'LEFT') add('text-align', { CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' }[st.textAlignHorizontal]);
      add('white-space', st.textAutoResize === 'WIDTH_AND_HEIGHT' ? 'pre' : 'pre-wrap');
      for (const e of n.effects || []) if (e.visible !== false) throw new Error(`text effect on ${n.id}`);
      inner = this.textRuns(n);
    } else if (svgRoot) {
      const ov = ctx.overrides.get(ctx.idOf(n).node);
      const svg = svgFor(ctx.root, ctx.fileKey, n, w, h, (ov && ov.asset) || n.name);
      add('display', 'block');
      if (svg.color) add('color', svg.color);
      inner = svg.inner;
      this.svg = svg;
    } else if (n.type !== 'VECTOR') {
      // children: Figma paints later siblings on top, as does the DOM order.
      let base = parentRot + (n.rotation || 0);
      inner = (n.children || []).map(c => this.render(c, n, base)).join('');
    }

    // ---- element ----
    const ids = ctx.idOf(n);
    if (this.used.has(ids.node)) throw new Error(`duplicate data-node ${ids.node}`);
    this.used.add(ids.node);
    const ov = ctx.overrides.get(ids.node);
    if (ov && ov.css) s.push(ov.css.replace(/;\s*$/, ''));
    const cls = [ctx.classFor(s.join(';'))];
    let attrs = ` data-node="${ids.node}"`;
    if (ids.twin) attrs += ` data-twin="${ids.twin}"`;
    if (isRoot) { cls.unshift('fr'); attrs += ` data-screen="${ctx.screenKey}" data-zone="${ctx.zone}"`; }
    if (ids.node === ctx.scrollId) attrs += ' data-role="scroll"';
    const c = cls.join(' ');
    if (isText) return `<span class="${c}"${attrs}>${inner}</span>`;
    if (svgRoot) {
      const sv = this.svg;
      return `<svg class="${c}"${attrs} width="${+w.toFixed(4)}" height="${+h.toFixed(4)}" viewBox="${sv.viewBox}" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
    }
    return `<div class="${c}"${attrs}>${inner}</div>`;
  }

  /** characters verbatim, with characterStyleOverrides as inner spans (rule 10). */
  textRuns(n) {
    const chars = n.characters, ov = n.characterStyleOverrides || [], table = n.styleOverrideTable || {};
    if (!ov.some(Boolean)) return esc(chars);
    let out = '', i = 0;
    while (i < chars.length) {
      const k = ov[i] || 0;
      let j = i + 1;
      while (j < chars.length && (ov[j] || 0) === k) j++;
      const seg = esc(chars.slice(i, j));
      const o = k ? table[k] : null;
      if (!o) out += seg;
      else {
        const d = [];
        // A run in another size must not grow the line box: Figma keeps the base line height,
        // so the run contributes no height of its own and keeps the shared baseline.
        if (o.fontSize) { d.push(`font-size:${px(o.fontSize)}`); if (o.fontSize !== n.style.fontSize && !o.lineHeightPx) d.push('line-height:0'); }
        if (o.fontWeight) d.push(`font-weight:${o.fontWeight}`);
        if (o.fontStyle) d.push(`font-style:${/italic/i.test(o.fontStyle) || o.italic ? 'italic' : 'normal'}`);
        if (o.letterSpacing !== undefined) d.push(`letter-spacing:${px(o.letterSpacing)}`);
        if (o.lineHeightPx) d.push(`line-height:${px(Math.round(o.lineHeightPx))}`);
        const f = solidPaints(o.fills);
        if (f.length) d.push(`color:${rgba(f[0].color, f[0].opacity)}`);
        out += `<span class="${this.ctx.classFor(d.join(';'))}">${seg}</span>`;
      }
      i = j;
    }
    return out;
  }
}
