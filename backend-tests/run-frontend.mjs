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

async function token(uid) {
  const n = Math.floor(Date.now() / 1000);
  return new SignJWT({ auth_time: n - 5 }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setSubject(uid)
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
    getToken: async () => token(dev.uid),
    signInGoogle: async () => {}, signInEmail: async () => {}, signUpEmail: async () => {}, resetPassword: async () => {},
    signOut: async () => { dev.uid = null; dev.cb && dev.cb(null); },
  };
  dev.w.Sync.attachAuth(dev.provider);
  dev.signIn = async (uid, email = uid + '@example.com') => { dev.uid = uid; await dev.cb({ uid, email, providerId: 'password' }); };
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
  await g.exam('larynx', [1, 1, 0]);               // guest data: 1 wrong, 2 right
  const guestHist = g.S().getExamHistory().length;
  await g.signIn('uid1', 'student@example.com');
  check('sign-in: guest progress is backed up on the device, not lost', !!g.w.localStorage.getItem('dqb_backup_guest') && guestHist === 1);
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
  check('account view: admin note says totals only; backup note present', /combined usage totals/.test(view.textContent) && /before signing in/.test(view.textContent));
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
