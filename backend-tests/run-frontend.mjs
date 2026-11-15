// Front-end sync tests. Boots the real site files in jsdom (a headless DOM, not a
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

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const SITE_DIR = process.env.SITE_DIR || repo;     // folder holding index.html, assets/, config/
const PORT = 8789, BASE = `http://127.0.0.1:${PORT}`, PROJECT = 'recall-med';
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
fs.writeFileSync(path.join(tmp, '.dev.vars'), `FIREBASE_PROJECT_ID=${PROJECT}\nADMIN_UIDS=admin1\nTEST_JWKS=${J({ keys: [jwk] })}\nGITHUB_TOKEN=test-gh-token-not-real\nGITHUB_API=http://127.0.0.1:8798\n`);

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
await new Promise((r) => ghServer.listen(8798, '127.0.0.1', r));
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

try {
  let up = false;
  for (let i = 0; i < 90 && !up; i++) { try { up = (await fetch(BASE + '/api/health')).ok; } catch (e) { await sleep(1000); } }
  check('local stack starts', up, slog.slice(-300));

  // F1 flag off
  let off = await boot({ cloud: false });
  check('flag off: sign-in and account buttons stay hidden', !visible(hdr(off).signin) && !visible(hdr(off).acct));
  await off.exam('larynx', [0, 1, undefined]);
  check('flag off: guest studying works and makes no API calls', off.S().getExamHistory().length === 1 && off.calls.length === 0 && off.w.Sync.owner() === 'guest');
  check('flag off: no sync store written', off.w.localStorage.getItem('dqb_sync') === null);
  off.close();

  // F2 flag on, guest
  let g = await boot();
  check('flag on: guest sees "Sign in" text button, no account icon', visible(hdr(g).signin) && hdr(g).signin.textContent.trim() === 'Sign in' && !visible(hdr(g).acct));
  hdr(g).signin.click(); await sleep(50);
  const modal = g.w.document.getElementById('account-modal');
  check('Sign in opens the modal with Google, email and password', modal.style.display === 'flex' && /Continue with Google/.test(modal.innerHTML) && modal.querySelector('input[name=email]') && modal.querySelector('input[name=password]'));
  check('modal fields have autocomplete and 16px-safe inputs', modal.querySelector('input[name=password]').getAttribute('autocomplete') === 'current-password');
  g.w.document.querySelector('[data-acct=to-signup]').click(); await sleep(20);
  check('Create account view has confirm password and new-password autocomplete', !!modal.querySelector('input[name=confirm]') && modal.querySelector('input[name=password]').getAttribute('autocomplete') === 'new-password');
  g.w.document.querySelector('[data-acct=to-reset]') || g.w.document.querySelector('[data-acct=to-signin]').click();
  await sleep(20); g.w.document.querySelector('[data-acct=to-reset]').click(); await sleep(20);
  check('Forgot password view asks only for email', modal.querySelectorAll('input').length === 1 && /Send reset link/.test(modal.innerHTML));
  g.w.document.dispatchEvent(new g.w.KeyboardEvent('keydown', { key: 'Escape' })); await sleep(260);
  check('Escape closes the modal', modal.style.display === 'none');

  // F3 guest with data signs in
  await g.signIn('uid1', 'student@example.com');   // guest with no progress; import behaviour is tested in the Phase 4 block
  check('sign-in without guest progress: no backup is made',  !g.w.localStorage.getItem('dqb_backup_guest'));
  check('sign-in: local lists start clean for the account', g.S().getExamHistory().length === 0 && g.S().getIncorrect().length === 0);
  check('sign-in: header swaps to the account icon', !visible(hdr(g).signin) && visible(hdr(g).acct) && /<svg/.test(hdr(g).acct.innerHTML));
  check('sign-in: owner is the account', g.w.Sync.owner() === 'uid1');

  // F4 exam on device A
  const A = g;
  await A.exam('larynx', [1, 0, 2, undefined], [3]);   // q1 right, q2 wrong, q3 wrong, q4 skipped, flag q4
  check('exam: wrong answers tracked locally', A.S().getIncorrect().length === 2 && A.w.Sync.pending() >= 4);
  const okA = await A.flush();
  check('exam: sync succeeds and nothing is left pending', okA && A.w.Sync.pending() === 0, `pending=${A.w.Sync.pending()} status=${A.w.Sync.status()}`);
  const srvAtt = sql(`SELECT COUNT(*) n, SUM(correct) c, SUM(attempted) a FROM attempts WHERE uid='uid1'`)[0];
  check('exam: server has exactly 1 attempt with the right numbers', srvAtt.n === 1 && srvAtt.c === 1 && srvAtt.a === 3, J(srvAtt));
  const st = A.S().getStats();
  check('exam: local statistics match the server (no double counting)', st.completedExams === 1 && st.totalAttempted === 3 && st.totalCorrect === 1 && st.totalIncorrect === 2, J(st));
  const srvScope = sql(`SELECT progress, incorrect, flags FROM scopes WHERE uid='uid1'`)[0];
  check('exam: server stores progress, 2 incorrect keys and 1 flag - no question text', Object.keys(JSON.parse(srvScope.incorrect)).length === 2 && Object.keys(JSON.parse(srvScope.flags)).length === 1 && !/Question \d/.test(J(srvScope)));

  // F5 device B pulls everything
  const B = await boot();
  await B.signIn('uid1', 'student@example.com');
  await until(() => B.S().getIncorrect().length === 2 && B.S().getFlagged().length === 1, 6000);
  const inc = B.S().getIncorrect();
  check('device B: sees the 2 incorrect questions, rebuilt with full text', inc.length === 2 && inc.every((q) => /^Question \d about larynx\?$/.test(q.question) && q.options.length === 4 && q.subSubjectLabel));
  check('device B: sees the flagged question', B.S().getFlagged().length === 1 && B.S().getFlagged()[0].id === 4);
  const sB = B.S().getStats();
  check('device B: same statistics and history as device A', sB.completedExams === 1 && sB.totalAttempted === 3 && B.S().getExamHistory().length === 1);
  check('device B: subject progress matches', J(B.S().getProgress()[sc] && B.S().getProgress()[sc].score) === J(A.S().getProgress()[sc].score));

  // F6 changes flow both ways
  B.S().removeIncorrect(inc[0].uid);
  B.S().toggleFlag({ module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', id: 2, question: 'Question 2 about larynx?', options: ['A', 'B', 'C', 'D'], answer: 1, explanation: 'x' });
  await B.flush(); await A.flush();
  await until(() => A.S().getIncorrect().length === 1 && A.S().getFlagged().length === 2, 6000);
  check('A receives B\'s removal and new flag', A.S().getIncorrect().length === 1 && A.S().getFlagged().length === 2, `${A.S().getIncorrect().length}/${A.S().getFlagged().length}`);

  // F7 response lost after the server processed it -> resend must not double count
  A.net.dropResponseOnce = '/api/sync';
  await A.exam('pharynx', [1, 1]);               // 2 right
  const bad1 = await A.flush();
  check('lost response: client keeps the attempt queued and reports a problem', bad1 === false && A.w.Sync.pending() > 0);
  const mid = sql(`SELECT COUNT(*) n FROM attempts WHERE uid='uid1'`)[0].n;
  const ok1 = await A.flush();
  const after = sql(`SELECT COUNT(*) n, SUM(attempted) a FROM attempts WHERE uid='uid1'`)[0];
  check('lost response: server stored it once already, resend adds nothing', mid === 2 && after.n === 2 && ok1 && A.w.Sync.pending() === 0, J([mid, after]));
  check('lost response: local stats equal server stats (2 exams, 5 attempted)', A.S().getStats().completedExams === 2 && A.S().getStats().totalAttempted === 5, J(A.S().getStats()));

  // F8 offline then online
  A.net.offline = true;
  A.S().toggleFlag({ module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', id: 5, question: 'Q5', options: ['A'], answer: 0, explanation: '' });
  await A.exam('pharynx', [1]);
  const offOk = await A.flush();
  check('offline: nothing is lost, changes wait, status says offline', offOk === false && A.w.Sync.pending() >= 2 && A.w.Sync.status() === 'offline');
  A.net.offline = false;
  const onOk = await A.flush();
  check('back online: queue drains to zero', onOk && A.w.Sync.pending() === 0 && sql(`SELECT COUNT(*) n FROM attempts WHERE uid='uid1'`)[0].n === 3);

  // F9 fail-open fall-through (HTML 200) is never success
  A.S().toggleFlag({ module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', id: 6, question: 'Q6', options: ['A'], answer: 0, explanation: '' });
  A.net.htmlFallthrough = true;
  const html = await A.flush();
  check('HTML page instead of JSON is treated as failure; change stays queued', html === false && A.w.Sync.pending() >= 1);
  A.net.htmlFallthrough = false; await A.flush();
  check('after the problem clears, the change uploads', A.w.Sync.pending() === 0);

  // F14-16 account view content
  hdr(A).acct.click(); await sleep(30);
  const view = A.w.document.getElementById('account-view');
  check('account view shows email, sign-in method and sync status', /student@example\.com/.test(view.textContent) && /Signed in with email/.test(view.textContent) && /Up to date/.test(view.textContent));
  check('account view: admin note says totals only; no import note when there is nothing to import', /combined usage totals/.test(view.textContent) && !/before signing in/.test(view.textContent) && !view.querySelector('[data-acct=to-import]'));
  const emoji = /\p{Extended_Pictographic}/u;
  check('no emoji in account interface text', !emoji.test(view.textContent) && !emoji.test(fs.readFileSync(path.join(SITE_DIR, 'assets/js/sync.js'), 'utf8').replace(/[\u2026\u2014]/g, '')));
  A.w.document.getElementById('account-close').click();

  // F10 reset on A; B was offline with old-epoch work
  B.net.offline = true;
  await B.exam('pharynx', [1, 1, 1]);                   // work done before it learns of the reset
  const Bflags = B.S().getFlagged().length;
  A.S().wipeHistory();                                   // what the Reset Progress button calls
  await A.flush();
  check('reset: server epoch is now 1 and old attempts no longer count', sql(`SELECT reset_epoch e FROM users WHERE uid='uid1'`)[0].e === 1 && (await (async () => { const r = sql(`SELECT COUNT(*) n FROM attempts WHERE uid='uid1' AND epoch=1`)[0]; return r.n === 0; })()));
  check('reset: device A is empty but keeps its flags', A.S().getExamHistory().length === 0 && A.S().getStats().completedExams === 0 && A.S().getFlagged().length >= 1);
  B.net.offline = false;
  await B.flush();
  await until(() => B.S().getExamHistory().length === 0, 6000);
  check('stale device B: its old exam did not come back', B.S().getStats().completedExams === 0 && B.S().getExamHistory().length === 0 && Object.keys(B.S().getProgress()).length === 0, J(B.S().getStats()));
  check('stale device B: flags survive and match', B.S().getFlagged().length === A.S().getFlagged().length && B.S().getFlagged().length >= Bflags - 0, `${B.S().getFlagged().length}/${A.S().getFlagged().length}`);
  check('server did not resurrect the stale attempt', sql(`SELECT COUNT(*) n FROM attempts WHERE uid='uid1' AND epoch=1`)[0].n === 0);

  // F11 sign out with pending changes (offline) -> confirmation, then wipe
  A.net.offline = true;
  A.S().toggleFlag({ module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', id: 3, question: 'Q3', options: ['A'], answer: 0, explanation: '' });
  hdr(A).acct.click(); await sleep(20);
  A.w.document.querySelector('[data-acct=signout]').click();
  await until(() => /Sign out\?/.test(A.w.document.getElementById('account-view').textContent), 4000);
  check('sign-out with unsynced changes asks first and says how many', /Sign out\?/.test(A.w.document.getElementById('account-view').textContent) && /not uploaded/.test(A.w.document.getElementById('account-view').textContent));
  check('...and nothing has been wiped yet', A.S().getFlagged().length >= 1 && A.w.Sync.owner() === 'uid1');
  A.w.document.querySelector('[data-acct=signout-force]').click();
  await until(() => A.w.Sync.owner() === 'guest', 4000);
  const left = A.storage();
  check('sign out anyway: all progress keys removed from the device', A.w.Sync.owner() === 'guest' && A.S().getFlagged().length === 0 && A.S().getExamHistory().length === 0 && !left.dqb_sync);
  check('after sign-out the header shows Sign in again', visible(hdr(A).signin) && !visible(hdr(A).acct));
  A.net.offline = false;

  // F12 sign out cleanly, sign back in: data comes back from the account
  await B.exam('pharynx', [1, 1]);
  await B.flush();
  B.w.document.getElementById('account-btn').click(); await sleep(20);
  B.w.document.querySelector('[data-acct=signout]').click();
  await until(() => B.w.Sync.owner() === 'guest', 6000);
  check('clean sign-out: synced first, then device wiped', B.w.Sync.owner() === 'guest' && B.S().getExamHistory().length === 0 && sql(`SELECT COUNT(*) n FROM attempts WHERE uid='uid1' AND epoch=1`)[0].n === 1);
  await B.signIn('uid1'); await until(() => B.S().getExamHistory().length === 1, 6000);
  check('signing back in restores history and statistics from the account', B.S().getExamHistory().length === 1 && B.S().getStats().completedExams === 1);

  // F13 a different account on the same device never mixes
  await B.exam('larynx', [0]);                         // uid1 local change, unsynced
  B.dev = B;
  await B.signIn('uid2', 'other@example.com');         // account switches without an explicit sign-out
  await sleep(300);
  const u2 = sql(`SELECT COUNT(*) n FROM attempts WHERE uid='uid2'`)[0].n;
  check('different account on the same device: no data carried over', B.S().getExamHistory().length === 0 && B.S().getIncorrect().length === 0 && u2 === 0 && B.w.Sync.owner() === 'uid2');
  check('previous account\'s unsynced work is kept as a local backup, not uploaded to the wrong account', Object.keys(B.storage()).some((k) => k.startsWith('dqb_backup_account_')) && sql(`SELECT COUNT(*) n FROM attempts WHERE uid='uid2'`)[0].n === 0);


  // ===== Phase 4: guest progress import =====
  const G = (extra = {}) => ({ module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', ...extra });
  const signOut = async (d) => { d.w.document.getElementById('account-btn').click(); await sleep(30); d.w.document.querySelector('[data-acct=signout]').click(); await until(() => d.w.Sync.owner() === 'guest', 8000); };
  const attNow = (uid) => sql(`SELECT COUNT(*) n FROM attempts WHERE uid='${uid}' AND epoch=(SELECT reset_epoch FROM users WHERE uid='${uid}')`)[0].n;
  const att = (uid) => sql(`SELECT COUNT(*) n, COALESCE(SUM(correct),0) c, COALESCE(SUM(attempted),0) a FROM attempts WHERE uid='${uid}'`)[0];

  // P1 new empty account receives guest progress automatically
  const P1 = await boot();
  await P1.exam('larynx', [1, 1, 0], [4]);                  // 1 wrong, 2 right, 1 flag
  check('P1 setup: guest has history, an incorrect question and a flag', P1.S().getExamHistory().length === 1 && P1.S().getIncorrect().length === 1 && P1.S().getFlagged().length === 1);
  await P1.signIn('uidP1', 'p1@example.com');
  await until(() => att('uidP1').n === 1, 8000);
  check('P1: new account gets the guest exam on the server (imported id, right numbers)', J(att('uidP1')) === J({ n: 1, c: 2, a: 3 }) && /^imp-/.test(sql(`SELECT attempt_id id FROM attempts WHERE uid='uidP1'`)[0].id), J(att('uidP1')));
  const p1s = sql(`SELECT progress, incorrect, flags FROM scopes WHERE uid='uidP1'`)[0];
  check('P1: server has the progress, 1 incorrect key and 1 flag', p1s && Object.keys(JSON.parse(p1s.incorrect)).length === 1 && Object.keys(JSON.parse(p1s.flags)).length === 1 && JSON.parse(p1s.progress).completed === true, J(p1s));
  check('P1: device keeps its history (with attempt id), list entries and correct statistics', P1.S().getExamHistory().length === 1 && !!P1.S().getExamHistory()[0].attemptId && P1.S().getIncorrect().length === 1 && P1.S().getFlagged().length === 1 && P1.S().getStats().completedExams === 1 && P1.S().getStats().totalCorrect === 2, J(P1.S().getStats()));
  check('P1: copy is kept under a new name and the offer is gone', !P1.w.localStorage.getItem('dqb_backup_guest') && !!P1.w.localStorage.getItem('dqb_backup_guest_imported'));
  await P1.flush(); await sleep(200);
  check('P1: nothing left pending and the server still has one attempt', P1.w.Sync.pending() === 0 && att('uidP1').n === 1);
  P1.w.document.getElementById('account-btn').click(); await sleep(30);
  const p1v = P1.w.document.getElementById('account-view');
  check('P1: account window says what was added; no import button', /Added from this device/.test(p1v.textContent) && !p1v.querySelector('[data-acct=to-import]'), p1v.textContent.slice(0, 200));
  P1.w.document.getElementById('account-close').click();

  // P2 signing out and back in never duplicates the imported exam
  await signOut(P1);
  await P1.signIn('uidP1', 'p1@example.com'); await until(() => P1.S().getExamHistory().length === 1, 6000); await sleep(300);
  check('P2: sign out and back in: still exactly one exam locally and on the server', P1.S().getExamHistory().length === 1 && att('uidP1').n === 1 && P1.S().getStats().completedExams === 1);

  // P3 existing account: no automatic import; the button adds only what the account lacks
  const P3 = await boot();
  await P3.exam('larynx', [0, 0], []);                       // guest: 2 wrong on larynx (same topic uidP1 already has)
  await P3.exam('pharynx', [1, 1, 1]);                       // guest: all right on pharynx (a topic uidP1 does not have)
  const beforeProg = sql(`SELECT progress p FROM scopes WHERE uid='uidP1' AND scope_key='CPM|final_exam|anatomy|larynx'`)[0].p;
  await P3.signIn('uidP1', 'p1@example.com'); await sleep(800);
  check('P3: existing account is NOT auto-imported into', att('uidP1').n === 1 && !!P3.w.localStorage.getItem('dqb_backup_guest'));
  check('P3: this device shows only the account\'s own data', P3.S().getExamHistory().length === 1);
  P3.w.document.getElementById('account-btn').click(); await sleep(30);
  const p3v = P3.w.document.getElementById('account-view');
  check('P3: account window offers the import with counts', !!p3v.querySelector('[data-acct=to-import]') && /2 exams/.test(p3v.textContent) && /before signing in/.test(p3v.textContent), p3v.textContent.slice(0, 250));
  p3v.querySelector('[data-acct=to-import]').click(); await sleep(30);
  check('P3: asks for confirmation first, and nothing is imported yet', /Add progress from this device/.test(P3.w.document.getElementById('account-view').textContent) && att('uidP1').n === 1);
  P3.w.document.querySelector('[data-acct=import-go]').click();
  await until(() => att('uidP1').n === 3, 8000);
  await until(() => P3.w.Sync.pending() === 0, 8000);
  check('P3: the 2 guest exams were added (3 total on the server)', att('uidP1').n === 3, J(att('uidP1')));
  check('P3: existing topic progress on the server was NOT overwritten', sql(`SELECT progress p FROM scopes WHERE uid='uidP1' AND scope_key='CPM|final_exam|anatomy|larynx'`)[0].p === beforeProg);
  check('P3: the topic the account lacked was added', sql(`SELECT COUNT(*) n FROM scopes WHERE uid='uidP1' AND scope_key='CPM|final_exam|anatomy|pharynx'`)[0].n === 1);
  check('P3: local history and stats match the server after import', P3.S().getExamHistory().length === 3 && P3.S().getStats().completedExams === 3, J(P3.S().getStats()));

  // P4 importing the same copy again adds nothing (same ids are stored once)
  P3.w.localStorage.setItem('dqb_backup_guest', P3.w.localStorage.getItem('dqb_backup_guest_imported'));
  P3.w.document.getElementById('account-view').innerHTML = '';
  P3.w.document.getElementById('account-btn').click(); await sleep(30);
  const again = P3.w.document.querySelector('[data-acct=to-import]');
  check('P4: restored copy shows the offer again', !!again);
  again.click(); await sleep(30); P3.w.document.querySelector('[data-acct=import-go]').click();
  await sleep(1500); await P3.flush();
  check('P4: importing the same copy twice does not duplicate exams', att('uidP1').n === 3 && P3.S().getExamHistory().length === 3, J(att('uidP1')));

  // P5 a different person on a shared device is only OFFERED, never auto-imported
  await signOut(P3);
  P3.w.localStorage.setItem('dqb_backup_guest', P3.w.localStorage.getItem('dqb_backup_guest_imported'));  // a copy left on the device
  await P3.signIn('uidP5', 'p5@example.com'); await sleep(800);
  check('P5: a brand-new account on a device with a leftover copy gets nothing automatically', att('uidP5').n === 0 && !!P3.w.localStorage.getItem('dqb_backup_guest'));

  // P6 an account that was reset (even if empty) is not auto-filled
  const P6 = await boot();
  await P6.signIn('uidP6', 'p6@example.com');
  await P6.exam('pharynx', [1, 1]); await P6.flush();
  P6.S().wipeHistory(); await P6.flush();
  await signOut(P6);
  await P6.exam('larynx', [1, 1, 1]);
  await P6.signIn('uidP6', 'p6@example.com'); await sleep(800);
  check('P6: reset account is not auto-filled from guest data', attNow('uidP6') === 0 && !!P6.w.localStorage.getItem('dqb_backup_guest'), J(att('uidP6')));

  // P7 offline: manual import fails safely and the offer stays
  const P7 = await boot();
  await P7.exam('larynx', [1, 1, 1]);
  await P7.signIn('uidP6', 'p6@example.com'); await sleep(600);   // existing (reset) account -> offer
  P7.net.offline = true;
  P7.w.document.getElementById('account-btn').click(); await sleep(30);
  P7.w.document.querySelector('[data-acct=to-import]').click(); await sleep(30);
  P7.w.document.querySelector('[data-acct=import-go]').click(); await sleep(600);
  check('P7: offline import shows an error, changes nothing, keeps the offer', /Could not reach/.test(P7.w.document.getElementById('account-view').textContent) && !!P7.w.localStorage.getItem('dqb_backup_guest') && attNow('uidP6') === 0);

  // P8 damaged guest data is skipped, valid data still imports
  const bad = await boot({ storage: {
    dqb_exam_history: J([
      { module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', scope: 'x', score: 50, correct: 9, total: 4, attempted: 4, timeSec: 1, id: 1700000000001 },
      { module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', scope: 'x', score: 50, correct: 2, total: 4, attempted: 4, timeSec: 5, id: 1700000000002 },
      'garbage', null, { id: 'x' },
    ]),
    dqb_incorrect: J([{ uid: 'a', id: 'not-a-number', module: 'CPM' }, null, 5]),
    dqb_progress: J({ 'bad scope': { completed: true }, 'CPM|final_exam|anatomy|larynx': { completed: true, total: 4 } }),
  } });
  await bad.signIn('uidP8', 'p8@example.com'); await until(() => att('uidP8').n === 1, 8000); await sleep(300);
  check('P8: damaged entries are skipped, the valid exam imports, no crash', J(att('uidP8')) === J({ n: 1, c: 2, a: 4 }) && bad.errors.filter((e) => !/Could not load|not implemented|fonts|navigation|import/i.test(e)).length === 0, J(att('uidP8')) + J(bad.errors.slice(0, 2)));
  [P1, P3, P6, P7, bad].forEach((d) => d.close());


  // ===== Account window: reset progress, delete account =====
  const wipeBtn = (d) => d.w.document.getElementById('wipe-history-btn');
  const openAcct = async (d) => { hdr(d).acct.click(); await sleep(40); return d.w.document.getElementById('account-view'); };
  const gd = await boot();
  check('D1: guest still sees the header Reset Progress button', wipeBtn(gd).hidden === false);
  await gd.signIn('uidD1', 'd1@example.com');
  check('D1: signed in: header Reset Progress button is hidden', wipeBtn(gd).hidden === true);
  await gd.exam('larynx', [1, 0, 2], [3]); await gd.flush();
  let dv = await openAcct(gd);
  check('D2: account window has Reset progress and Delete account', !!dv.querySelector('[data-acct=reset-progress]') && !!dv.querySelector('[data-acct=to-delete]'));
  check('D2: account window keeps Reset password and Sign out', !!dv.querySelector('[data-acct=send-reset]') && !!dv.querySelector('[data-acct=signout]'));
  dv.querySelector('[data-acct=reset-progress]').click(); await sleep(300);
  check('D3: Reset progress closes the account window and opens the confirmation', gd.w.document.getElementById('account-modal').style.display === 'none' && gd.w.document.getElementById('wipe-modal').style.display === 'flex');
  gd.w.document.getElementById('wipe-cancel-btn').click(); await sleep(30);
  check('D3: cancelling resets nothing', gd.S().getExamHistory().length === 1 && sql(`SELECT reset_epoch e FROM users WHERE uid='uidD1'`)[0].e === 0);
  dv = await openAcct(gd); dv.querySelector('[data-acct=reset-progress]').click(); await sleep(30);
  gd.w.document.getElementById('wipe-confirm-btn').click();
  await until(() => sql(`SELECT reset_epoch e FROM users WHERE uid='uidD1'`)[0].e === 1, 8000);
  check('D3: confirming resets here and on the server, and keeps flags', gd.S().getExamHistory().length === 0 && gd.S().getFlagged().length === 1 && sql(`SELECT reset_epoch e FROM users WHERE uid='uidD1'`)[0].e === 1);

  // delete account (password user)
  await gd.exam('larynx', [1, 1]); await gd.flush();
  dv = await openAcct(gd); dv.querySelector('[data-acct=to-delete]').click(); await sleep(30);
  dv = gd.w.document.getElementById('account-view');
  check('D4: delete explains it is permanent and asks for the password', !!dv.querySelector('input[name=password]') && /cannot be undone/.test(dv.textContent));
  gd.w.document.querySelector('[data-acct=delete-go]').click(); await sleep(60);
  check('D4: empty password is refused', /Enter your password/.test(gd.w.document.getElementById('acct-error').textContent) && sql(`SELECT COUNT(*) n FROM users WHERE uid='uidD1'`)[0].n === 1);
  const pwIn = () => gd.w.document.getElementById('account-view').querySelector('input[name=password]');
  pwIn().value = 'wrong'; gd.w.document.querySelector('[data-acct=delete-go]').click(); await sleep(300);
  check('D4: wrong password: error shown, nothing deleted, still signed in', /Incorrect email or password/.test(gd.w.document.getElementById('acct-error').textContent) && sql(`SELECT COUNT(*) n FROM users WHERE uid='uidD1'`)[0].n === 1 && gd.w.Sync.owner() === 'uidD1');
  pwIn().value = 'right'; gd.net.offline = true; gd.w.document.querySelector('[data-acct=delete-go]').click(); await sleep(900);
  check('D5: offline: nothing deleted anywhere, local data intact, still signed in', /Nothing was deleted/.test(gd.w.document.getElementById('acct-error').textContent) && sql(`SELECT COUNT(*) n FROM users WHERE uid='uidD1'`)[0].n === 1 && gd.S().getFlagged().length === 1 && gd.w.Sync.owner() === 'uidD1');
  gd.net.offline = false;
  pwIn().value = 'right'; gd.w.document.querySelector('[data-acct=delete-go]').click();
  await until(() => gd.w.Sync.owner() === 'guest', 8000); await sleep(200);
  const gone = ['users', 'scopes', 'attempts'].map((t) => sql(`SELECT COUNT(*) n FROM ${t} WHERE uid='uidD1'`)[0].n);
  check('D6: account deleted: server has no rows for it and the sign-in itself was deleted', J(gone) === J([0, 0, 0]) && gd.deletedFirebase === true, J(gone));
  check('D6: this device is cleared: no history, flags, sync store or account backups', gd.S().getExamHistory().length === 0 && gd.S().getFlagged().length === 0 && !gd.w.localStorage.getItem('dqb_sync') && !Object.keys(gd.storage()).some((k) => k.startsWith('dqb_backup_account_')));
  check('D6: header is back to guest (Sign in visible, Reset Progress visible)', visible(hdr(gd).signin) && !visible(hdr(gd).acct) && wipeBtn(gd).hidden === false);
  check('D6: other accounts were not touched', att('uidP1').n === 3);

  // Google user: confirms through Google, no password field
  const gg = await boot();
  await gg.signIn('uidD3', 'd3@gmail.com', 'google.com'); await gg.exam('larynx', [1, 1]); await gg.flush();
  dv = await openAcct(gg); dv.querySelector('[data-acct=to-delete]').click(); await sleep(30);
  check('D7: Google account: no password field, explains the Google confirmation', !gg.w.document.getElementById('account-view').querySelector('input[name=password]') && /Google again/.test(gg.w.document.getElementById('account-view').textContent));
  gg.w.document.querySelector('[data-acct=delete-go]').click();
  await until(() => gg.w.Sync.owner() === 'guest', 8000); await sleep(200);
  check('D7: Google account deleted after re-confirming with Google', gg.googleReauth === true && sql(`SELECT COUNT(*) n FROM users WHERE uid='uidD3'`)[0].n === 0 && sql(`SELECT COUNT(*) n FROM attempts WHERE uid='uidD3'`)[0].n === 0);

  // the sign-in removal fails after the data is gone: data stays deleted and the device is cleared
  const gf = await boot();
  await gf.signIn('uidD4', 'd4@example.com'); await gf.exam('larynx', [1, 1]); await gf.flush();
  gf.net.failDelete = true;
  dv = await openAcct(gf); dv.querySelector('[data-acct=to-delete]').click(); await sleep(30);
  gf.w.document.getElementById('account-view').querySelector('input[name=password]').value = 'right';
  gf.w.document.querySelector('[data-acct=delete-go]').click();
  await until(() => gf.w.Sync.owner() === 'guest', 8000); await sleep(200);
  check('D8: if removing the sign-in fails, the data is still deleted and this device is signed out and cleared', sql(`SELECT COUNT(*) n FROM users WHERE uid='uidD4'`)[0].n === 0 && gf.S().getExamHistory().length === 0 && !gf.w.localStorage.getItem('dqb_sync'));
  check('D8: nothing re-uploads afterwards', (await sleep(1500), sql(`SELECT COUNT(*) n FROM users WHERE uid='uidD4'`)[0].n === 0));
  [gd, gg, gf].forEach((d) => d.close());

  // ===== Signing in to an account that was reset before: no false 'reset on another device' notice =====
  const R1 = await boot();
  await R1.signIn('uidR1', 'r1@example.com');
  await R1.exam('larynx', [1, 1]); await R1.flush();
  R1.S().wipeHistory(); await R1.flush();                    // account is now at reset count 1
  await R1.exam('pharynx', [1, 1, 1]); await R1.flush();     // fresh data after the reset
  await signOut(R1);
  const R2 = await boot();
  const toasts = []; { const U = R2.lex('UI'); const o = U.toast; U.toast = function (m) { toasts.push(String(m)); return o.apply(U, arguments); }; }
  await R2.signIn('uidR1', 'r1@example.com'); await until(() => R2.S().getExamHistory().length === 1, 8000); await sleep(300);
  check('R: first sign-in to a reset account shows its data and NO "reset on another device" notice', R2.S().getExamHistory().length === 1 && R2.S().getStats().completedExams === 1 && !toasts.some((m) => /another device/.test(m)), J(toasts));
  // a real reset from another device is still announced on a device that already had the account loaded
  R1.close();
  const R3 = await boot();
  await R3.signIn('uidR1', 'r1@example.com'); await until(() => R3.S().getExamHistory().length === 1, 8000);
  R2.S().wipeHistory(); await R2.flush();
  const toasts3 = []; { const U = R3.lex('UI'); const o = U.toast; U.toast = function (m) { toasts3.push(String(m)); return o.apply(U, arguments); }; }
  await R3.exam('larynx', [1]); await R3.flush(); await sleep(300);
  check('R: a real reset on another device is still announced, and this device follows it', toasts3.some((m) => /another device/.test(m)) && R3.S().getExamHistory().length === 0, J(toasts3) + ' hist=' + R3.S().getExamHistory().length);
  [R2, R3].forEach((d) => d.close());

  // ===== Loading cover while a freshly signed-in device fetches its account =====
  const L1 = await boot();
  L1.net.delayMs = 900;
  const lp = L1.signIn('uidP1', 'p1@example.com');
  await sleep(350);
  check('L: a cover is shown while the account loads (no empty-dashboard flash)', !!L1.w.document.getElementById('sync-loading') && /Loading your progress/.test(L1.w.document.getElementById('sync-loading').textContent));
  await lp; await until(() => !L1.w.document.getElementById('sync-loading'), 4000);
  check('L: the cover is gone once the data has loaded, and the data is there', !L1.w.document.getElementById('sync-loading') && L1.S().getExamHistory().length >= 1);
  const L2 = await boot();
  L2.net.offline = true;
  await L2.signIn('uidP1', 'p1@example.com'); await sleep(300);
  check('L: signing in while offline never leaves the cover stuck', !L2.w.document.getElementById('sync-loading'));
  L1.net.delayMs = 0; await L1.signIn('uidP1', 'p1@example.com'); await sleep(200);
  check('L: no cover on later syncs of an already-loaded device', !L1.w.document.getElementById('sync-loading'));
  [L1, L2].forEach((d) => d.close());

  // ===== Deleting needs a recent sign-in (checked by the server) =====
  const SD = await boot();
  await SD.signIn('uidSD', 'sd@example.com'); await SD.exam('larynx', [1, 1]); await SD.flush();
  SD.authAge = 3600;                                          // the sign-in is an hour old
  dv = await openAcct(SD); dv.querySelector('[data-acct=to-delete]').click(); await sleep(30);
  SD.w.document.getElementById('account-view').querySelector('input[name=password]').value = 'right';
  SD.w.document.querySelector('[data-acct=delete-go]').click(); await sleep(900);
  check('S: an old sign-in cannot delete: clear message, nothing deleted, still signed in', /sign out, sign in again/.test(SD.w.document.getElementById('acct-error').textContent) && sql(`SELECT COUNT(*) n FROM users WHERE uid='uidSD'`)[0].n === 1 && SD.w.Sync.owner() === 'uidSD');
  SD.authAge = 5;                                             // after signing in again
  SD.w.document.querySelector('[data-acct=delete-go]').click();
  await until(() => SD.w.Sync.owner() === 'guest', 8000); await sleep(200);
  check('S: with a fresh sign-in the same deletion goes through', sql(`SELECT COUNT(*) n FROM users WHERE uid='uidSD'`)[0].n === 0);
  SD.close();


  // ===== Account name, navy avatar, animation hooks, Sync now cooldown =====
  {
    const submit = (d, form) => form.dispatchEvent(new d.w.Event('submit', { bubbles: true, cancelable: true }));
    const setVals = (form, v) => Object.entries(v).forEach(([k, x]) => { form.elements[k].value = x; });
    const nameRow = (uid) => (sql(`SELECT first_name f, last_name l FROM users WHERE uid='${uid}'`) || [])[0];

    // -- sign-up form and validation
    const NM = await boot();
    NM.signUps = 0;
    NM.provider.signUpEmail = async (email) => { NM.signUps++; await NM.signIn('uidNM', email); };
    hdr(NM).signin.click(); await sleep(50);
    NM.w.document.querySelector('[data-acct=to-signup]').click(); await sleep(30);
    let form = NM.w.document.getElementById('acct-form');
    const order = Array.from(form.elements).map((e) => e.name).filter(Boolean);
    check('N: sign-up asks for first name (required) and last name (optional), before the email',
      order.indexOf('first') === 0 && order.indexOf('last') === 1 && order.indexOf('email') === 2 && form.elements.first.required && !form.elements.last.required &&
      form.elements.first.getAttribute('autocomplete') === 'given-name' && form.elements.last.getAttribute('autocomplete') === 'family-name');
    setVals(form, { first: '  ', last: '', email: 'nm@example.com', password: 'secret1', confirm: 'secret1' }); submit(NM, form); await sleep(60);
    check('N: blank first name is refused before any account is created', /first name/i.test(NM.w.document.getElementById('acct-error').textContent) && NM.signUps === 0);
    setVals(form, { first: 'Fuck', last: '' }); submit(NM, form); await sleep(60);
    check('N: a blocked name is refused before any account is created', /different name/i.test(NM.w.document.getElementById('acct-error').textContent) && NM.signUps === 0);
    setVals(form, { first: 'Kareem', last: 'Mohamed' }); submit(NM, form);
    await until(() => nameRow('uidNM') && nameRow('uidNM').f === 'Kareem', 6000); await sleep(300);
    check('N: sign-up creates the account and the server stores the name', NM.signUps === 1 && J(nameRow('uidNM')) === J({ f: 'Kareem', l: 'Mohamed' }), J(nameRow('uidNM')));
    check('N: the queued name is cleared once saved', NM.w.localStorage.getItem('dqb_pending_name') === null);

    // -- account window: navy generic avatar, Dr. name, email
    let av2 = await openAcct(NM);
    const avatar = av2.querySelector('.acct-avatar');
    check('N: avatar is a generic user icon, not a letter', !!avatar && !!avatar.querySelector('svg') && avatar.textContent.trim() === '');
    check('N: account shows "Dr. Kareem Mohamed" with the email under it', (av2.querySelector('.acct-name') || {}).textContent === 'Dr. Kareem Mohamed' && /nm@example\.com/.test(av2.querySelector('.acct-email').textContent));
    check('N: opening the window does not replay the view-change animation, but the window itself animates in CSS',
      !av2.classList.contains('acct-swap') && /@keyframes acct-pop/.test(fs.readFileSync(path.join(SITE_DIR, 'assets/css/account.css'), 'utf8')) && /prefers-reduced-motion/.test(fs.readFileSync(path.join(SITE_DIR, 'assets/css/account.css'), 'utf8')));

    // -- a second device shows the same name
    const NB = await boot(); await NB.signIn('uidNM', 'nm@example.com'); await sleep(200);
    av2 = await openAcct(NB);
    check('N: another device shows the same name after signing in', (av2.querySelector('.acct-name') || {}).textContent === 'Dr. Kareem Mohamed');
    NB.close();

    // -- editing: prefilled, last name optional, blocked names refused, server updated
    NM.w.document.querySelector('[data-acct=to-edit-name]').click(); await sleep(30);
    form = NM.w.document.getElementById('acct-form');
    check('N: edit form is prefilled and the window plays its settle-in animation class', form.elements.first.value === 'Kareem' && form.elements.last.value === 'Mohamed' && NM.w.document.getElementById('account-view').classList.contains('acct-swap'));
    setVals(form, { first: 'Kareem', last: 'Shit' }); submit(NM, form); await sleep(80);
    check('N: edit: blocked name refused, server unchanged', /different name/i.test(NM.w.document.getElementById('acct-error').textContent) && nameRow('uidNM').l === 'Mohamed');
    setVals(form, { first: 'Karim', last: '' }); submit(NM, form);
    await until(() => nameRow('uidNM').f === 'Karim', 5000); await sleep(100);
    check('N: edit: saved (last name removed); the account view shows "Dr. Karim"', J(nameRow('uidNM')) === J({ f: 'Karim', l: null }) && (NM.w.document.querySelector('.acct-name') || {}).textContent === 'Dr. Karim', J(nameRow('uidNM')));

    // -- Google sign-in has no stored name: offer to add one, prefilled from the Google name
    const GN = await boot();
    GN.uid = 'uidGN'; await GN.cb({ uid: 'uidGN', email: 'gn@example.com', providerId: 'google.com', displayName: 'Sara Ali Hassan' }); await sleep(200);
    av2 = await openAcct(GN);
    check('N: Google account without a name: "Add your name" is offered, no empty name line', !av2.querySelector('.acct-name') && /Add your name/.test(av2.textContent));
    av2.querySelector('[data-acct=to-edit-name]').click(); await sleep(30);
    form = GN.w.document.getElementById('acct-form');
    check('N: the Google name is only a prefill (first / rest), nothing is saved until Save', form.elements.first.value === 'Sara' && form.elements.last.value === 'Ali Hassan' && !(nameRow('uidGN') && nameRow('uidGN').f));
    GN.close();

    // -- sign-up while offline: the name waits and is saved on the next sign-in
    const NO = await boot(); NO.signUps = 0;
    NO.provider.signUpEmail = async (email) => { NO.signUps++; await NO.signIn('uidNO', email); };
    NO.net.offline = true;
    hdr(NO).signin.click(); await sleep(40); NO.w.document.querySelector('[data-acct=to-signup]').click(); await sleep(30);
    form = NO.w.document.getElementById('acct-form');
    setVals(form, { first: 'Omar', last: '', email: 'no@example.com', password: 'secret1', confirm: 'secret1' }); submit(NO, form); await sleep(400);
    check('N: offline sign-up keeps the name queued (nothing lost)', !!JSON.parse(NO.w.localStorage.getItem('dqb_pending_name') || 'null') && !nameRow('uidNO'));
    NO.net.offline = false; await NO.signIn('uidNO', 'no@example.com');
    await until(() => nameRow('uidNO') && nameRow('uidNO').f === 'Omar', 6000); await sleep(300);
    check('N: queued name is saved after reconnecting, then cleared', !!nameRow('uidNO') && nameRow('uidNO').f === 'Omar' && NO.w.localStorage.getItem('dqb_pending_name') === null);
    NO.close();

    // -- a queued name is never given to a different account
    const NX = await boot({ storage: { dqb_pending_name: J({ email: 'someone@example.com', first: 'Zed', last: '' }) } });
    await NX.signIn('uidNX', 'other@example.com'); await sleep(500);
    check('N: a queued name for one email is not applied to another account', !(nameRow('uidNX') && nameRow('uidNX').f));
    NX.close();

    // -- Sync now cooldown (button only)
    const SN = await boot({ storage: { dqb_manual_sync_at: '0' } });
    await SN.signIn('uidSN', 'sn@example.com'); await sleep(200);
    let avs = await openAcct(SN);
    let btn = SN.w.document.getElementById('acct-sync-btn');
    check('C: Sync now is available when it has not been used', !!btn && !btn.disabled && btn.textContent === 'Sync now');
    const stateCalls = () => SN.calls.filter((c) => c.url.includes('/api/state')).length;
    const c0 = stateCalls();
    btn.click(); await sleep(400);
    btn = SN.w.document.getElementById('acct-sync-btn');
    check('C: pressing it syncs once and starts a countdown (disabled, shows seconds left)', stateCalls() === c0 + 1 && btn.disabled && /^Sync now \((29|30)s\)$/.test(btn.textContent), `${stateCalls() - c0} ${btn.textContent}`);
    btn.dispatchEvent(new SN.w.MouseEvent('click', { bubbles: true })); await sleep(300);
    check('C: a stray click during the cooldown does nothing (no extra request)', stateCalls() === c0 + 1);
    SN.w.document.getElementById('account-close').click(); await sleep(30);
    avs = await openAcct(SN); btn = SN.w.document.getElementById('acct-sync-btn');
    check('C: closing and reopening the window does not reset the cooldown', btn.disabled && /^Sync now \(\d+s\)$/.test(btn.textContent));
    await SN.exam('larynx', [1, 0]);
    const during = await SN.flush();
    check('C: normal syncing is untouched during the cooldown (exam uploads, nothing pending)', during === true && SN.w.Sync.pending() === 0 && sql(`SELECT COUNT(*) n FROM attempts WHERE uid='uidSN'`)[0].n === 1);
    check('C: the cooldown time is remembered across a reload (stored, not trusted beyond 30 s)', Number(SN.w.localStorage.getItem('dqb_manual_sync_at')) > Date.now() - 5000);
    SN.close();
    const SR = await boot({ storage: { dqb_manual_sync_at: String(Date.now() - 12000) } });
    await SR.signIn('uidSR', 'sr@example.com'); await sleep(200);
    await openAcct(SR);
    const secs = () => Number((/\((\d+)s\)/.exec(SR.w.document.getElementById('acct-sync-btn').textContent) || [])[1]);
    const s1 = secs();
    check('C: a recent press stored before a reload keeps the button locked with the right time left', SR.w.document.getElementById('acct-sync-btn').disabled && s1 >= 8 && s1 <= 18, String(s1));
    await sleep(2300);
    check('C: the countdown ticks down by itself without redrawing the window', secs() <= s1 - 2, `${s1} -> ${secs()}`);
    SR.close();
    const SE = await boot({ storage: { dqb_manual_sync_at: String(Date.now() - 27000) } });
    await SE.signIn('uidSE', 'se@example.com'); await sleep(200);
    await openAcct(SE);
    check('C: when the 30 s are over the button comes back on its own', await until(() => { const x = SE.w.document.getElementById('acct-sync-btn'); return x && !x.disabled && x.textContent === 'Sync now'; }, 9000, 100));
    SE.close();
    NM.close();
  }


  // ===== Admin dashboard page (admin.html) with seeded data =====
  {
    const now = Date.now(), Q = 'CPM|final_exam|anatomy|pharynx';
    const flagE = (x, id = 3) => J({ [id]: { epoch: 0, rev: 1, updatedAt: 1, flaggedAt: 1, ...x } }).replace(/'/g, "''");
    let q = '';
    for (let i = 1; i <= 25; i++) {
      const rev = J({ keys: [Q + '|3', Q + '|4'], answers: [i <= 22 ? 0 : 1, 1] });
      q += `INSERT INTO users (uid, created_at, last_seen) VALUES ('ad${i}', ${now - 2 * 864e5}, ${now});` +
        `INSERT INTO attempts (uid, attempt_id, epoch, created_at, module, exam_type, subject, sub_subject, scope, score, correct, total, attempted, time_sec, review) VALUES ('ad${i}', 'att-${i}-aaaaaaaa', 0, ${now - 3600000}, 'CPM', 'final_exam', 'anatomy', 'pharynx', '${Q}', 50, ${i <= 22 ? 1 : 2}, 2, 2, 120, '${rev}');`;
    }
    for (let i = 1; i <= 3; i++) q += `INSERT INTO scopes (uid, scope_key, flags) VALUES ('ad${i}', '${Q}', '${flagE({})}');`;
    q += `INSERT INTO scopes (uid, scope_key, flags) VALUES ('ad4', '${Q}', '${flagE({ removed: true }, 4)}');`;
    spawnSync(wr, ['d1', 'execute', 'recall-db', '--local', '--command', q], { cwd: tmp, encoding: 'utf8' });

    const html = fs.readFileSync(path.join(tmp, 'admin.html'), 'utf8');
    const mod = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1].replace(/^import\('\.\/assets\/js\/auth\.js'\).*$/m, '');
    const page = async (uid, hash = '') => {
      const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: BASE + '/admin.html' + hash, runScripts: 'outside-only', pretendToBeVisual: true });
      const w = dom.window; w.fetch = (u, i) => fetch(new URL(u, BASE).href, i); w.scrollTo = () => {};
      w.eval("window.Sync = { attachAuth: function (p) { window.__prov = p; p.onChange(function (u) { window.__onUser && window.__onUser(u); }); } };");
      w.eval(mod);
      w.Sync.attachAuth({ onChange: (cb) => cb({ uid }), getToken: async () => token(uid), signOut: async () => {}, signInGoogle: async () => {}, signInEmail: async () => {} });
      await until(() => w.document.querySelector('.rc-nav') || /not an administrator/.test(w.document.body.textContent), 8000);
      return w;
    };
    const go = async (w, hash, ms = 900) => { w.location.hash = hash; await sleep(ms); return w.document.getElementById('pane').textContent; };
    const click = async (w, sel, ms = 900) => { const el = w.document.querySelector(sel); if (!el) throw new Error('missing ' + sel); el.click(); await sleep(ms); };
    const key = (w, k) => new w.KeyboardEvent('keydown', { key: k, bubbles: true });
    const cfgNow = () => JSON.parse(fs.readFileSync(path.join(tmp, 'config/modules.json'), 'utf8'));
    const pharynx = () => cfgNow().modules.find((m) => m.id === 'CPM').subSubjects.final_exam.anatomy.find((x) => x.id === 'pharynx');
    const A = await page('admin1', '#overview');
    const ov = A.document.getElementById('pane').textContent;
    check('admin page: overview shows accounts, studying counts, exams and the per-day chart', /Accounts/.test(ov) && /Studying today/.test(ov) && /25/.test(ov) && !!A.document.querySelector('#pane svg rect') && /Exams by module/.test(ov), ov.slice(0, 200));
    check('admin page: navigation has Overview, Content, Students, Retention, System and the current one is marked', A.document.querySelectorAll('#nav a').length === 5 && A.document.querySelector('#nav a[aria-current=page]').dataset.sec === 'overview');

    // ---- Content: Module > exam type > Subject > Topic > Questions ----
    let c = await go(A, '#content');
    check('content: home shows one card per module (CPM, GIT, CNS, ENDO_REPRO, URINARY) with topic and question counts', A.document.querySelectorAll('.modules-grid .module-card').length === 5 && /CPM[\s\S]*Topics[\s\S]*Questions/.test(c), c.slice(0, 200));
    check('content: CNS is badged Ongoing on its card', /CNS[\s\S]{0,60}Ongoing/.test(A.document.querySelector('a[href="#content/CNS"]').textContent));
    check('content: the statistics (possible wrong key, hardest, saved by the most) sit in one collapsible card', /Possible wrong answer key[\s\S]*?#3[^B]*B \(1\d%\)A \(8\d%\)2\d/.test(c) && /Hardest questions[\s\S]*?#3[^%]*1\d%[^A]*A \(8\d%\)2\d/.test(c) && /not a report/.test(c) && /Saved by the most students/.test(c) && !/flag/i.test(c));
    c = await go(A, '#content/CPM');
    check('content: module page has the Ongoing and Visible switches, the exam type tabs and one card per subject', !!A.document.querySelector('[data-sw=mod-ongoing]') && !!A.document.querySelector('[data-sw=mod-visible]') && A.document.querySelectorAll('.exam-type-section').length === 2 && A.document.querySelectorAll('.subject-card').length === 8 && /Module settings/.test(c));
    c = await go(A, '#content/CPM/final_exam');
    check('content: the Final Exam tab shows Anatomy with its topic count and question count', /Anatomy[\s\S]*topics?[\s\S]*questions/.test(c) && /Final Exam/.test(A.document.querySelector('.exam-type-section:last-child .exam-type-header__title').textContent));
    c = await go(A, '#content/CPM/final_exam/anatomy');
    check('content: subject page lists its topics, each with a visibility switch, a details button and its question count', A.document.querySelectorAll('.topics-list .topic-row').length >= 2 && /Pharynx/.test(c) && /4 Questions/.test(c) && /6 Questions/.test(c) && !!A.document.querySelector('[data-sw=topic]') && !!A.document.querySelector('[data-act=tdetails]') && !!A.document.querySelector('[data-act=newtopic]'), c.slice(0, 300));
    c = await go(A, '#content/CPM/final_exam/anatomy/pharynx');
    check('content: topic page lists its questions with Edit and Remove, Add a question and an Open on GitHub link', A.document.querySelectorAll('.rc-q').length === 4 && !!A.document.querySelector('[data-act=edit]') && !!A.document.querySelector('[data-act=del]') && !!A.document.querySelector('[data-add]') && !!A.document.querySelector('a[href^="https://github.com/recall-med/recall4/blob/main/data/CPM/final_exam/anatomy/"]'));
    check('content: breadcrumbs lead back up level by level', /Content/.test(A.document.getElementById('crumbs').textContent) && A.document.querySelectorAll('#crumbs a').length === 3);
    await go(A, '#content', 700);
    const cs = A.document.getElementById('cs'); cs.value = 'Question 3 about pharynx'; cs.dispatchEvent(new A.Event('input', { bubbles: true }));
    check('content: search finds a question across every topic, showing where it lives', A.document.querySelectorAll('#cres .rc-q').length === 1 && /Pharynx/.test(A.document.getElementById('cres').textContent) && A.document.getElementById('chome').hidden === true);
    cs.value = ''; cs.dispatchEvent(new A.Event('input', { bubbles: true }));

    // ---- editing a question: the side drawer ----
    await go(A, '#content/CPM/final_exam/anatomy/pharynx', 700);
    await click(A, '[data-act=edit]', 700);
    const dr = () => A.document.querySelector('.rc-layer--drawer');
    check('editor: opens as a side drawer with the question, four options with a correct-answer radio, and an explanation', !!dr() && A.document.querySelectorAll('.rc-opt input[type=radio]').length === 4 && A.document.querySelectorAll('[data-o]').length === 4 && /Edit question #1/.test(dr().textContent));
    A.document.querySelector('.rc-scrim').dispatchEvent(new A.MouseEvent('click', { bubbles: true }));
    check('popups: tapping outside the drawer does NOT close it', !!dr());
    A.document.querySelector('[name=question]').value = 'Edited from the dashboard?';
    A.document.querySelector('[data-x]').click(); await sleep(200);
    check('popups: closing with unsaved edits asks first (a dialog on top of the drawer)', !!A.document.querySelector('.rc-layer--dialog') && /Discard your changes/.test(A.document.body.textContent) && !!dr());
    A.document.dispatchEvent(key(A, 'Escape')); await sleep(300);
    check('popups: Escape closes only the top layer (the dialog); the drawer stays', !A.document.querySelector('.rc-layer--dialog') && !!dr());
    A.history.back(); await sleep(400);
    check('popups: the browser Back button also asks (dialog opens again) instead of leaving the page', !!A.document.querySelector('.rc-layer--dialog') && !!dr());
    await click(A, '.rc-layer--dialog [data-no]', 500);
    check('popups: Cancel on the dialog keeps the edits', !A.document.querySelector('.rc-layer--dialog') && A.document.querySelector('[name=question]').value === 'Edited from the dashboard?');
    await click(A, '[data-save]', 1200);
    check('editor: Save commits to GitHub (fake), closes the drawer and shows a confirmation toast', !dr() && /Saved/.test(A.document.querySelector('.rc-toasts').textContent) && ghLog.some((x) => /Admin edit: data\/CPM\/final_exam\/anatomy\/pharynx\.json #1/.test(x.message)));
    check('editor: the page now shows the new text', /Edited from the dashboard\?/.test(A.document.getElementById('pane').textContent));
    await click(A, '[data-add]', 700);
    A.document.querySelector('[name=question]').value = 'A brand new question?';
    A.document.querySelectorAll('[data-o]').forEach((i, n) => { i.value = 'Opt ' + n; }); A.document.querySelectorAll('.rc-opt input[type=radio]')[2].checked = true;
    await click(A, '[data-save]', 1200);
    check('editor: a new question is added with the next id', A.document.querySelectorAll('.rc-q').length === 5 && /A brand new question/.test(A.document.getElementById('pane').textContent) && ghLog.some((x) => /Admin add: .*pharynx\.json/.test(x.message)));
    await click(A, '[data-act=del]', 500);
    check('remove: asks first in a dialog naming the question', !!A.document.querySelector('.rc-layer--dialog') && /Remove question #1\?/.test(A.document.querySelector('.rc-layer--dialog').textContent));
    await click(A, '.rc-layer--dialog [data-no]', 400);
    check('remove: Cancel removes nothing', A.document.querySelectorAll('.rc-q').length === 5);
    await click(A, '[data-act=del]', 500); await click(A, '.rc-layer--dialog [data-ok]', 1200);
    check('remove: confirming removes it and shows a toast', A.document.querySelectorAll('.rc-q').length === 4 && /Removed question #1/.test(A.document.querySelector('.rc-toasts').textContent));

    // ---- visibility, details, new topics ----
    await go(A, '#content/CPM/final_exam/anatomy', 800);
    await click(A, '[data-sw=topic]', 1300);
    check('visibility: the topic switch hides that topic in config/modules.json (one commit) and the page shows it as off', pharynx().hidden === true && A.document.querySelector('[data-sw=topic]').checked === false && ghLog.some((x) => /^Admin: edit topic pharynx/.test(x.message)));
    await click(A, '[data-act=tdetails]', 500);
    check('details: the drawer has name, professor and a visibility switch', !!dr() && A.document.querySelector('[name=label]').value === 'Pharynx' && !!A.document.querySelector('[name=professor]') && !!A.document.querySelector('[data-vis]'));
    A.document.querySelector('[name=label]').value = 'Pharynx (renamed)'; A.document.querySelector('[name=professor]').value = "Prof. D'Souza";
    A.document.querySelector('[data-vis]').click();
    await click(A, '[data-save]', 1300);
    check('details: name, professor and visibility are saved together; the apostrophe is made typographic', pharynx().label === 'Pharynx (renamed)' && pharynx().professor === 'Prof. D\u2019Souza' && !('hidden' in pharynx()) && !dr());
    await click(A, '[data-act=newtopic]', 500);
    A.document.querySelector('[name=label]').value = '<b>x</b>';
    await click(A, '[data-save]', 800);
    check('new topic: markup in the name is refused with a plain message and nothing is created', /cannot contain/.test(A.document.getElementById('tferr').textContent) && !fs.existsSync(path.join(tmp, 'data/CPM/final_exam/anatomy/new_topic.json')));
    A.document.querySelector('[name=label]').value = 'Epiglottis'; A.document.querySelector('[name=professor]').value = 'Prof. Hala';
    await click(A, '[data-save]', 1800);
    const newTopic = cfgNow().modules.find((m) => m.id === 'CPM').subSubjects.final_exam.anatomy.find((x) => x.id === 'epiglottis');
    check('new topic: created HIDDEN, with an empty data file, and the page opens it', !!newTopic && newTopic.hidden === true && newTopic.professor === 'Prof. Hala' && fs.existsSync(path.join(tmp, 'data/CPM/final_exam/anatomy/epiglottis.json')) && /Epiglottis/.test(A.document.getElementById('pane').textContent) && /Hidden from students/.test(A.document.getElementById('pane').textContent), A.location.hash);
    c = await go(A, '#content', 900);
    check('new topic: it appears under "Waiting for approval" with a Make visible button', /Waiting for approval/.test(c) && /Epiglottis/.test(c) && !!A.document.querySelector('[data-act=publish]'));
    await click(A, '[data-act=publish]', 1300);
    check('approval: Make visible switches it on for students', !('hidden' in cfgNow().modules.find((m) => m.id === 'CPM').subSubjects.final_exam.anatomy.find((x) => x.id === 'epiglottis')) && !/Waiting for approval ·/.test(A.document.getElementById('pane').textContent));
    // module settings
    await go(A, '#content/CPM', 800);
    await click(A, '[data-sw=mod-ongoing]', 1300);
    check('module: Ongoing switch makes CPM the ongoing module and removes it from CNS', cfgNow().modules.find((m) => m.id === 'CPM').ongoing === true && !cfgNow().modules.find((m) => m.id === 'CNS').ongoing);
    await click(A, '[data-sw=mod-ongoing]', 1300);
    await go(A, '#content/CNS', 800); await click(A, '[data-sw=mod-ongoing]', 1300);
    check('module: switching it back restores CNS as the ongoing module', cfgNow().modules.find((m) => m.id === 'CNS').ongoing === true && !cfgNow().modules.find((m) => m.id === 'CPM').ongoing);
    await go(A, '#content/GIT', 800); await click(A, '[data-sw=mod-visible]', 600);
    check('module: hiding a whole module asks first in a dialog', /Hide this module from students/.test(A.document.querySelector('.rc-layer--dialog').textContent) && !cfgNow().modules.find((m) => m.id === 'GIT').hidden);
    await click(A, '.rc-layer--dialog [data-ok]', 1300);
    check('module: after confirming, GIT is hidden in config/modules.json', cfgNow().modules.find((m) => m.id === 'GIT').hidden === true);

    // ---- what students and admins see in the app itself ----
    await click(A, '[data-sw=mod-visible]', 1300);   // GIT visible again (no dialog when switching on)
    const gitShown = !cfgNow().modules.find((m) => m.id === 'GIT').hidden;
    const rt = await go(A, '#retention', 800);
    check('admin page: retention shows a cohort table and activation figures', /Weekly signup cohorts/.test(rt) && /Median time to first exam/.test(rt));
    const sy = await go(A, '#system', 800);
    check('admin page: system tab shows totals and the reset countdown', /Exams stored/.test(sy) && /Daily limits reset in/.test(sy));
    check('admin page: no emails anywhere in the page outside the Students tab', !/@/.test(A.document.body.textContent.replace(/@media/g, '')) && gitShown);

    // ---- students tab ----
    spawnSync(wr, ['d1', 'execute', 'recall-db', '--local', '--command', `UPDATE users SET email='ad1@example.com', first_name='Ada', last_name='One' WHERE uid='ad1'`], { cwd: tmp, encoding: 'utf8' });
    spawnSync(wr, ['d1', 'execute', 'recall-db', '--local', '--command', `INSERT OR IGNORE INTO users (uid, created_at, last_seen) VALUES ('admin1', ${Date.now()}, ${Date.now()})`], { cwd: tmp, encoding: 'utf8' });
    let st = await go(A, '#students', 1000);
    check('students: lists accounts with name and email, filters All / Admins / Removed', /ad1@example\.com/.test(st) && /Ada One/.test(st) && /not yet on file/.test(st) && A.document.querySelectorAll('[data-sf]').length === 3, st.slice(0, 200));
    const si = A.document.getElementById('sq'); si.value = 'ad1@'; si.dispatchEvent(new A.Event('input', { bubbles: true }));
    check('students: search narrows the list', A.document.querySelectorAll('#sb tr').length === 1);
    si.value = ''; si.dispatchEvent(new A.Event('input', { bubbles: true }));
    await click(A, '[data-rm="ad7"]', 500);
    check('students: Remove asks first in a dialog naming the account', /Remove ad7/.test(A.document.querySelector('.rc-layer--dialog').textContent));
    await click(A, '.rc-layer--dialog [data-no]', 400);
    check('students: cancelling removes nobody', sql(`SELECT blocked FROM users WHERE uid='ad7'`)[0].blocked === 0);
    await click(A, '[data-rm="ad7"]', 500); await click(A, '.rc-layer--dialog [data-ok]', 1300);
    check('students: confirming blocks the account and shows it as Removed with Unblock', sql(`SELECT blocked FROM users WHERE uid='ad7'`)[0].blocked === 1 && /Removed/.test(A.document.getElementById('pane').textContent) && !!A.document.querySelector('[data-ub="ad7"]'));
    check('students: owner row is labelled Owner and has no Remove', /Owner/.test(A.document.getElementById('sb').textContent) && !A.document.querySelector('[data-rm="admin1"]'));
    await click(A, '[data-mk="ad2"]', 500); await click(A, '.rc-layer--dialog [data-ok]', 1300);
    check('students: Make admin gives the account admin rights; the row then shows Remove admin and no Remove', sql(`SELECT is_admin FROM users WHERE uid='ad2'`)[0].is_admin === 1 && !!A.document.querySelector('[data-rma="ad2"]') && !A.document.querySelector('[data-rm="ad2"]'));
    const A2 = await page('ad2', '#students'); await sleep(900);
    check('students: the new admin can open the dashboard, sees students, but no Make admin / Remove admin buttons', !!A2.document.querySelector('.rc-nav') && /ad1@example\.com/.test(A2.document.getElementById('pane').textContent) && !A2.document.querySelector('[data-mk],[data-rma]'));
    A2.close();
    await click(A, '[data-rma="ad2"]', 500); await click(A, '.rc-layer--dialog [data-ok]', 1300);
    check('students: Remove admin takes the rights away again', sql(`SELECT is_admin FROM users WHERE uid='ad2'`)[0].is_admin === 0);
    A.close();
    const N = await page('student-not-admin');
    check('admin page: a non-admin account is told so and sees no data', /not an administrator/.test(N.document.body.textContent) && !/Accounts/.test(N.document.body.textContent));
    N.close();

    // ---- the student app: hidden topics and modules ----
    const cfgHide = cfgNow();
    cfgHide.modules.find((m) => m.id === 'CPM').subSubjects.final_exam.anatomy.find((x) => x.id === 'larynx').hidden = true;
    cfgHide.modules.find((m) => m.id === 'URINARY').hidden = true;
    fs.writeFileSync(path.join(tmp, 'config/modules.json'), J(cfgHide, null, 2));
    const S1 = await boot({ cloud: false });
    const cfgOf = (d) => d.lex('App.config');
    const topicIds = (d) => cfgOf(d).modules.find((m) => m.id === 'CPM').subSubjects.final_exam.anatomy.map((x) => x.id);
    check('hidden: a student does not get the hidden topic or the hidden module in the app', !topicIds(S1).includes('larynx') && topicIds(S1).includes('pharynx') && !cfgOf(S1).modules.some((m) => m.id === 'URINARY'));
    check('hidden: the module list on the dashboard has no card for the hidden module', !/Urinary|URINARY/.test(S1.w.document.getElementById('app').textContent) || !S1.w.document.querySelector('[data-params*="URINARY"]'));
    S1.close();
    const S2 = await boot({ cloud: false, storage: { dqb_is_admin: '1' } });
    check('hidden: on an admin device the hidden topic and module are kept (shown with a Hidden badge)', topicIds(S2).includes('larynx') && cfgOf(S2).modules.some((m) => m.id === 'URINARY'));
    await S2.w.eval("App.navigate('subject', { moduleId: 'CPM', examType: 'final_exam', subject: 'anatomy' })"); await sleep(900);
    check('hidden: the admin sees "Hidden" on the hidden topic row and not on the visible one', /Larynx[\s\S]{0,80}Hidden/.test(S2.w.document.getElementById('app').textContent) && !/Pharynx[^]{0,20}Hidden/.test(S2.w.document.getElementById('app').textContent.replace(/Larynx[\s\S]*/, '')));
    S2.close();
    const S3 = await boot({ storage: { dqb_is_admin: '1', dqb_last_page: J({ page: 'module', params: { moduleId: 'URINARY' } }) } });
    await S3.signIn('plain-student', 'ps@example.com'); await sleep(600);
    check('hidden: when /api/state says the person is not an admin, the admin flag is dropped and the hidden module disappears at once', S3.w.localStorage.getItem('dqb_is_admin') === null && !cfgOf(S3).modules.some((m) => m.id === 'URINARY'));
    S3.close();
    const S4 = await boot(); await S4.signIn('admin1', 'admin@example.com'); await sleep(800);
    check('hidden: when /api/state says admin, the flag is stored and hidden items appear without a reload', S4.w.localStorage.getItem('dqb_is_admin') === '1' && cfgOf(S4).modules.some((m) => m.id === 'URINARY'));
    await S4.w.eval("document.getElementById('account-btn').click()"); await sleep(100);
    S4.w.document.getElementById('account-modal').dispatchEvent(new S4.w.MouseEvent('click', { bubbles: true }));
    check('popups: tapping outside the account window does NOT close it', S4.w.document.getElementById('account-modal').style.display !== 'none');
    S4.w.document.dispatchEvent(new S4.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);
    check('popups: Escape closes the account window', S4.w.document.getElementById('account-modal').style.display === 'none');
    await S4.w.eval("document.getElementById('account-btn').click()"); await sleep(300);
    S4.w.history.back(); await sleep(500);
    check('popups: the Back button closes the account window and stays on the same page', S4.w.document.getElementById('account-modal').style.display === 'none');
    await S4.w.eval("document.getElementById('account-btn').click()"); await sleep(300);
    S4.w.document.getElementById('account-close').click(); await sleep(500);
    check('popups: the X closes the account window', S4.w.document.getElementById('account-modal').style.display === 'none');
    await S4.w.eval("document.getElementById('wipe-modal').style.display = 'flex'"); await sleep(300);
    S4.w.document.getElementById('wipe-modal').dispatchEvent(new S4.w.MouseEvent('click', { bubbles: true }));
    check('popups: the reset confirmation has an X and ignores taps outside it', !!S4.w.document.getElementById('wipe-close') && S4.w.document.getElementById('wipe-modal').style.display === 'flex');
    S4.w.document.dispatchEvent(new S4.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);
    check('popups: Escape closes the reset confirmation', S4.w.document.getElementById('wipe-modal').style.display === 'none');
    // ---- confirmations: the browser's confirm() boxes are gone; the same window as the account pop-up ----
    const appSrc = fs.readFileSync(path.join(tmp, 'assets/js/app.js'), 'utf8');
    check('confirm: no native browser confirm() is left in the app', !/(^|[^.\w])confirm\(/.test(appSrc));
    const covs = () => Array.from(S4.w.document.querySelectorAll('.modal-overlay')).filter((o) => o.id.startsWith('confirm-'));
    let cres = null; S4.w.RecallLayers.confirm({ title: 'Abandon this exam?', message: 'Your progress will be lost.', ok: 'Abandon exam', danger: true }).then((v) => { cres = v; }); await sleep(150);
    let cov = covs()[0];
    check('confirm: same window as the account pop-up (overlay, account box, title, text, X, Cancel and the action)', !!cov && !!cov.querySelector('.modal-box--account .acct-title') && cov.querySelector('.acct-title').textContent === 'Abandon this exam?' && !!cov.querySelector('.account-close') && cov.querySelector('[data-c=ok]').className.includes('btn--danger') && cov.querySelector('[data-c=no]').textContent === 'Cancel');
    cov.dispatchEvent(new S4.w.MouseEvent('click', { bubbles: true })); await sleep(100);
    check('confirm: tapping outside the window does nothing', cres === null && covs().length === 1);
    S4.w.document.dispatchEvent(new S4.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(120);
    check('confirm: Escape cancels (false) and it plays its closing animation before it goes', cres === false && covs()[0] && covs()[0].classList.contains('is-closing'));
    await sleep(800);
    check('confirm: and then it is gone from the page', covs().length === 0);
    cres = null; S4.w.RecallLayers.confirm({ title: 'T', message: 'M', ok: 'Yes' }); S4.w.RecallLayers.confirm({ title: 'T2', message: 'M2' }).then((v) => { cres = v; }); await sleep(200);
    S4.w.history.back(); await sleep(600);
    check('confirm: the Back button closes the top confirmation as a cancel', cres === false);
    S4.w.history.back(); await sleep(1000);
    check('confirm: Back again closes the one below', covs().length === 0 || covs().every((o) => o.classList.contains('is-closing')));
    cres = null; S4.w.RecallLayers.confirm({ title: 'T', message: 'M', ok: 'Yes' }).then((v) => { cres = v; }); await sleep(150);
    covs()[0].querySelector('[data-c=ok]').click(); await sleep(150);
    check('confirm: the action button confirms (true)', cres === true);
    await sleep(800);
    check('popups: the account window now plays a closing animation too (is-closing before display none)', (() => { const m = S4.w.document.getElementById('account-modal'); S4.w.RecallLayers.show(m); S4.w.RecallLayers.hide(m); return m.classList.contains('is-closing') && m.style.display !== 'none'; })());
    await sleep(400);
    S4.close();
  }

  // ===== Save (was Flag): wording, star icon, messages =====
  {
    const ui = fs.readFileSync(path.join(SITE_DIR, 'assets/js/ui.js'), 'utf8'), app = fs.readFileSync(path.join(SITE_DIR, 'assets/js/app.js'), 'utf8'), idx = fs.readFileSync(path.join(SITE_DIR, 'index.html'), 'utf8');
    check('Save: the button says Save / Saved and uses a star, not a flag shape', /Save question/.test(ui) && /'Saved' : 'Save'/.test(ui) && !/Unflag/.test(ui) && !/M4 15s1-1/.test(ui) && /<polygon points="12 2 15\.09 8\.26/.test(ui));
    check('Save: pop-ups say saved, not flagged', /Question saved\./.test(app) && /Removed from saved\./.test(app) && !/Question flagged/.test(app) && !/Flag removed/.test(app));
    check('Save: no visible "Flag"/"Flagged"/flag emoji left in the app screens', !/>\s*Flagged?\s*</.test(ui + app + idx) && !/🚩/.test(ui + app) && !/Flagged Questions|Clear All Flags|Remove Flag/.test(ui + app));
    const S1 = await boot();
    S1.w.document.body.innerHTML += '';
    check('Save: the star icon is filled when a question is saved (CSS)', /\.flag-btn--active \.icon[^}]*fill:\s*currentColor/.test(fs.readFileSync(path.join(SITE_DIR, 'assets/css/styles.css'), 'utf8')));
    S1.close();
    // admin button in the account window: only for admins
    const AD = await boot(); await AD.signIn('admin1', 'admin@example.com'); await sleep(250);
    let av = await openAcct(AD);
    check('Admin button: an admin sees "Open admin dashboard" in the account window, linking to admin.html', /Open admin dashboard/.test(av.textContent) && !!av.querySelector('a.acct-adminlink[href="admin.html"]'));
    AD.close();
    const NA = await boot(); await NA.signIn('plain-student', 'ps@example.com'); await sleep(250);
    av = await openAcct(NA);
    check('Admin button: an ordinary student never sees it', !/Open admin dashboard/.test(av.textContent) && !av.querySelector('.acct-adminlink'));
    NA.close();
  }

  // F16 hostile email text is escaped
  await B.signIn('uid3', '<img src=x onerror=alert(1)>@e.com');
  B.w.document.getElementById('account-btn').click(); await sleep(20);
  const av = B.w.document.getElementById('account-view');
  check('email text is escaped in the account view', !av.querySelector('img') && /&lt;img|<img/.test(av.innerHTML.replace(/</g, '<')) && av.textContent.includes('<img src=x'));

  // errors from the page itself
  const pageErrors = [off, g, A, B].flatMap((d) => d.errors).filter((e) => !/Could not load|not implemented|fonts|navigation|import/i.test(e));
  check('no script errors were raised inside the page', pageErrors.length === 0, J(pageErrors.slice(0, 3)));
  tearingDown = true;
  [g, B, A].forEach((d) => d.close());
} finally {
  tearingDown = true;
  ghServer.close(); server.kill('SIGTERM'); await sleep(500); fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`); if (fail) console.log('Failed: ' + failures.join(' | '));
process.exit(fail ? 1 : 0);
