// Backend test runner. Usage (from this folder): npm install && npm test
// It copies ../functions into a temp folder, starts a LOCAL Worker with a LOCAL
// D1 database (nothing touches the live site), runs every check and prints
// PASS/FAIL per check. It never deletes or edits anything in the repo.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const PROJECT = 'recall-med';
const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; failures.push(name); console.log('FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}
const J = (x) => JSON.stringify(x);

// ---------- keys and tokens ----------
const good = await generateKeyPair('RS256', { extractable: true });
const other = await generateKeyPair('RS256', { extractable: true });
const goodJwk = { ...(await exportJWK(good.publicKey)), kid: 'test-key-1', alg: 'RS256', use: 'sig' };

async function token(uid, o = {}) {
  const now = Math.floor(Date.now() / 1000);
  let jwt = new SignJWT({ auth_time: o.authTime ?? now - 5, ...(o.email ? { email: o.email } : {}) })
    .setProtectedHeader({ alg: o.alg || 'RS256', kid: o.kid || 'test-key-1' })
    .setSubject(uid)
    .setIssuer(o.iss || `https://securetoken.google.com/${PROJECT}`)
    .setAudience(o.aud || PROJECT)
    .setIssuedAt(o.iat ?? now - 5)
    .setExpirationTime(o.exp ?? now + 3600);
  return jwt.sign(o.key || good.privateKey);
}

async function api(p, { method = 'GET', tok, body, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (tok) h.Authorization = 'Bearer ' + tok;
  if (body !== undefined || raw !== undefined) h['Content-Type'] = 'application/json';
  const doFetch = () => fetch(BASE + p, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? J(body) : undefined });
  let res;
  try { res = await doFetch(); }
  catch (e) { // a reused idle connection can be closed by the local server between slow database checks; try once more
    if (!/other side closed|ECONNRESET/i.test(String((e && e.cause) || e))) throw e;
    res = await doFetch();
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-json */ }
  return { status: res.status, data };
}

// ---------- local Worker ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-test-'));
fs.cpSync(path.join(repo, 'functions'), path.join(tmp, 'functions'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'index.html'), '<!doctype html><title>stub</title>');
fs.writeFileSync(path.join(tmp, 'wrangler.toml'),
  'name = "recall-test"\npages_build_output_dir = "."\ncompatibility_date = "2026-10-24"\n' +
  '[[d1_databases]]\nbinding = "DB"\ndatabase_name = "recall-db"\ndatabase_id = "00000000-0000-0000-0000-000000000000"\n');
fs.writeFileSync(path.join(tmp, '.dev.vars'),
  `FIREBASE_PROJECT_ID=${PROJECT}\nADMIN_UIDS=admin1\nTEST_JWKS=${J({ keys: [goodJwk] })}\nGITHUB_TOKEN=test-gh-token-not-real\nGITHUB_API=http://127.0.0.1:8799\n`);

// A tiny fake GitHub (contents API) so the question editor can be tested without any real token.
const GH_PATH = '/repos/recall-med/recall4/contents/data/CPM/final_exam/anatomy/pharynx.json';
const gh = { text: JSON.stringify({ questions: [1, 2, 3, 4].map((i) => ({ id: i, question: `Q${i}?`, options: ['A', 'B', 'C', 'D'], answer: 1, explanation: 'Because B.', image: 'keep.png' })) }, null, 2) + '\n', sha: 'sha-1', puts: [], auth: [], files: {}, cfgPuts: [], race: false };
const CFG_URL = '/repos/recall-med/recall4/contents/config/modules.json';
gh.files[CFG_URL] = { text: fs.readFileSync(path.join(repo, 'config', 'modules.json'), 'utf8'), sha: 'cfg-1' };
const ghServer = http.createServer((req, res) => {
  gh.auth.push(req.headers.authorization);
  const url = new URL(req.url, 'http://x');
  const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (url.pathname !== GH_PATH) {   // every other file: config/modules.json and files the admin tools create
    const f = gh.files[url.pathname];
    if (req.method === 'GET') return f ? send(200, { sha: f.sha, content: Buffer.from(f.text).toString('base64'), encoding: 'base64' }) : send(404, { message: 'Not Found' });
    let b2 = ''; req.on('data', (d) => { b2 += d; }); return req.on('end', () => {
      const j = JSON.parse(b2);
      if (gh.race && f) { gh.race = false; f.sha = 'raced-' + Date.now(); return send(409, { message: 'conflict' }); }   // someone else committed in between
      if (f && j.sha !== f.sha) return send(409, { message: 'conflict' });
      if (!f && j.sha) return send(422, { message: 'sha not expected' });
      gh.cfgPuts.push({ path: url.pathname, ...j });
      gh.files[url.pathname] = { text: Buffer.from(j.content, 'base64').toString('utf8'), sha: 'f' + gh.cfgPuts.length };
      send(f ? 200 : 201, { content: { sha: gh.files[url.pathname].sha } });
    });
  }
  if (req.method === 'GET') return send(200, { sha: gh.sha, content: Buffer.from(gh.text).toString('base64'), encoding: 'base64' });
  let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
    const j = JSON.parse(b);
    if (j.sha !== gh.sha) return send(409, { message: 'conflict' });
    gh.puts.push(j); gh.text = Buffer.from(j.content, 'base64').toString('utf8'); gh.sha = 'sha-' + (gh.puts.length + 1);
    send(200, { content: { sha: gh.sha } });
  });
});
await new Promise((r) => ghServer.listen(8799, '127.0.0.1', r));
const wr = path.join(here, 'node_modules', '.bin', 'wrangler');
const schema = path.join(repo, 'db', 'schema.sql');
const ex = spawnSync(wr, ['d1', 'execute', 'recall-db', '--local', '--file', schema], { cwd: tmp, encoding: 'utf8' });
if (ex.status !== 0) { console.log(ex.stdout, ex.stderr); process.exit(2); }

