// Shared setup for the front-end test parts (fe/part-*.mjs; run them all with ../run-frontend.mjs).
// Boots the real site files in jsdom (a headless DOM, not a
// real browser) against a LOCAL Worker + LOCAL D1, with a fake sign-in provider.
// Usage: put the site files next to ../functions (see SITE_DIR), then: node run-frontend.mjs
// Layout and visual appearance are NOT tested here; a real phone is still needed for that.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import crypto from 'node:crypto';
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // backend-tests/ (this file lives in backend-tests/fe/)
const repo = path.resolve(here, '..');
const SITE_DIR = process.env.SITE_DIR || repo;     // folder holding index.html, assets/, config/
const PORT = Number(process.env.FE_PORT || 8789), GH_PORT = Number(process.env.FE_GH_PORT || 8798), BASE = `http://127.0.0.1:${PORT}`, PROJECT = 'recall-med';
let pass = 0, fail = 0; const failures = [];
let tearingDown = false;   // timers in a closed jsdom window can fire once more; that is a test-harness artefact, not a page bug
process.on('uncaughtException', (e) => { if (!tearingDown) { console.log('UNCAUGHT', e && e.stack); process.exit(3); } });
process.on('unhandledRejection', (e) => { if (!tearingDown) { console.log('UNHANDLED', e && e.stack); process.exit(3); } });
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('PASS ' + name); } else { fail++; failures.push(name); console.log('FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}
const J = JSON.stringify;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, step = 40) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(step); } return false; }

