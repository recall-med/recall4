// Front-end test part: admin. Run alone with: node fe/part-admin.mjs   (or all parts: node run-frontend.mjs)
import * as H from './harness.mjs';
const { BASE, PROJECT, GH_PORT, J, JSDOM, PORT, ResourceLoader, SITE_DIR, SignJWT, VirtualConsole, att, attNow, boot, check, crypto, deviceCount, ex, exportJWK, fileURLToPath, fs, generateKeyPair, ghLog, ghServer, good, hdr, here, http, jwk, openAcct, os, path, qfile, repo, sc, server, shaOf, signOut, sleep, slog, spawn, spawnSync, sql, tmp, token, until, visible, wr } = H;

await H.ready();
try {
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
    const ongoingMod = cfgNow().modules.find((m) => m.ongoing);
    const cardText = ongoingMod ? A.document.querySelector('a[href="#content/' + ongoingMod.id + '"]').textContent : '';
    check('content: the module the config marks as ongoing is badged Ongoing on its card (' + (ongoingMod && ongoingMod.id) + ')', !!ongoingMod && /Ongoing/.test(cardText) && cardText.includes(ongoingMod.title), cardText.slice(0, 80));
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


} catch (e) { H.crash(e); } finally { await H.finish(); }
