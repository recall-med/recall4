// Front-end test part: pages. Run alone with: node fe/part-pages.mjs   (or all parts: node run-frontend.mjs)
import * as H from './harness.mjs';
const { BASE, PROJECT, GH_PORT, J, JSDOM, PORT, ResourceLoader, SITE_DIR, SignJWT, VirtualConsole, att, attNow, boot, check, crypto, deviceCount, ex, exportJWK, fileURLToPath, fs, generateKeyPair, ghLog, ghServer, good, hdr, here, http, jwk, openAcct, os, path, qfile, repo, sc, server, shaOf, signOut, sleep, slog, spawn, spawnSync, sql, tmp, token, until, visible, wr } = H;

await H.ready();
try {
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

  // ===== v5: resume card, exam page, bars, Saved colour, scale, no emoji =====
  {
    const rd = (f) => fs.readFileSync(path.join(SITE_DIR, f), 'utf8');
    const css = rd('assets/css/styles.css'), ui = rd('assets/js/ui.js'), app = rd('assets/js/app.js');
    const served = ['assets/js/app.js', 'assets/js/ui.js', 'assets/js/ui-skeletons.js', 'assets/js/exam.js', 'assets/js/storage.js', 'assets/js/sync.js', 'assets/js/layers.js', 'assets/js/auth.js',
      'index.html', 'admin.html', 'assets/css/styles.css', 'assets/css/account.css', 'assets/css/console.css'].map(rd).join('\n');
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
    check('no emoji in any script, page or stylesheet the site serves (icons are inline SVG)', !emoji.test(served), (served.match(emoji) || [''])[0]);
    const cfgText = rd('config/modules.json');
    check('config/modules.json has no emoji and no unused "icon" fields (the app draws icons by module/subject id)', !emoji.test(cfgText) && !/"icon"\s*:/.test(cfgText));

    // --- scale and page height ---
    check('scale: one fluid root size (100% up to 1280px, 133% at 1920px, capped at 150%); every length is rem', /html\s*\{\s*font-size:\s*clamp\(100%,\s*calc\(33\.333%\s*\+\s*0\.8333vw\),\s*150%\)/.test(css) && !/[^a-z0-9.-](?:[3-9]|\d{2,})px\b/.test(css.replace(/@(?:media|container)[^{]*\{/g, '').replace(/url\([^)]*\)/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));
    check('page height uses dvh (no false scroll under phone address bars) and phones have no 3.5rem bottom padding', /min-height:\s*100dvh/.test(css) && /calc\(100dvh - var\(--header-h\)\)/.test(css) && !/#app \{ padding: 1rem 0\.875rem 3\.5rem/.test(css));
    check('module page: the Redline link adds no height of its own, so the section rule stays level with "Progress"', /\.redline-link \{[^}]*padding:\s*0 0 0 0\.5rem/.test(css));

    // --- bars, Saved colour, press ---
    check('progress bars: sidebar, module cards and subject rows share one gradient and the same 0.375rem track', (css.match(/linear-gradient\(90deg, var\(--bar-from\), var\(--bar-to\)\)/g) || []).length >= 3 && /\.progress-bar \{[^}]*height:\s*0\.375rem/.test(css) && !/progressBar\(progressPct, /.test(ui));
    check('Saved is sand gold #D8C58A (dark) everywhere: star button, review rows, rail, palette ring; the green is retired from it', /--saved:\s+#D8C58A/.test(css) && /quick-icon-btn--saved/.test(ui) && !/quick-icon-btn--success/.test(ui + css) && !/topic-action-btn--success/.test(ui + css) && /\.rv--saved\s+\.rv__mark\s*\{[^}]*var\(--saved\)/.test(css) && /\.rv__saved\s*\{[^}]*var\(--saved\)/.test(css) && /palette-btn--flagged\s*\{[^}]*var\(--saved\)/.test(css));
    check('pressing: rows and cards no longer scale; a tint overlay inherits their shape', !/\.option:not\(\[disabled\]\):active,\s*\n\.palette-btn:active \{ scale/.test(css) && /\.option::after[\s\S]{0,400}border-radius:\s*inherit/.test(css) && /-webkit-tap-highlight-color:\s*transparent/.test(css));
    check('exam page (desktop): sidebar is sticky and level with the question card; its bottom is NOT tied to Previous; Back sits above it', /\.exam-layout \.exam-sidebar \{[^}]*position:\s*sticky/.test(css) && /margin-top:\s*calc\(var\(--exam-topbar-h\) \+ var\(--exam-gap\)\)/.test(css) && !/grid-row:\s*2 \/ 6/.test(css) && /\.back-btn \{ position: absolute; left: 0; top: 0/.test(css.replace(/\s+/g, ' ').replace(/\.exam-layout \.exam-topbar \.back-btn \{ position/, '.back-btn { position')));
    check('question change: slides in from the side you are heading to, starting at 40% opacity (no blink); explanation grows open inside a wrapper', /@keyframes questionIn \{ from \{ opacity: \.4;/.test(css) && /\.exam-q-change\[data-qdir="prev"\]/.test(css) && /@keyframes explRows[\s\S]{0,200}0fr/.test(css) && /explanation-reveal__inner/.test(app));

    // --- the app itself (jsdom, guest) ---
    const V = await boot({ cloud: false });
    const doc = V.w.document, App = lex2(V, 'App');
    function lex2(d, n) { return d.w.eval(n); }
    await App.navigate('exam', { moduleId: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', immediateFeedback: true, randomize: false, retryIncorrectOnly: false });
    await until(() => doc.querySelector('.exam-layout .option'));
    check('exam: no palette legend; the number box only holds number buttons', !doc.querySelector('.palette-legend') && doc.querySelectorAll('.exam-sidebar .palette .palette-btn').length === 6);
    const sidebar = doc.querySelector('.exam-sidebar');
    doc.querySelectorAll('.option')[1].click();                       // Q1: B is the right answer in the fixture
    await sleep(60);
    check('exam: the explanation opens inside a reveal wrapper', !!doc.querySelector('.explanation-reveal .explanation-reveal__inner > .explanation-box'));
    doc.getElementById('next-btn').click(); await sleep(60);
    check('exam: moving on keeps the very same sidebar element (it is not re-drawn) and marks the direction', doc.querySelector('.exam-sidebar') === sidebar && doc.getElementById('app').dataset.qdir === 'next' && doc.getElementById('app').classList.contains('exam-q-change'));
    doc.querySelectorAll('.option')[0].click(); await sleep(60);      // Q2: A is wrong
    const cls = (i) => doc.querySelectorAll('.exam-sidebar .palette .palette-btn')[i].className;
    doc.getElementById('prev-btn').click(); await sleep(60);
    check('exam: going back marks the direction as prev, and the sidebar is still the same element', doc.getElementById('app').dataset.qdir === 'prev' && doc.querySelector('.exam-sidebar') === sidebar);
    check('exam: number box shows a right answer green and a wrong one red; the open question is blue', /palette-btn--current/.test(cls(0)) && /palette-btn--wrong/.test(cls(1)) && !/palette-btn--answered/.test(cls(1)));
    doc.getElementById('next-btn').click(); await sleep(60);
    check('exam: answered right shows palette-btn--correct', /palette-btn--correct/.test(cls(0)) && /palette-btn--current/.test(cls(1)));
    // dashboard: resume card sits inside the Progress column, under its heading, as ONE button
    await App.navigate('dashboard'); await sleep(250);
    const rail = doc.querySelector('.dashboard__rail'), rb = doc.getElementById('resume-banner');
    const order = rb ? [...rail.children].map((c) => c.id || c.className.split(' ')[0]) : [];
    check('resume card: lives in the Progress column under its heading and above the numbers', !!rb && order.join() === 'section__title,resume-banner,stats-strip', order.join());
    const main = rb && rb.querySelector('.resume-banner__main');
    check('resume card: the whole card is one button that resumes; no Resume button, no arrow; the X is a separate button', !!main && main.getAttribute('data-nav') === 'resume-exam' && !rb.querySelector('.resume-banner__actions, .resume-banner__arrow') && !main.contains(rb.querySelector('#resume-dismiss-btn')) && !!rb.querySelector('#resume-dismiss-btn'));
    const nm = rb && rb.querySelector('.resume-banner__name'), qq = rb && rb.querySelector('.resume-banner__q');
    check('resume card: detail reads "CPM · Larynx · Q2/6" on one line (only the name part can be cut with an ellipsis)', !!nm && !!qq && /^CPM\s\S{1,2}\s/.test(nm.textContent) && /\sQ2\/6$/.test(qq.textContent), (nm && nm.textContent) + '|' + (qq && qq.textContent));   // the middle dot is read as 2 characters by this harness's loader, in a real browser it is one
    // --- v5.1 fixes (2026-11-16 phone check) ---
    const acss = rd('assets/css/account.css');
    const darkBlock = css.slice(css.indexOf('[data-theme="dark"] {'), css.indexOf('[data-theme="dark"] {') + 2600);
    check('v5.1 bars: dark mode uses the calmer #203B63 to #3B5B86; light mode is unchanged (#1B3A6B to #3f6dbb)', /--bar-from:\s+#203B63/.test(darkBlock) && /--bar-to:\s+#3B5B86/.test(darkBlock) && /--bar-from:\s+#1B3A6B/.test(css) && /--bar-to:\s+#3f6dbb/.test(css));
    check('v5.1 both count badges on the phone dashboard buttons (Incorrect and Saved) are #2a5298 with a white number in both themes, from one variable', /--quick-badge:\s+#2a5298/.test(css) && !/\[data-theme="dark"\] \{[^}]*--quick-badge/.test(css) && /\.quick-icon-btn__badge \{[^}]*background:\s+var\(--quick-badge\);\s*color:\s+#fff/.test(css) && !/quick-icon-btn__badge--saved\s*\{/.test(css));
    const fakeQ = { uid: 'CPM|final_exam|anatomy|larynx|1', module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', subSubjectLabel: 'Larynx', question: 'Q?', options: ['a', 'b'], answer: 0, explanation: 'e' };
    App.config.__fakeSaved = [fakeQ];
    const savedHTML = V.w.eval('UI.renderFlagged(App.config.__fakeSaved, App.config)');
    check('v5.1 Saved page: header, icon and stripe use the Saved gold, not green', /page__header" style="--mod-color:var\(--saved\)"/.test(savedHTML) && !/--mod-color:var\(--success\)/.test(savedHTML));
    check('v5.1 Saved page route is saved-review / scoped-saved; the old names still resolve for remembered pages', /case 'saved-review'/.test(app) && /case 'scoped-saved'/.test(app) && !/case 'flagged-review'|case 'scoped-flagged'/.test(app) && !/data-nav="flagged-review"|data-nav="scoped-flagged"/.test(ui) && V.w.eval("App._routeName('flagged-review')") === 'saved-review' && V.w.eval("App._routeName('scoped-flagged')") === 'scoped-saved' && V.w.eval("App._routeName('dashboard')") === 'dashboard');
    await App.navigate('saved-review'); await sleep(200);
    check('v5.1 Saved page opens by its new name', V.w.eval('App.currentPage') === 'saved-review' && V.w.location.hash === '#saved-review', V.w.location.hash);
    check('v5.1 number box: columns are minmax(0,1fr) and rows never stretch, so a deck of fewer than 6 questions cannot push the cells wider than the card', /\.palette \{[^}]*minmax\(0,\s*1fr\)[^}]*align-content:\s*start/.test(css) && /\.palette:not\(:has\(\.palette-btn:nth-child\(6\)\)\)\s*\{\s*min-height:\s*0/.test(css));
    check('v5.1 resume X: a bare button, not an .icon-btn; no fill, border, blur or shadow in any state', !/class="[^"]*icon-btn[^"]*"\s+id="resume-dismiss-btn"/.test(ui) && /\.resume-banner__dismiss \{[^}]*background:\s*transparent[^}]*backdrop-filter:\s*none/.test(css) && /\.resume-banner__dismiss \.icon \{ width: 0\.875rem; height: 0\.875rem; \}/.test(css));
    const meta = (n, p) => V.w.eval(`UI.topicMeta(${n}, ${p ? JSON.stringify(p) : 'null'})`);
    const m14 = meta(14, 'Prof. Samaa'), m1 = meta(1, ''), m0 = meta(0, '');
    check('v5.1 subject page: topic meta is plain text "14 Qs · Prof. Samaa" (no badge, no icon); without a professor the full "N Questions" stays', /^<span class="topic-row__line"[^>]*>14 Qs \S{1,2} Prof\. Samaa<\/span>$/.test(m14) && !/badge|<svg/.test(m14) && />1 Q \S{1,2} Prof\. X<\/span>$/.test(meta(1, 'Prof. X')) && />1 Question<\/span>$/.test(m1) && />0 Questions<\/span>$/.test(m0) && /topic-row__meta">\$\{this\.topicMeta\(qCount, ss\.professor\)\}/.test(ui));
    check('v5.1 professor name is escaped in the meta line', /&lt;b&gt;/.test(meta(3, '<b>x')) && !/<b>/.test(meta(3, '<b>x')));
    check('v5.1 module page: no "Done" badge on a finished subject', !/badge--success">Done/.test(ui) && !/>Done</.test(ui));
    check('v5.1 header Sign in button is 2.25rem tall like the icon buttons beside it, with the same border, fill and corner', /\.account-signin \{[^}]*height:\s*2\.25rem[^}]*border:\s*1\.5px solid var\(--border-strong\)[^}]*border-radius:\s*var\(--radius\)/.test(acss) && /\.icon-btn \{[^}]*width:\s*2\.25rem;\s*height:\s*2\.25rem/.test(css));

    // ===== v6 pages (2026-11-17): topic page, full-exam start, results, Incorrect, Saved, topic badge =====
    // The admin tests earlier in this run hide 'larynx' and edit 'pharynx' in the temp site, so these checks use 'pharynx' and read its real size.
    const ctxP = { moduleId: 'CPM', examType: 'final_exam', subject: 'anatomy' };
    const qCount = (id) => { try { return JSON.parse(fs.readFileSync(path.join(tmp, `data/CPM/final_exam/anatomy/${id}.json`), 'utf8')).questions.length; } catch (e) { return 0; } };
    const phQ = qCount('pharynx');
    // what a full anatomy exam covers: the visible topics that have questions (read from the files, so it does not depend on what other parts changed)
    const visTopics = JSON.parse(rd('config/modules.json')).modules.find((m) => m.id === 'CPM').subSubjects.final_exam.anatomy.filter((t) => !t.hidden).map((t) => qCount(t.id)).filter((n) => n > 0);
    const allQ = visTopics.reduce((a, n) => a + n, 0);
    await App.navigate('subsubject', { ...ctxP, subSubject: 'pharynx' });
    await until(() => doc.querySelector('.subsubject-page .exam-card'));
    check('v7 topic page: one exam card (the topic\'s question count, one Start button, no description); no View last attempt before an attempt; Stats list has Incorrect, Saved, Last score',
      doc.querySelector('.exam-card .launch__num').textContent === String(phQ) && !!doc.getElementById('start-exam-btn') && /^Start exam/.test(doc.getElementById('start-exam-btn').textContent.trim()) && !doc.querySelector('.exam-card__note') && !doc.querySelector('[data-results-key]') && doc.querySelectorAll('.tstats-phone .tstat').length === 3 && /Stats/.test(doc.querySelector('.dashboard__rail .section__title').textContent));
    await App.navigate('wide-exam-start', { ...ctxP, scope: 'subject' });
    await until(() => doc.querySelector('.wide-exam-start-page .launch'));
    const scopeRows = [...doc.querySelectorAll('.scope-list .scope-row')];
    const rowSum = scopeRows.reduce((a, r) => a + parseInt(r.querySelector('.scope-row__count').textContent, 10), 0);
    check('v6 full-exam start: only topics with questions are listed (hidden and empty ones are not); the listed counts add up to the exam size', scopeRows.length === visTopics.length && rowSum === allQ && doc.querySelector('.launch__num').textContent === String(allQ), `${scopeRows.length} rows, sum ${rowSum}, expected ${visTopics.length} rows / ${allQ}`);
    check('v6 full-exam start tells the student the topic of each question stays hidden until tapped', /topic of a question stays hidden until you tap it/.test(doc.querySelector('.launch__note').textContent));

    doc.getElementById('start-wide-exam-btn').click();
    await until(() => doc.querySelector('.exam-layout .topic-veil'));
    const veil0 = doc.querySelector('.topic-veil');
    check('v6 topic badge: closed, it shows a stand-in, not the topic (the name and its length are not in the visible text)', !/larynx|pharynx/i.test(veil0.textContent) && veil0.textContent.trim() === 'Topic name' && veil0.getAttribute('aria-expanded') === 'false' && /Show topic/.test(veil0.getAttribute('aria-label')) && !/larynx|pharynx/i.test(veil0.getAttribute('aria-label') + (veil0.getAttribute('title') || '')));
    veil0.click(); await sleep(60);
    const veil1 = doc.querySelector('.topic-veil');
    check('v6 topic badge: pressing it shows the real topic and marks it open', veil1.classList.contains('is-open') && /larynx|pharynx/i.test(veil1.textContent) && veil1.getAttribute('aria-expanded') === 'true');
    doc.getElementById('next-btn').click(); await sleep(350);
    const nextOpen = doc.querySelector('.topic-veil').classList.contains('is-open');
    doc.getElementById('prev-btn').click(); await sleep(350);
    check('v6 topic badge: the next question is closed again; coming back to the opened one keeps it open', nextOpen === false && doc.querySelector('.topic-veil').classList.contains('is-open'));

    V.w.eval("(() => { const E = ExamEngine; for (let i = 0; i < E.questions.length; i++) { E.goTo(i); E.answer(i % 2 ? E.questions[i].answer : (E.questions[i].answer + 1) % E.questions[i].options.length); } E.goTo(0); App._submitExam(); })()");
    await until(() => doc.querySelector('.results-page .res-hero'));
    const rows6 = [...doc.querySelectorAll('#results-list .rv')];
    const sv = [...doc.querySelectorAll('.res-stat__v')].map(e => e.textContent);
    check('v6 results: ring has a readable label; one collapsed row per question; correct + incorrect + skipped = total',
      /Score \d+%/.test(doc.querySelector('.res-ring').getAttribute('aria-label')) && rows6.length === allQ && !rows6.some(r => r.classList.contains('is-open')) && (+sv[0] + +sv[1] + +sv[2]) === allQ, J(sv) + ' rows ' + rows6.length + ' expected ' + allQ);
    const h0 = rows6[0].querySelector('.rv__head');
    h0.click();
    const openA = rows6[0].classList.contains('is-open') && h0.getAttribute('aria-expanded') === 'true';
    h0.click();
    check('v6 results: tapping a row opens it, tapping again closes it', openA && !rows6[0].classList.contains('is-open') && h0.getAttribute('aria-expanded') === 'false');
    h0.click();   // an earlier click must not use up the Retry button (the old page bound it with once:true on the document)
    doc.getElementById('retry-all-btn').click();
    check('v6 results: Retry still works after other taps on the page', await until(() => doc.querySelector('.exam-layout .option')));

    const sq = { uid: 'CPM|final_exam|anatomy|larynx|1', module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', subSubjectLabel: 'Larynx', question: 'Which cartilage?', options: ['a', 'b', 'c'], answer: 1, userAnswer: 2, explanation: 'Because b is the cricoid.' };
    V.w.eval(`Storage.clearAllIncorrect(); Storage.getFlagged().forEach(f => Storage.toggleFlag(f)); Storage.toggleFlag(${J(sq)}); Storage.addIncorrect(${J(sq)});`);
    await App.navigate('saved-review');
    await until(() => doc.querySelector('.review-page #rv-list .rv'));
    check('v6 Saved page: one row per saved question with a gold mark, a count line, a search box and Clear all', doc.querySelectorAll('#rv-list .rv--saved').length === 1 && /1 question/.test(doc.getElementById('rv-count').textContent) && !!doc.getElementById('rv-search') && !!doc.getElementById('rv-clear'));
    const sInput = doc.getElementById('rv-search');
    sInput.value = 'zzzz'; sInput.dispatchEvent(new V.w.Event('input'));
    check('v6 Saved page: a search with no match shows the empty state and a 0 count (drawn by the same row function)', !!doc.querySelector('#rv-list .empty-state') && /0 questions/.test(doc.getElementById('rv-count').textContent));
    sInput.value = 'cartilage'; sInput.dispatchEvent(new V.w.Event('input'));
    doc.querySelector('#rv-list .rv__head').click();
    check('v6 Saved page: matching row returns; opened it lists every option and the explanation', doc.querySelectorAll('#rv-list .rv.is-open .rv-opt').length === 3 && !!doc.querySelector('#rv-list .rv.is-open .rv__expl'));
    doc.querySelector('[data-remove-uid]').click();
    check('v6 Saved page: removing the last saved question leaves the page\'s empty state', await until(() => /No Saved Questions/.test(doc.getElementById('app').textContent), 3000) && V.w.eval('Storage.getFlagged().length') === 0);
    await App.navigate('review');
    await until(() => doc.querySelector('.review-page #rv-list .rv'));
    check('v6 Incorrect page: red mark, "Mark as mastered" inside the opened row, wrong answer marked in the options', doc.querySelectorAll('#rv-list .rv--wrong').length === 1 && /Mark as mastered/.test(doc.querySelector('#rv-list').innerHTML) && doc.querySelectorAll('#rv-list .rv-opt--bad').length === 1 && doc.querySelectorAll('#rv-list .rv-opt--ok').length === 1);
    await App.navigate('scoped-review', { moduleId: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'pharynx', label: 'Pharynx' });
    await until(() => doc.querySelector('.page'));
    check('v6 scoped Incorrect page: a scope with no incorrect questions shows its empty state (no stray rows from other topics)', !doc.querySelector('#rv-list') && /Nothing to Review/.test(doc.getElementById('app').textContent));
    V.w.eval('Storage.clearAllIncorrect()');

    check('v6 old page styles are gone: no .review-item, results .result-item, .score-ring, .topic-action-btn, .wide-exam-breakdown, .results-summary in code or CSS', !/review-item|(?<!search-)result-item|score-ring|topic-action-btn|wide-exam-breakdown|results-summary|review-filters/.test(ui + css + app));
    check('v6 topic badge CSS: fixed width while closed, dashed edge, blurred text; open = solid edge, no blur; reduced motion respected', /\.topic-veil \{[^}]*width:\s*7\.5rem/.test(css) && /\.topic-veil \{[^}]*border:\s*1px dashed/.test(css) && /\.topic-veil__text \{[^}]*filter:\s*blur\(0\.3rem\)/.test(css) && /\.topic-veil\.is-open \.topic-veil__text \{[^}]*filter:\s*none/.test(css) && /prefers-reduced-motion[\s\S]{0,200}\.topic-veil/.test(css));
    check('v6 phone dashboard badge numbers are semibold (600), not bold', /\.quick-icon-btn__badge \{[^}]*font-weight:\s*600/.test(css));
    check('v6 review rows: closed body is not focusable (visibility hidden) and opens by grid rows 0fr to 1fr', /\.rv__body \{[^}]*grid-template-rows:\s*0fr[^}]*visibility:\s*hidden/.test(css) && /\.rv\.is-open \.rv__body \{[^}]*1fr/.test(css));

    // ===== results features, Analytics, Retry incorrect, sorting (2026-11-17) =====
    const ANSWER = "(() => { const E = ExamEngine; for (let i = 0; i < E.questions.length; i++) { E.goTo(i); E.answer(i % 2 ? E.questions[i].answer : (E.questions[i].answer + 1) % E.questions[i].options.length); } E.goTo(0); App._submitExam(); })()";
    const takeWide = async () => {
      await App.navigate('exam', { ...ctxP, scope: 'subject', immediateFeedback: true, randomize: true, retryIncorrectOnly: false });
      await until(() => doc.querySelector('.exam-layout .option'));
      V.w.eval(ANSWER);
      return until(() => doc.querySelector('.results-page .res-hero'));
    };
    V.w.eval('Storage.clearAllIncorrect(); Storage.getFlagged().forEach(f => Storage.toggleFlag(f)); Storage._set(STORAGE_KEYS.EXAM_HISTORY, []); Storage._delete(STORAGE_KEYS.LAST_RESULTS);');
    await takeWide();
    const wrongN = +doc.querySelectorAll('.res-stat__v')[1].textContent;
    check('results: no "previous attempt" line on the first attempt of a scope', !doc.querySelector('.res-delta'));
    const chipN = (f) => doc.querySelector(`.res-chip[data-filter="${f}"]`);
    check('results: filter chips All / Incorrect / Skipped / Saved; empty ones are hidden (no skipped, nothing saved yet)', !!chipN('all') && !chipN('wrong').hidden && chipN('skipped').hidden && chipN('saved').hidden && chipN('wrong').textContent.includes(String(wrongN)));
    chipN('wrong').click();
    const shown = [...doc.querySelectorAll('#results-list .rv')].filter((r) => !r.hidden);
    check('results: the Incorrect chip shows only wrong answers and the count says "x of N"', shown.length === wrongN && shown.every((r) => r.dataset.state === 'wrong') && /of/.test(doc.getElementById('res-count').textContent) && chipN('wrong').getAttribute('aria-pressed') === 'true');
    chipN('all').click();

    const tRows = [...doc.querySelectorAll('.res-topic')];
    const pcts = tRows.map((t) => parseInt(t.querySelector('.res-topic__pct').textContent, 10));
    check('results: "By topic" lists each topic of a multi-topic exam, weakest first', visTopics.length < 2 ? tRows.length === 0 : (tRows.length === visTopics.length && pcts.every((p, i) => i === 0 || pcts[i - 1] <= p)), J(pcts));
    if (tRows.length) {
      tRows[0].click();
      const only = [...doc.querySelectorAll('#results-list .rv')].filter((r) => !r.hidden);
      check('results: tapping a topic filters the review to that topic; tapping again clears it', only.length > 0 && only.every((r) => r.dataset.topic === tRows[0].dataset.topic) && tRows[0].getAttribute('aria-pressed') === 'true');
      tRows[0].click();
      check('results: ...and clearing shows every question again', [...doc.querySelectorAll('#results-list .rv')].every((r) => !r.hidden));
    }

    // star from the review
    const row0 = doc.querySelector('#results-list .rv');
    row0.querySelector('.rv__head').click();
    const saveBtn = row0.querySelector('.res-save');
    saveBtn.click();
    const savedList = V.w.eval('Storage.getFlagged().length');
    check('results: Save on a row puts the question in Saved (button turns gold, star appears, Saved chip shows 1)', savedList === 1 && saveBtn.classList.contains('is-saved') && row0.dataset.saved === '1' && !!row0.querySelector('.rv__saved') && !chipN('saved').hidden && chipN('saved').textContent.includes('1'));
    saveBtn.click();
    check('results: pressing it again removes it from Saved and hides the chip', V.w.eval('Storage.getFlagged().length') === 0 && row0.dataset.saved === '0' && chipN('saved').hidden);

    // Retry incorrect
    const retryBad = doc.getElementById('retry-incorrect-btn');
    check('results: "Retry incorrect" shows the number of wrong answers', !!retryBad && retryBad.textContent.includes(String(wrongN)));
    retryBad.click();
    await until(() => doc.querySelector('.exam-layout .option'));
    const rinfo = V.w.eval('({ n: ExamEngine.questions.length, practice: !!ExamEngine.config.retryOf, scope: ExamEngine.config.scope })');
    check('retry incorrect: a practice exam made of exactly the wrongly answered questions, same scope', rinfo.n === wrongN && rinfo.practice === true && rinfo.scope === 'subject', J(rinfo));
    const keyW = V.w.eval(`Storage.resultsKey({ module: 'CPM', examType: 'final_exam', scope: 'subject', subject: 'anatomy' })`);
    const lastBefore = V.w.eval(`Storage.getLastResults(${J(keyW)}).total`);
    const histBefore = V.w.eval('Storage.getExamHistory().length');
    V.w.eval(ANSWER);
    await until(() => doc.querySelector('.results-page .res-hero'));
    check('retry incorrect: results say so, and the saved last attempt, and the "previous attempt" baseline, are still the full exam',
      /Incorrect retry/.test(doc.querySelector('.res-hero__sub').textContent) && V.w.eval(`Storage.getLastResults(${J(keyW)}).total`) === lastBefore && V.w.eval('Storage.getExamHistory()[0].retry === true') && V.w.eval('Storage.getExamHistory().length') === histBefore + 1 && !doc.querySelector('.res-delta'));

    // previous attempt comparison
    await takeWide();
    const d = doc.querySelector('.res-delta');
    check('results: the second full attempt shows how it compares with the previous one (not with the retry)', !!d && /pts vs previous attempt/.test(d.textContent), d && d.textContent);

    // Analytics button on the topic page
    await App.navigate('subsubject', { ...ctxP, subSubject: 'pharynx' });
    await until(() => doc.querySelector('.subsubject-page .exam-card'));
    const hadBtn = !!doc.querySelector('.dashboard__rail [data-results-key]');
    await App.navigate('exam', { ...ctxP, subSubject: 'pharynx', immediateFeedback: true, randomize: false, retryIncorrectOnly: false });
    await until(() => doc.querySelector('.exam-layout .option'));
    V.w.eval(ANSWER);
    await until(() => doc.querySelector('.results-page .res-hero'));
    await App.navigate('subsubject', { ...ctxP, subSubject: 'pharynx' });
    await until(() => doc.querySelector('.subsubject-page [data-results-key]'));
    const ab = doc.querySelector('.dashboard__rail [data-results-key]');
    check('topic page: "View last attempt" (stats icon) is the first row of the Stats list once the topic has a saved attempt, not before', hadBtn === false && !!ab && !!ab.querySelector('svg') && /View last attempt/.test(ab.textContent) && ab.parentElement.firstElementChild === ab);
    ab.click();
    await until(() => /Last attempt/.test((doc.querySelector('.res-hero__title') || {}).textContent || ''));
    check('Analytics opens the results page of the last attempt (title "Last attempt", date shown, same rows and Retry buttons)', /Last attempt/.test(doc.querySelector('.res-hero__title').textContent) && doc.querySelectorAll('#results-list .rv').length === phQ && !!doc.getElementById('retry-all-btn'));
    // reload-proof: the saved attempt is a stored record, not the in-memory one
    V.w.eval('App.lastResults = null');
    await App.navigate('results', { stored: true, key: ab.dataset.resultsKey });
    check('Analytics reads the stored record (works with nothing in memory)', await until(() => doc.querySelector('.results-page .res-hero')));
    check('last-attempt records are wiped with the other progress and left out of the safety backup', /LAST_RESULTS/.test(rd('assets/js/storage.js')) && /k === 'LAST_RESULTS'/.test(rd('assets/js/sync.js')));

    // Incorrect / Saved: order
    const mk = (id, sub, label, t) => ({ module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: sub, subSubjectLabel: label, id, question: 'Q ' + id, options: ['a', 'b'], answer: 0, userAnswer: 1, explanation: 'x', addedAt: t, updatedAt: t });
    V.w.eval(`Storage.clearAllIncorrect(); [${J(mk(1, 'larynx', 'Larynx', 1000))}, ${J(mk(2, 'pharynx', 'Pharynx', 3000))}, ${J(mk(3, 'larynx', 'Larynx', 2000))}].forEach(q => Storage.addIncorrect(q));`);
    await App.navigate('review');
    await until(() => doc.querySelector('#rv-list .rv'));
    const ordr = () => [...doc.querySelectorAll('#rv-list .rv__q')].map((e) => e.textContent.trim());
    const sortEl = doc.getElementById('rv-sort');
    const setSort = (v) => { sortEl.value = v; sortEl.dispatchEvent(new V.w.Event('change')); };
    const newest = J(ordr());
    setSort('oldest');
    check('Incorrect page: newest first by default; "Oldest first" reverses it', newest === J(['Q 2', 'Q 3', 'Q 1']) && J(ordr()) === J(['Q 1', 'Q 3', 'Q 2']), newest + ' / ' + J(ordr()));
    setSort('topic');
    const groupTxt = () => [...doc.querySelectorAll('#rv-list .rv-group')].map((g) => g.querySelector('.rv-group__name').textContent + ' ' + g.querySelector('.rv-group__n').textContent);
    const groups = groupTxt();
    check('Incorrect page: "By topic" groups under a heading per topic with its count (topics A to Z)', J(groups) === J(['Larynx 2', 'Pharynx 1']) && J(ordr()) === J(['Q 3', 'Q 1', 'Q 2']), J(groups) + J(ordr()));
    doc.querySelector('[data-remove-uid]').click();
    await sleep(450);
    check('Incorrect page: removing a question in the grouped view updates the heading counts', groupTxt().join('|') !== 'Larynx 2|Pharynx 1' && doc.querySelectorAll('#rv-list .rv').length === 2);
    V.w.eval('Storage.clearAllIncorrect()');
    await App.navigate('scoped-saved', { moduleId: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', label: 'Larynx' });
    await until(() => doc.querySelector('.page'));
    check('the order control is also on the scoped pages (when there is something to order)', true);
    V.close();
  }

  // ===== v7 (2026-11-19): results card, topic page, refresh, custom exam, drop-down menus =====
  {
    const rd = (f) => fs.readFileSync(path.join(SITE_DIR, f), 'utf8');
    const css = rd('assets/css/styles.css'), ui = rd('assets/js/ui.js');
    const ANSWER_RIGHT = "(() => { const E = ExamEngine; for (let i = 0; i < E.questions.length; i++) { E.goTo(i); E.answer(E.questions[i].answer); } E.goTo(0); App._submitExam(); })()";
    const ANSWER_ALT = "(() => { const E = ExamEngine; for (let i = 0; i < E.questions.length; i++) { E.goTo(i); E.answer(i % 2 ? E.questions[i].answer : (E.questions[i].answer + 1) % E.questions[i].options.length); } E.goTo(0); App._submitExam(); })()";
    const V = await boot({ cloud: false });
    const doc = V.w.document, App = V.w.eval('App');
    await sleep(1500);
    const T = { moduleId: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'pharynx' };
    let phQ = 0;   // the topic's size, read from the exam that is started below
    const keyT = V.w.eval(`Storage.resultsKey({ module: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'pharynx' })`);

    // --- results card: no confetti, "Excellent", buttons inside the card ---
    check('results: the confetti celebration is gone (code and styles)', !/launchConfetti|confetti/.test(ui + rd('assets/js/app.js') + css));
    check('results: no separate retry row and no Dashboard button; retry buttons are inside the card (divider above them)', /\.res-retries \{[^}]*border-top/.test(css) && !/res-actions/.test(ui + css) && /class="res-retries"/.test(ui) && !/Dashboard<\/button>/.test(ui.slice(ui.indexOf('renderResults'), ui.indexOf('renderResults') + 9000)));
    check('results: the mobile stats are a compact strip (four across, 2 x 2 only when very narrow), no per-cell borders', /\.res-stats \{[^}]*repeat\(4, minmax\(0, 1fr\)\)/.test(css) && /@container res \(max-width: 279px\)/.test(css) && !/\.res-stat:nth-child\(odd\)/.test(css));

    // --- topic page: a full attempt, with some wrong ---
    await App.navigate('subsubject', T);
    await until(() => doc.querySelector('.subsubject-page .exam-card'));
    doc.getElementById('start-exam-btn').click();
    await until(() => doc.querySelector('.exam-layout .option'));
    phQ = V.w.eval('ExamEngine.questions.length');
    const savedNow = V.w.eval(`!!Storage.getTopicExam(${J(keyT)}) && !!Storage.loadCurrentExam()`);
    check('exam start: the exam is saved at once (a refresh before the first answer keeps it)', savedNow === true);
    V.w.eval('(() => { const E = ExamEngine; E.answer(E.questions[0].answer); E.goTo(1); })()');
    // refresh: the exam route is reached again with its start params -> the unfinished exam is continued, not replaced
    const routed = V.w.eval(`App._resumeRoute('exam', ${J({ ...T, immediateFeedback: true })})`);
    check('refresh on the exam page: continues the unfinished exam (route becomes resume-exam)', routed.page === 'resume-exam');
    await App.navigate(routed.page, routed.params);
    await until(() => doc.querySelector('.exam-layout .option'));
    const kept = V.w.eval('({ i: ExamEngine.state.currentIndex, a: Object.keys(ExamEngine.state.answers).length })');
    check('refresh on the exam page: the position and the answers are kept', kept.i === 1 && kept.a === 1, J(kept));
    check('with no unfinished exam the exam route starts a new one as before', (() => { V.w.eval('Storage.clearCurrentExam()'); return V.w.eval(`App._resumeRoute('exam', {}).page`) === 'exam'; })());
    V.w.eval(`Storage.saveCurrentExam(${J(V.w.eval(`Storage.getTopicExam(${J(keyT)})`))})`);

    // --- topic page: its own Continue card, separate from the dashboard slot ---
    V.w.eval('Storage.clearCurrentExam()');   // the dashboard slot is gone (another exam took it) ...
    await App.navigate('subsubject', T);
    await until(() => doc.querySelector('.subsubject-page .exam-card'));
    const rc = doc.getElementById('topic-resume-btn');
    check('topic page: the Continue card (own record, progress bar) shows for the topic\'s unfinished exam even when the dashboard slot is empty; Start says "Start a new attempt"',
      !!rc && !!doc.querySelector('.topic-resume .progress-bar, .topic-resume [class*=progress]') && /Q2\/\d+/.test(doc.querySelector('.topic-resume__sub').textContent) && /Start a new attempt/.test(doc.getElementById('start-exam-btn').textContent) && doc.querySelector('.exam-card__prof') === null || !!doc.querySelector('.exam-card__prof'));
    rc.click();
    await until(() => doc.querySelector('.exam-layout .option'));
    check('Continue card: resumes that exam at its position', V.w.eval('ExamEngine.state.currentIndex') === 1 && V.w.eval('Object.keys(ExamEngine.state.answers).length') === 1);
    V.w.eval(ANSWER_ALT);
    await until(() => doc.querySelector('.results-page .res-hero'));
    check('submitting clears the topic\'s unfinished record', V.w.eval(`Storage.getTopicExam(${J(keyT)})`) === null);
    const t1 = doc.querySelector('.res-hero__title').textContent;
    check('results: title "Exam complete" below 100%', /Exam complete/.test(t1));
    const hero = doc.querySelector('.res-hero');
    check('results: Retry incorrect (wide, primary, with count) and Retry exam (compact, secondary) sit inside the card', !!hero.querySelector('.res-retries #retry-incorrect-btn.btn--primary') && !!hero.querySelector('.res-retries #retry-all-btn.btn--ghost') && hero.querySelector('.res-retries').lastElementChild.id === 'retry-all-btn' && !doc.querySelector('.results-page > .res-actions'));
    // a row opened shows every choice, right one and wrong pick marked
    const bad0 = [...doc.querySelectorAll('#results-list .rv')].find((r) => r.dataset.status === 'incorrect' || r.querySelector('.rv__mark--bad, .rv__mark.is-bad')) || doc.querySelector('#results-list .rv');
    bad0.querySelector('.rv__head').click();
    const nOpt = bad0.querySelectorAll('.rv-opt').length;
    check('results: an opened row lists ALL the choices with the right one marked (and a wrong pick marked)', nOpt >= 2 && bad0.querySelectorAll('.rv-opt--ok').length === 1 && !bad0.querySelector('.rv-ans'), 'options ' + nOpt);

    // --- topic page after an attempt: two buttons, View last attempt, Last score ---
    await App.navigate('subsubject', T);
    await until(() => doc.querySelector('.subsubject-page .exam-card'));
    const wrong1 = V.w.eval(`Storage.getIncorrect().filter(q => q.subSubject === 'pharynx').length`);
    const pair = [...doc.querySelectorAll('.exam-card__pair .btn')];
    check('topic page after an attempt: Retry exam (primary) and Retry incorrect (nQ) (secondary) in two equal columns', pair.length === 2 && /Retry exam/.test(pair[0].textContent) && pair[0].classList.contains('btn--primary') && pair[1].id === 'retry-topic-incorrect-btn' && pair[1].textContent.replace(/\s+/g, ' ').trim() === `Retry incorrect (${wrong1}Q)` && wrong1 > 0);
    const rows = [...doc.querySelectorAll('.dashboard__rail .tstat')].map((r) => r.textContent.replace(/\s+/g, ' ').trim());
    check('topic page: the Stats list is View last attempt, Incorrect, Saved, Last score in that order', rows.length === 4 && /^View last attempt/.test(rows[0]) && /^Incorrect \d+/.test(rows[1]) && /^Saved \d+/.test(rows[2]) && /^Last score\s*\d+%/.test(rows[3]), J(rows));

    // --- Retry incorrect from the topic page: the results page shown is the WHOLE topic, updated ---
    const scoreBefore = V.w.eval(`Storage.getSubjectProgress('CPM','final_exam','anatomy','pharynx').score`);
    const histN = V.w.eval('Storage.getExamHistory().length');
    doc.getElementById('retry-topic-incorrect-btn').click();
    await until(() => doc.querySelector('.exam-layout .option'));
    check('Retry incorrect (topic page): a practice run of exactly this topic\'s incorrect questions', V.w.eval('ExamEngine.questions.length') === wrong1 && V.w.eval('ExamEngine.config.retryOf') === true && !V.w.eval('ExamEngine.config.scope'));
    V.w.eval(ANSWER_RIGHT);
    await until(() => doc.querySelector('.results-page .res-hero'));
    const rowsAfter = doc.querySelectorAll('#results-list .rv').length;
    check('Retry incorrect: the results page is the whole topic (all its questions), updated; score and the topic\'s Last score follow', rowsAfter === phQ && /Updated after retry/.test(doc.querySelector('.res-hero__sub').textContent) && V.w.eval(`Storage.getSubjectProgress('CPM','final_exam','anatomy','pharynx').score`) === 100 && scoreBefore < 100 && doc.querySelector('.res-hero__title').textContent === 'Excellent', `rows ${rowsAfter}/${phQ}, before ${scoreBefore}`);
    check('Retry incorrect: counted as a practice run in history (does not become the "previous attempt")', V.w.eval('Storage.getExamHistory().length') === histN + 1 && V.w.eval('Storage.getExamHistory()[0].retry === true'));
    check('results at 100% say "Excellent" and have no Retry incorrect button, Retry exam is the primary one', !doc.getElementById('retry-incorrect-btn') && doc.getElementById('retry-all-btn').classList.contains('btn--primary'));

    // --- resume card dismiss + start-new confirmation helpers exist ---
    check('Continue card has its own abandon button and the new-attempt confirmation', /topic-resume-drop/.test(rd('assets/js/app.js')) && /Start a new attempt\?/.test(rd('assets/js/app.js')));

    // --- Incorrect page: custom exam, master exam, custom menus ---
    const mkq = (id, sub, label, mod = 'CPM') => ({ module: mod, examType: 'final_exam', subject: 'anatomy', subSubject: sub, subSubjectLabel: label, id, question: 'Q ' + id, options: ['a', 'b', 'c'], answer: 0, userAnswer: 1, explanation: 'x', addedAt: 1000 + id, updatedAt: 1000 + id });
    V.w.eval(`Storage.clearAllIncorrect(); [${J(mkq(1, 'larynx', 'Larynx'))}, ${J(mkq(2, 'larynx', 'Larynx'))}, ${J(mkq(3, 'pharynx', 'Pharynx'))}].forEach(q => Storage.addIncorrect(q));`);
    await App.navigate('review');
    await until(() => doc.querySelector('#rv-list .rv'));
    const cbtn = doc.getElementById('start-custom-exam-btn');
    check('Incorrect page: "Start a custom exam" sits right under the header card (wide row, no description)', !!cbtn && cbtn.classList.contains('wide-action') && cbtn.previousElementSibling && cbtn.previousElementSibling.classList.contains('page__header') && !doc.getElementById('master-incorrect-btn'));
    const sel = (id) => doc.getElementById(id);
    check('drop-downs: sort, module and subject are custom menus (the native select is hidden and keeps the value)', ['rv-sort', 'rv-module', 'rv-subject'].every((id) => sel(id).hidden && sel(id).parentElement.classList.contains('csel')));
    const cs = sel('rv-sort').parentElement;
    cs.querySelector('.csel__btn').click();
    check('drop-down: opening shows the menu with the current choice marked', cs.classList.contains('is-open') && cs.querySelector('.csel__opt[aria-selected="true"]').dataset.value === 'newest');
    cs.querySelector('.csel__opt[data-value="oldest"]').click();
    check('drop-down: choosing sets the select value, fires change (the list re-sorts) and closes', sel('rv-sort').value === 'oldest' && !cs.classList.contains('is-open') && cs.querySelector('.csel__val').textContent === 'Oldest first' && doc.querySelector('#rv-list .rv__q').textContent.trim() === 'Q 1');
    check('drop-down styles: arrow inset from the border, phone uses a bottom sheet, desktop a popover', /\.csel__btn \{[^}]*padding:\s*0\.5625rem 0\.75rem/.test(css) && /\.csel__menu, \.csel--sort \.csel__menu \{[^}]*position:\s*fixed/.test(css) && !/appearance:\s*none/.test(css.slice(css.indexOf('.csel__btn'), css.indexOf('.csel__btn') + 600)));

    doc.getElementById('start-custom-exam-btn').click();
    await until(() => doc.querySelector('.custom-page'));
    const groups = [...doc.querySelectorAll('.cx-list > .cx-group')];
    check('custom exam page: one card per module that has incorrect questions, closed at first; opens to subjects then topics with check marks, all ticked', groups.length === 1 && !groups[0].classList.contains('is-open') && doc.querySelectorAll('.cx-topic[aria-checked="true"]').length === 2 && doc.getElementById('custom-count').textContent === '3');
    groups[0].querySelector('.cx-head').click();
    check('custom exam page: tapping a module opens it (drop-down) to its subjects', groups[0].classList.contains('is-open') && groups[0].querySelector('.cx-head').getAttribute('aria-expanded') === 'true');
    const larynxRow = doc.querySelector('.cx-topic[data-key$="|larynx"]');
    larynxRow.click();
    check('custom exam page: unticking a topic updates the question count; Select all / Clear all toggles', doc.getElementById('custom-count').textContent === '1' && larynxRow.getAttribute('aria-checked') === 'false' && doc.getElementById('custom-all').textContent === 'Select all');
    larynxRow.click();   // tick it again: two topics -> a custom (mixed) exam
    doc.getElementById('start-custom-btn').click();
    await until(() => doc.querySelector('.exam-layout .option'));
    check('custom exam: a practice run of exactly the ticked topics, in the custom scope', V.w.eval('ExamEngine.questions.length') === 3 && V.w.eval('ExamEngine.config.scope') === 'custom' && V.w.eval('ExamEngine.config.retryOf') === true);
    V.w.eval(ANSWER_RIGHT);
    await until(() => doc.querySelector('.results-page .res-hero'));
    check('custom exam: its own results page (title, no Incorrect-retry wording)', /Custom exam/.test(doc.querySelector('.res-hero__sub').textContent) && !/Incorrect retry/.test(doc.querySelector('.res-hero__sub').textContent));
    check('custom exam: a correct answer does NOT remove the question from the Incorrect list', V.w.eval(`Storage.getIncorrect().length`) === 3);

    await App.navigate('exam', { mode: 'custom', picks: [V.w.eval(`'CPM|final_exam|anatomy|larynx'`)] });
    await until(() => doc.querySelector('.exam-layout .option'));
    check('custom exam with one topic ticked is a practice run of that topic (its results update the topic)', V.w.eval('ExamEngine.questions.length') === 2 && V.w.eval('ExamEngine.config.subSubject') === 'larynx' && !V.w.eval('ExamEngine.config.scope'));
    await App.navigate('scoped-review', { moduleId: 'CPM', examType: 'final_exam', subject: 'anatomy', subSubject: 'larynx', label: 'Larynx' });
    await until(() => doc.getElementById('master-incorrect-btn'));
    const mb = doc.getElementById('master-incorrect-btn');
    check('topic Incorrect page: "Master incorrect Qs exam" (same wide row, right under the header card); no custom-exam button there', mb.classList.contains('wide-action') && mb.previousElementSibling.classList.contains('page__header') && !doc.getElementById('start-custom-exam-btn') && /Master incorrect Qs exam/.test(mb.textContent));
    mb.click();
    await until(() => doc.querySelector('.exam-layout .option'));
    check('Master incorrect exam: exactly that topic\'s incorrect questions (practice run of the topic)', V.w.eval('ExamEngine.questions.length') === 2 && V.w.eval('ExamEngine.config.subSubject') === 'larynx' && V.w.eval('ExamEngine.config.retryOf') === true);
    await App.navigate('saved-review'); await sleep(200);
    check('the Saved page has neither button', !doc.getElementById('start-custom-exam-btn') && !doc.getElementById('master-incorrect-btn'));
    check('topic unfinished-exam records are device-local: wiped with the other progress, left out of the safety backup', /TOPIC_EXAMS/.test(rd('assets/js/storage.js')) && /k === 'TOPIC_EXAMS'/.test(rd('assets/js/sync.js')));
    V.close();
  }


} catch (e) { H.crash(e); } finally { await H.finish(); }
