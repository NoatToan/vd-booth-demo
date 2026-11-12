// POST /api/heartbeat: a booth screen says it is alive (app.js beat(), every minute). One row per device in
// `devices`; /status/ reads it through /api/status. Only known fields are kept, each clipped.
import { db, json } from './_db.js';

const S = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
const N = v => (Number.isFinite(v) ? v : null);

export async function POST(request) {
  const raw = await request.text();
  if (raw.length > 4096) return json(413, { error: 'too large' });
  let b; try { b = JSON.parse(raw); } catch { return json(400, { error: 'invalid JSON' }); }
  const device = S(b.device, 40);
  if (!device || !/^[\w.:-]+$/.test(device)) return json(400, { error: 'device required' });
  const state = {
    view: S(b.view, 16), screen: S(b.screen, 24), uptimeS: N(b.uptimeS), loadedAt: S(b.loadedAt, 30), errors: N(b.errors),
    lastError: S(b.lastError, 200), reloads: N(b.reloads), reloadWhy: S(b.reloadWhy, 40), heapMB: N(b.heapMB), online: b.online === true,
    sw: b.sw === true, screenSize: S(b.screenSize, 20), idleS: N(b.idleS), ua: S(request.headers.get('user-agent'), 160),
  };
  // /tvcheck/ sends what the TV's browser supports; flat key -> short value only
  if (b.probe && typeof b.probe === 'object' && !Array.isArray(b.probe))
    state.probe = Object.fromEntries(Object.entries(b.probe).slice(0, 40).map(([k, v]) => [String(k).slice(0, 60), typeof v === 'boolean' || typeof v === 'number' ? v : String(v).slice(0, 300)]));
  try {
    const sql = await db();
    await sql`INSERT INTO devices (device, zone, state) VALUES (${device}, ${S(b.zone, 24)}, ${JSON.stringify(state)}::jsonb)
      ON CONFLICT (device) DO UPDATE SET zone = EXCLUDED.zone, state = EXCLUDED.state, last_seen = now(), beats = devices.beats + 1`;
    return json(200, { ok: true });
  } catch (e) { console.error('heartbeat failed', e); return json(500, { error: 'not saved' }); }
}
