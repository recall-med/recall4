// Front-end test part: import. Run alone with: node fe/part-import.mjs   (or all parts: node run-frontend.mjs)
import * as H from './harness.mjs';
const { BASE, PROJECT, GH_PORT, J, JSDOM, PORT, ResourceLoader, SITE_DIR, SignJWT, VirtualConsole, att, attNow, boot, check, crypto, deviceCount, ex, exportJWK, fileURLToPath, fs, generateKeyPair, ghLog, ghServer, good, hdr, here, http, jwk, openAcct, os, path, qfile, repo, sc, server, shaOf, signOut, sleep, slog, spawn, spawnSync, sql, tmp, token, until, visible, wr } = H;

await H.ready();
try {
  // ===== Phase 4: guest progress import =====
  const G = (extra = {}) => ({ module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', ...extra });

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



} catch (e) { H.crash(e); } finally { await H.finish(); }
