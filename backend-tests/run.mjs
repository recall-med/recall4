// Backend test runner. Usage (from this folder): npm install && npm test
// It copies ../functions into a temp folder, starts a LOCAL Worker with a LOCAL
// D1 database (nothing touches the live site), runs every check and prints
// PASS/FAIL per check. It never deletes or edits anything in the repo.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  let jwt = new SignJWT({ auth_time: now - 5 })
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
  const res = await fetch(BASE + p, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? J(body) : undefined });
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
  `FIREBASE_PROJECT_ID=${PROJECT}\nADMIN_UIDS=admin1\nTEST_JWKS=${J({ keys: [goodJwk] })}\n`);
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
  for (const [m, pth] of [['POST', '/api/sync'], ['POST', '/api/reset'], ['PUT', '/api/session'], ['GET', '/api/session'], ['GET', '/api/admin/summary']]) {
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

  // ===== admin =====
  r = await api('/api/admin/summary', { tok: await token('student1') });
  check('admin route: non-admin -> 403', r.status === 403);
  r = await api('/api/admin/summary', { tok: await token('admin1') });
  check('admin route: admin -> 200 with aggregates', r.status === 200 && typeof r.data.accounts === 'number' && Array.isArray(r.data.examsPerDay), J(r.data).slice(0, 200));
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
