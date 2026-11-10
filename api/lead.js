// POST /api/lead: one visitor's contact details from lead/index.html (opened from the Done-screen QR).
// Validates on the server too; stores nothing without explicit consent; a filled honeypot is accepted and dropped.
import { db, json, EXPERIENCES, INTERESTS } from './_db.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export async function POST(request) {
  let b;
  try { b = await request.json(); } catch { return json(400, { error: 'invalid JSON' }); }
  if (clip(b.website, 200)) return json(200, { ok: true }); // honeypot: bots fill every field

  const lead = {
    full_name: clip(b.fullName, 120), email: clip(b.email, 200).toLowerCase(), company: clip(b.company, 160),
    job_title: clip(b.jobTitle, 120), phone: clip(b.phone, 40), message: clip(b.message, 1000),
    experience: EXPERIENCES.includes(b.experience) ? b.experience : null,
    interests: Array.isArray(b.interests) ? [...new Set(b.interests.filter(i => INTERESTS.includes(i)))] : [],
    consent: b.consent === true, consent_text: clip(b.consentText, 600), source: clip(b.source, 60) || 'booth-qr',
  };
  const errors = {};
  if (!lead.full_name) errors.fullName = 'Please enter your name.';
  if (!EMAIL.test(lead.email)) errors.email = 'Please enter a valid email address.';
  if (lead.phone && !/^[+()\d\s.-]{6,40}$/.test(lead.phone)) errors.phone = 'Please check the phone number.';
  if (!lead.consent || !lead.consent_text) errors.consent = 'Please agree so we can contact you.';
  if (Object.keys(errors).length) return json(422, { errors });

  try {
    const sql = await db();
    const [row] = await sql`INSERT INTO leads (full_name, email, company, job_title, phone, experience, interests, message, consent, consent_text, source)
      VALUES (${lead.full_name}, ${lead.email}, ${lead.company || null}, ${lead.job_title || null}, ${lead.phone || null}, ${lead.experience},
              ${lead.interests}, ${lead.message || null}, ${lead.consent}, ${lead.consent_text}, ${lead.source})
      RETURNING id, created_at`;
    return json(201, { ok: true, id: String(row.id) });
  } catch (e) {
    console.error('lead insert failed', e);
    return json(500, { error: 'Could not save right now. Please try again.' });
  }
}

export function GET() { return json(405, { error: 'POST only' }); }
