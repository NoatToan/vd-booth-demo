// Shared Postgres access for the lead API (Neon, provisioned through the Vercel Marketplace: resource "vd-booth-leads",
// env DATABASE_URL). The table is created on first use, so a fresh database needs no migration step.
import { neon } from '@neondatabase/serverless';

export const EXPERIENCES = ['send', 'receive', 'collect', 'family', 'travel'];
export const INTERESTS = ['visa-direct', 'vxbs', 'cross-border-aft', 'demo', 'partnership'];

let ready = null;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const sql = neon(process.env.DATABASE_URL);
  ready ||= sql`CREATE TABLE IF NOT EXISTS leads (
      id          bigserial PRIMARY KEY,
      created_at  timestamptz NOT NULL DEFAULT now(),
      full_name   text NOT NULL,
      email       text NOT NULL,
      company     text,
      job_title   text,
      phone       text,
      experience  text,
      interests   text[] NOT NULL DEFAULT '{}',
      message     text,
      consent     boolean NOT NULL,
      consent_text text NOT NULL,
      source      text
    )`.catch(e => { ready = null; throw e; });
  return ready.then(() => sql);
}

export const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
