// Front-end sync tests. Boots the real site files in jsdom (a headless DOM, not a
// real browser) against a LOCAL Worker + LOCAL D1, with a fake sign-in provider.
// Usage: put the site files next to ../functions (see SITE_DIR), then: node run-frontend.mjs
// Layout and visual appearance are NOT tested here; a real phone is still needed for that.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
// small synthetic question files (the real question bank is not needed)
function qfile(sub, n) {
  const dir = path.join(tmp, 'data/CPM/final_exam/anatomy'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, sub + '.json'), J({ questions: Array.from({ length: n }, (_, i) => ({
    id: i + 1, question: `Question ${i + 1} about ${sub}?`, options: ['A', 'B', 'C', 'D'], answer: 1, explanation: 'Because B.' })) }));
}
qfile('larynx', 6); qfile('pharynx', 4);
fs.writeFileSync(path.join(tmp, 'wrangler.toml'), 'name = "recall-fe"\npages_build_output_dir = "."\ncompatibility_date = "2026-10-24"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "recall-db"\ndatabase_id = "00000000-0000-0000-0000-000000000000"\n');
fs.writeFileSync(path.join(tmp, '.dev.vars'), `FIREBASE_PROJECT_ID=${PROJECT}\nADMIN_UIDS=admin1\nTEST_JWKS=${J({ keys: [jwk] })}\n`);
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
  g.w.document.dispatchEvent(new g.w.KeyboardEvent('keydown', { key: 'Escape' })); await sleep(20);
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
  dv.querySelector('[data-acct=reset-progress]').click(); await sleep(50);
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
  server.kill('SIGTERM'); await sleep(500); fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`); if (fail) console.log('Failed: ' + failures.join(' | '));
process.exit(fail ? 1 : 0);
