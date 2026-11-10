// GET /api/leads: the collected leads as CSV, for the booth team.
//   curl -H "Authorization: Bearer $LEADS_ADMIN_TOKEN" https://vd-booth-demo.vercel.app/api/leads > leads.csv
// LEADS_ADMIN_TOKEN is a sensitive Vercel env var; without it set, the endpoint is closed.
import { db, json } from './_db.js';

const cell = v => {
  const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('; ') : v instanceof Date ? v.toISOString() : String(v);
  // quote everything; neutralise spreadsheet formulas
  return `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
};

export async function GET(request) {
  const want = process.env.LEADS_ADMIN_TOKEN;
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!want || got !== want) return json(401, { error: 'unauthorized' });
  const sql = await db();
  const rows = await sql`SELECT id, created_at, full_name, email, company, job_title, phone, experience, interests, message, consent, source FROM leads ORDER BY id`;
  const cols = ['id', 'created_at', 'full_name', 'email', 'company', 'job_title', 'phone', 'experience', 'interests', 'message', 'consent', 'source'];
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n') + '\r\n';
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="booth-leads.csv"', 'cache-control': 'no-store' } });
}
