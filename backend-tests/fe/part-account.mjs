// Front-end test part: account. Run alone with: node fe/part-account.mjs   (or all parts: node run-frontend.mjs)
import * as H from './harness.mjs';
const { BASE, PROJECT, GH_PORT, J, JSDOM, PORT, ResourceLoader, SITE_DIR, SignJWT, VirtualConsole, att, attNow, boot, check, crypto, deviceCount, ex, exportJWK, fileURLToPath, fs, generateKeyPair, ghLog, ghServer, good, hdr, here, http, jwk, openAcct, os, path, qfile, repo, sc, server, shaOf, signOut, sleep, slog, spawn, spawnSync, sql, tmp, token, until, visible, wr } = H;

await H.ready();
try {
  // This part runs alone, so it creates the bystander account that two checks below rely on (uidP1: 3 uploaded exams)
  { const seed = await boot(); await seed.signIn('uidP1', 'p1@example.com');
    for (let i = 0; i < 3; i++) { await seed.exam('larynx', [1]); await seed.flush(); }
    check('seed: a second account with three uploaded exams exists on the server', att('uidP1').n === 3, J(att('uidP1')));
    seed.close(); }

  // ===== Account window: reset progress, delete account =====
  const wipeBtn = (d) => d.w.document.getElementById('wipe-history-btn');
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



} catch (e) { H.crash(e); } finally { await H.finish(); }