const server = spawn(wr, ['pages', 'dev', '.', '--port', String(PORT), '--ip', '127.0.0.1'], { cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
async function waitUp() {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return true; } catch (e) { /* not yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
async function sql(q) { // read-only inspection of the local database
  const r = spawnSync(wr, ['d1', 'execute', 'recall-db', '--local', '--json', '--command', q], { cwd: tmp, encoding: 'utf8' });
  try { return JSON.parse(r.stdout)[0].results; } catch (e) { return null; }
}

// ---------- helpers for payloads ----------
const SCOPE = 'CPM|end_module|anatomy|larynx';
const uuid = () => crypto.randomUUID();
const prog = (rev, t, extra = {}) => ({ epoch: 0, rev, updatedAt: t, completed: true, attempted: 10, correct: 7, total: 10, score: 70, lastAttempt: t, ...extra });
const attempt = (id = uuid(), o = {}) => ({
  attemptId: id, module: 'CPM', examType: 'end_module', subject: 'anatomy', subSubject: 'larynx',
  score: 70, correct: 7, total: 10, attempted: 10, timeSec: 120, review: { keys: [`${SCOPE}|1`], answers: [2] }, ...o,
});
const dev = () => uuid();

try {
  check('local Worker starts', await waitUp(), serverLog.slice(-400));

  // ===== health =====
  let r = await api('/api/health');
  check('health: public, returns ok', r.status === 200 && r.data.ok === true);
  r = await api('/api/health?db=1');
  check('health?db=1: database binding reachable', r.status === 200 && r.data.db === true);

  // ===== token tests =====
  const U = 'userA';
  r = await api('/api/state');
  check('no token -> 401', r.status === 401);
  r = await api('/api/state', { tok: 'garbage' });
  check('malformed token -> 401', r.status === 401);
  const t = await token(U);
  const [h, p, s] = t.split('.');
  const forged = await token(U, { key: other.privateKey });
  r = await api('/api/state', { tok: forged });
  check('forged signature (wrong private key, same kid) -> 401', r.status === 401);
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  payload.sub = 'victim';
  const tampered = [h, Buffer.from(J(payload)).toString('base64url'), s].join('.');
  r = await api('/api/state', { tok: tampered });
  check('tampered payload (sub changed, old signature) -> 401', r.status === 401);
  r = await api('/api/state', { tok: await token(U, { aud: 'someone-else' }) });
  check('wrong audience -> 401', r.status === 401);
  r = await api('/api/state', { tok: await token(U, { iss: 'https://securetoken.google.com/other' }) });
  check('wrong issuer -> 401', r.status === 401);
  const nowS = Math.floor(Date.now() / 1000);
  r = await api('/api/state', { tok: await token(U, { exp: nowS - 10, iat: nowS - 3600 }) });
  check('expired token -> 401', r.status === 401);
  r = await api('/api/state', { tok: await token(U, { kid: 'unknown-kid' }) });
  check('unknown key id -> 401', r.status === 401);
  const algNone = [Buffer.from(J({ alg: 'none', typ: 'JWT' })).toString('base64url'), p, ''].join('.');
  r = await api('/api/state', { tok: algNone });
  check('alg "none" token -> 401', r.status === 401);
  const hs = [Buffer.from(J({ alg: 'HS256', kid: 'test-key-1' })).toString('base64url'), p, s].join('.');
  r = await api('/api/state', { tok: hs });
  check('alg HS256 token -> 401', r.status === 401);
  r = await api('/api/state', { tok: t });
  check('valid token -> 200 with empty state', r.status === 200 && r.data.epoch === 0 && Object.keys(r.data.scopes).length === 0);
  for (const [m, pth] of [['POST', '/api/sync'], ['POST', '/api/reset'], ['PUT', '/api/session'], ['GET', '/api/session'], ['GET', '/api/admin/summary'], ['GET', '/api/admin/config'], ['POST', '/api/admin/config'], ['POST', '/api/account'], ['POST', '/api/profile']]) {
    const rr = await api(pth, { method: m, body: m === 'GET' ? undefined : {} });
    check(`every route needs a token: ${m} ${pth} -> 401`, rr.status === 401);
  }

  // ===== student isolation =====
  const tA = await token('userA'), tB = await token('userB');
  const dA = dev();
  r = await api('/api/sync', { method: 'POST', tok: tA, body: {
    baseEpoch: 0, deviceId: dA,
    scopes: { [SCOPE]: { progress: prog(1, Date.now() - 1000), flags: { 5: { epoch: 0, rev: 1, updatedAt: Date.now() - 1000, flaggedAt: Date.now() - 1000 } } } },
    attempts: [attempt()],
  } });
  check('sync: user A writes progress, flag and an attempt', r.status === 200 && r.data.acceptedAttempts.length === 1, J(r.data));
  r = await api('/api/state?uid=userA', { tok: tB });
  check('isolation: user B cannot see user A data (even with ?uid=userA)', r.status === 200 && Object.keys(r.data.scopes).length === 0 && r.data.attempts.length === 0 && r.data.stats.completedExams === 0);
  r = await api('/api/sync', { method: 'POST', tok: tB, body: { baseEpoch: 0, deviceId: dev(), uid: 'userA', scopes: { [SCOPE]: { flags: { 9: { epoch: 0, rev: 1, updatedAt: 1 } } } } } });
  const stA = await api('/api/state', { tok: tA });
  check('isolation: a uid in the body is ignored; A has none of B\'s flags', r.status === 200 && !stA.data.scopes[SCOPE].flags[9]);

  // ===== duplicate attempt id / stats =====
  const tD = await token('dupUser');
  const id1 = uuid();
  const body1 = { baseEpoch: 0, deviceId: dev(), attempts: [attempt(id1)] };
  const a1 = await api('/api/sync', { method: 'POST', tok: tD, body: body1 });
  const a2 = await api('/api/sync', { method: 'POST', tok: tD, body: body1 });
  const rows = await sql(`SELECT COUNT(*) AS n FROM attempts WHERE uid='dupUser'`);
  check('duplicate attempt id stores exactly one row', rows && rows[0].n === 1, J(rows));
  check('duplicate attempt: both calls report it accepted (safe retry)', a1.data.acceptedAttempts[0] === id1 && a2.data.acceptedAttempts[0] === id1);
  check('duplicate attempt: statistics do not change', a1.data.stats.completedExams === 1 && a2.data.stats.completedExams === 1 && a2.data.stats.totalAttempted === 10 && a2.data.stats.totalCorrect === 7 && a2.data.stats.totalIncorrect === 3);

  // ===== idempotent payload =====
  const tI = await token('idemUser');
  const idem = { baseEpoch: 0, deviceId: dev(), scopes: { [SCOPE]: {
    progress: prog(2, Date.now() - 500),
    incorrect: { 3: { epoch: 0, rev: 1, updatedAt: Date.now() - 500, userAnswer: 1, addedAt: Date.now() - 500 } },
    flags: { 4: { epoch: 0, rev: 1, updatedAt: Date.now() - 500, flaggedAt: Date.now() - 500 } } } } };
  await api('/api/sync', { method: 'POST', tok: tI, body: idem });
  const s1 = (await api('/api/state', { tok: tI })).data;
  const v1 = await sql(`SELECT version FROM scopes WHERE uid='idemUser'`);
  await api('/api/sync', { method: 'POST', tok: tI, body: idem });
  const s2 = (await api('/api/state', { tok: tI })).data;
  const v2 = await sql(`SELECT version FROM scopes WHERE uid='idemUser'`);
  check('same sync payload twice -> identical state', J(s1.scopes) === J(s2.scopes) && J(s1.stats) === J(s2.stats));
  check('same sync payload twice -> second send writes nothing (version unchanged)', v1 && v2 && v1[0].version === v2[0].version, J([v1, v2]));

  // ===== two-device conflict: deterministic, order-independent =====
  const base = Date.now() - 10000;
  const X = { baseEpoch: 0, deviceId: dev(), scopes: { [SCOPE]: { progress: prog(3, base + 100, { score: 80 }),
    incorrect: { 1: { epoch: 0, rev: 2, updatedAt: base + 50, userAnswer: 0, addedAt: base, removed: true } },
    flags: { 2: { epoch: 0, rev: 1, updatedAt: base + 10, flaggedAt: base } } } } };
  const Y = { baseEpoch: 0, deviceId: dev(), scopes: { [SCOPE]: { progress: prog(3, base + 200, { score: 90 }),
    incorrect: { 1: { epoch: 0, rev: 1, updatedAt: base + 900, userAnswer: 2, addedAt: base } },
    flags: { 2: { epoch: 0, rev: 2, updatedAt: base + 20, flaggedAt: base, removed: true } } } } };
  const tXY = await token('conflictXY'), tYX = await token('conflictYX');
  await api('/api/sync', { method: 'POST', tok: tXY, body: X }); await api('/api/sync', { method: 'POST', tok: tXY, body: Y });
  await api('/api/sync', { method: 'POST', tok: tYX, body: Y }); await api('/api/sync', { method: 'POST', tok: tYX, body: X });
  const cXY = (await api('/api/state', { tok: tXY })).data.scopes[SCOPE], cYX = (await api('/api/state', { tok: tYX })).data.scopes[SCOPE];
  check('conflict: X then Y equals Y then X', J({ ...cXY, version: 0 }) === J({ ...cYX, version: 0 }), J([cXY, cYX]));
  check('conflict: higher rev wins even with an older timestamp (incorrect entry)', cXY.incorrect[1].rev === 2 && cXY.incorrect[1].removed === true);
  check('conflict: same rev -> later updatedAt wins (progress score 90)', cXY.progress.score === 90);
  check('conflict: flag tombstone with higher rev wins', cXY.flags[2].removed === true && cXY.flags[2].rev === 2);

  // future timestamp is clamped to server time
  const tF = await token('futureUser');
  await api('/api/sync', { method: 'POST', tok: tF, body: { baseEpoch: 0, deviceId: dev(), scopes: { [SCOPE]: { progress: prog(1, Date.now() + 10 * 86400000) } } } });
  const fut = (await api('/api/state', { tok: tF })).data.scopes[SCOPE].progress;
  check('a client timestamp from the future is clamped to server time', fut.updatedAt <= Date.now() + 5000, J(fut.updatedAt));

  // ===== delete account =====
  const tDel = await token('delUser'), tKeep = await token('keepUser');
  const delSeed = { baseEpoch: 0, deviceId: dev(), attempts: [attempt()], scopes: { [SCOPE]: { progress: prog(3, Date.now() - 300),
    incorrect: { 7: { epoch: 0, rev: 1, updatedAt: Date.now() - 300, userAnswer: 1, addedAt: Date.now() - 300 } },
    flags: { 8: { epoch: 0, rev: 1, updatedAt: Date.now() - 300, flaggedAt: Date.now() - 300 } } } } };
  await api('/api/sync', { method: 'POST', tok: tDel, body: delSeed });
  await api('/api/sync', { method: 'POST', tok: tKeep, body: { ...delSeed, attempts: [attempt()] } });
  const cntRows = async (uid) => ({ u: (await sql(`SELECT COUNT(*) n FROM users WHERE uid='${uid}'`))[0].n,
    s: (await sql(`SELECT COUNT(*) n FROM scopes WHERE uid='${uid}'`))[0].n, a: (await sql(`SELECT COUNT(*) n FROM attempts WHERE uid='${uid}'`))[0].n });
  check('delete setup: both users have data', J(await cntRows('delUser')) === J({ u: 1, s: 1, a: 1 }) && J(await cntRows('keepUser')) === J({ u: 1, s: 1, a: 1 }));
  const nowS2 = Math.floor(Date.now() / 1000);
  r = await api('/api/account', { method: 'POST', tok: await token('delUser', { authTime: nowS2 - 3600 }), body: { confirm: 'delete' } });
  check('delete account: refused (403) when the sign-in is older than 10 minutes, and nothing is deleted', r.status === 403 && r.data.error === 'recent_login_required' && (await cntRows('delUser')).u === 1);
  r = await api('/api/state', { tok: await token('delUser', { authTime: nowS2 - 3600 }) });
  check('an old sign-in still works for everything else (only deletion needs a recent one)', r.status === 200);
  r = await api('/api/account', { method: 'GET', tok: tDel });
  check('delete account: GET is refused (405)', r.status === 405);
  r = await api('/api/account', { method: 'POST', tok: tDel, body: {} });
  check('delete account: missing confirm is refused and deletes nothing', r.status === 400 && (await cntRows('delUser')).u === 1);
  r = await api('/api/account', { method: 'POST', tok: tDel, body: { confirm: 'yes' } });
  check('delete account: wrong confirm value is refused', r.status === 400 && (await cntRows('delUser')).u === 1);
  r = await api('/api/account', { method: 'POST', tok: tDel, body: { confirm: 'delete', uid: 'keepUser' } });
  check('delete account: removes only the token owner\'s rows (a uid in the body is ignored)', r.status === 200 && r.data.deleted === true && J(await cntRows('delUser')) === J({ u: 0, s: 0, a: 0 }) && J(await cntRows('keepUser')) === J({ u: 1, s: 1, a: 1 }), J(await cntRows('keepUser')));
  r = await api('/api/account', { method: 'POST', tok: tDel, body: { confirm: 'delete' } });
  check('delete account: repeating it is harmless', r.status === 200 && (await cntRows('keepUser')).u === 1);
  r = await api('/api/state', { tok: tDel });
  check('after deletion a new sign-in starts from an empty account', r.status === 200 && r.data.epoch === 0 && Object.keys(r.data.scopes).length === 0 && r.data.attempts.length === 0);

  // ===== reset, stale offline device, flags survive =====
  const tR = await token('resetUser');
  const staleDev = { baseEpoch: 0, deviceId: dev(), attempts: [attempt()], scopes: { [SCOPE]: { progress: prog(5, Date.now() - 400),
    incorrect: { 7: { epoch: 0, rev: 1, updatedAt: Date.now() - 400, userAnswer: 1, addedAt: Date.now() - 400 } },
    flags: { 8: { epoch: 0, rev: 1, updatedAt: Date.now() - 400, flaggedAt: Date.now() - 400 } } } } };
  await api('/api/sync', { method: 'POST', tok: tR, body: staleDev });
  r = await api('/api/reset', { method: 'POST', tok: tR, body: { fromEpoch: 0 } });
  check('reset bumps the epoch to 1', r.status === 200 && r.data.epoch === 1 && r.data.already === false, J(r.data));
  r = await api('/api/reset', { method: 'POST', tok: tR, body: { fromEpoch: 0 } });
  check('reset retry with the same fromEpoch is a no-op (epoch stays 1)', r.data.epoch === 1 && r.data.already === true);
  let st = (await api('/api/state', { tok: tR })).data;
  check('after reset: progress, incorrect, attempts and stats are gone', st.epoch === 1 && st.scopes[SCOPE].progress === null && Object.keys(st.scopes[SCOPE].incorrect).length === 0 && st.attempts.length === 0 && st.stats.completedExams === 0);
  check('after reset: the flag survives', !!st.scopes[SCOPE].flags[8] && !st.scopes[SCOPE].flags[8].removed);
  const lateFlag = { epoch: 0, rev: 1, updatedAt: Date.now() - 100, flaggedAt: Date.now() - 100 };
  r = await api('/api/sync', { method: 'POST', tok: tR, body: { ...staleDev, attempts: [attempt()], scopes: { [SCOPE]: { ...staleDev.scopes[SCOPE], flags: { 12: lateFlag } } } } });
  check('stale offline payload: droppedStale notice returned', r.status === 200 && r.data.droppedStale === true);
  st = (await api('/api/state', { tok: tR })).data;
  check('stale offline payload: its progress, incorrect and attempts did not come back', st.scopes[SCOPE].progress === null && Object.keys(st.scopes[SCOPE].incorrect).length === 0 && st.attempts.length === 0);
  check('stale offline payload: its flag is still merged', !!st.scopes[SCOPE].flags[12]);
  r = await api('/api/sync', { method: 'POST', tok: tR, body: { baseEpoch: 5, deviceId: dev() } });
  check('baseEpoch ahead of the server -> 400', r.status === 400);
  r = await api('/api/sync', { method: 'POST', tok: tR, body: { baseEpoch: 1, deviceId: dev(), attempts: [attempt()], scopes: { [SCOPE]: { progress: prog(1, Date.now() - 50, { epoch: 1 }) } } } });
  st = (await api('/api/state', { tok: tR })).data;
  check('new-epoch data after reset is accepted', r.data.droppedStale === false && st.attempts.length === 1 && st.scopes[SCOPE].progress.epoch === 1);

  // ===== validation: sizes, types =====
  const tV = await token('validUser');
  r = await api('/api/sync', { method: 'POST', tok: tV, raw: '{"baseEpoch":0,"deviceId":"' + 'x'.repeat(300 * 1024) + '"}' });
  check('oversized body -> 413', r.status === 413, String(r.status));
  r = await api('/api/sync', { method: 'POST', tok: tV, raw: '{not json' });
  check('malformed JSON -> 400', r.status === 400);
  r = await api('/api/sync', { method: 'POST', tok: tV, raw: '[1,2]' });
  check('JSON array body -> 400', r.status === 400);
  r = await api('/api/sync', { method: 'POST', tok: tV, body: { baseEpoch: 'zero', deviceId: dev() } });
  check('wrong type for baseEpoch -> 400', r.status === 400);
  r = await api('/api/sync', { method: 'POST', tok: tV, body: { baseEpoch: 0, deviceId: dev(), scopes: { "x'; DROP TABLE users;--": {} } } });
  check('SQL-looking scope key rejected -> 400', r.status === 400);
  r = await api('/api/sync', { method: 'POST', tok: tV, body: { baseEpoch: 0, deviceId: dev(), attempts: [attempt(uuid(), { correct: 99 })] } });
  check('attempt with correct > attempted -> 400', r.status === 400);
  r = await api('/api/sync', { method: 'POST', tok: tV, body: { baseEpoch: 0, deviceId: dev(), attempts: Array.from({ length: 31 }, () => attempt()) } });
  check('more than 30 attempts in one call -> 400', r.status === 400);
  const many = {}; for (let i = 0; i < 210; i++) many[i] = { epoch: 0, rev: 1, updatedAt: 1, flaggedAt: 1 };
  r = await api('/api/sync', { method: 'POST', tok: tV, body: { baseEpoch: 0, deviceId: dev(), scopes: { [SCOPE]: { flags: many } } } });
  check('more than 200 entries in one call -> 400', r.status === 400);
  r = await api('/api/sync', { method: 'POST', tok: tV, body: { baseEpoch: 0, deviceId: dev(), scopes: { [SCOPE]: { incorrect: { 1: { epoch: 0, rev: 1, updatedAt: 1, question: 'full text must not be stored' } } } } } });
  check('unknown field (question text) rejected -> 400', r.status === 400);
  const usersAfter = await sql(`SELECT COUNT(*) AS n FROM users`);
  check('tables still intact after hostile input', usersAfter && usersAfter[0].n >= 5);

  // ===== attempt rate limit =====
  const tL = await token('rateUser');
  let acc = 0, rej = 0;
  for (let i = 0; i < 3; i++) {
    r = await api('/api/sync', { method: 'POST', tok: tL, body: { baseEpoch: 0, deviceId: dev(), attempts: Array.from({ length: 25 }, () => attempt()) } });
    acc += r.data.acceptedAttempts.length; rej += r.data.rejectedAttempts.length;
  }
  check('rate limit: 75 attempts in an hour -> 60 accepted, 15 rejected', acc === 60 && rej === 15, `${acc}/${rej}`);

  // ===== realistic concurrency: 3 devices at once =====
  const tQ = await token('threeDevices');
  const three = await Promise.all([0, 1, 2].map((i) => api('/api/sync', { method: 'POST', tok: tQ, body: {
    baseEpoch: 0, deviceId: dev(),
    scopes: { [SCOPE]: { flags: { [200 + i]: { epoch: 0, rev: 1, updatedAt: Date.now() - 100, flaggedAt: Date.now() - 100 } } } } } })));
  const q = (await api('/api/state', { tok: tQ })).data;
  check('parallel: 3 devices syncing at the same instant -> all 200 and all 3 flags stored',
    three.every((x) => x.status === 200) && Object.keys(q.scopes[SCOPE].flags).length === 3, J(three.map((x) => x.status)));

  // ===== parallel requests lose nothing (compare-and-set) =====
  const tP = await token('parallelUser');
  const N = 20;
  const results = await Promise.all(Array.from({ length: N }, (_, i) => api('/api/sync', { method: 'POST', tok: tP, body: {
    baseEpoch: 0, deviceId: dev(),
    scopes: { [SCOPE]: { flags: { [100 + i]: { epoch: 0, rev: 1, updatedAt: Date.now() - 100, flaggedAt: Date.now() - 100 } } } } } })));
  const ok200 = results.filter((x) => x.status === 200).length;
  const busy = results.filter((x) => x.status === 503).length;
  const par = (await api('/api/state', { tok: tP })).data;
  const have = Object.keys(par.scopes[SCOPE].flags).length;
  check(`parallel stress: ${N} simultaneous syncs to ONE scope, every accepted one is stored (200s=${ok200}, 503s=${busy}, stored=${have})`, have === ok200 && ok200 + busy === N);
  const retried = [];
  for (let i = 0; i < N; i++) if (!par.scopes[SCOPE].flags[100 + i]) retried.push(i);
  for (const i of retried) await api('/api/sync', { method: 'POST', tok: tP, body: { baseEpoch: 0, deviceId: dev(), scopes: { [SCOPE]: { flags: { [100 + i]: { epoch: 0, rev: 1, updatedAt: Date.now() - 100, flaggedAt: Date.now() - 100 } } } } } });
  const par2 = (await api('/api/state', { tok: tP })).data;
  check('parallel: any 503 request succeeds when retried, nothing duplicated', Object.keys(par2.scopes[SCOPE].flags).length === N);

  // ===== session / exam resume =====
  const tS = await token('sessionUser');
  const dev1 = dev(), dev2 = dev();
  r = await api('/api/session', { method: 'PUT', tok: tS, body: { deviceId: dev1, label: 'Phone', baseEpoch: 0, sessionVersion: 0, session: { keys: ['a'], answers: [1], elapsedMs: 5000 } } });
  check('session: device 1 saves an in-progress exam', r.status === 200 && r.data.sessionVersion === 0);
  r = await api('/api/session', { method: 'PUT', tok: tS, body: { deviceId: dev2, baseEpoch: 0, sessionVersion: 0, session: { keys: ['b'] } } });
  check('session: device 2 cannot overwrite without takeover (409 session_owned)', r.status === 409 && r.data.error === 'session_owned');
  r = await api('/api/session', { tok: tS });
  check('session: GET shows device 1 label for the "Resume from ..." prompt', r.data.session && r.data.session.label === 'Phone' && r.data.session.data.keys[0] === 'a');
  r = await api('/api/session', { method: 'PUT', tok: tS, body: { deviceId: dev2, label: 'Laptop', baseEpoch: 0, sessionVersion: 0, takeover: true, session: { keys: ['a'], answers: [1, 2], elapsedMs: 9000 } } });
  check('session: explicit takeover succeeds and bumps the version', r.status === 200 && r.data.sessionVersion === 1);
  r = await api('/api/session', { method: 'PUT', tok: tS, body: { deviceId: dev1, baseEpoch: 0, sessionVersion: 0, session: { keys: ['a'], answers: [1, 2, 3] } } });
  check('session: old device learns it was taken over (409)', r.status === 409);
  r = await api('/api/session', { method: 'PUT', tok: tS, body: { deviceId: dev2, baseEpoch: 0, sessionVersion: 1, session: null } });
  check('session: owner can clear it when the exam ends', r.status === 200 && (await api('/api/session', { tok: tS })).data.session === null);
  r = await api('/api/session', { method: 'PUT', tok: tS, body: { deviceId: dev2, baseEpoch: 0, sessionVersion: 1, session: { pad: 'x'.repeat(70 * 1024) } } });
  check('session: payload over 64 KB rejected', r.status === 413 || r.status === 400);


  // ===== profile name (first required, last optional, not unique, changeable, small blocklist) =====
  {
    const tN = await token('nameUser');
    r = await api('/api/profile', { method: 'POST', tok: tN, body: { firstName: 'Kareem', lastName: 'Mohamed' } });
    check('profile: saves first and last name', r.status === 200 && r.data.profile.firstName === 'Kareem' && r.data.profile.lastName === 'Mohamed', J(r.data));
    r = await api('/api/state', { tok: tN });
    check('profile: /api/state returns the saved name', r.data.profile && r.data.profile.firstName === 'Kareem' && r.data.profile.lastName === 'Mohamed');
    r = await api('/api/profile', { method: 'POST', tok: tN, body: { firstName: '  Karim   ', lastName: '' } });
    check('profile: changeable; spaces tidied; last name optional', r.status === 200 && r.data.profile.firstName === 'Karim' && r.data.profile.lastName === '');
    r = await api('/api/state', { tok: tN });
    check('profile: change is stored (empty last name stays empty)', r.data.profile.firstName === 'Karim' && r.data.profile.lastName === '');
    r = await api('/api/profile', { method: 'POST', tok: tN, body: { firstName: 'Karim' } });
    check('profile: last name may be left out entirely; repeating the same name is harmless', r.status === 200);
    r = await api('/api/profile', { method: 'POST', tok: await token('nameUser2'), body: { firstName: 'Karim', lastName: '' } });
    check('profile: names are not unique (a second account may use the same name)', r.status === 200);
    for (const [label, body] of [
      ['empty first name', { firstName: '   ' }], ['missing first name', { lastName: 'X' }], ['31-character first name', { firstName: 'a'.repeat(31) }],
      ['digits', { firstName: 'Kareem2' }], ['symbols', { firstName: 'Ka<b>reem' }], ['number type', { firstName: 5 }],
      ['blocked word', { firstName: 'Fuck' }], ['blocked word spread with spaces', { firstName: 'f u c k' }], ['blocked word stretched', { firstName: 'Fuuuck' }],
      ['blocked whole word in last name', { firstName: 'Sam', lastName: 'Ass' }], ['blocked Arabic word', { firstName: '\u0634\u0631\u0645\u0648\u0637' }],
    ]) {
      r = await api('/api/profile', { method: 'POST', tok: tN, body });
      check(`profile: rejected (400): ${label}`, r.status === 400, `${r.status} ${J(r.data)}`);
    }
    r = await api('/api/state', { tok: tN });
    check('profile: rejected attempts changed nothing', r.data.profile.firstName === 'Karim');
    for (const [fn, ln] of [['Hassan', 'Assad'], ['Scott', 'Cockburn'], ["Sinead", "O'Connor"], ['Jean-Luc', 'Picard'], ['\u0643\u0631\u064a\u0645', '\u0645\u062d\u0645\u062f'], ['\u00c9lodie', 'Fran\u00e7ois']]) {
      r = await api('/api/profile', { method: 'POST', tok: await token('nameOk'), body: { firstName: fn, lastName: ln } });
      check(`profile: real name accepted: ${fn} ${ln}`, r.status === 200, `${r.status} ${J(r.data)}`);
    }
    r = await api('/api/profile', { method: 'GET', tok: tN });
    check('profile: GET is not allowed (405)', r.status === 405);
    r = await api('/api/state', { tok: await token('userNoName') });
    check('profile: a new account has no name yet (null)', r.data.profile === null);
    // reset keeps the name; account deletion removes it
    const ep = (await api('/api/state', { tok: tN })).data.epoch;
    await api('/api/reset', { method: 'POST', tok: tN, body: { fromEpoch: ep } });
    r = await api('/api/state', { tok: tN });
    check('profile: reset progress keeps the name', r.data.profile && r.data.profile.firstName === 'Karim');
    r = await api('/api/account', { method: 'POST', tok: tN, body: { confirm: 'delete' } });
    const gone = await sql(`SELECT COUNT(*) n FROM users WHERE uid='nameUser'`);
    check('profile: delete account removes the name with the user row', r.status === 200 && gone[0].n === 0);

    // the browser copy and the server copy of the rules must agree
    const srvN = await import(path.join(repo, 'functions/_lib/names.js'));
    globalThis.window = undefined;
    const cliSrc = fs.readFileSync(path.join(repo, 'assets/js/names.js'), 'utf8');
    new Function(cliSrc)();   // sets globalThis.RecallNames
    const cli = globalThis.RecallNames;
    const probes = [['Kareem', 'Mohamed'], ['', 'x'], ['x'.repeat(31), ''], ['Fuck', ''], ['f.u.c.k', ''], ['Fuuuck', 'x'], ['Sam', 'Ass'], ['Hassan', 'Assad'],
      ['Ka<b>', ''], ['Jean-Luc', "O'Brien"], ['\u0643\u0631\u064a\u0645', '\u0645\u062d\u0645\u062f'], ['\u0634\u0631\u0645\u0648\u0637', ''], ['\u062e\u0648\u0644', 'x'], ['  Ann  ', '  Lee  '], ['Dick', ''], ['Scunthorpe', ''], ['Bi tch', ''], ['Nazi', 'x']];
    const mismatch = probes.filter(([a, b]) => J(srvN.cleanName(a, b)) !== J(cli.clean(a, b)));
    check('names: browser rules and server rules give identical answers on every probe', mismatch.length === 0, J(mismatch));
    delete globalThis.RecallNames;
  }


  // ===== emails from the token, removing students, blocking, question editor (fake GitHub) =====
  {
    const tA = await token('admin1'), tS = await token('stu1', { email: 'Stu.One@Example.com' });
    await api('/api/state', { tok: tS });
    let rows = (await sql(`SELECT email, blocked FROM users WHERE uid='stu1'`))[0];
    check('email: stored (lower-cased) from the verified token at sign-in', rows.email === 'stu.one@example.com' && rows.blocked === 0, J(rows));
    await api('/api/state', { tok: await token('stu1', { email: 'new.mail@example.com' }) });
    check('email: updated when it changes', (await sql(`SELECT email FROM users WHERE uid='stu1'`))[0].email === 'new.mail@example.com');
    await api('/api/state', { tok: await token('stu1') });
    check('email: a token without an email never erases the stored one', (await sql(`SELECT email FROM users WHERE uid='stu1'`))[0].email === 'new.mail@example.com');

    r = await api('/api/admin/students', { tok: tS });
    check('students list: refused for a non-admin (403)', r.status === 403);
    r = await api('/api/admin/students', { tok: tA });
    const me = r.data.students.find((x) => x.uid === 'stu1');
    check('students list: admin sees email, status and activity per account', r.status === 200 && me && me.email === 'new.mail@example.com' && me.blocked === 0 && typeof me.exams === 'number', J(me));

    // exam data first, so the removal has something to delete
    const nowMs = Date.now();
    await sql(`INSERT INTO attempts (uid, attempt_id, epoch, created_at, module, exam_type, subject, sub_subject, scope, score, correct, total, attempted, time_sec) VALUES ('stu1','blk-att-aaaa',0,${nowMs},'CPM','final_exam','anatomy','larynx','CPM|final_exam|anatomy|larynx',50,1,2,2,60)`);
    r = await api('/api/admin/student', { method: 'POST', tok: tS, body: { uid: 'stu1', action: 'remove' } });
    check('remove: refused for a non-admin (403)', r.status === 403);
    r = await api('/api/admin/student', { method: 'POST', tok: tA, body: { uid: 'admin1', action: 'remove' } });
    check('remove: an administrator cannot be removed (400)', r.status === 400);
    r = await api('/api/admin/student', { method: 'POST', tok: tA, body: { uid: 'nobody-here', action: 'remove' } });
    check('remove: unknown account (404)', r.status === 404);
    r = await api('/api/admin/student', { method: 'POST', tok: tA, body: { uid: 'stu1', action: 'remove' } });
    const left = (await sql(`SELECT (SELECT COUNT(*) FROM attempts WHERE uid='stu1') a, (SELECT COUNT(*) FROM scopes WHERE uid='stu1') s, (SELECT blocked FROM users WHERE uid='stu1') b`))[0];
    check('remove: cloud data deleted and the account blocked', r.status === 200 && left.a === 0 && left.s === 0 && left.b === 1, J(left) + ' ' + r.status + ' ' + J(r.data));
    r = await api('/api/state', { tok: tS });
    check('remove: the person now gets 403 account_blocked from the API', r.status === 403 && r.data.error === 'account_blocked');
    r = await api('/api/sync', { method: 'POST', tok: tS, body: { baseEpoch: 0, deviceId: dev(), uid: 'stu1', scopes: {} } });
    check('remove: sync is refused too (403)', r.status === 403);
    r = await api('/api/account', { method: 'POST', tok: await token('stu1'), body: { confirm: 'delete' } });
    check('remove: deleting their own account cannot be used to dodge the block (403)', r.status === 403);
    check('remove: the row is still there, still blocked', (await sql(`SELECT blocked FROM users WHERE uid='stu1'`))[0].blocked === 1);
    r = await api('/api/admin/student', { method: 'POST', tok: tA, body: { uid: 'stu1', action: 'unblock' } });
    check('unblock: the person can sync again (and starts clean)', r.status === 200 && (await api('/api/state', { tok: tS })).status === 200);

    // question editor through the fake GitHub
    const Q = '/api/admin/question', P = 'data/CPM/final_exam/anatomy/pharynx.json';
    r = await api(`${Q}?path=${P}&id=3`, { tok: tS });
    check('editor: refused for a non-admin (403)', r.status === 403);
    r = await api(`${Q}?path=${encodeURIComponent('../../etc/passwd')}&id=3`, { tok: tA });
    check('editor: a path outside data/<a>/<b>/<c>/<d>.json is refused (400)', r.status === 400);
    r = await api(`${Q}?path=${P}&id=3`, { tok: tA });
    check('editor: reads one question and its version', r.status === 200 && r.data.question.id === 3 && r.data.sha === 'sha-1', J(r.data));
    check('editor: the GitHub token reached GitHub as a bearer header, and is never in a response', gh.auth.every((a) => a === 'Bearer test-gh-token-not-real') && !J(r.data).includes('test-gh'));
    const edit = (o) => api(Q, { method: 'POST', tok: tA, body: { path: P, id: 3, sha: gh.sha, ...o } });
    for (const [label, o] of [['empty question', { question: '  ' }], ['1 option', { options: ['only'] }], ['answer out of range', { answer: 7 }], ['nothing to change', {}], ['bad id', { id: 'x' }]]) {
      r = await edit(o); check(`editor: rejected (400): ${label}`, r.status === 400, `${r.status} ${J(r.data)}`);
    }
    check('editor: rejected edits wrote nothing to GitHub', gh.puts.length === 0);
    r = await edit({ question: 'Edited stem?', options: ['one', 'two', 'three', 'four'], answer: 2, explanation: 'New reason.' });
    const saved = JSON.parse(gh.text);
    check('editor: saved as one commit with a plain message, other questions and fields untouched', r.status === 200 && gh.puts.length === 1 && /^Admin edit: data\/CPM/.test(gh.puts[0].message) && gh.puts[0].branch === 'main' &&
      saved.questions[2].question === 'Edited stem?' && saved.questions[2].answer === 2 && saved.questions[2].image === 'keep.png' && saved.questions[0].question === 'Q1?', J(r.data));
    check('editor: file formatting kept (2-space indent, trailing newline)', gh.text.startsWith('{\n  "questions": [\n    {') && gh.text.endsWith('}\n'));
    r = await api(Q, { method: 'POST', tok: tA, body: { path: P, id: 3, sha: 'sha-1', question: 'Stale?' } });
    check('editor: a stale version is refused (409) and changes nothing', r.status === 409 && JSON.parse(gh.text).questions[2].question === 'Edited stem?');
    r = await api(`${Q}?path=data/CPM/final_exam/anatomy/missing.json&id=1`, { tok: tA });
    check('editor: a file that is not in the repo gives 404', r.status === 404);
  }


  // ===== admin roles, and adding / removing questions =====
  {
    const tA = await token('admin1'), tM = await token('adm2', { email: 'adm2@example.com' }), tS = await token('stu1');
    await api('/api/state', { tok: tM }); await api('/api/state', { tok: tS });
    r = await api('/api/state', { tok: tA });
    check('roles: the owner\u2019s state says isAdmin true', r.data.isAdmin === true);
    r = await api('/api/state', { tok: tM });
    check('roles: an ordinary account\u2019s state says isAdmin false', r.data.isAdmin === false);
    r = await api('/api/admin/students', { tok: tM });
    check('roles: an ordinary account cannot open admin routes (403)', r.status === 403);
    r = await api('/api/admin/student', { method: 'POST', tok: tM, body: { uid: 'stu1', action: 'make_admin' } });
    check('roles: an ordinary account cannot make anyone admin (403)', r.status === 403);
    r = await api('/api/admin/student', { method: 'POST', tok: tA, body: { uid: 'adm2', action: 'make_admin' } });
    check('roles: the owner can make an account admin', r.status === 200 && (await sql(`SELECT is_admin FROM users WHERE uid='adm2'`))[0].is_admin === 1);
    r = await api('/api/state', { tok: tM });
    check('roles: that account\u2019s state now says isAdmin true', r.data.isAdmin === true);
    r = await api('/api/admin/students', { tok: tM });
    check('roles: an admin can open the student list; owner flag is reported', r.status === 200 && r.data.me.owner === false && r.data.students.find((x) => x.uid === 'admin1').owner === true && r.data.students.find((x) => x.uid === 'adm2').is_admin === 1);
    r = await api('/api/admin/student', { method: 'POST', tok: tM, body: { uid: 'stu1', action: 'make_admin' } });
    check('roles: an admin who is not an owner cannot make others admin (403 owner_only)', r.status === 403 && r.data.error === 'owner_only');
    r = await api('/api/admin/student', { method: 'POST', tok: tM, body: { uid: 'stu1', action: 'remove' } });
    check('roles: an admin can remove a student', r.status === 200);
    await api('/api/admin/student', { method: 'POST', tok: tA, body: { uid: 'stu1', action: 'unblock' } });
    r = await api('/api/admin/student', { method: 'POST', tok: tA, body: { uid: 'adm2', action: 'remove' } });
    check('roles: an admin cannot be removed until the admin rights are taken away (400)', r.status === 400 && r.data.error === 'cannot_remove_admin');
    r = await api('/api/admin/student', { method: 'POST', tok: tA, body: { uid: 'admin1', action: 'remove_admin' } });
    check('roles: an owner\u2019s rights cannot be changed from the app (400)', r.status === 400 && r.data.error === 'owner_fixed');
    r = await api('/api/admin/student', { method: 'POST', tok: tA, body: { uid: 'adm2', action: 'remove_admin' } });
    check('roles: the owner can take admin rights away again', r.status === 200 && (await api('/api/admin/students', { tok: tM })).status === 403);
    await api('/api/admin/student', { method: 'POST', tok: tA, body: { uid: 'stu1', action: 'remove' } });
    r = await api('/api/admin/student', { method: 'POST', tok: tA, body: { uid: 'stu1', action: 'make_admin' } });
    check('roles: a blocked account cannot be made admin until unblocked (400)', r.status === 400);
    await api('/api/admin/student', { method: 'POST', tok: tA, body: { uid: 'stu1', action: 'unblock' } });

    // add and remove questions (fake GitHub); the earlier editor tests left pharynx.json with ids 1-4
    const Q = '/api/admin/question', P = 'data/CPM/final_exam/anatomy/pharynx.json';
    r = await api(`${Q}?path=${P}`, { tok: tA });
    check('questions: GET without an id returns just the file version (used before adding)', r.status === 200 && typeof r.data.sha === 'string' && !r.data.question);
    const post = (o) => api(Q, { method: 'POST', tok: tA, body: { path: P, sha: gh.sha, ...o } });
    r = await post({ action: 'add', question: '  ', options: ['a', 'b'], answer: 0 });
    check('add: an empty question is refused (400)', r.status === 400);
    r = await post({ action: 'add', question: 'Brand new?', options: ['a', 'b', 'c', 'd'], answer: 9 });
    check('add: an answer that points nowhere is refused (400)', r.status === 400);
    const before = gh.puts.length;
    r = await post({ action: 'add', question: 'Brand new?', options: ['a', 'b', 'c', 'd'], answer: 3, explanation: 'Because D.' });
    let doc = JSON.parse(gh.text);
    check('add: the new question gets the next free id and the usual shape; one commit', r.status === 200 && r.data.id === 5 && gh.puts.length === before + 1 && J(Object.keys(doc.questions[4])) === J(['id', 'question', 'options', 'explanation', 'answer']) && doc.questions[4].answer === 3 && /^Admin add: /.test(gh.puts[before].message), J(r.data));
    r = await post({ action: 'delete', id: 2, sha: 'stale' });
    check('delete: a stale version is refused (409) and nothing changes', r.status === 409 && JSON.parse(gh.text).questions.length === 5);
    r = await post({ action: 'delete', id: 99 });
    check('delete: an id that is not in the file gives 404', r.status === 404);
    r = await post({ action: 'delete', id: 2 });
    doc = JSON.parse(gh.text);
    check('delete: removes only that question and never renumbers the others', r.status === 200 && J(doc.questions.map((x) => x.id)) === J([1, 3, 4, 5]) && /^Admin delete: /.test(gh.puts[gh.puts.length - 1].message));
    r = await api(Q, { method: 'POST', tok: tM, body: { action: 'delete', path: P, sha: gh.sha, id: 1 } });
    check('delete: refused for a non-admin (403)', r.status === 403 && JSON.parse(gh.text).questions.length === 4);
    for (const id of [1, 3, 4]) await post({ action: 'delete', id });
    r = await post({ action: 'delete', id: 5 });
    check('delete: the last question of a topic cannot be removed (400 last_question)', r.status === 400 && r.data.error === 'last_question' && JSON.parse(gh.text).questions.length === 1);
    r = await post({ action: 'add', question: 'After the rest?', options: ['a', 'b'], answer: 1 });
    check('add: ids continue after the highest existing one, even after deletions', r.status === 200 && r.data.id === 6);
    r = await post({ action: 'delete', id: 6 });
    r = await post({ action: 'add', question: 'Reuse test?', options: ['a', 'b'], answer: 0 });
    check('add: an id that was removed is never handed out again (nextId counter in the file)', r.status === 200 && r.data.id === 7 && JSON.parse(gh.text).nextId === 8, J(r.data));
    r = await post({ action: 'nonsense' });
    check('questions: an unknown action is refused (400)', r.status === 400);
    r = await api(`${Q}?path=${P}&full=1`, { tok: tA });
    check('questions: GET with full=1 returns the whole topic fresh, with its version', r.status === 200 && Array.isArray(r.data.questions) && r.data.questions.length === JSON.parse(gh.text).questions.length && r.data.sha === gh.sha, J(r.data).slice(0, 120));
    check('questions: meta.totalQuestions is kept true when the file has a meta block (file here has none, so none is invented)', !('meta' in JSON.parse(gh.text)));
  }

  // ===== admin config: visibility, ongoing, topic details, new topics (fake GitHub) =====
  {
    const C = '/api/admin/config', tA = await token('admin1'), tS = await token('stu1');
    const cfgNow = () => JSON.parse(gh.files[CFG_URL].text);
    const post = (o, tok = tA) => api(C, { method: 'POST', tok, body: o });
    const topic = (cfg, m, e, s, id) => cfg.modules.find((x) => x.id === m).subSubjects[e][s].find((x) => x.id === id);
    let r = await api(C, { tok: tS });
    check('config: refused for a non-admin (403)', r.status === 403);
    r = await api(C, { tok: tA });
    check('config: GET returns the current site configuration and its version, fresh from GitHub', r.status === 200 && Array.isArray(r.data.config.modules) && r.data.sha === 'cfg-1' && r.data.config.modules.length === 5, J(r.data).slice(0, 100));
    check('config: the GitHub token is never in a response', !J(r.data).includes('test-gh'));
    const original = gh.files[CFG_URL].text;
    for (const [label, o] of [['unknown action', { action: 'x' }], ['unknown module', { action: 'set_module', moduleId: 'NOPE', hidden: true }], ['nothing to change', { action: 'set_module', moduleId: 'CPM' }], ['hidden not a boolean', { action: 'set_module', moduleId: 'CPM', hidden: 'yes' }],
      ['unknown topic', { action: 'set_topic', moduleId: 'CPM', exam: 'final_exam', subject: 'anatomy', topicId: 'nope', hidden: true }], ['unknown subject', { action: 'set_topic', moduleId: 'CPM', exam: 'final_exam', subject: 'nope', topicId: 'pharynx', hidden: true }],
      ['markup in a name', { action: 'set_topic', moduleId: 'CPM', exam: 'final_exam', subject: 'anatomy', topicId: 'pharynx', label: 'A <b>bold</b>' }], ['quote in a name', { action: 'set_topic', moduleId: 'CPM', exam: 'final_exam', subject: 'anatomy', topicId: 'pharynx', label: 'Say "hi"' }],
      ['empty name', { action: 'set_topic', moduleId: 'CPM', exam: 'final_exam', subject: 'anatomy', topicId: 'pharynx', label: '   ' }], ['name too long', { action: 'set_topic', moduleId: 'CPM', exam: 'final_exam', subject: 'anatomy', topicId: 'pharynx', label: 'x'.repeat(81) }],
      ['add without a name', { action: 'add_topic', moduleId: 'CPM', exam: 'final_exam', subject: 'anatomy', label: '' }]]) {
      r = await post(o); check(`config: rejected: ${label}`, r.status === 400 || r.status === 404, `${r.status} ${J(r.data)}`);
    }
    check('config: rejected changes wrote nothing to GitHub', gh.cfgPuts.length === 0 && gh.files[CFG_URL].text === original);
    // module settings
    r = await post({ action: 'set_module', moduleId: 'CPM', ongoing: true });
    let c = cfgNow();
    check('config: making CPM ongoing switches the previously ongoing module (CNS) off: only one is ongoing', r.status === 200 && c.modules.find((x) => x.id === 'CPM').ongoing === true && !('ongoing' in c.modules.find((x) => x.id === 'CNS')) && c.modules.filter((x) => x.ongoing).length === 1, J(r.data).slice(0, 80));
    check('config: one commit with a plain message; formatting kept (2-space indent, same trailing newline as before)', gh.cfgPuts.length === 1 && /^Admin: make ongoing module CPM/.test(gh.cfgPuts[0].message) && gh.cfgPuts[0].branch === 'main' && gh.files[CFG_URL].text.endsWith('}') === original.endsWith('}') && gh.files[CFG_URL].text.startsWith('{\n  "siteTitle"'));
    r = await post({ action: 'set_module', moduleId: 'CPM', ongoing: false });
    check('config: switching ongoing off removes the field again', r.status === 200 && !('ongoing' in cfgNow().modules.find((x) => x.id === 'CPM')));
    r = await post({ action: 'set_module', moduleId: 'GIT', hidden: true });
    check('config: hiding a module sets hidden:true; showing it removes the field', r.status === 200 && cfgNow().modules.find((x) => x.id === 'GIT').hidden === true);
    r = await post({ action: 'set_module', moduleId: 'GIT', hidden: false });
    check('config: showing the module again removes hidden', !('hidden' in cfgNow().modules.find((x) => x.id === 'GIT')));
    // topic details
    r = await post({ action: 'set_topic', moduleId: 'CPM', exam: 'final_exam', subject: 'anatomy', topicId: 'pharynx', label: "Pharynx & Larynx's  parts", professor: "Prof. D'Souza", hidden: true });
    let t = topic(cfgNow(), 'CPM', 'final_exam', 'anatomy', 'pharynx');
    check('config: topic name, professor and visibility change together; spaces tidied; a straight apostrophe becomes a typographic one', r.status === 200 && t.label === 'Pharynx & Larynx\u2019s parts' && t.professor === 'Prof. D\u2019Souza' && t.hidden === true && t.id === 'pharynx' && !('icon' in t), J(t));
    r = await post({ action: 'set_topic', moduleId: 'CPM', exam: 'final_exam', subject: 'anatomy', topicId: 'pharynx', professor: '', hidden: false });
    t = topic(cfgNow(), 'CPM', 'final_exam', 'anatomy', 'pharynx');
    check('config: an empty professor removes the field; showing removes hidden; the id never changes', r.status === 200 && !('professor' in t) && !('hidden' in t) && t.id === 'pharynx');
    // new topic
    const before = gh.cfgPuts.length;
    r = await post({ action: 'add_topic', moduleId: 'CPM', exam: 'final_exam', subject: 'anatomy', label: 'Bronchi & Lungs', professor: 'Prof. Samaa' });
    t = topic(cfgNow(), 'CPM', 'final_exam', 'anatomy', 'bronchi_lungs');
    const newPath = '/repos/recall-med/recall4/contents/data/CPM/final_exam/anatomy/bronchi_lungs.json', nf = gh.files[newPath];
    check('add topic: registered as HIDDEN with the professor and no icon field (icons come from the app, by id); id made from the name', r.status === 200 && r.data.topicId === 'bronchi_lungs' && t && t.hidden === true && t.label === 'Bronchi & Lungs' && t.professor === 'Prof. Samaa' && !('icon' in t), J(r.data));
    check('add topic: an EMPTY data file was created first (meta, no questions, nextId 1), then the config; two commits', !!nf && gh.cfgPuts.length === before + 2 && gh.cfgPuts[before].path === newPath && /bronchi_lungs\.json/.test(gh.cfgPuts[before].message) && JSON.parse(nf.text).questions.length === 0 && JSON.parse(nf.text).nextId === 1 && JSON.parse(nf.text).meta.subSubject === 'bronchi_lungs');
    r = await post({ action: 'add_topic', moduleId: 'CPM', exam: 'final_exam', subject: 'anatomy', label: 'Bronchi & Lungs' });
    check('add topic: the same name again gets a numbered id, never overwrites the first', r.status === 200 && r.data.topicId === 'bronchi_lungs_2' && !!topic(cfgNow(), 'CPM', 'final_exam', 'anatomy', 'bronchi_lungs'));
    r = await post({ action: 'add_topic', moduleId: 'CPM', exam: 'final_exam', subject: 'anatomy', label: '\u0634\u0631\u0643\u0629' });
    check('add topic: a name with no latin letters still gets a safe id', r.status === 200 && /^[a-z0-9_]+$/.test(r.data.topicId), J(r.data));
    // an empty new topic accepts its first question through the question editor, and its last cannot be removed
    const np = 'data/CPM/final_exam/anatomy/bronchi_lungs.json';
    r = await api(`/api/admin/question?path=${np}&full=1`, { tok: tA });
    check('add topic: the new empty file opens fresh through the editor route', r.status === 200 && r.data.questions.length === 0 && typeof r.data.sha === 'string');
    r = await api('/api/admin/question', { method: 'POST', tok: tA, body: { action: 'add', path: np, sha: r.data.sha, question: 'First?', options: ['a', 'b', 'c', 'd'], answer: 1, explanation: '' } });
    const nd = JSON.parse(gh.files[newPath].text);
    check('add topic: the first question gets id 1 and meta.totalQuestions follows (1)', r.status === 200 && r.data.id === 1 && nd.meta.totalQuestions === 1 && nd.nextId === 2, J(r.data));
    // concurrency: someone else commits between our read and our write -> read again, apply again, succeed
    gh.race = true; const putsBefore = gh.cfgPuts.length;
    r = await post({ action: 'set_module', moduleId: 'URINARY', hidden: true });
    check('config: when someone else committed in between, the change is re-applied on the newest file (one retry) and succeeds', r.status === 200 && gh.cfgPuts.length === putsBefore + 1 && cfgNow().modules.find((x) => x.id === 'URINARY').hidden === true && !!topic(cfgNow(), 'CPM', 'final_exam', 'anatomy', 'bronchi_lungs'), J(r.data));
    r = await post({ action: 'set_module', moduleId: 'URINARY', hidden: false });
    r = await post({ action: 'set_module', moduleId: 'CNS', ongoing: true });
    check('config: the original ongoing module can be restored', r.status === 200 && cfgNow().modules.find((x) => x.id === 'CNS').ongoing === true);
    r = await api(C, { method: 'POST', tok: tS, body: { action: 'set_module', moduleId: 'CPM', hidden: true } });
    check('config: a non-admin cannot change anything (403) and nothing is written', r.status === 403 && !('hidden' in cfgNow().modules.find((x) => x.id === 'CPM')));
    r = await api(C, { method: 'POST', body: { action: 'set_module', moduleId: 'CPM', hidden: true } });
    check('config: refused without a token (401)', r.status === 401);
  }

  // ===== admin =====
  r = await api('/api/admin/summary', { tok: await token('student1') });
  check('admin route: non-admin -> 403', r.status === 403);
  r = await api('/api/admin/summary', { tok: await token('admin1') });
  check('admin route: admin -> 200 with aggregates', r.status === 200 && typeof r.data.accounts === 'number' && Array.isArray(r.data.examsPerDay), J(r.data).slice(0, 200));
  check('admin route: dashboard sections present (hours, saved, items, cohorts, activation, totals)', Array.isArray(r.data.examsPerHourUtc) && Array.isArray(r.data.saved) && Array.isArray(r.data.items) && Array.isArray(r.data.cohorts) && r.data.activation && typeof r.data.totals.users === 'number' && typeof r.data.studyingWeek === 'number', J(Object.keys(r.data)));
  check('admin route: no emails or per-user rows in the response', !/@/.test(J(r.data)) && !('users' in r.data));
  const r2 = await api('/api/admin/summary', { tok: await token('admin1') });
  check('admin route: second call is served from cache', r2.status === 200 && r2.data.cached === true);

  // ===== production config has no test override =====
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name === 'node_modules' || e.name === '.git' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const files = walk(repo).map((f) => path.relative(repo, f));
  const refs = files.filter((f) => fs.readFileSync(path.join(repo, f), 'utf8').includes('TEST_JWKS'));
  check('repo: TEST_JWKS appears only in auth.js and this test file', refs.every((f) => ['functions/_lib/auth.js', 'backend-tests/run.mjs', 'backend-tests/run-frontend.mjs'].includes(f.replaceAll('\\', '/'))), J(refs));
  check('repo: no wrangler.toml or .dev.vars committed', !files.some((f) => /(^|\/)(wrangler\.toml|\.dev\.vars)$/.test(f)));
  check('repo: .gitignore excludes .dev.vars and node_modules', /\.dev\.vars/.test(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8')) && /node_modules/.test(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8')));
  const authSrc = fs.readFileSync(path.join(repo, 'functions/_lib/auth.js'), 'utf8');
  check('auth.js: test keys honoured only for localhost hosts', /isLocalHost\(request\)/.test(authSrc) && /127\.0\.0\.1/.test(authSrc));
  const pk = new RegExp('-----BEGIN [A-Z ]*PRIV' + 'ATE KEY-----|"private' + '_key"');
  const secretish = files.filter((f) => /\.(js|mjs|json|sql|md|toml)$/.test(f) && !f.endsWith('run.mjs')).filter((f) => pk.test(fs.readFileSync(path.join(repo, f), 'utf8')));
  check('repo: no private keys or service-account keys in any file', secretish.length === 0, J(secretish));
  // ===== test keys must be refused on the live hostname =====
  {
    const auth = await import(path.join(repo, 'functions/_lib/auth.js'));
    const env = { FIREBASE_PROJECT_ID: PROJECT, TEST_JWKS: J({ keys: [goodJwk] }) };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(J({ keys: [] }), { status: 200, headers: { 'cache-control': 'max-age=60' } });
    const tk = await token('someone');
    const mk = (host) => new Request(`https://${host}/api/state`, { headers: { Authorization: 'Bearer ' + tk } });
    let live = 'accepted', local = 'rejected';
    try { await auth.verifyRequest(mk('recall-med.pages.dev'), env); } catch (e) { live = e.status; }
    try { const uid = await auth.verifyRequest(mk('localhost'), env); local = uid; } catch (e) { local = 'rejected ' + e.status; }
    globalThis.fetch = realFetch;
    check('live hostname with TEST_JWKS set: test-signed token still refused (401)', live === 401, String(live));
    check('localhost with TEST_JWKS: test-signed token accepted (proves the guard is the only difference)', local === 'someone', String(local));
    // rough CPU indication (Node, not Workers): verify cost per call
    const reqL = mk('localhost');
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) await auth.verifyRequest(reqL, env);
    console.log('INFO token verify, Node on this sandbox: ' + ((performance.now() - t0) / 200).toFixed(2) + ' ms per call (NOT the Workers CPU figure)');
  }
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) console.log('Failed: ' + failures.join(' | '));
process.exit(fail ? 1 : 0);
