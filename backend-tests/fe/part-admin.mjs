// Front-end test part: admin. Run alone with: node fe/part-admin.mjs   (or all parts: node run-frontend.mjs)
import * as H from './harness.mjs';
const { BASE, PROJECT, GH_PORT, J, JSDOM, PORT, ResourceLoader, SITE_DIR, SignJWT, VirtualConsole, att, attNow, boot, check, crypto, deviceCount, ex, exportJWK, fileURLToPath, fs, generateKeyPair, ghCommits, ghState, ghLog, ghServer, good, hdr, here, http, jwk, openAcct, os, path, qfile, repo, sc, server, shaOf, signOut, sleep, slog, spawn, spawnSync, sql, tmp, token, until, visible, wr } = H;

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
    const page = async (uid, hash = '', seed = null) => {
      const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: BASE + '/admin.html' + hash, runScripts: 'outside-only', pretendToBeVisual: true });
      const w = dom.window; w.fetch = (u, i) => fetch(new URL(u, BASE).href, i); w.scrollTo = () => {};
      if (seed) w.localStorage.setItem('rc_admin_draft_v1', seed);
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
    check('content: module page has the Ongoing and Visible switches, the exam type tabs and one card per subject', !!A.document.querySelector('[data-sw=mod-ongoing]') && !!A.document.querySelector('[data-sw=mod-visible]') && A.document.querySelectorAll('.exam-type-section').length === 6 && A.document.querySelectorAll('.subject-card').length === 16 && A.document.querySelectorAll('[data-act=addsingle]').length === 2 && /Module settings/.test(c));
    check('content: exam types are listed Final, End Module, TBL, Lecture Questions, then the two Last Year types (one exam each, no subject cards, no description note)', [...A.document.querySelectorAll('.exam-type-header__title')].map((x) => x.textContent).join('|') === 'Final Exam|End Module Exam|TBL Exam|Lecture Questions|Last Year Final Exam|Last Year End Module Exam' && !/extra button/.test(c));
    c = await go(A, '#content/CPM/final_exam');
    check('content: the Final Exam tab shows Anatomy with its topic count and question count', /Anatomy[\s\S]*topics?[\s\S]*questions/.test(c) && /Final Exam/.test(A.document.querySelector('.exam-type-section:first-child .exam-type-header__title').textContent));
    c = await go(A, '#content/CPM/final_exam/anatomy');
    check('content: subject page lists its topics, each with a visibility switch, a details button and its question count', A.document.querySelectorAll('.topics-list .topic-row').length >= 2 && /Pharynx/.test(c) && /4 Questions/.test(c) && /6 Questions/.test(c) && !!A.document.querySelector('[data-sw=topic]') && !!A.document.querySelector('[data-act=tdetails]') && !!A.document.querySelector('[data-act=newtopic]'), c.slice(0, 300));
    c = await go(A, '#content/CPM/final_exam/anatomy/pharynx');
    check('content: topic page lists its questions with Edit and Remove, Add a question and an Open on GitHub link', A.document.querySelectorAll('.rc-q').length === 4 && !!A.document.querySelector('[data-act=edit]') && !!A.document.querySelector('[data-act=del]') && !!A.document.querySelector('[data-add]') && !!A.document.querySelector('a[href^="https://github.com/recall-med/recall4/blob/main/data/CPM/final_exam/anatomy/"]'));
    check('content: breadcrumbs lead back up level by level', /Content/.test(A.document.getElementById('crumbs').textContent) && A.document.querySelectorAll('#crumbs a').length === 3);
    await go(A, '#content', 700);
    const cs = A.document.getElementById('cs'); cs.value = 'Question 3 about pharynx'; cs.dispatchEvent(new A.Event('input', { bubbles: true }));
    check('content: search finds a question across every topic, showing where it lives', A.document.querySelectorAll('#cres .rc-q').length === 1 && /Pharynx/.test(A.document.getElementById('cres').textContent) && A.document.getElementById('chome').hidden === true);
    cs.value = ''; cs.dispatchEvent(new A.Event('input', { bubbles: true }));

    // ---- editing is STAGED: nothing reaches GitHub until Save ----
    const location_hash = (w) => w.location.hash;
    const bar = () => A.document.getElementById('savebar');
    const barOn = () => !!bar() && !bar().hidden;
    const draftN = () => { try { return JSON.parse(A.localStorage.getItem('rc_admin_draft_v1') || '{"ops":[]}').ops.length; } catch (e) { return -1; } };
    const dr = () => A.document.querySelector('.rc-layer--drawer');
    check('save bar: hidden while there is nothing to save', !barOn() && ghCommits.length === 0);
    await go(A, '#content/CPM/final_exam/anatomy/pharynx', 700);
    await click(A, '[data-act=edit]', 700);
    check('editor: opens as a side drawer with the question, four options with a correct-answer radio, and an explanation', !!dr() && A.document.querySelectorAll('.rc-opt input[type=radio]').length === 4 && A.document.querySelectorAll('[data-o]').length === 4 && /Edit question #1/.test(dr().textContent));
    A.document.querySelector('.rc-scrim').dispatchEvent(new A.MouseEvent('click', { bubbles: true }));
    check('popups: tapping outside the drawer does NOT close it', !!dr());
    A.document.querySelector('[name=question]').value = 'Edited from the dashboard?';
    A.document.querySelector('[data-x]').click(); await sleep(200);
    check('popups: closing with unapplied edits asks first (a dialog on top of the drawer)', !!A.document.querySelector('.rc-layer--dialog') && /Discard your changes/.test(A.document.body.textContent) && !!dr());
    A.document.dispatchEvent(key(A, 'Escape')); await sleep(300);
    check('popups: Escape closes only the top layer (the dialog); the drawer stays', !A.document.querySelector('.rc-layer--dialog') && !!dr());
    A.history.back(); await sleep(400);
    check('popups: the browser Back button also asks (dialog opens again) instead of leaving the page', !!A.document.querySelector('.rc-layer--dialog') && !!dr());
    await click(A, '.rc-layer--dialog [data-no]', 500);
    check('popups: Cancel on the dialog keeps the edits', !A.document.querySelector('.rc-layer--dialog') && A.document.querySelector('[name=question]').value === 'Edited from the dashboard?');
    check('editor: the apply button says Apply edit, not Save to GitHub', /Apply edit/.test(A.document.querySelector('[data-save]').textContent));
    await click(A, '[data-save]', 700);
    check('staging: applying an edit closes the drawer, shows it as Edited on the page and makes NO commit', !dr() && /Edited from the dashboard\?/.test(A.document.getElementById('pane').textContent) && /Edited/.test(A.document.querySelector('.rc-q').textContent) && ghCommits.length === 0);
    check('save bar: appears with "Unsaved changes", the count, Review, Discard and Save', barOn() && /Unsaved changes/.test(bar().textContent) && /1 change\b/.test(bar().textContent) && !!bar().querySelector('[data-act=review]') && !!bar().querySelector('[data-act=discard]') && !!bar().querySelector('[data-act=save]'), bar() && bar().textContent);
    check('staging: the draft is kept in the browser (survives a refresh)', draftN() === 1);
    await click(A, '[data-add]', 700);
    A.document.querySelector('[name=question]').value = 'A brand new question?';
    A.document.querySelectorAll('[data-o]').forEach((i, n) => { i.value = 'Opt ' + n; }); A.document.querySelectorAll('.rc-opt input[type=radio]')[2].checked = true;
    await click(A, '[data-save]', 700);
    check('staging: a new question shows with a New badge and no id yet; the bar counts 2 changes', A.document.querySelectorAll('.rc-q').length === 5 && /A brand new question/.test(A.document.getElementById('pane').textContent) && /New/.test(A.document.querySelector('.rc-q:last-child').textContent) && /2 changes/.test(bar().textContent) && ghCommits.length === 0);
    await click(A, '.rc-q:last-child [data-act=edit]', 600);
    check('staging: a staged new question can be edited again before saving', !!dr() && A.document.querySelector('[name=question]').value === 'A brand new question?' && /Edit new question/.test(dr().textContent));
    A.document.querySelector('[name=question]').value = 'A brand new question, reworded?';
    await click(A, '[data-save]', 600);
    check('staging: re-editing a new question updates the same change (still 2)', /reworded/.test(A.document.getElementById('pane').textContent) && /2 changes/.test(bar().textContent));
    await click(A, '[data-act=del]', 500);
    check('remove: no dialog, no commit; the question stays in the list struck through with Undo', !A.document.querySelector('.rc-layer--dialog') && !!A.document.querySelector('.rc-q--del') && !!A.document.querySelector('[data-act=undel]') && /3 changes/.test(bar().textContent) && ghCommits.length === 0);
    await click(A, '[data-act=undel]', 500);
    check('remove: Undo brings the question back and the count drops', !A.document.querySelector('.rc-q--del') && /2 changes/.test(bar().textContent));
    await click(A, '[data-act=del]', 500);
    check('remove: removing again stages it once more', /3 changes/.test(bar().textContent));
    check('remove: topic page header counts the live questions only (4 on file, 1 removed, 1 added = 4)', /4 questions/.test(A.document.querySelector('.rc-badges').textContent));

    // ---- visibility, details, new topics, module settings: all staged ----
    await go(A, '#content/CPM/final_exam/anatomy', 800);
    await click(A, '[data-sw=topic]', 500);
    check('visibility: the topic switch only stages (config unchanged on disk) and shows as off', pharynx().hidden === undefined && A.document.querySelector('[data-sw=topic]').checked === false && /4 changes/.test(bar().textContent) && ghCommits.length === 0);
    check('save bar: the same bar is on every tab (Overview, Students, Retention, System)', (await go(A, '#overview', 500), barOn()) && (await go(A, '#retention', 500), barOn()) && (await go(A, '#system', 500), barOn()) && /4 changes/.test(bar().textContent));
    await go(A, '#content/CPM/final_exam/anatomy', 800);
    await click(A, '[data-act=tdetails]', 500);
    check('details: the drawer has name, professor and a visibility switch', !!dr() && A.document.querySelector('[name=label]').value === 'Pharynx' && !!A.document.querySelector('[name=professor]') && !!A.document.querySelector('[data-vis]'));
    A.document.querySelector('[name=label]').value = 'Pharynx (renamed)'; A.document.querySelector('[name=professor]').value = "Prof. D'Souza";
    A.document.querySelector('[data-vis]').click();
    await click(A, '[data-save]', 600);
    check('details: staged together with the visibility change (one change per topic); nothing written yet', pharynx().label === 'Pharynx' && !dr() && /Pharynx \(renamed\)/.test(A.document.getElementById('pane').textContent) && /4 changes/.test(bar().textContent));
    await click(A, '[data-act=newtopic]', 500);
    A.document.querySelector('[name=label]').value = '<b>x</b>';
    await click(A, '[data-save]', 500);
    check('new topic: markup in the name is refused with a plain message and nothing is staged', /cannot contain/.test(A.document.getElementById('tferr').textContent) && /4 changes/.test(bar().textContent));
    A.document.querySelector('[name=label]').value = 'Epiglottis'; A.document.querySelector('[name=professor]').value = 'Prof. Hala';
    await click(A, '[data-save]', 1500);
    const newT = () => cfgNow().modules.find((m) => m.id === 'CPM').subSubjects.final_exam.anatomy.find((x) => x.id === 'epiglottis');
    check('new topic: staged HIDDEN (not on disk, no data file yet), the page opens it, no Open-on-GitHub link', !newT() && !fs.existsSync(path.join(tmp, 'data/CPM/final_exam/anatomy/epiglottis.json')) && /Epiglottis/.test(A.document.getElementById('pane').textContent) && /Hidden from s/.test(A.document.getElementById('pane').textContent) && !A.document.querySelector('a[href*="github.com"]') && /5 changes/.test(bar().textContent));
    await click(A, '[data-add]', 600);
    A.document.querySelector('[name=question]').value = 'Epiglottis question?'; A.document.querySelectorAll('[data-o]').forEach((i, n) => { i.value = 'E' + n; });
    await click(A, '[data-save]', 600);
    check('new topic: a question can be added to a topic that is not on GitHub yet', A.document.querySelectorAll('.rc-q').length === 1 && /6 changes/.test(bar().textContent));
    c = await go(A, '#content', 900);
    check('new topic: it appears under "Waiting for approval" with a Make visible button', /Waiting for approval/.test(c) && /Epiglottis/.test(c) && !!A.document.querySelector('[data-act=publish]'));
    await click(A, '[data-act=publish]', 600);
    check('approval: Make visible is staged into the new topic (still one change for it)', !/Waiting for approval ·/.test(A.document.getElementById('pane').textContent) && /6 changes/.test(bar().textContent) && ghCommits.length === 0);
    await go(A, '#content/CPM', 800);
    await click(A, '[data-sw=mod-ongoing]', 500);
    check('module: Ongoing switch is staged; the page shows CPM as ongoing, the file still has ENDO_REPRO', cfgNow().modules.find((m) => m.id === 'ENDO_REPRO').ongoing === true && !cfgNow().modules.find((m) => m.id === 'CPM').ongoing && A.document.querySelector('[data-sw=mod-ongoing]').checked === true && /7 changes/.test(bar().textContent));
    await go(A, '#content/GIT', 800); await click(A, '[data-sw=mod-visible]', 500);
    check('module: hiding a whole module is staged without a dialog and shows in the count', !A.document.querySelector('.rc-layer--dialog') && A.document.querySelector('[data-sw=mod-visible]').checked === false && !cfgNow().modules.find((m) => m.id === 'GIT').hidden && /8 changes/.test(bar().textContent));

    // ---- refresh keeps the edits; leaving the page warns ----
    const seed = A.localStorage.getItem('rc_admin_draft_v1');
    const B = await page('admin1', '#content/CPM/final_exam/anatomy/pharynx', seed); await sleep(1200);
    check('refresh: a new page load restores the unsaved changes (bar, count, removed and new questions) and says so', !B.document.getElementById('savebar').hidden && /8 changes/.test(B.document.getElementById('savebar').textContent) && !!B.document.querySelector('.rc-q--del') && /reworded/.test(B.document.getElementById('pane').textContent) && /Restored 8 unsaved changes/.test(B.document.querySelector('.rc-toasts').textContent));
    const bu = new A.Event('beforeunload', { cancelable: true }); A.dispatchEvent(bu);
    check('leaving: closing or reloading the page with unsaved changes triggers the browser warning', bu.defaultPrevented === true);
    B.close();
    const other = await page('someone-else-not-admin'); const seedOther = other.localStorage.getItem('rc_admin_draft_v1'); other.close();
    check('refresh: another account never sees this draft (it is tied to the account)', seedOther === null);

    // ---- review, undo, discard ----
    await click(A, '[data-act=review]', 700);
    check('review: lists every change in words with an Undo each, and says nothing is on GitHub yet', A.document.querySelectorAll('.rc-chg__row').length === 8 && /Module GIT/.test(dr().textContent) && /New topic: Epiglottis/.test(dr().textContent) && /Edited question #1/.test(dr().textContent) && /Removed question #1/.test(dr().textContent) && /Nothing is on GitHub until you save/.test(dr().textContent));
    await click(A, '[data-rundo="mod:GIT"]', 400);
    check('review: Undo takes that one change out; the bar updates', A.document.querySelectorAll('.rc-chg__row').length === 7 && /7 changes/.test(bar().textContent));
    A.document.querySelector('[data-x]').click(); await sleep(400);
    await click(A, '[data-act=discard]', 500);
    check('discard: asks first in a dialog', /Discard all unsaved changes/.test(A.document.querySelector('.rc-layer--dialog').textContent));
    await click(A, '.rc-layer--dialog [data-no]', 400);
    check('discard: Cancel keeps everything', barOn() && draftN() === 7);
    await click(A, '[data-act=discard]', 500); await click(A, '.rc-layer--dialog [data-ok]', 900);
    check('discard: confirming clears the draft, hides the bar and the page shows GitHub\'s content again', !barOn() && draftN() === 0 && !/Edited from the dashboard/.test(A.document.getElementById('pane').textContent) && ghCommits.length === 0);
    const bu2 = new A.Event('beforeunload', { cancelable: true }); A.dispatchEvent(bu2);
    check('leaving: with nothing unsaved there is no warning', bu2.defaultPrevented === false);

    // ---- Save = ONE commit for the whole bundle ----
    await go(A, '#content/CPM/final_exam/anatomy/pharynx', 800);
    await click(A, '[data-act=edit]', 700); A.document.querySelector('[name=question]').value = 'Saved in a bundle?'; await click(A, '[data-save]', 600);
    await click(A, '[data-add]', 600); A.document.querySelector('[name=question]').value = 'Bundled new question?'; A.document.querySelectorAll('[data-o]').forEach((i, n) => { i.value = 'B' + n; }); await click(A, '[data-save]', 600);
    await go(A, '#content/CPM/final_exam/anatomy', 700);
    await click(A, '[data-act=newtopic]', 500); A.document.querySelector('[name=label]').value = 'Epiglottis'; A.document.querySelector('[name=professor]').value = 'Prof. Hala'; await click(A, '[data-save]', 1500);
    await click(A, '[data-add]', 600); A.document.querySelector('[name=question]').value = 'Epiglottis question?'; A.document.querySelectorAll('[data-o]').forEach((i, n) => { i.value = 'E' + n; }); await click(A, '[data-save]', 600);
    await go(A, '#content/CPM', 700); await click(A, '[data-sw=mod-ongoing]', 400);
    const nBefore = draftN();
    await click(A, '[data-act=save]', 2500);
    check('save: ONE commit holds the whole bundle (config + both topic files + the new topic file) with a summary message', ghCommits.length === 1 && nBefore === 5 && ghCommits[0].paths.includes('config/modules.json') && ghCommits[0].paths.includes('data/CPM/final_exam/anatomy/pharynx.json') && ghCommits[0].paths.includes('data/CPM/final_exam/anatomy/epiglottis.json') && /^Admin: save 5 changes/.test(ghCommits[0].message), J(ghCommits));
    const ph = J(JSON.parse(fs.readFileSync(path.join(tmp, 'data/CPM/final_exam/anatomy/pharynx.json'), 'utf8')));
    check('save: the edited question and the new one (next free id, meta count) are in the file; ids were not renumbered', /Saved in a bundle\?/.test(ph) && /Bundled new question\?/.test(ph) && JSON.parse(ph).questions.length === 5 && JSON.parse(ph).questions[4].id === 5);
    check('save: the new topic exists, hidden, with its question; CPM is now the ongoing module and ENDO_REPRO is not', newT() && newT().hidden === true && newT().professor === 'Prof. Hala' && JSON.parse(fs.readFileSync(path.join(tmp, 'data/CPM/final_exam/anatomy/epiglottis.json'), 'utf8')).questions[0].id === 1 && cfgNow().modules.find((m) => m.id === 'CPM').ongoing === true && !cfgNow().modules.find((m) => m.id === 'ENDO_REPRO').ongoing);
    check('save: the bar disappears, the draft is cleared and a toast confirms one commit', !barOn() && draftN() === 0 && /Saved 5 changes in one commit/.test(A.document.querySelector('.rc-toasts').textContent));
    await click(A, '[data-sw=mod-ongoing]', 400); await click(A, '[data-act=save]', 2000);   // CPM off again: a second, separate commit
    await go(A, '#content/CNS', 700); await click(A, '[data-sw=mod-ongoing]', 400); await click(A, '[data-act=save]', 2000);
    check('save: later saves are separate commits; switching on CNS makes it the only ongoing module', ghCommits.length === 3 && cfgNow().modules.find((m) => m.id === 'CNS').ongoing === true && !cfgNow().modules.find((m) => m.id === 'CPM').ongoing);

    // ---- conflicts and races ----
    await go(A, '#content/CPM/final_exam/anatomy/pharynx', 800);
    await click(A, '[data-act=edit]', 700); A.document.querySelector('[name=question]').value = 'My edit?'; await click(A, '[data-save]', 600);
    const pf = path.join(tmp, 'data/CPM/final_exam/anatomy/pharynx.json'), pdoc = JSON.parse(fs.readFileSync(pf, 'utf8')); pdoc.questions[0].question = 'Someone else edited it first?'; fs.writeFileSync(pf, J(pdoc, null, 2));   // another admin commits the same question
    const cN = ghCommits.length;
    await click(A, '[data-act=save]', 1800);
    check('conflict: saving over a question someone else changed is refused with a plain message, nothing is committed and the draft is kept', ghCommits.length === cN && barOn() && draftN() === 1 && /changed by someone else/.test(A.document.querySelector('.rc-toasts').textContent), A.document.querySelector('.rc-toasts').textContent);
    await click(A, '[data-act=discard]', 500); await click(A, '.rc-layer--dialog [data-ok]', 800);
    await go(A, '#content/URINARY', 700); await click(A, '[data-sw=mod-visible]', 400);
    ghState.raceOnce = true;
    await click(A, '[data-act=save]', 2500);
    check('race: if main moved while saving, the save is retried on the newer head and succeeds', ghCommits.length === cN + 1 && !barOn() && draftN() === 0);

    // ---- Last Year is ONE exam per module (no subjects or topics) ----
    const cfgM = (id) => cfgNow().modules.find((m) => m.id === id);
    const exists = (f) => fs.existsSync(path.join(tmp, f));
    await go(A, '#content/CPM', 900);
    await click(A, '[data-act=addsingle]', 1500);
    check('last year (admin): "Add" creates the one exam hidden, opens it, with no subject, topic name, professor or Details button', location_hash(A) === '#content/CPM/final_exam_last_year/exam/exam' && /Last Year Final Exam/.test(A.document.querySelector('.page__title').textContent) && !A.document.querySelector('[data-act=tdetails]') && /Hidden from s/.test(A.document.getElementById('pane').textContent) && !/Anatomy/.test(A.document.querySelector('.page__subtitle').textContent) && /1 change\b/.test(bar().textContent));
    await click(A, '[data-add]', 600); A.document.querySelector('[name=question]').value = 'Last year question?'; A.document.querySelectorAll('[data-o]').forEach((i, n) => { i.value = 'L' + n; }); await click(A, '[data-save]', 600);
    await click(A, '[data-sw=topic]', 500);
    await click(A, '[data-act=save]', 2500);
    check('last year (admin): saved as data/CPM/final_exam_last_year/exam/exam.json, visible, labelled like the exam type', exists('data/CPM/final_exam_last_year/exam/exam.json') && J(cfgM('CPM').subSubjects.final_exam_last_year.exam) === J([{ id: 'exam', label: 'Last Year Final Exam' }]), J(cfgM('CPM').subSubjects.final_exam_last_year));
    await go(A, '#content/CPM', 900);
    check('last year (admin): the module page shows the exam as one row with a switch, a remove button and no Add button for it', /Last Year Final Exam/.test(A.document.getElementById('pane').textContent) && A.document.querySelectorAll('[data-act=addsingle]').length === 1 && !!A.document.querySelector('[data-go$="final_exam_last_year/exam/exam"] [data-act=rmtopic]') && !A.document.querySelector('[data-go$="final_exam_last_year/exam/exam"] [data-act=tdetails]'));

    // ---- removing topics (and the single exam): staged, the data file is deleted in the same commit ----
    await go(A, '#content/CPM/final_exam/anatomy', 900);
    const c0 = ghCommits.length;
    await click(A, '[data-act=rmtopic][data-tk$="epiglottis"]', 600);
    check('remove topic: staged without a dialog; the row leaves the list, nothing is deleted yet', !A.document.querySelector('[data-go$="anatomy/epiglottis"]') && exists('data/CPM/final_exam/anatomy/epiglottis.json') && /1 change\b/.test(bar().textContent) && ghCommits.length === c0);
    await click(A, '[data-act=review]', 700);
    check('remove topic: Review says what will be deleted and offers Undo', /Remove topic Epiglottis/.test(dr().textContent) && /deletes 1 question and its data file/.test(dr().textContent));
    await click(A, '[data-rundo="rt:CPM|final_exam|anatomy|epiglottis"]', 500);
    check('remove topic: Undo brings the topic back', !dr() && !!A.document.querySelector('[data-go$="anatomy/epiglottis"]') && !barOn());
    await click(A, '[data-act=rmtopic][data-tk$="epiglottis"]', 600);
    await go(A, '#content/CPM', 900); await click(A, '[data-go$="final_exam_last_year/exam/exam"] [data-act=rmtopic]', 700);
    const nCommits = ghCommits.length;
    await click(A, '[data-act=save]', 2500);
    check('remove topic: ONE commit removes both config entries and deletes both data files', ghCommits.length === nCommits + 1 && ghCommits.at(-1).paths.includes('-data/CPM/final_exam/anatomy/epiglottis.json') && ghCommits.at(-1).paths.includes('-data/CPM/final_exam_last_year/exam/exam.json') && !exists('data/CPM/final_exam/anatomy/epiglottis.json') && !exists('data/CPM/final_exam_last_year/exam/exam.json') && !cfgM('CPM').subSubjects.final_exam.anatomy.some((x) => x.id === 'epiglottis') && cfgM('CPM').subSubjects.final_exam_last_year.exam.length === 0, J(ghCommits.at(-1)));
    // the last question of a topic can be removed (the topic stays, empty)
    await go(A, '#content/CPM/final_exam/anatomy', 800); await click(A, '[data-act=newtopic]', 500); A.document.querySelector('[name=label]').value = 'Solo'; await click(A, '[data-save]', 1500);
    await click(A, '[data-add]', 600); A.document.querySelector('[name=question]').value = 'Only question?'; A.document.querySelectorAll('[data-o]').forEach((i, n) => { i.value = 'S' + n; }); await click(A, '[data-save]', 600); await click(A, '[data-act=save]', 2500);
    await click(A, '[data-act=del]', 500); await click(A, '[data-act=save]', 2500);
    check('remove question: the last question of a topic can be removed (no "remove the file on GitHub" refusal); the empty topic stays', JSON.parse(fs.readFileSync(path.join(tmp, 'data/CPM/final_exam/anatomy/solo.json'), 'utf8')).questions.length === 0 && !barOn());
    await go(A, '#content/CPM/final_exam/anatomy', 800); await click(A, '[data-act=rmtopic][data-tk$="solo"]', 500); await click(A, '[data-act=save]', 2500);

    // ---- Redline Data links per exam type ----
    await go(A, '#content/CPM', 900);
    check('redline: every exam type except Last Year has a "Redline Data link" row', A.document.querySelectorAll('.rc-redline').length === 4 && /No link/.test(A.document.querySelector('.rc-redline').textContent));
    await click(A, '[data-act=redline][data-ek="CPM|final_exam"]', 600);
    A.document.querySelector('[name=url]').value = 'ftp://nope'; await click(A, '[data-save]', 400);
    check('redline: a link that is not https:// is refused with a plain message', /https:\/\//.test(A.document.getElementById('rlerr').textContent) && !!dr());
    A.document.querySelector('[name=url]').value = 'https://example.com/redline-final'; await click(A, '[data-save]', 700);
    check('redline: a valid link is staged (shown on the page, not in the config file yet)', !dr() && /redline-final/.test(A.document.querySelector('.rc-redline').textContent) && !cfgM('CPM').redlineLinks && /1 change\b/.test(bar().textContent));
    await click(A, '[data-act=redline][data-ek="CPM|final_exam"]', 600); A.document.querySelector('[name=url]').value = 'https://example.com/redline-final-2'; await click(A, '[data-save]', 700);
    check('redline: editing a staged link keeps it one change', /final-2/.test(A.document.querySelector('.rc-redline').textContent) && /1 change\b/.test(bar().textContent));
    await click(A, '[data-act=save]', 2500);
    check('redline: saved into the module config under the exam type id', cfgM('CPM').redlineLinks.final_exam === 'https://example.com/redline-final-2');
    const Sx = await boot({ cloud: false }); await Sx.w.eval("App.navigate('module', { moduleId: 'CPM' })"); await sleep(1500);
    check('redline: students get the Redline Data button for that exam type (including the new types once configured)', !!Sx.w.document.querySelector('.module-page a.redline-link[href="https://example.com/redline-final-2"]')); Sx.close();
    await click(A, '[data-act=rmredline]', 500);
    check('redline: Remove is staged and shows "No link"; saving deletes it (and the empty redlineLinks object)', /No link/.test(A.document.querySelector('.rc-redline').textContent) && /1 change\b/.test(bar().textContent));
    await click(A, '[data-act=save]', 2500);
    check('redline: removed from the config', !cfgM('CPM').redlineLinks);

    // ---- topics left over from the old Last Year structure (subject > topic) are listed for cleanup and never shown to students ----
    {
      const cL = cfgNow(), cpmL = cL.modules.find((x) => x.id === 'CPM'); cpmL.subSubjects.final_exam_last_year.anatomy = [{ id: 'xgdf', label: 'xgdf' }]; fs.writeFileSync(path.join(tmp, 'config/modules.json'), J(cL, null, 2));
      fs.mkdirSync(path.join(tmp, 'data/CPM/final_exam_last_year/anatomy'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'data/CPM/final_exam_last_year/anatomy/xgdf.json'), J({ questions: [1, 2].map((i) => ({ id: i, question: 'Old ' + i + '?', options: ['A', 'B'], answer: 0 })) }));
      const SL = await boot({ cloud: false }); await SL.w.eval("App.navigate('module', { moduleId: 'CPM' })"); await sleep(1500);
      check('last year (old structure): an old topic under a Last Year type gives students no button and no section', !SL.w.document.querySelector('.wide-exam-btn--variant') && !/Last Year/.test(SL.w.document.querySelector('.module-page').textContent)); SL.close();
      A.document.getElementById('rf').click(); await sleep(1500); await go(A, '#content/CPM', 900);
      check('last year (old structure): the admin lists it under "Old topics (not used any more)" with a Remove button, and still offers to add the new single exam', /Old topics \(not used any more\)/.test(A.document.getElementById('pane').textContent) && !!A.document.querySelector('[data-go$="final_exam_last_year/anatomy/xgdf"] [data-act=rmtopic]') && A.document.querySelectorAll('[data-act=addsingle]').length === 2);
      await click(A, '[data-go$="final_exam_last_year/anatomy/xgdf"] [data-act=rmtopic]', 600); await click(A, '[data-act=save]', 2500);
      check('last year (old structure): removing it deletes its config entry and data file', !exists('data/CPM/final_exam_last_year/anatomy/xgdf.json') && !(cfgM('CPM').subSubjects.final_exam_last_year.anatomy || []).some((x) => x.id === 'xgdf'));
    }

    // ---- keeping in step with GitHub: deleted files and removed topics ----
    await go(A, '#content/CPM/final_exam/anatomy', 800); await click(A, '[data-act=newtopic]', 500); A.document.querySelector('[name=label]').value = 'Ghost'; await click(A, '[data-save]', 1500);
    await click(A, '[data-add]', 600); A.document.querySelector('[name=question]').value = 'Ghost question?'; A.document.querySelectorAll('[data-o]').forEach((i, n) => { i.value = 'G' + n; }); await click(A, '[data-save]', 600); await click(A, '[data-act=save]', 2500);
    fs.rmSync(path.join(tmp, 'data/CPM/final_exam/anatomy/ghost.json'));   // the file is deleted on GitHub, the config still lists it
    A.document.getElementById('rf').click(); await sleep(1500);
    await go(A, '#content/CPM/final_exam/anatomy', 900);
    check('github sync: a topic whose data file was deleted on GitHub shows a "File missing" badge in the list', /File missing/.test(A.document.querySelector('[data-go$="anatomy/ghost"]').textContent));
    await go(A, '#content/CPM/final_exam/anatomy/ghost', 900);
    check('github sync: its page explains the file is not in the repository and offers Remove topic (no raw error); Add a question is disabled', /not in the repository/.test(A.document.getElementById('pane').textContent) && A.document.querySelector('[data-add]').disabled === true && !!A.document.querySelector('.rc-notice [data-act=rmtopic]'));
    await click(A, '.rc-notice [data-act=rmtopic]', 700); await click(A, '[data-act=save]', 2500);
    check('github sync: removing it cleans the config even though the file is already gone', !cfgM('CPM').subSubjects.final_exam.anatomy.some((x) => x.id === 'ghost') && !barOn());
    await go(A, '#content/CPM/final_exam/anatomy', 800); await click(A, '[data-act=newtopic]', 500); A.document.querySelector('[name=label]').value = 'Ghost2'; await click(A, '[data-save]', 1500); await click(A, '[data-act=save]', 2500);
    await go(A, '#content/CPM/final_exam/anatomy', 800); await click(A, '[data-sw=topic][data-tk$="ghost2"]', 500);
    const c2 = cfgNow(), l2 = c2.modules.find((m) => m.id === 'CPM').subSubjects.final_exam.anatomy; l2.splice(l2.findIndex((x) => x.id === 'ghost2'), 1); fs.writeFileSync(path.join(tmp, 'config/modules.json'), J(c2, null, 2)); fs.rmSync(path.join(tmp, 'data/CPM/final_exam/anatomy/ghost2.json'));   // removed on GitHub while a change to it is unsaved
    A.document.getElementById('rf').click(); await sleep(1500);
    check('github sync: an unsaved change to a topic that was removed on GitHub is dropped on refresh, with a message, instead of breaking the save', !barOn() && draftN() === 0 && /Dropped 1 unsaved change/.test(A.document.querySelector('.rc-toasts').textContent), A.document.querySelector('.rc-toasts').textContent);

    // ---- what students and admins see in the app itself ----
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
    // ---- the new exam types in the student app: order, Last Year buttons, hidden until approved ----
    {
      const cT = cfgNow(), cpmT = cT.modules.find((m) => m.id === 'CPM');
      const addT = (et, id, hidden) => {
        const single = /_last_year$/.test(et), sj = single ? 'exam' : 'anatomy'; if (single) id = 'exam';
        cpmT.subSubjects[et] = cpmT.subSubjects[et] || {}; (cpmT.subSubjects[et][sj] = cpmT.subSubjects[et][sj] || []).push({ id, label: single ? (et === 'final_exam_last_year' ? 'Last Year Final Exam' : 'Last Year End Module Exam') : id.toUpperCase(), ...(hidden ? { hidden: true } : {}) });
        fs.mkdirSync(path.join(tmp, 'data/CPM', et, sj), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'data/CPM', et, sj, id + '.json'), J({ questions: [1, 2].map((i) => ({ id: i, question: 'Q' + i + '?', options: ['A', 'B', 'C', 'D'], answer: 0, explanation: 'x' })) }));
      };
      addT('end_module', 'em1'); addT('tbl_exam', 'tbl1'); addT('lecture_questions', 'lec1'); addT('final_exam_last_year', 'fly1'); addT('end_module_last_year', 'emly1', true);
      fs.writeFileSync(path.join(tmp, 'config/modules.json'), J(cT, null, 2));
      const modPage = async (storage) => { const d = await boot({ cloud: false, storage }); await d.w.eval("App.navigate('module', { moduleId: 'CPM' })"); await sleep(1500); return d; };
      const titles = (d) => [...d.w.document.querySelectorAll('.module-page .exam-type-header__title')].map((x) => x.textContent).join('|');
      const S5 = await modPage({});
      check('exam types: the module page lists Final, End Module, TBL, Lecture Questions in that order (and no Last Year section)', titles(S5) === 'Final Exam|End Module Exam|TBL Exam|Lecture Questions', titles(S5));
      const fin = S5.w.document.querySelector('.module-page .exam-type-section'), btns = [...fin.querySelectorAll('.wide-exam-btn')];
      check('last year: a button under Start Full Final Exam, same design (same classes), only in the section it belongs to', btns.length === 2 && /Start Full Final Exam/.test(btns[0].textContent) && /Start Last Year Final Exam/.test(btns[1].textContent) && btns[1].className === btns[0].className + ' wide-exam-btn--variant' && btns[1].previousElementSibling === btns[0] && /final_exam_last_year/.test(btns[1].dataset.params) && /"subject":"exam"/.test(btns[1].dataset.params) && /Q/.test(btns[1].textContent) && /2 Q/.test(btns[1].textContent));
      check('last year: End Module has none for students while its Last Year topic is hidden (waiting for approval)', S5.w.document.querySelectorAll('.module-page .exam-type-section')[1].querySelectorAll('.wide-exam-btn').length === 1 && !/Last Year End Module/.test(S5.w.document.querySelector('.module-page').textContent));
      await S5.w.eval("document.querySelector('.wide-exam-btn--variant').click()"); await sleep(1200);
      const pg = S5.w.document.getElementById('app').textContent;
      check('last year: the button opens that one exam directly (title, module, breadcrumb, a Start button), with no subject or topic shown', /Last Year Final Exam/.test(pg) && !/Anatomy|Topic exam/.test(pg) && !!S5.w.document.querySelector('.subsubject-page [data-act=start], .subsubject-page .launch .btn--primary, .subsubject-page button.btn--primary'), pg.slice(0, 200));
      S5.close();
      const S6 = await modPage({ dqb_is_admin: '1' });
      const endBtns = [...S6.w.document.querySelectorAll('.module-page .exam-type-section')[1].querySelectorAll('.wide-exam-btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
      check('last year: an admin device sees the hidden Last Year End Module button (and the full-exam button before it)', endBtns.length === 2 && /Start Full End Module Exam/.test(endBtns[0]) && /Start Last Year End Module Exam/.test(endBtns[1]), J(endBtns));
      S6.close();
      const cU = cfgNow(), cpmU = cU.modules.find((m) => m.id === 'CPM'); delete cpmU.subSubjects.final_exam_last_year; cpmU.subSubjects.final_exam_last_year = { anatomy: [] };
      fs.writeFileSync(path.join(tmp, 'config/modules.json'), J(cU, null, 2));
      const S7 = await modPage({});
      check('last year: with no Last Year topic at all there is no button and no extra row', S7.w.document.querySelector('.module-page .exam-type-section').querySelectorAll('.wide-exam-btn').length === 1);
      S7.close();
    }
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
