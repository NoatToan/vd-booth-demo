// POST /api/lead: one visitor's contact details from lead/index.html (opened from the Done-screen QR).
// Validation lives in _validate.js. Spam is accepted and dropped (bots learn nothing); a repeat of the same email
// within 10 minutes is not stored twice; one network may send at most 20 leads per 10 minutes.
import { createHmac } from 'node:crypto';
import { db, json } from './_db.js';
import { validate, CONSENT } from './_validate.js';

const MAX_BODY = 16 * 1024;
const ipHash = request => {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || '';
  return ip ? createHmac('sha256', process.env.LEADS_ADMIN_TOKEN || 'booth').update(ip).digest('hex').slice(0, 32) : null; // never the raw IP
};

export async function POST(request) {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return json(415, { error: 'Send JSON.' });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: 'Too much data.' });
  let b;
  try { b = JSON.parse(raw); } catch { return json(400, { error: 'invalid JSON' }); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json(400, { error: 'invalid body' });

  const { lead, errors, spam } = validate(b);
  if (spam) return json(201, { ok: true });
  if (Object.keys(errors).length) return json(422, { errors });

  try {
    const sql = await db();
    const ip = ipHash(request);
    if (ip) {
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM leads WHERE ip_hash = ${ip} AND created_at > now() - interval '10 minutes'`;
      if (n >= 20) return json(429, { error: 'Too many submissions from this network. Please try again in a few minutes.' });
    }
    const [dup] = await sql`SELECT id FROM leads WHERE email = ${lead.email} AND created_at > now() - interval '10 minutes' ORDER BY id DESC LIMIT 1`;
    if (dup) return json(200, { ok: true, id: String(dup.id), duplicate: true });
    const [row] = await sql`INSERT INTO leads (full_name, email, company, job_title, phone, experience, interests, message, consent, consent_text, consent_version, source, ip_hash)
      VALUES (${lead.full_name}, ${lead.email}, ${lead.company || null}, ${lead.job_title || null}, ${lead.phone || null}, ${lead.experience},
              ${lead.interests}, ${lead.message || null}, ${lead.consent}, ${CONSENT[lead.consent_version]}, ${lead.consent_version}, ${lead.source}, ${ip})
      RETURNING id`;
    return json(201, { ok: true, id: String(row.id) });
  } catch (e) {
    console.error('lead insert failed', e);
    return json(500, { error: 'Could not save right now. Please try again.' });
  }
}

export function GET() { return json(405, { error: 'POST only' }); }
