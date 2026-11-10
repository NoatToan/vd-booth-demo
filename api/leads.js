// GET /api/leads: the collected leads as CSV, for the booth team.
//   curl -H "Authorization: Bearer $LEADS_ADMIN_TOKEN" https://vd-booth-demo.vercel.app/api/leads > leads.csv
//   ?format=json for JSON. DELETE /api/leads?source=e2e-test… removes test rows only (source must start with e2e-test).
// LEADS_ADMIN_TOKEN is a sensitive Vercel env var; without it set, the endpoint is closed.
import { db, json } from './_db.js';

const cell = v => {
  const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('; ') : v instanceof Date ? v.toISOString() : String(v);
  // quote everything; neutralise spreadsheet formulas
  return `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
};

const authorized = request => {
  const want = process.env.LEADS_ADMIN_TOKEN;
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return !!want && got === want;
};

export async function GET(request) {
  if (!authorized(request)) return json(401, { error: 'unauthorized' });
  const sql = await db();
  const rows = await sql`SELECT id, created_at, full_name, email, company, job_title, phone, experience, interests, message, consent, consent_version, source FROM leads ORDER BY id`;
  if (new URL(request.url).searchParams.get('format') === 'json') return json(200, { count: rows.length, leads: rows.map(r => ({ ...r, id: String(r.id) })) });
  const cols = ['id', 'created_at', 'full_name', 'email', 'company', 'job_title', 'phone', 'experience', 'interests', 'message', 'consent', 'consent_version', 'source'];
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n') + '\r\n';
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="booth-leads.csv"', 'cache-control': 'no-store' } });
}

export async function DELETE(request) {
  if (!authorized(request)) return json(401, { error: 'unauthorized' });
  const source = new URL(request.url).searchParams.get('source') || '';
  if (!/^e2e-test[\w:.-]*$/.test(source)) return json(400, { error: 'only e2e-test sources can be deleted' });
  const sql = await db();
  const rows = await sql`DELETE FROM leads WHERE source = ${source} RETURNING id`;
  return json(200, { deleted: rows.length });
}
