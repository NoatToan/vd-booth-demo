#!/usr/bin/env node
// Pulls the Figma data that the 2026-11-10 pull could not get (Tier 1 REST was rate-limited), and nothing else.
// Idempotent: finished jobs are recorded in figma/pull-state.json and skipped. Safe to run from launchd every hour.
//   node scripts/figma-pull/pull.mjs            # try every pending job once
//   node scripts/figma-pull/pull.mjs --status   # print the state, no requests
// Jobs (each costs one Tier 1 request on success; 404 / 429 cost nothing useful). GET image and GET file are
// limited separately in practice: on 2026-11-10 /v1/images still answered while /v1/files was 429.
//   rest:<key>  GET /v1/files/<key>                 -> figma/rest/<key>.json (what scripts/gen reads)
//   svg:<key>   GET /v1/images/<key>?format=svg     -> figma/assets/<key>/<slug(name)>.svg, one per IMAGE-SVG name
// Tokens are files outside the repo; a job tries them in order and moves on after a 404 (no access) or 429 (quota).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HOME = process.env.HOME || '/Users/Apple';
const TOKENS = { personal: `${HOME}/.figma_token.truongtoanlvc`, hbg: `${HOME}/.figma_token.hbg` };
const SEND = 'zSn01lZ2vy3a2kM9EDo6mD', VXBS = 'MPq4C2qjwzVdD2gYloQuUu', FF = 'h8rm8AicgWcMQ2FpMe0bDK', TRAVEL = 'r2SArlDBWw4YrxIR7xcSVb';
// hbg can read SEND / VXBS only; spend its quota there and keep the personal quota for the AFT files.
const JOBS = [
  { id: `rest:${VXBS}`, tokens: ['hbg', 'personal'] },
  { id: `svg:${SEND}`, tokens: ['hbg', 'personal'], only: ['22:154', '22:198'] }, // replaces the hand-drawn x / completed-check
  { id: `rest:${TRAVEL}`, tokens: ['personal'] },
  { id: `rest:${FF}`, tokens: ['personal'] },
  { id: `svg:${TRAVEL}`, tokens: ['personal'] },
  { id: `svg:${FF}`, tokens: ['personal'] },
];
const STATE = `${ROOT}/figma/pull-state.json`;
const LABEL = 'com.noattoan.vd-booth-figma-pull';

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { done: {}, blocked: {} };
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
const log = (...a) => console.log(new Date().toISOString(), ...a);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

if (process.argv.includes('--status')) {
  for (const j of JOBS) console.log(j.id.padEnd(32), state.done[j.id] ? `done ${state.done[j.id]}` : state.blocked[j.id] || 'pending');
  process.exit(0);
}

async function get(url, token) {
  const r = await fetch(url, { headers: { 'X-Figma-Token': token } });
  return { status: r.status, retryAfter: +(r.headers.get('retry-after') || 0), body: r.ok ? await r.json() : await r.text() };
}

/** One IMAGE-SVG node id per distinct name, from the Framelink pull (same rule as the 2026-10-29 asset export). */
function svgNodes(key, only) {
  const d = JSON.parse(readFileSync(`${ROOT}/figma/${key}.json`, 'utf8'));
  const byName = new Map();
  const walk = n => {
    const t = { ...(d.elements?.[n.template] || {}), ...n };
    if (t.type === 'IMAGE-SVG' && (!only || only.includes(n.id))) {
      const name = slug(t.name || n.name || n.id);
      if (!byName.has(name)) byName.set(name, n.id);
    }
    (n.children || []).forEach(walk);
  };
  d.nodes.forEach(walk);
  if (only) { // ids that Framelink does not list as IMAGE-SVG (frame-rooted icons): name them from the REST tree
    const rest = JSON.parse(readFileSync(`${ROOT}/figma/rest/${key}.json`, 'utf8'));
    const find = n => (only.includes(n.id) && !byName.has(slug(n.name)) && byName.set(slug(n.name), n.id), (n.children || []).forEach(find));
    find(rest.document);
  }
  return byName;
}

async function run(job, token) {
  const [kind, key] = job.id.split(':');
  if (kind === 'rest') {
    const r = await get(`https://api.figma.com/v1/files/${key}`, token);
    if (r.status !== 200) return r;
    mkdirSync(`${ROOT}/figma/rest`, { recursive: true });
    writeFileSync(`${ROOT}/figma/rest/${key}.json`, JSON.stringify(r.body));
    return { status: 200, note: `lastModified ${r.body.lastModified}` };
  }
  const nodes = svgNodes(key, job.only);
  const r = await get(`https://api.figma.com/v1/images/${key}?format=svg&ids=${[...nodes.values()].join(',')}`, token);
  if (r.status !== 200) return r;
  mkdirSync(`${ROOT}/figma/assets/${key}`, { recursive: true });
  let n = 0;
  for (const [name, id] of nodes) {
    const url = r.body.images?.[id];
    if (!url) { log(`  ${job.id}: no render for ${name} (${id})`); continue; }
    writeFileSync(`${ROOT}/figma/assets/${key}/${name}.svg`, await (await fetch(url)).text()); // S3 download, not rate-limited
    n++;
  }
  return { status: 200, note: `${n}/${nodes.size} svg` };
}

for (const job of JOBS) {
  if (state.done[job.id]) continue;
  for (const t of job.tokens) {
    if (!existsSync(TOKENS[t])) continue;
    const r = await run(job, readFileSync(TOKENS[t], 'utf8').trim());
    if (r.status === 200) {
      state.done[job.id] = `${new Date().toISOString()} via ${t} (${r.note})`; delete state.blocked[job.id];
      log('DONE', job.id, state.done[job.id]); break;
    }
    const until = r.retryAfter ? new Date(Date.now() + r.retryAfter * 1000).toISOString() : '';
    state.blocked[job.id] = `${r.status} via ${t}${until ? ` until ${until}` : ''}`;
    log('BLOCKED', job.id, state.blocked[job.id]);
  }
  save();
}
save();

const left = JOBS.filter(j => !state.done[j.id]).length;
log(left ? `${left} job(s) pending` : 'ALL DONE');
if (!left && process.platform === 'darwin') {
  // finished: remove the hourly launchd agent installed by install-agent.sh
  try { execFileSync('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`], { stdio: 'ignore' }); } catch {}
}
