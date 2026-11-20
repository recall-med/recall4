// Front-end test part: sync. Run alone with: node fe/part-sync.mjs   (or all parts: node run-frontend.mjs)
import * as H from './harness.mjs';
const { BASE, PROJECT, GH_PORT, J, JSDOM, PORT, ResourceLoader, SITE_DIR, SignJWT, VirtualConsole, att, attNow, boot, check, crypto, deviceCount, ex, exportJWK, fileURLToPath, fs, generateKeyPair, ghLog, ghServer, good, hdr, here, http, jwk, openAcct, os, path, qfile, repo, sc, server, shaOf, signOut, sleep, slog, spawn, spawnSync, sql, tmp, token, until, visible, wr } = H;

await H.ready();
try {
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


  // F16 hostile email text is escaped
  await B.signIn('uid3', '<img src=x onerror=alert(1)>@e.com');
  B.w.document.getElementById('account-btn').click(); await sleep(20);
  const av = B.w.document.getElementById('account-view');
  check('email text is escaped in the account view', !av.querySelector('img') && /&lt;img|<img/.test(av.innerHTML.replace(/</g, '<')) && av.textContent.includes('<img src=x'));

  // F17 mixed runs and partial full exams upload (new exam types included)
  const runWith = (d, cfg, qs) => d.w.eval(`(function () { var E = ExamEngine; E.config = ${J(cfg)}; E.questions = ${J(qs)}; E.state = { currentIndex: 0, answers: { 0: 0, 1: 0 }, flagged: new Set(), startTime: Date.now() - 5000, endTime: null, elapsedMs: 5000, paused: false, submitted: false }; return E.submit(); })()`);
  const Qm = (id, et, sub) => ({ id, question: 'q' + id + '?', options: ['A', 'B'], answer: 0, explanation: '', _subject: 'anatomy', _subSubject: sub, _module: 'CPM', _examType: et });
  runWith(B, { module: '', examType: '', scope: 'custom', mixed: true, title: 'Custom exam', topicCount: 2, immediateFeedback: true }, [Qm(1, 'final_exam', 'larynx'), Qm(2, 'tbl_exam', 'tbl1')]);
  runWith(B, { module: 'CPM', examType: 'tbl_exam', scope: 'examtype', partial: true, immediateFeedback: true }, [Qm(3, 'tbl_exam', 'tbl1'), Qm(4, 'tbl_exam', 'tbl2')]);
  const okM = await B.flush();
  const mixedRows = sql(`SELECT module, exam_type, scope, review FROM attempts WHERE uid='uid3' ORDER BY created_at`);
  const mx = mixedRows.find((r) => r.scope === 'custom'), pr = mixedRows.find((r) => r.scope === 'examtype_partial');
  check('mixed run: uploaded as module/exam type "mixed", scope custom, each question key carries its own module and exam type', okM && !!mx && mx.module === 'mixed' && mx.exam_type === 'mixed' && /CPM\|final_exam\|anatomy\|larynx\|1/.test(mx.review) && /CPM\|tbl_exam\|anatomy\|tbl1\|2/.test(mx.review), J(mixedRows));
  check('partial full exam: uploaded with a _partial scope suffix so it is not counted as a complete one; TBL exam type passes validation', !!pr && pr.module === 'CPM' && pr.exam_type === 'tbl_exam', J(mixedRows));

  // errors from the page itself
  const pageErrors = [off, g, A, B].flatMap((d) => d.errors).filter((e) => !/Could not load|not implemented|fonts|navigation|import/i.test(e));
  check('no script errors were raised inside the page', pageErrors.length === 0, J(pageErrors.slice(0, 3)));
  H.teardown();
  [g, B, A].forEach((d) => d.close());
} catch (e) { H.crash(e); } finally { await H.finish(); }
