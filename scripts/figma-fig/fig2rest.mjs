#!/usr/bin/env node
// .fig (Figma "Save local copy") -> REST-shaped JSON, for files whose REST pull is rate-limited.
//   node scripts/figma-fig/fig2rest.mjs <fileKey>
// Reads figma/fig/<fileKey>.fig, writes figma/rest/<fileKey>.json (the GET /v1/files/<key> shape scripts/gen and
// scripts/verify read) and figma/fig/<fileKey>.geometry.json (vector paths per node id, for fig2svg.mjs).
// A .fig is a zip: canvas.fig (fig-kiwi: magic, u32 version, then [u32 len][chunk]: chunk 0 = kiwi schema,
// chunk 1 = the message), plus images/<sha1>. Node ids (guid) are the same as in the source file.
// Only the features the booth files use are mapped; anything else throws so it cannot be dropped silently.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';
import { decodeBinarySchema, compileSchema } from 'kiwi-schema';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function readFig(path) {
  const zip = execFileSync('unzip', ['-p', path, 'canvas.fig'], { maxBuffer: 1 << 30 });
  const meta = JSON.parse(execFileSync('unzip', ['-p', path, 'meta.json']).toString());
  if (zip.subarray(0, 8).toString() !== 'fig-kiwi') throw new Error(`${path}: not a fig-kiwi canvas`);
  const chunks = [];
  for (let off = 12; off < zip.length;) { const n = zip.readUInt32LE(off); chunks.push(zip.subarray(off + 4, off + 4 + n)); off += 4 + n; }
  const inflate = c => (c[0] === 0x28 && c[1] === 0xb5 && c[2] === 0x2f && c[3] === 0xfd ? zlib.zstdDecompressSync(c) : zlib.inflateRawSync(c));
  const schema = compileSchema(decodeBinarySchema(inflate(chunks[0])));
  return { meta, version: zip.readUInt32LE(8), msg: schema.decodeMessage(inflate(chunks[1])) };
}

const gid = g => `${g.sessionID}:${g.localID}`;
const hex = b => Buffer.from(b).toString('hex');
const WEIGHT = { Thin: 100, 'Extra Light': 200, Light: 300, Regular: 400, Medium: 500, 'Semi Bold': 600, Bold: 700, 'Extra Bold': 800, Black: 900 };
const fontWeight = style => { const s = style.replace(/\s*Italic$/, '').trim() || 'Regular'; if (!(s in WEIGHT)) throw new Error(`font style ${style}`); return WEIGHT[s]; };
const color = c => ({ r: c.r, g: c.g, b: c.b, a: c.a });

function paint(p) {
  const out = { blendMode: p.blendMode || 'NORMAL', type: p.type };
  if (p.visible === false) out.visible = false;
  if (p.opacity !== undefined && p.opacity !== 1) out.opacity = p.opacity;
  if (p.type === 'SOLID') out.color = color(p.color);
  else if (p.type === 'IMAGE') {
    out.scaleMode = p.imageScaleMode || 'FILL';
    out.imageRef = hex(p.image.hash);
    if (p.rotation) out.rotation = p.rotation;
    if (p.imageScaleMode === 'TILE') out.scalingFactor = p.scale;
  } else if (p.type === 'GRADIENT_LINEAR') {
    // kiwi stores the inverse of the gradient space -> handles: p0 = T^-1(0,.5), p1 = T^-1(1,.5), p2 = T^-1(0,1)
    const { m00: a, m01: b, m02: c, m10: d, m11: e, m12: f } = p.transform;
    const det = a * e - b * d, inv = (x, y) => ({ x: (e * (x - c) - b * (y - f)) / det, y: (-d * (x - c) + a * (y - f)) / det });
    out.gradientHandlePositions = [inv(0, 0.5), inv(1, 0.5), inv(0, 1)];
    out.gradientStops = p.stops.map(s => ({ color: color(s.color), position: s.position }));
  } else throw new Error(`paint ${p.type}`);
  return out;
}

