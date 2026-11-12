// Offline safety for an all-day booth: network first (a new deploy shows on the next load), the cache when the
// network is down, so a periodic reload or a flaky venue Wi-Fi never leaves a blank screen.
// Precache list + version: sw-assets.json (scripts/gen/build-sw-assets.mjs). The API is never cached.
const PREFIX = 'vd-booth-';
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const { version, files } = await (await fetch('sw-assets.json', { cache: 'no-store' })).json();
    const cache = await caches.open(PREFIX + version);
    await cache.addAll(['./', ...files]);
    await (await caches.open(PREFIX + 'meta')).put('version', new Response(version));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const v = await (await (await caches.open(PREFIX + 'meta')).match('version'))?.text();
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== PREFIX + v && k !== PREFIX + 'meta') await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    const v = await (await (await caches.open(PREFIX + 'meta')).match('version'))?.text();
    const cache = await caches.open(PREFIX + (v || 'runtime'));
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000); // a stalled network counts as down
      const r = await fetch(e.request, { signal: ctl.signal });
      clearTimeout(t);
      if (r.ok && r.type === 'basic') cache.put(e.request, r.clone());
      return r;
    } catch {
      return (await caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' })) || (await caches.match('./')) || Response.error();
    }
  })());
});
