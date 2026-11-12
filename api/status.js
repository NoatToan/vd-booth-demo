// GET /api/status: every booth screen's last heartbeat, for /status/. Bearer LEADS_ADMIN_TOKEN (the booth team's key).
// DELETE /api/status?device=<id> forgets a device (e.g. a test browser).
import { db, json } from './_db.js';

const authorized = r => { const w = process.env.LEADS_ADMIN_TOKEN, g = (r.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); return !!w && g === w; };

export async function GET(request) {
  if (!authorized(request)) return json(401, { error: 'unauthorized' });
  const sql = await db();
  const rows = await sql`SELECT device, zone, first_seen, last_seen, beats, state, extract(epoch FROM now() - last_seen)::int AS age_s FROM devices ORDER BY zone, device`;
  return json(200, { now: new Date().toISOString(), deployment: process.env.VERCEL_DEPLOYMENT_ID || null, commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null, devices: rows.map(r => ({ ...r, beats: Number(r.beats) })) });
}

export async function DELETE(request) {
  if (!authorized(request)) return json(401, { error: 'unauthorized' });
  const device = new URL(request.url).searchParams.get('device') || '';
  const sql = await db();
  const rows = await sql`DELETE FROM devices WHERE device = ${device} RETURNING device`;
  return json(200, { deleted: rows.length });
}