function typeStyle(n, base) {
  const st = {};
  if (n.fontName) {
    st.fontFamily = n.fontName.family; st.fontPostScriptName = n.fontName.postscript || null;
    st.fontStyle = n.fontName.style; st.fontWeight = fontWeight(n.fontName.style);
    if (/Italic/.test(n.fontName.style)) st.italic = true;
  }
  if (n.fontSize !== undefined) st.fontSize = n.fontSize;
  const fsz = n.fontSize ?? base?.fontSize;
  if (n.letterSpacing) st.letterSpacing = n.letterSpacing.units === 'PIXELS' ? n.letterSpacing.value : n.letterSpacing.value * fsz / 100;
  if (n.textDecoration && n.textDecoration !== 'NONE') st.textDecoration = n.textDecoration;
  if (n.textCase && n.textCase !== 'ORIGINAL') st.textCase = n.textCase;
  if (n.fillPaints) st.fills = n.fillPaints.map(paint);
  return st;
}

export function toRest(fig, fileKey) {
  const nodes = fig.msg.nodeChanges.filter(n => n.phase !== 'REMOVED');
  const byId = new Map(nodes.map(n => [gid(n.guid), n]));
  const kids = new Map();
  for (const n of nodes) if (n.parentIndex) {
    const p = gid(n.parentIndex.guid);
    (kids.get(p) || kids.set(p, []).get(p)).push(n);
  }
  for (const l of kids.values()) l.sort((x, y) => (x.parentIndex.position < y.parentIndex.position ? -1 : x.parentIndex.position > y.parentIndex.position ? 1 : 0));
  const geometry = {};
  const blob = i => fig.msg.blobs[i].bytes;

  function conv(n, parent, world, parentRest) {
    const id = gid(n.guid);
    const T = n.transform || { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
    // world = parent world · local
    const W = world ? {
      m00: world.m00 * T.m00 + world.m01 * T.m10, m01: world.m00 * T.m01 + world.m01 * T.m11, m02: world.m00 * T.m02 + world.m01 * T.m12 + world.m02,
      m10: world.m10 * T.m00 + world.m11 * T.m10, m11: world.m10 * T.m01 + world.m11 * T.m11, m12: world.m10 * T.m02 + world.m11 * T.m12 + world.m12,
    } : T;
    if (Math.abs(T.m01) > 1e-6 || Math.abs(T.m10) > 1e-6) throw new Error(`${id}: rotation is not mapped`);
    const type = { ROUNDED_RECTANGLE: 'RECTANGLE' }[n.type] || n.type;
    const r = { id, name: n.name, type };
    if (n.visible === false) r.visible = false;
    const isFrame = n.type === 'FRAME', isDoc = n.type === 'DOCUMENT', isCanvas = n.type === 'CANVAS';
    if (!isDoc && !isCanvas) {
      const sz = n.size || { x: 0, y: 0 };
      r.absoluteBoundingBox = { x: W.m02, y: W.m12, width: sz.x, height: sz.y };
      r.absoluteRenderBounds = { ...r.absoluteBoundingBox };
      if (n.opacity !== undefined && n.opacity !== 1) r.opacity = n.opacity;
      r.fills = (n.fillPaints || []).map(paint);
      r.strokes = (n.strokePaints || []).map(paint);
      r.strokeWeight = n.strokeWeight ?? 1;
      r.strokeAlign = n.strokeAlign || 'INSIDE';
      if (n.strokeCap && n.strokeCap !== 'NONE') r.strokeCap = n.strokeCap;
      if (n.strokeJoin && n.strokeJoin !== 'MITER') r.strokeJoin = n.strokeJoin;
      if (n.borderStrokeWeightsIndependent) r.individualStrokeWeights = { top: n.borderTopWeight || 0, right: n.borderRightWeight || 0, bottom: n.borderBottomWeight || 0, left: n.borderLeftWeight || 0 };
      const radii = [n.rectangleTopLeftCornerRadius, n.rectangleTopRightCornerRadius, n.rectangleBottomRightCornerRadius, n.rectangleBottomLeftCornerRadius].map(v => v || 0);
      if (n.rectangleCornerRadiiIndependent && new Set(radii).size > 1) r.rectangleCornerRadii = radii;
      else if (n.cornerRadius) r.cornerRadius = n.cornerRadius;
      r.effects = (n.effects || []).map(e => {
        if (e.type !== 'DROP_SHADOW' && e.type !== 'INNER_SHADOW') throw new Error(`${id}: effect ${e.type}`);
        return { type: e.type, visible: e.visible !== false, color: color(e.color), blendMode: e.blendMode || 'NORMAL', offset: e.offset, radius: e.radius, spread: e.spread || 0, ...(e.type === 'DROP_SHADOW' ? { showShadowBehindNode: !!e.showShadowBehindNode } : {}) };
      });
      if (isFrame) r.clipsContent = !n.frameMaskDisabled;
      if (n.minSize?.value) { if (n.minSize.value.x) r.minWidth = n.minSize.value.x; if (n.minSize.value.y) r.minHeight = n.minSize.value.y; }
      if (n.maxSize?.value) { if (n.maxSize.value.x) r.maxWidth = n.maxSize.value.x; if (n.maxSize.value.y) r.maxHeight = n.maxSize.value.y; }

      // ---- auto layout (own) ----
      if (n.stackMode && n.stackMode !== 'NONE') {
        r.layoutMode = n.stackMode;
        r.primaryAxisSizingMode = n.stackPrimarySizing === 'FIXED' ? 'FIXED' : 'AUTO';
        r.counterAxisSizingMode = n.stackCounterSizing && n.stackCounterSizing !== 'FIXED' ? 'AUTO' : 'FIXED';
        r.primaryAxisAlignItems = { SPACE_EVENLY: 'SPACE_BETWEEN' }[n.stackPrimaryAlignItems] || n.stackPrimaryAlignItems || 'MIN';
        r.counterAxisAlignItems = n.stackCounterAlignItems || 'MIN';
        r.paddingLeft = n.stackHorizontalPadding || 0;
        r.paddingRight = n.stackPaddingRight || 0; // absent = 0 (verified against the API pull: "9px 14px 0px")
        r.paddingTop = n.stackVerticalPadding || 0;
        r.paddingBottom = n.stackPaddingBottom || 0;
        r.itemSpacing = n.stackSpacing || 0;
        if (n.stackWrap === 'WRAP') { r.layoutWrap = 'WRAP'; r.counterAxisSpacing = n.stackCounterSpacing || 0; }
      }
      // ---- auto layout (as a child) ----
      const pl = parentRest && parentRest.layoutMode;
      if (n.stackPositioning === 'ABSOLUTE') r.layoutPositioning = 'ABSOLUTE';
      const inFlow = pl && r.layoutPositioning !== 'ABSOLUTE';
      const grow = inFlow && n.stackChildPrimaryGrow === 1, stretch = inFlow && n.stackChildAlignSelf === 'STRETCH';
      if (inFlow) { r.layoutAlign = stretch ? 'STRETCH' : 'INHERIT'; r.layoutGrow = grow ? 1 : 0; }
      const hug = axis => {
        if (n.type === 'TEXT') return axis === 'H' ? n.textAutoResize === 'WIDTH_AND_HEIGHT' : (n.textAutoResize === 'WIDTH_AND_HEIGHT' || n.textAutoResize === 'HEIGHT');
        if (!r.layoutMode) return false;
        const primary = (r.layoutMode === 'HORIZONTAL') === (axis === 'H');
        return primary ? r.primaryAxisSizingMode === 'AUTO' : r.counterAxisSizingMode === 'AUTO';
      };
      for (const axis of ['H', 'V']) {
        const along = pl && ((pl === 'HORIZONTAL') === (axis === 'H'));
        const fill = inFlow && (along ? grow : stretch);
        r[axis === 'H' ? 'layoutSizingHorizontal' : 'layoutSizingVertical'] = fill ? 'FILL' : hug(axis) ? 'HUG' : 'FIXED';
      }
      r.constraints = { vertical: 'TOP', horizontal: 'LEFT' };
    }

    // ---- text ----
    if (n.type === 'TEXT') {
      const td = n.textData;
      r.characters = td.characters;
      const style = typeStyle(n);
      delete style.fills;
      style.textAutoResize = n.textAutoResize || 'NONE';
      style.textAlignHorizontal = n.textAlignHorizontal || 'LEFT';
      style.textAlignVertical = n.textAlignVertical || 'TOP';
      // explicit line heights are exact in REST; only "auto" (PERCENT 100) uses the font's metrics, which Figma
      // has already resolved into derivedTextData
      const { value: lv, units: lu } = n.lineHeight;
      const auto = lu === 'PERCENT' && lv === 100;
      style.lineHeightPx = auto ? n.derivedTextData.baselines[0].lineHeight : lu === 'PIXELS' ? lv : lu === 'RAW' ? lv * n.fontSize : lv * n.fontSize / 100;
      style.lineHeightUnit = auto ? 'INTRINSIC_%' : lu === 'PIXELS' ? 'PIXELS' : 'FONT_SIZE_%';
      if (!auto && lu !== 'PIXELS') style.lineHeightPercentFontSize = lu === 'RAW' ? lv * 100 : lv;
      r.style = style;
      // characterStyleIDs index UTF-16 code units, the same unit as REST characterStyleOverrides
      const ids = td.characterStyleIDs || [];
      if (ids.some(Boolean)) {
        r.characterStyleOverrides = [...ids];
        while (r.characterStyleOverrides.length && !r.characterStyleOverrides.at(-1)) r.characterStyleOverrides.pop();
        r.styleOverrideTable = {};
        for (const o of td.styleOverrideTable || []) {
          const s = typeStyle(o, n);
          if (o.fontSize !== undefined) s.lineHeightPx = undefined;
          r.styleOverrideTable[o.styleID] = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined));
        }
      } else { r.characterStyleOverrides = []; r.styleOverrideTable = {}; }
    }

    // ---- geometry for fig2svg: every painted shape (vectors, rectangles, frames with a fill or stroke) ----
    if (n.type !== 'TEXT' && (n.fillGeometry?.length || n.strokeGeometry?.length)) {
      geometry[id] = {
        size: n.size,
        fill: (n.fillGeometry || []).map(g => ({ rule: g.windingRule, blob: Buffer.from(blob(g.commandsBlob)).toString('base64') })),
        stroke: (n.strokeGeometry || []).map(g => ({ rule: g.windingRule, blob: Buffer.from(blob(g.commandsBlob)).toString('base64') })),
      };
    }
    const cs = kids.get(id) || [];
    if (isDoc || isCanvas || isFrame || cs.length) r.children = cs.filter(c => !c.internalOnly && c.type !== 'CODE_COMPONENT').map(c => conv(c, n, isDoc || isCanvas ? null : W, r));
    if (isCanvas) { r.backgroundColor = n.backgroundColor ? color(n.backgroundColor) : { r: 0.96, g: 0.96, b: 0.96, a: 1 }; r.flowStartingPoints = []; r.prototypeStartNodeID = null; }
    return r;
  }

  const doc = nodes.find(n => n.type === 'DOCUMENT');
  const document = conv(doc, null, null, null);
  document.children = document.children.filter(c => !byId.get(c.id).internalOnly);
  const rest = {
    document, components: {}, componentSets: {}, schemaVersion: 0, styles: {},
    name: fig.meta.file_name, lastModified: fig.meta.exported_at, thumbnailUrl: '', version: String(fig.version),
    role: 'viewer', editorType: 'figma', linkAccess: 'view',
    $source: `figma/fig/${fileKey}.fig via scripts/figma-fig/fig2rest.mjs (fig-kiwi v${fig.version}, exported ${fig.meta.exported_at})`,
  };
  return { rest, geometry };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const key = process.argv[2];
  if (!key) { console.error('usage: node scripts/figma-fig/fig2rest.mjs <fileKey>'); process.exit(2); }
  const fig = readFig(`${ROOT}/figma/fig/${key}.fig`);
  const { rest, geometry } = toRest(fig, key);
  writeFileSync(`${ROOT}/figma/rest/${key}.json`, JSON.stringify(rest));
  writeFileSync(`${ROOT}/figma/fig/${key}.geometry.json`, JSON.stringify(geometry));
  let count = 0; const walk = n => { count++; (n.children || []).forEach(walk); }; walk(rest.document);
  console.log(`${key}: ${count} nodes -> figma/rest/${key}.json, ${Object.keys(geometry).length} shapes -> figma/fig/${key}.geometry.json`);
}
