// Shared Postgres access for the lead API (Neon, provisioned through the Vercel Marketplace: resource "vd-booth-leads",
// env DATABASE_URL). The table is created on first use, so a fresh database needs no migration step.
import { neon } from '@neondatabase/serverless';

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
    )`
    // added 2026-11-10 (validation pass): consent wording version, and a keyed hash of the sender IP for rate limiting
    .then(() => sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_version text, ADD COLUMN IF NOT EXISTS ip_hash text`)
    .then(() => sql`CREATE INDEX IF NOT EXISTS leads_email_time ON leads (email, created_at)`)
    // booth screens' heartbeats (api/heartbeat.js): one row per device, upserted every minute
    .then(() => sql`CREATE TABLE IF NOT EXISTS devices (
      device text PRIMARY KEY, zone text, first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(),
      beats bigint NOT NULL DEFAULT 1, state jsonb NOT NULL DEFAULT '{}')`)
    .catch(e => { ready = null; throw e; });
  return ready.then(() => sql);
}

export const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