// ---------- local stack ----------
const good = await generateKeyPair('RS256', { extractable: true });
const jwk = { ...(await exportJWK(good.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-fe-'));
fs.cpSync(path.join(repo, 'functions'), path.join(tmp, 'functions'), { recursive: true });
for (const d of ['assets', 'config']) fs.cpSync(path.join(SITE_DIR, d), path.join(tmp, d), { recursive: true });
fs.copyFileSync(path.join(SITE_DIR, 'index.html'), path.join(tmp, 'index.html'));
fs.copyFileSync(path.join(SITE_DIR, 'admin.html'), path.join(tmp, 'admin.html'));
// small synthetic question files (the real question bank is not needed)
function qfile(sub, n) {
  const dir = path.join(tmp, 'data/CPM/final_exam/anatomy'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, sub + '.json'), J({ questions: Array.from({ length: n }, (_, i) => ({
    id: i + 1, question: `Question ${i + 1} about ${sub}?`, options: ['A', 'B', 'C', 'D'], answer: 1, explanation: 'Because B.' })) }));
}
qfile('larynx', 6); qfile('pharynx', 4);
fs.writeFileSync(path.join(tmp, 'wrangler.toml'), 'name = "recall-fe"\npages_build_output_dir = "."\ncompatibility_date = "2026-10-24"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "recall-db"\ndatabase_id = "00000000-0000-0000-0000-000000000000"\n');
fs.writeFileSync(path.join(tmp, '.dev.vars'), `FIREBASE_PROJECT_ID=${PROJECT}\nADMIN_UIDS=admin1\nTEST_JWKS=${J({ keys: [jwk] })}\nGITHUB_TOKEN=test-gh-token-not-real\nGITHUB_API=http://127.0.0.1:${GH_PORT}\n`);

// Fake GitHub for the admin tools: serves and updates the temp site's own files, and logs each commit.
const ghLog = [];
const shaOf = (t) => crypto.createHash('sha1').update(t).digest('hex');
const ghServer = http.createServer((req, res) => {
  const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace('/repos/recall-med/recall4/contents/', '');
  const fp = path.join(tmp, rel);
  if (!fp.startsWith(tmp)) return send(400, {});
  if (req.method === 'GET') { if (!fs.existsSync(fp)) return send(404, { message: 'Not Found' }); const t = fs.readFileSync(fp, 'utf8'); return send(200, { sha: shaOf(t), content: Buffer.from(t).toString('base64') }); }
  let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
    const j = JSON.parse(b), exists = fs.existsSync(fp);
    if (exists && j.sha !== shaOf(fs.readFileSync(fp, 'utf8'))) return send(409, { message: 'conflict' });
    if (!exists && j.sha) return send(422, { message: 'sha not expected' });
    const t = Buffer.from(j.content, 'base64').toString('utf8'); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, t);
    ghLog.push({ path: rel, message: j.message }); send(exists ? 200 : 201, { content: { sha: shaOf(t) } });
  });
});
await new Promise((r) => ghServer.listen(GH_PORT, '127.0.0.1', r));
const wr = path.join(here, 'node_modules', '.bin', 'wrangler');
const ex = spawnSync(wr, ['d1', 'execute', 'recall-db', '--local', '--file', path.join(repo, 'db/schema.sql')], { cwd: tmp, encoding: 'utf8' });
if (ex.status !== 0) { console.log(ex.stdout, ex.stderr); process.exit(2); }
const server = spawn(wr, ['pages', 'dev', '.', '--port', String(PORT), '--ip', '127.0.0.1'], { cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'] });
let slog = ''; server.stdout.on('data', (d) => (slog += d)); server.stderr.on('data', (d) => (slog += d));
function sql(q) { const r = spawnSync(wr, ['d1', 'execute', 'recall-db', '--local', '--json', '--command', q], { cwd: tmp, encoding: 'utf8' }); try { return JSON.parse(r.stdout)[0].results; } catch (e) { return null; } }

async function token(uid, authAge = 5) {
  const n = Math.floor(Date.now() / 1000);
  return new SignJWT({ auth_time: n - authAge }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setSubject(uid)
    .setIssuer('https://securetoken.google.com/' + PROJECT).setAudience(PROJECT).setIssuedAt(n - 5).setExpirationTime(n + 3600).sign(good.privateKey);
}

// ---------- a "device" = one jsdom window with its own localStorage ----------
class Loader extends ResourceLoader {
  fetch(url) { if (url.startsWith(BASE)) return super.fetch(url); return Promise.resolve(Buffer.from('')); }
}
let deviceCount = 0;
async function boot({ storage = {}, cloud = true, net = {} } = {}) {
  const id = ++deviceCount;
  const calls = [];
  const dev = { id, calls, net, uid: null, cb: null, errors: [] };
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => dev.errors.push(String(e.message || e).slice(0, 200)));
  const dom = await JSDOM.fromFile(path.join(tmp, 'index.html'), {
    url: BASE + '/', runScripts: 'dangerously', resources: new Loader(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
      if (cloud) w.localStorage.setItem('dqb_cloud_preview', '1');
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      w.IntersectionObserver = w.IntersectionObserver || class { observe() {} disconnect() {} unobserve() {} };
      w.scrollTo = () => {};
      w.fetch = async (input, init = {}) => {
        const url = new URL(input, BASE).href;
        const isApi = url.includes('/api/');
        if (isApi) calls.push({ url: url.replace(BASE, ''), method: init.method || 'GET' });
        if (isApi && dev.net.delayMs) await sleep(dev.net.delayMs);
        if (isApi && dev.net.offline) throw new TypeError('Failed to fetch');
        if (isApi && dev.net.htmlFallthrough) return new Response('<!doctype html><title>x</title>', { status: 200, headers: { 'content-type': 'text/html' } });
        const res = await fetch(url, init);
        if (isApi && dev.net.dropResponseOnce && url.includes(dev.net.dropResponseOnce)) { dev.net.dropResponseOnce = null; throw new TypeError('Failed to fetch'); }
        return res;
      };
    },
  });
  dev.dom = dom; dev.w = dom.window;
  await sleep(1500); if (process.env.DEBUG_FE) console.log('DEBUG', dev.errors, typeof dev.w.Sync, (() => { try { return dev.w.eval('typeof Storage + typeof ExamEngine + typeof App'); } catch (e) { return String(e); } })());
  const lex = (n) => { try { return dev.w.eval(n); } catch (e) { return undefined; } };
  dev.lex = lex;
  await until(() => lex('typeof App !== "undefined" && App.currentPage') && dev.w.document.querySelector('#app .dashboard, #app .error-screen'));
  dev.provider = {
    onChange(cb) { dev.cb = cb; },
    getToken: async () => token(dev.uid, dev.authAge || 5),
    signInGoogle: async () => {}, signInEmail: async () => {}, signUpEmail: async () => {}, resetPassword: async () => {},
    signOut: async () => { dev.uid = null; dev.cb && dev.cb(null); },
    reauthEmail: async (pw) => { if (pw === 'wrong') { const e = new Error('bad'); e.code = 'auth/invalid-credential'; throw e; } dev.reauthed = (dev.reauthed || 0) + 1; },
    reauthGoogle: async () => { dev.googleReauth = true; },
    deleteAccount: async () => { if (dev.net.failDelete) throw new Error('could not delete'); dev.deletedFirebase = true; dev.uid = null; dev.cb && dev.cb(null); },
  };
  dev.w.Sync.attachAuth(dev.provider);
  dev.signIn = async (uid, email = uid + '@example.com', providerId = 'password') => { dev.uid = uid; await dev.cb({ uid, email, providerId }); };
  dev.storage = () => Object.fromEntries(Array.from({ length: dev.w.localStorage.length }, (_, i) => { const k = dev.w.localStorage.key(i); return [k, dev.w.localStorage.getItem(k)]; }));
  dev.S = () => lex('Storage');
  dev.flush = () => dev.w.Sync._flush();
  dev.close = () => dev.w.close();
  // run a real exam through ExamEngine: picks = answer index per question position (undefined = skip)
  dev.exam = async (sub, picks, flagIdx = []) => {
    const E = lex('ExamEngine');
    await E.init({ module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: sub, subSubjectLabel: sub });
    picks.forEach((p, i) => { if (p !== undefined) E.state.answers[i] = p; });
    flagIdx.forEach((i) => E.toggleFlag(i));
    return E.submit();
  };
  return dev;
}
const hdr = (d) => ({ signin: d.w.document.getElementById('signin-btn'), acct: d.w.document.getElementById('account-btn') });
const visible = (el) => el && !el.hidden;
const sc = 'CPM|final_exam|anatomy|larynx';


// ---------- helpers shared by several parts ----------
const signOut = async (d) => { d.w.document.getElementById('account-btn').click(); await sleep(30); d.w.document.querySelector('[data-acct=signout]').click(); await until(() => d.w.Sync.owner() === 'guest', 8000); };
const attNow = (uid) => sql(`SELECT COUNT(*) n FROM attempts WHERE uid='${uid}' AND epoch=(SELECT reset_epoch FROM users WHERE uid='${uid}')`)[0].n;
const att = (uid) => sql(`SELECT COUNT(*) n, COALESCE(SUM(correct),0) c, COALESCE(SUM(attempted),0) a FROM attempts WHERE uid='${uid}'`)[0];
const openAcct = async (d) => { hdr(d).acct.click(); await sleep(40); return d.w.document.getElementById('account-view'); };

// ---------- part lifecycle ----------
export async function ready() {
  let up = false;
  for (let i = 0; i < 90 && !up; i++) { try { up = (await fetch(BASE + '/api/health')).ok; } catch (e) { await sleep(1000); } }
  check('local stack starts', up, slog.slice(-300));
}
export function teardown() { tearingDown = true; }
export function crash(e) {
  // an exception inside a test block used to end the run silently (no summary line); now it is a visible failure
  fail++; failures.push('suite stopped early: ' + (e && e.message)); console.log('FAIL suite stopped early  -> ' + (e && e.stack));
}
export async function finish() {
  tearingDown = true;
  ghServer.close(); server.kill('SIGTERM'); await sleep(500); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) console.log('Failed: ' + failures.join(' | '));
  process.exit(fail ? 1 : 0);
}

export { BASE, PROJECT, GH_PORT, J, JSDOM, PORT, ResourceLoader, SITE_DIR, SignJWT, VirtualConsole, att, attNow, boot, check, crypto, deviceCount, ex, exportJWK, fileURLToPath, fs, generateKeyPair, ghLog, ghServer, good, hdr, here, http, jwk, openAcct, os, path, qfile, repo, sc, server, shaOf, signOut, sleep, slog, spawn, spawnSync, sql, tmp, token, until, visible, wr };
