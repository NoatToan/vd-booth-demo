// Preload for framelink-offline.mjs: answers GET https://api.figma.com/v1/files/<key> from figma/rest/<key>.json,
// so Framelink's own simplifier runs on a REST tree converted from a .fig. Any other Figma call fails loudly.
import { readFileSync } from 'node:fs';
const ROOT = process.env.VD_ROOT;
const real = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const m = u.match(/^https:\/\/api\.figma\.com\/v1\/files\/([A-Za-z0-9]+)(\?.*)?$/);
  if (m) return new Response(readFileSync(`${ROOT}/figma/rest/${m[1]}.json`, 'utf8'), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.startsWith('https://api.figma.com/')) return new Response(JSON.stringify({ status: 404, err: `offline: ${u}` }), { status: 404 });
  return real(url, init);
};
