/**
 * ============================================================
 * Recall — ui.js  (v3 — subject & exam-type wide exams)
 * ============================================================
 */

const UI = {

  get root() { return document.getElementById('app'); },

  // The dashboard's module cards cascade in one after another; everything else rises in as one piece.
  _STAGGER: '.modules-grid .module-card',

  // mode: 'enter' = parts rise in one after another (normal page change)
  //       'swap'  = quick fade (used for a skeleton, and for the real page replacing it)
  //       'none'  = no animation (also forced while _silent is set, for background refreshes)
  setContent(html, mode = 'enter') {
    if (this._silent) mode = 'none';
    this.root.innerHTML = html;
    this.root.classList.remove('page-enter', 'page-swap', 'exam-q-change');
    if (mode === 'none') return;
    void this.root.offsetWidth;
    if (mode === 'swap') { this.root.classList.add('page-swap'); return; }
    this.root.querySelectorAll(this._STAGGER).forEach((el, n) => el.style.setProperty('--i', Math.min(n, 4)));
    this.root.classList.add('page-enter');
  },

  toast(message, type = 'info', duration = 2800) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = `toast toast--${type}`;
    t.innerHTML = `<span class="toast__icon">${this.examIcon(type === 'success' ? 'check' : type === 'error' ? 'x' : 'info')}</span>${message}`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast--visible'));
    setTimeout(() => { t.classList.remove('toast--visible'); setTimeout(() => t.remove(), 400); }, duration);
  },

  breadcrumb(crumbs) {
    if (!crumbs || crumbs.length === 0) return '';
    const items = crumbs.map((c, i) => {
      if (i === crumbs.length - 1) return `<span class="breadcrumb__current">${c.label}</span>`;
      return `<a class="breadcrumb__link" data-nav="${c.nav}" data-params='${JSON.stringify(c.params || {})}'>${c.label}</a>`;
    });
    return `<nav class="breadcrumb" aria-label="Breadcrumb">
      <span class="breadcrumb__home"><svg class="icon icon--sm" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span>
      ${items.join('<span class="breadcrumb__sep"><svg class="icon icon--sm" viewBox="0 0 24 24" style="opacity:.5"><polyline points="9 18 15 12 9 6"/></svg></span>')}
    </nav>`;
  },

  backBtn(nav, params = {}) {
    return `<button class="btn btn--ghost btn--sm back-btn" data-nav="${nav}" data-params='${JSON.stringify(params)}'>
      <svg class="icon icon--sm" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back
    </button>`;
  },

  loading(message = 'Loading…') {
    this.setContent(`<div class="loading-screen">
      <div class="spinner"></div>
      <p class="loading-screen__text">${message}</p>
    </div>`);
  },

  emptyState(title, body, icon = this.examIcon('inbox', 'icon icon--xl')) {
    return `<div class="empty-state">
      <div class="empty-state__icon">${icon}</div>
      <h3 class="empty-state__title">${title}</h3>
      <p class="empty-state__body">${body}</p>
    </div>`;
  },

  statCard(label, value, icon, color) {
    return `<div class="stat-card" style="--accent:${color}">
      <div class="stat-card__icon">${icon}</div>
      <div class="stat-card__value">${value}</div>
      <div class="stat-card__label">${label}</div>
    </div>`;
  },

  progressBar(percent) {   // one look for every bar (colour comes from the stylesheet)
    const p = Math.min(100, Math.max(0, percent));
    return `<div class="progress-bar" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar__fill" style="width:${p}%"></div>
    </div>`;
  },

  formatStudyTime(totalSeconds) {
    const totalMinutes = Math.round((totalSeconds || 0) / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },

  // ─── Confetti (lightweight canvas celebration) ─────────────────────────────

  // ─── Resume banner ──────────────────────────────────────────────────────────

  renderResumeBanner(saved, config) {
    if (!saved || saved.state?.submitted) return '';
    const mod = config.modules.find(m => m.id === saved.config.module);
    const et  = config.examTypes.find(e => e.id === saved.config.examType);

    let setLabel;
    if (saved.config.scope === 'subject') {
      const sub = config.subjects.find(s => s.id === saved.config.subject);
      setLabel = `${sub?.label || saved.config.subject} — Full Exam`;
    } else if (saved.config.scope === 'examtype') {
      setLabel = `${et?.label || saved.config.examType} — Full Exam`;
    } else {
      const subSubs = (mod?.subSubjects && mod.subSubjects[saved.config.examType] && mod.subSubjects[saved.config.examType][saved.config.subject]) || [];
      const ss = subSubs.find(s => s.id === saved.config.subSubject);
      setLabel = ss?.label || saved.config.subSubject || 'Exam';
    }

    const currentQ = (saved.state?.currentIndex ?? 0) + 1;
    const totalQ   = (saved.questions || []).length;

    return `<div class="resume-banner" id="resume-banner">
      <button class="resume-banner__main" type="button" data-nav="resume-exam" aria-label="Continue exam, question ${currentQ} of ${totalQ}">
        <span class="resume-banner__icon">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polygon points="10,8.3 16,12 10,15.7" fill="currentColor" stroke="none"/></svg>
        </span>
        <span class="resume-banner__text">
          <span class="resume-banner__title">Continue Exam</span>
          <span class="resume-banner__subtitle"><span class="resume-banner__name">${mod?.title || saved.config.module} · ${setLabel}</span><span class="resume-banner__q"> · Q${currentQ}/${totalQ}</span></span>
        </span>
      </button>
      <button class="resume-banner__dismiss" id="resume-dismiss-btn" type="button" aria-label="Abandon exam">
        <svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
  },

  // ─── Dashboard ────────────────────────────────────────────────────────────

  renderDashboard(config, progressMap, stats, countMap = null, resumeBannerHTML = '') {
    const accuracy  = stats.totalAttempted > 0
      ? Math.round((stats.totalCorrect / stats.totalAttempted) * 100) : 0;
    const incorrect = Storage.getIncorrect();
    const flagged   = Storage.getFlagged();

    const statsHTML = [
      { label: 'Attempted',        value: stats.totalAttempted },
      { label: 'Accuracy',         value: `${accuracy}%` },
      { label: 'Study Time',       value: this.formatStudyTime(stats.totalTimeSpentSec) },
    ].map(s => `<div class="stat-pill"><div class="stat-pill__value">${s.value}</div><div class="stat-pill__label">${s.label}</div></div>`).join('');

    // Most recently studied module first; never-studied modules keep config order (stable sort).
    // A module flagged "ongoing" in config is pinned to the top. If another module was studied
    // more recently than the ongoing one AND within the last hour, that module takes the top
    // spot until the hour is up, then the ongoing module returns to first.
    const byRecency = config.modules
      .filter(mod => {
        if (!countMap) return true;
        return Object.keys(countMap).some(k => k.startsWith(mod.id + '|') && countMap[k] > 0);
      })
      .map(mod => ({ mod, act: this._moduleActivity(mod, progressMap) }))
      .sort((x, y) => y.act.ts - x.act.ts);

    const pinned = byRecency.filter(x => x.mod.ongoing);
    const others = byRecency.filter(x => !x.mod.ongoing);
    let visibleMods = byRecency;
    if (pinned.length) {
      const ONGOING_TAKEOVER_MS = 60 * 60 * 1000;
      const lead = others[0];
      const takeover = lead && lead.act.ts > pinned[0].act.ts && (Date.now() - lead.act.ts) < ONGOING_TAKEOVER_MS;
      visibleMods = takeover ? [lead, ...pinned, ...others.slice(1)] : [...pinned, ...others];
    }

    const arrowSvg = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

    const modulesHTML = visibleMods.map(({ mod, act }, i) => {
      const mp = this._calcModuleProgress(mod, config, progressMap);
      return `<div class="module-card${i === 0 ? ' module-card--hero' : ''}" data-nav="module" data-params='${JSON.stringify({ moduleId: mod.id })}' tabindex="0" role="button" aria-label="Open ${mod.title}">
        <div class="module-card__header">
          <span class="module-card__icon">${this.moduleIcon(mod.id)}</span>
          <div class="module-card__meta">
            <div class="module-card__titlerow"><h3 class="module-card__title">${mod.title}</h3>${mod.ongoing ? '<span class="badge badge--ongoing">Ongoing</span>' : ''}${mod.hidden ? '<span class="badge badge--hidden" title="Only admins see this">Hidden</span>' : ''}</div>
            <p class="module-card__subtitle">${mod.fullTitle}</p>
            <p class="module-card__activity">${act.ts ? `Studied ${this._timeAgo(act.ts)}` : 'Not started yet'}</p>
          </div>
        </div>
        <div class="module-card__progress-track">
          <div class="module-card__progress-fill" style="width:${mp.percent}%"></div>
        </div>
        <div class="module-card__row">
          <div class="module-card__stats">
            <div class="module-card__stat"><strong>${mp.setsCompleted} / ${mp.totalSets}</strong><span>Sets</span></div>
            <div class="module-card__stat"><strong>${mp.avgScore}%</strong><span>Average</span></div>
          </div>
          <span class="module-card__cta">${mp.setsCompleted > 0 ? 'Continue' : 'Start'} ${arrowSvg}</span>
        </div>
      </div>`;
    }).join('');

    const dotsHTML = visibleMods.length > 1
      ? `<div class="modules-dots" aria-hidden="true">${visibleMods.map((_, i) =>
          `<span class="modules-dots__dot${i === 0 ? ' modules-dots__dot--active' : ''}" data-dot="${i}"></span>`).join('')}</div>`
      : '';

    const reviewBtn = `<button class="quick-icon-btn quick-icon-btn--danger${incorrect.length === 0 ? ' quick-icon-btn--empty' : ''}" data-nav="review" title="Review Incorrect" aria-label="Review incorrect questions${incorrect.length > 0 ? ` (${incorrect.length})` : ''}">
          <svg class="icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
          ${incorrect.length > 0 ? `<span class="quick-icon-btn__badge">${incorrect.length}</span>` : ''}
        </button>`;

    const flaggedBtn = `<button class="quick-icon-btn quick-icon-btn--saved${flagged.length === 0 ? ' quick-icon-btn--empty' : ''}" data-nav="saved-review" title="Saved" aria-label="Saved questions${flagged.length > 0 ? ` (${flagged.length})` : ''}">
          <svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          ${flagged.length > 0 ? `<span class="quick-icon-btn__badge quick-icon-btn__badge--saved">${flagged.length}</span>` : ''}
        </button>`;

    const chevron = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
    const railAction = (nav, icon, label, n) => `<button class="rail-action" data-nav="${nav}" aria-label="Review ${label.toLowerCase()} questions (${n})">
          <span class="rail-action__label">${icon}${label}</span>
          <span class="rail-action__end"><span class="rail-action__count${n ? '' : ' rail-action__count--zero'}">${n}</span>${chevron}</span>
        </button>`;
    const incIcon  = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>';
    const flagIcon = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    const actionsHTML = railAction('review', incIcon, 'Incorrect', incorrect.length) + railAction('saved-review', flagIcon, 'Saved', flagged.length);

    return `
    <div class="dashboard">
      <div class="dashboard__intro">
        <div>
          <h1 class="dashboard__greeting">Welcome, Batch #4.</h1>
          <p class="dashboard__subgreeting">By Your Professors.</p>
        </div>
        <div class="dashboard__quickactions">
          ${reviewBtn}
          ${flaggedBtn}
        </div>
      </div>
      <aside class="dashboard__rail">
        <h2 class="section__title">Progress</h2>
        ${resumeBannerHTML}
        <div class="stats-strip">${statsHTML}${actionsHTML}</div>
      </aside>
      <section class="section">
        <h2 class="section__title">Modules</h2>
        <div class="modules-grid">${modulesHTML}</div>
        ${dotsHTML}
      </section>
      <footer class="dashboard__footer">
        <p>Made by <strong>Kareem Farouk</strong> · Questions by Department Heads</p>
        <p>Visit <a href="https://harvest-programme.web.app/index.html" target="_blank" rel="noopener noreferrer" class="harvest-link">Redline Education</a> &amp; <a href="https://znu-pulse.vercel.app" target="_blank" rel="noopener noreferrer" class="pulse-link">ZNU Pulse</a></p>
      </footer>
    </div>
    `;
  },

  // ─── Module page ──────────────────────────────────────────────────────────

  // ─── Page-scoped progress rail (PC/tablet) ────────────────────────────────
  // Same pill as the dashboard, but computed for one module / subject / topic only.
  // f = { moduleId, examType?, subject?, subSubject?, label }
  scopeStats(f) {
    const match = o => o.module === f.moduleId
      && (!f.examType   || o.examType   === f.examType)
      && (!f.subject    || o.subject    === f.subject)
      && (!f.subSubject || o.subSubject === f.subSubject);
    let attempted = 0, correct = 0, timeSec = 0;
    Storage.getExamHistory().filter(match).forEach(r => {
      attempted += (r.attempted ?? r.total) || 0;
      correct   += r.correct || 0;
      timeSec   += r.timeSec || 0;
    });
    return {
      attempted,
      accuracy:  attempted ? Math.round((correct / attempted) * 100) : 0,
      timeSec,
      incorrect: Storage.getIncorrect().filter(match).length,
      flagged:   Storage.getFlagged().filter(match).length,
    };
  },

  // The Incorrect and Saved rows of a scope (rail on tablet and up, a short list on phones)
  _reviewActions(f, st) {
    st = st || this.scopeStats(f);
    const params = { moduleId: f.moduleId, examType: f.examType, subject: f.subject, subSubject: f.subSubject, label: f.label };
    const chevron  = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
    const incIcon  = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>';
    const flagIcon = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    const action = (nav, icon, label, n) => `<button class="rail-action" data-nav="${nav}" data-params='${JSON.stringify(params)}' aria-label="Review ${label.toLowerCase()} questions (${n})">
        <span class="rail-action__label">${icon}${label}</span>
        <span class="rail-action__end"><span class="rail-action__count${n ? '' : ' rail-action__count--zero'}">${n}</span>${chevron}</span>
      </button>`;
    return action('scoped-review', incIcon, 'Incorrect', st.incorrect) + action('scoped-saved', flagIcon, 'Saved', st.flagged);
  },

  scopeRail(f, opts = {}) {
    const st   = this.scopeStats(f);
    const pill = (label, value) => `<div class="stat-pill"><div class="stat-pill__value">${value}</div><div class="stat-pill__label">${label}</div></div>`;
    const lead = (opts.lead || []).map(([l, v]) => pill(l, v)).join('');
    const rows = {
      attempted: pill('Attempted',  st.attempted),
      accuracy:  pill('Accuracy',   `${st.accuracy}%`),
      time:      pill('Study Time', this.formatStudyTime(st.timeSec)),
    };
    const stats = (opts.stats || ['attempted', 'accuracy', 'time']).map(k => rows[k]).join('');
    return `<aside class="dashboard__rail">
      <h2 class="section__title">Progress</h2>
      <div class="stats-strip">${lead}${stats}${this._reviewActions(f, st)}</div>
    </aside>`;
  },

  // Where "Back" / breadcrumb go from a (possibly partial) scoped review
  _reviewScope(filter) {
    if (!filter) return { page: 'dashboard', params: {} };
    const params = { moduleId: filter.moduleId };
    let page = 'module';
    if (filter.subject)    { params.examType = filter.examType; params.subject = filter.subject; page = 'subject'; }
    if (filter.subSubject) { params.subSubject = filter.subSubject; page = 'subsubject'; }
    return { page, params };
  },

  renderModule(mod, config, progressMap, countMap = null) {
    const arrow = '<svg class="icon icon--sm wide-exam-btn__arrow" viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

    // "Last year" exam types (variantOf = their parent) are not sections: they are one extra button under the parent's full-exam button.
    const variantsOf = id => config.examTypes.filter(v => v.variantOf === id);
    const totalFor = id => (countMap
      ? Object.entries(countMap).filter(([k]) => k.startsWith(`${mod.id}|${id}|`)).reduce((acc, [, n]) => acc + n, 0)
      : null);

    const examTypesHTML = config.examTypes.filter(et => !et.variantOf).map(et => {
      const subjectsHTML = config.subjects.filter(sub => {
        if (!countMap) return true;
        const subSubs = (mod.subSubjects && mod.subSubjects[et.id] && mod.subSubjects[et.id][sub.id]) || [];
        return subSubs.some(ss => (countMap[`${mod.id}|${et.id}|${sub.id}|${ss.id}`] || 0) > 0);
      }).map(sub => {
        const subSubs   = (mod.subSubjects && mod.subSubjects[et.id] && mod.subSubjects[et.id][sub.id]) || [];
        const completed = subSubs.filter(ss => {
          const key = `${mod.id}|${et.id}|${sub.id}|${ss.id}`;
          return progressMap[key]?.completed;
        }).length;
        const pct = subSubs.length ? Math.round((completed / subSubs.length) * 100) : 0;

        return `<div class="subject-card" data-nav="subject"
          data-params='${JSON.stringify({ moduleId: mod.id, examType: et.id, subject: sub.id })}'
          tabindex="0" role="button">
          <div class="subject-card__left">
            <span class="subject-card__icon">${this.subjectIcon(sub.id)}</span>
            <div class="subject-card__text">
              <div class="subject-card__name">${sub.label}</div>
              <div class="subject-card__score">${subSubs.length > 0 ? `${completed}/${subSubs.length} topics` : 'No topics yet'}</div>
            </div>
          </div>
          <div class="subject-card__bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <div class="subject-card__right">
            <span class="subject-card__arrow"><svg class="icon icon--sm" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
          </div>
        </div>`;
      }).join('');

      // Last-year buttons: only for a variant that has at least one visible question
      const variantBtns = variantsOf(et.id).map(v => {
        const n = totalFor(v.id);
        return n > 0
          ? `<button class="btn btn--primary wide-exam-btn wide-exam-btn--variant"
              data-nav="wide-exam-start"
              data-params='${JSON.stringify({ moduleId: mod.id, examType: v.id, scope: 'examtype' })}'>
              Start ${v.label} <span class="badge badge--count">${n} Q</span>${arrow}
            </button>`
          : '';
      }).join('');

      if (!subjectsHTML && !variantBtns) return '';

      // Total questions for this exam type
      const etTotalQ = totalFor(et.id);

      const fullExamBtn = etTotalQ > 0
        ? `<button class="btn btn--primary wide-exam-btn"
            data-nav="wide-exam-start"
            data-params='${JSON.stringify({ moduleId: mod.id, examType: et.id, scope: 'examtype' })}'>
            Start Full ${et.label} <span class="badge badge--count">${etTotalQ} Q</span>${arrow}
          </button>`
        : '';
      const actionsHTML = (fullExamBtn || variantBtns) ? `<div class="wide-exam-actions">${fullExamBtn}${variantBtns}</div>` : '';

      // Optional "Redline Data" guide link: mod.redlineLinks[examTypeId]; no link configured = no button
      const redlineUrl = (mod.redlineLinks && mod.redlineLinks[et.id]) || '';
      const redlineBtn = redlineUrl
        ? `<a class="redline-link" href="${String(redlineUrl).replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">
            <span class="redline-link__label">Redline Data</span>
            <svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>`
        : '';

      return `<div class="exam-type-section">
        <div class="exam-type-header">
          <div class="exam-type-header__top">
            <div class="exam-type-header__row">
              <div class="exam-type-header__heading">
                <h3 class="exam-type-header__title">${et.label}</h3>
                <p class="exam-type-header__desc">${et.description}</p>
              </div>
              ${redlineBtn}
            </div>
            ${actionsHTML}
          </div>
        </div>
        ${subjectsHTML ? `<div class="subjects-list">${subjectsHTML}</div>` : ''}
      </div>`;
    }).join('');

    return `
    <div class="page module-page has-rail">
      ${this.backBtn('dashboard')}
      ${this.breadcrumb([
        { label: 'Dashboard', nav: 'dashboard' },
        { label: mod.title },
      ])}
      <header class="page__header">
        <span class="page__icon">${this.moduleIcon(mod.id)}</span>
        <div>
          <h1 class="page__title">${mod.title}</h1>
          <p class="page__subtitle">${mod.fullTitle}</p>
        </div>
      </header>
      ${this.scopeRail({ moduleId: mod.id, label: mod.title })}
      <div class="page__main">${examTypesHTML}</div>
    </div>`;
  },

  // ─── Subject page — shows sub-subject cards + "Start Subject Exam" ────────

  renderSubject(mod, examType, subjectId, subSubjects, progressMap, config, countMap = null) {
    const sub = config.subjects.find(s => s.id === subjectId);
    const et  = config.examTypes.find(e => e.id === examType);
    const arrow = '<svg class="icon icon--sm wide-exam-btn__arrow" viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

    const visibleSubSubs = subSubjects.filter(ss =>
      !countMap || (countMap[`${mod.id}|${examType}|${subjectId}|${ss.id}`] || 0) > 0
    );

    const totalSubjectQ = countMap
      ? visibleSubSubs.reduce((acc, ss) => acc + (countMap[`${mod.id}|${examType}|${subjectId}|${ss.id}`] || 0), 0)
      : 0;

    const subjectExamPanel = totalSubjectQ > 0
      ? `<div class="topic-panel">
          <div class="topic-panel__primary">
            <button class="btn btn--primary btn--lg" id="start-subject-exam-btn">
              Start Full ${sub.label} Exam <span class="badge badge--count">${totalSubjectQ} Q</span>${arrow}
            </button>
          </div>
        </div>`
      : '';

    const topicRows = visibleSubSubs.map(ss => {
      const prog = progressMap[`${mod.id}|${examType}|${subjectId}|${ss.id}`] || {};
      const pct  = prog.total ? Math.round((prog.correct / prog.total) * 100) : 0;
      const pctColor = pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
      const qCount = countMap ? (countMap[`${mod.id}|${examType}|${subjectId}|${ss.id}`] || 0) : 0;

      return `<div class="topic-row" data-nav="subsubject"
        data-params='${JSON.stringify({ moduleId: mod.id, examType, subject: subjectId, subSubject: ss.id })}'
        tabindex="0" role="button">
        <div class="topic-row__left">
          <span class="topic-row__icon">${this.topicIcon()}</span>
          <div class="topic-row__text">
            <div class="topic-row__name">${ss.label}${ss.hidden ? ' <span class="badge badge--hidden" title="Only admins see this">Hidden</span>' : ''}</div>
            <div class="topic-row__meta">${this.topicMeta(qCount, ss.professor)}</div>
          </div>
        </div>
        <div class="topic-row__right">
          ${prog.completed ? `<span class="topic-row__score" style="color:${pctColor}">${pct}%</span>` : ''}
          <span class="topic-row__arrow"><svg class="icon icon--sm" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
        </div>
      </div>`;
    }).join('');

    const content = visibleSubSubs.length === 0
      ? this.emptyState('No Topics Yet', `No questions added yet for ${sub.label} in ${mod.title}.`, this.subjectIcon(sub.id, 'module-icon module-icon--lg'))
      : `${subjectExamPanel}
        <div class="page-label">Topics</div>
        <div class="topics-list">${topicRows}</div>`;

    return `
    <div class="page subject-page has-rail">
      ${this.backBtn('module', { moduleId: mod.id })}
      ${this.breadcrumb([
        { label: 'Dashboard', nav: 'dashboard' },
        { label: mod.title, nav: 'module', params: { moduleId: mod.id } },
        { label: et.label, nav: 'module', params: { moduleId: mod.id } },
        { label: sub.label },
      ])}
      <header class="page__header">
        <span class="page__icon">${this.subjectIcon(sub.id)}</span>
        <div>
          <h1 class="page__title">${sub.label}</h1>
          <p class="page__subtitle">${mod.title} · ${et.label} — Choose a topic</p>
        </div>
      </header>
      ${this.scopeRail({ moduleId: mod.id, examType, subject: subjectId, label: sub.label })}
      <div class="page__main">${content}</div>
    </div>`;
  },

  // Incorrect / Saved shortcuts for one scope, as rows. Tablet and up show them in the rail instead (see scopeRail),
  // so this block is phone-only (the stylesheet hides it from 768px).
  scopeReview(f) {
    return `<div class="scope-review"><div class="page-label page-label--wide">Review</div><div class="scope-review__rows">${this._reviewActions(f, this.scopeStats(f))}</div></div>`;
  },

  // The unfinished exam of this topic (its own record, separate from the dashboard's "Continue Exam" card)
topicResume(saved, where = 'main') {
    const total = (saved.questions || []).length;
    const answered = Object.keys(saved.state.answers || {}).length;
    const cur = (saved.state.currentIndex || 0) + 1;
    // The dashboard's resume card, with an arrow in place of the X (the whole card is the button). Drawn twice: under the
    // exam card on phones ('main') and above the Stats list in the rail from 768 px ('rail'); the stylesheet shows one.
    return `<div class="resume-banner resume-banner--topic resume-banner--${where}">
      <button class="resume-banner__main js-topic-resume" type="button" aria-label="Continue exam, question ${cur} of ${total}">
        <span class="resume-banner__icon"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polygon points="10,8.3 16,12 10,15.7" fill="currentColor" stroke="none"/></svg></span>
        <span class="resume-banner__text">
          <span class="resume-banner__title">Continue Exam</span>
          <span class="resume-banner__subtitle"><span class="resume-banner__name">Q${cur}/${total}</span><span class="resume-banner__q"> · ${answered} answered</span></span>
        </span>
        <svg class="icon icon--sm resume-banner__go" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>`;
  },

  // Stats of one topic, in this order: View last attempt (only when a stored attempt exists), Incorrect, Saved, Last score.
  // Used twice: in the rail (tablet and up) and under the exam card (phones); the stylesheet shows one of them.
  _viewLastRow(key, attempts) {
    const attrs = attempts ? `data-attempts-key="${key}" data-back='${JSON.stringify(attempts)}'` : `data-results-key="${key}"`;
    return `<button type="button" class="tstat tstat--link" ${attrs} aria-label="View last attempt">
        <span class="tstat__label">${this.examIcon('chart', 'icon icon--sm')}View last attempt</span>
        <span class="tstat__end"><svg class="icon icon--sm tstat__go" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span>
      </button>`;
  },

  // `attempts` ({ nav, params } of the page itself) turns "View last attempt" into a link to the LIST of attempts, for full
  // exams and custom exams, whose attempts can cover different topics.
  topicStats(f, st, key, hasLast, scoreText, attempts = null) {
    const params  = JSON.stringify({ moduleId: f.moduleId, examType: f.examType, subject: f.subject, subSubject: f.subSubject, label: f.label });
    const chevron = '<svg class="icon icon--sm tstat__go" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
    const star    = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    const redo    = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>';
    const link = (attrs, icon, label, n) => `<button type="button" class="tstat tstat--link" ${attrs}>
        <span class="tstat__label">${icon}${label}</span>
        <span class="tstat__end">${n === null ? '' : `<span class="tstat__n${n ? '' : ' tstat__n--zero'}">${n}</span>`}${chevron}</span>
      </button>`;
    return `<div class="tstats">
      ${hasLast ? this._viewLastRow(key, attempts) : ''}
      ${link(`data-nav="scoped-review" data-params='${params}' aria-label="Review incorrect questions (${st.incorrect})"`, redo, 'Incorrect', st.incorrect)}
      ${link(`data-nav="scoped-saved" data-params='${params}' aria-label="Review saved questions (${st.flagged})"`, star, 'Saved', st.flagged)}
      <div class="tstat tstat--plain"><span class="tstat__label">Last score</span><span class="tstat__value">${scoreText}</span></div>
    </div>`;
  },

  renderSubSubject(mod, examType, subjectId, subSubjectId, questionCount, progress, config, resume = null) {
    const sub    = config.subjects.find(s => s.id === subjectId);
    const et     = config.examTypes.find(e => e.id === examType);
    const subSubs = (mod.subSubjects && mod.subSubjects[examType] && mod.subSubjects[examType][subjectId]) || [];
    const ss     = subSubs.find(s => s.id === subSubjectId) || { label: subSubjectId };
    const pct    = progress && progress.total ? Math.round((progress.correct / progress.total) * 100) : 0;
    const noQ    = questionCount === 0;
    const f      = { moduleId: mod.id, examType, subject: subjectId, subSubject: subSubjectId, label: ss.label };
    const key    = Storage.resultsKey({ module: mod.id, examType, subject: subjectId, subSubject: subSubjectId });
    const st     = this.scopeStats(f);
    const hasLast = !!Storage.getLastResults(key);
    const stats  = this.topicStats(f, st, key, hasLast, progress ? `${pct}%` : '—');

    // Buttons: first visit "Start exam" ("Start a new attempt" while an unfinished one is waiting); after an attempt
    // "Retry exam" with, when there are any, "Retry incorrect (nQ)" beside it
    let actions;
    if (progress) {
      actions = st.incorrect > 0
        ? `<div class="exam-card__pair"><button class="btn btn--primary btn--lg" id="start-exam-btn">Retry exam</button><button class="btn btn--ghost btn--lg res-retry" id="retry-topic-incorrect-btn">Retry incorrect<span class="res-retry__n">${st.incorrect}</span></button></div>`
        : `<button class="btn btn--primary btn--lg exam-card__start" id="start-exam-btn">Retry exam</button>`;
    } else {
      actions = `<button class="btn btn--primary btn--lg exam-card__start" id="start-exam-btn">${resume ? 'Start a new attempt' : 'Start exam'}${this.examIcon('arrow', 'icon icon--sm launch__arrow')}</button>`;
    }

    const examCard = `<section class="exam-card">
        <div class="exam-card__top">
          <div class="exam-card__body">
            <p class="launch__eyebrow">Topic exam</p>
            <p class="launch__count"><span class="launch__num">${questionCount}</span><span class="launch__unit">${questionCount === 1 ? 'question' : 'questions'}</span></p>
          </div>
          ${ss.professor ? `<div class="exam-card__prof">${this.professorBadge(ss.professor)}</div>` : ''}
        </div>
        <div class="exam-card__actions">${actions}</div>
      </section>`;

    return `
    <div class="page subsubject-page has-rail">
      ${this.backBtn('subject', { moduleId: mod.id, examType, subject: subjectId })}
      ${this.breadcrumb([
        { label: 'Dashboard', nav: 'dashboard' },
        { label: mod.title, nav: 'module', params: { moduleId: mod.id } },
        { label: et.label, nav: 'module', params: { moduleId: mod.id } },
        { label: sub.label, nav: 'subject', params: { moduleId: mod.id, examType, subject: subjectId } },
        { label: ss.label },
      ])}
      <header class="page__header">
        <span class="page__icon">${this.subjectIcon(subjectId)}</span>
        <div>
          <h1 class="page__title">${ss.label}</h1>
          <p class="page__subtitle">${mod.title} · ${sub.label} · ${et.label}</p>
          ${ss.hidden ? `<div class="page__badges"><span class="badge badge--hidden" title="Only admins see this">Hidden</span></div>` : ''}
        </div>
      </header>
      <aside class="dashboard__rail"><h2 class="section__title">Stats</h2>${resume ? this.topicResume(resume, 'rail') : ''}${stats}</aside>
      <div class="page__main">
      ${noQ
        ? this.emptyState(
            'No Questions Yet',
            `Add questions to <code>data/${mod.dataPath}/${examType}/${subjectId}/${subSubjectId}.json</code> in your repo.`,
            this.subjectIcon(subjectId, 'module-icon module-icon--lg')
          )
        : `<div class="page-label page-label--wide topic-exam-label">Exam</div>${resume ? this.topicResume(resume, 'main') : ''}${examCard}
           <div class="tstats-phone"><div class="page-label page-label--wide">Stats</div>${stats}</div>`
      }
      </div>
    </div>`;
  },

  // ─── Full-exam start page (every topic of a subject, or every subject of an exam type) ──

  renderWideExamStart(mod, params, totalCount, config, countMap = null) {
    const et  = config.examTypes.find(e => e.id === params.examType);
    const isSubjectScope = params.scope === 'subject';
    const sub = isSubjectScope ? config.subjects.find(s => s.id === params.subject) : null;

    const icon     = isSubjectScope ? this.subjectIcon(sub.id) : this.moduleIcon(mod.id);
    const title    = isSubjectScope ? `${sub.label} — Full Exam` : `${et.label} — Full Exam`;
    const subtitle = isSubjectScope
      ? `${mod.title} · ${et.label} · All ${sub.label} Topics`
      : `${mod.title} · All Subjects`;

    const backNav    = isSubjectScope ? 'subject' : 'module';
    const backParams = isSubjectScope
      ? { moduleId: mod.id, examType: params.examType, subject: params.subject }
      : { moduleId: mod.id };

    const noQ = totalCount === 0;

    // What the exam covers, as check marks (all on at first; the student can leave topics out). A topic with no questions
    // is not listed (the exam skips it too). A full-module exam lists subjects that open to their topics.
    const qOf = (sid, ssId) => countMap ? (countMap[`${mod.id}|${params.examType}|${sid}|${ssId}`] || 0) : 0;
    const tick = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
    const chev = '<svg class="icon icon--sm cx-head__chev" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    const topicRow = (sid, ss) => `<button type="button" class="cx-topic" role="checkbox" aria-checked="true" data-key="${sid}|${ss.id}" data-n="${qOf(sid, ss.id)}">
        <span class="cx-topic__box">${tick}</span><span class="cx-topic__name">${ss.label}</span><span class="cx-topic__n">${qOf(sid, ss.id)}</span>
      </button>`;
    let pickHTML;
    if (isSubjectScope) {
      const list = ((mod.subSubjects?.[params.examType]?.[params.subject]) || []).filter(ss => qOf(sub.id, ss.id) > 0);
      pickHTML = `<div class="cx-group" data-cx-group><div class="cx-flat">${list.map(ss => topicRow(sub.id, ss)).join('')}</div></div>`;
    } else {
      pickHTML = config.subjects.map(sj => {
        const list = ((mod.subSubjects?.[params.examType]?.[sj.id]) || []).filter(ss => qOf(sj.id, ss.id) > 0);
        if (list.length === 0) return '';
        const total = list.reduce((a, ss) => a + qOf(sj.id, ss.id), 0);
        return `<div class="cx-group" data-cx-group>
          <button type="button" class="cx-head" aria-expanded="false"><span class="cx-head__icon">${this.subjectIcon(sj.id, 'module-icon')}</span><span class="cx-head__text"><span class="cx-head__name">${sj.label}</span><span class="cx-head__meta">${list.length} ${list.length === 1 ? 'topic' : 'topics'}</span></span><span class="cx-head__n">${total}</span>${chev}</button>
          <div class="cx-body"><div class="cx-inner">${list.map(ss => topicRow(sj.id, ss)).join('')}</div></div>
        </div>`;
      }).join('');
    }

    const railFilter = isSubjectScope
      ? { moduleId: mod.id, examType: params.examType, subject: params.subject, label: sub.label }
      : { moduleId: mod.id, examType: params.examType, label: et.label };

    // Same pieces as the topic page: Stats list and exam card (the card is tighter here, and has no description)
    const key = Storage.resultsKey({ module: mod.id, examType: params.examType, scope: params.scope, subject: isSubjectScope ? params.subject : '' });
    const rec = Storage.getLastResults(key);
    const st  = this.scopeStats(railFilter);
    const stats = this.topicStats(railFilter, st, key, !!rec, rec ? `${rec.score}%` : '—', { nav: 'wide-exam-start', params });
    const actions = rec
      ? (st.incorrect > 0
          ? `<div class="exam-card__pair"><button class="btn btn--primary btn--lg" id="start-wide-exam-btn">Retry exam</button><button class="btn btn--ghost btn--lg res-retry" id="retry-wide-incorrect-btn">Retry incorrect<span class="res-retry__n">${st.incorrect}</span></button></div>`
          : `<button class="btn btn--primary btn--lg exam-card__start" id="start-wide-exam-btn">Retry exam</button>`)
      : `<button class="btn btn--primary btn--lg exam-card__start" id="start-wide-exam-btn">Start exam${this.examIcon('arrow', 'icon icon--sm launch__arrow')}</button>`;
    const examCard = `<section class="exam-card exam-card--compact">
        <div class="exam-card__top">
          <div class="exam-card__body">
            <p class="launch__eyebrow">${isSubjectScope ? 'Subject exam' : 'Module exam'}</p>
            <p class="launch__count"><span class="launch__num" id="wide-count">${totalCount}</span><span class="launch__unit" id="wide-unit">${totalCount === 1 ? 'question' : 'questions'}</span></p>
          </div>
        </div>
        <div class="exam-card__actions">${actions}</div>
      </section>`;

    return `
    <div class="page wide-exam-start-page has-rail">
      ${this.backBtn(backNav, backParams)}
      ${this.breadcrumb([
        { label: 'Dashboard', nav: 'dashboard' },
        { label: mod.title, nav: 'module', params: { moduleId: mod.id } },
        ...(isSubjectScope ? [
          { label: et.label, nav: 'module', params: { moduleId: mod.id } },
          { label: sub.label, nav: 'subject', params: { moduleId: mod.id, examType: params.examType, subject: params.subject } },
        ] : [
          { label: et.label, nav: 'module', params: { moduleId: mod.id } },
        ]),
        { label: 'Full Exam' },
      ])}
      <header class="page__header">
        <span class="page__icon">${icon}</span>
        <div>
          <h1 class="page__title">${title}</h1>
          <p class="page__subtitle">${subtitle}</p>
        </div>
      </header>
      <aside class="dashboard__rail"><h2 class="section__title">Stats</h2>${stats}</aside>
      <div class="page__main">
      ${noQ
        ? this.emptyState('No Questions Available', 'No questions have been added to this section yet.', icon.replace('module-icon', 'module-icon module-icon--lg'))
        : `<div class="page-label page-label--wide topic-exam-label">Exam</div>${examCard}
           <div class="tstats-phone"><div class="page-label page-label--wide">Stats</div>${stats}</div>
           ${pickHTML ? `<div class="page-label page-label--wide res-review-title"><span>${isSubjectScope ? 'Topics covered' : 'Subjects covered'}</span><button type="button" class="cx-all" id="wide-all">Clear all</button></div><div class="cx-list wide-pick">${pickHTML}</div>` : ''}`
      }
      </div>
    </div>`;
  },

  // ─── Exam interface ───────────────────────────────────────────────────────

  // Inline SVG glyphs for exam chrome (no emoji in UI chrome — see DESIGN_STANDARDS §1/§4)
  examIcon(name, cls = 'icon icon--sm') {
    const paths = {
      inbox:       '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>',
      search:      '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
      checkcircle: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
      alert:       '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      info:        '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
      flag:  '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
      check: '<polyline points="20 6 9 17 4 12"/>',
      x:     '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
      prev:  '<polyline points="15 18 9 12 15 6"/>',
      next:  '<polyline points="9 18 15 12 9 6"/>',
      arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
      retry: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>',
      chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      eye:   '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    };
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`;
  },

  examLetter(i) { return 'ABCDEFGH'[i] || String(i + 1); },

  // Sidebar "X/Y answered · flag count" row — shared by renderExam and the live palette updater
  examProgressInfo(p) {
    return `<span>${p.answered}/${p.total} answered</span>${p.flagged > 0
      ? `<span class="exam-progress-info__flag">${this.examIcon('flag')}${p.flagged}</span>` : ''}`;
  },

  // Explanation panel — single source of truth for both full render and live answer update
  // True when there is nothing worth showing: empty text, or boilerplate that only restates
  // the correct option ("The correct answer is B. Neurogenic shock") — the option colours and
  // check/cross already say that.
  isRedundantExplanation(text, correctText) {
    const norm = v => String(v ?? '').replace(/<[^>]*>/g, ' ').toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const t = norm(text);
    if (!t) return true;
    const rest = t.replace(/^(the )?(correct )?(answer|option|choice)( is)?\s*/, '')
                  .replace(/^[a-h](\s+|$)/, '').trim();
    return rest === '' || rest === norm(correctText);
  },

  // Returns '' when the question has no explanation text — the option check/cross already
  // signals correctness, so an empty card would only be noise.
  // Green once answered correctly, red once answered wrongly (every exam here shows feedback straight away;
  // if one ever hides it, the button stays a neutral "answered" so nothing leaks).
  examPaletteState(engine, i) {
    if (!engine.isAnswered(i)) return '';
    if (!engine.config.immediateFeedback) return ' palette-btn--answered';
    return engine.state.answers[i] === engine.questions[i].answer ? ' palette-btn--correct' : ' palette-btn--wrong';
  },

  examExplanation({ correct, correctIndex, explanation, topic, correctText }) {
    if (this.isRedundantExplanation(explanation, correctText)) return '';
    return `<div class="explanation-box ${correct ? 'explanation-box--correct' : 'explanation-box--wrong'}">
      <div class="explanation-box__header">
        ${this.examIcon(correct ? 'check' : 'x')}
        <span>${correct ? 'Correct' : `Incorrect — correct answer: <strong>${this.examLetter(correctIndex)}</strong>`}</span>
      </div>
      ${topic ? `<div class="explanation-box__topic">${topic}</div>` : ''}
      <p class="explanation-box__text">${explanation}</p>
    </div>`;
  },

  // The topic of a question in a multi-topic exam. Closed, it shows a blurred stand-in of a fixed width (so neither the
  // words nor their length give the topic away) with an eye glyph and a dashed edge: quiet, but clearly pressable. Pressing
  // it (App._revealTopic) swaps in the real name, which sharpens out of the blur while the pill grows to fit.
  topicVeil(label, open = false) {
    const safe = String(label).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return `<button type="button" class="topic-veil${open ? ' is-open' : ''}" data-topic="${safe}" aria-expanded="${open}" aria-label="${open ? `Topic: ${safe}` : 'Show topic'}"${open ? '' : ' title="Tap to show the topic"'}>${this.examIcon('eye', 'icon topic-veil__eye')}<span class="topic-veil__text">${open ? safe : 'Reveal topic'}</span></button>`;
  },

  renderExam(engine, config, shownTopics = null) {
    const q         = engine.getCurrent();
    const idx       = engine.state.currentIndex;
    const total     = engine.questions.length;
    const et        = config.examTypes.find(e => e.id === engine.config.examType);
    const modObj    = config.modules.find(m => m.id === engine.config.module);
    const answered  = engine.getCurrentAnswer();
    const isAnswered = answered !== undefined;
    const isFlagged = engine.isFlagged(idx);
    const progress  = engine.getProgress();

    // Wide exam vs single sub-subject
    const isWide = !!engine.config.scope;
    let sidebarTitle, sidebarSub;

    if (isWide) {
      if (engine.config.scope === 'custom') {
        sidebarTitle = engine.config.title || 'Custom exam';
        sidebarSub   = `${engine.config.topicCount || 'Several'} topics`;
      } else if (engine.config.scope === 'subject') {
        const sub = config.subjects.find(s => s.id === engine.config.subject);
        sidebarTitle = `${this.subjectIcon(sub?.id, 'module-icon module-icon--inline')}${sub?.label}`;
        sidebarSub   = `${modObj?.shortTitle} · ${et?.label} · All Topics`;
      } else {
        sidebarTitle = `${this.moduleIcon(modObj?.id, 'module-icon module-icon--inline')}${modObj?.shortTitle}`;
        sidebarSub   = `${et?.label} · All Subjects`;
      }
    } else {
      const sub   = config.subjects.find(s => s.id === engine.config.subject);
      const subSubs = (modObj?.subSubjects?.[engine.config.examType]?.[engine.config.subject]) || [];
      const ss    = subSubs.find(s => s.id === engine.config.subSubject) || { label: engine.config.subSubject };
      sidebarTitle = ss.label;
      sidebarSub   = `${sub?.label} · ${et?.label}`;
    }

    const topicLabel = (isWide && q._subSubjectLabel) ? q._subSubjectLabel : '';

    const paletteHTML = engine.questions.map((_, i) => {
      let cls = 'palette-btn';
      if (i === idx) cls += ' palette-btn--current';
      else           cls += this.examPaletteState(engine, i);
      if (engine.isFlagged(i)) cls += ' palette-btn--flagged';
      return `<button class="${cls}" data-goto="${i}" title="Question ${i + 1}" aria-label="Question ${i + 1}"${i === idx ? ' aria-current="true"' : ''}>${i + 1}</button>`;
    }).join('');

    const optionsHTML = q.options.map((opt, i) => {
      let cls = 'option';
      let status = '';
      if (isAnswered) {
        if (i === q.answer)      { cls += ' option--correct'; status = 'check'; }
        else if (i === answered) { cls += ' option--wrong';   status = 'x'; }
      }
      return `<button class="${cls}" data-option="${i}" ${isAnswered ? 'disabled' : ''}>
        <span class="option__letter">${this.examLetter(i)}</span>
        <span class="option__text">${opt}</span>
        ${status ? `<span class="option__status">${this.examIcon(status)}</span>` : ''}
      </button>`;
    }).join('');

    const explanationHTML = (isAnswered && engine.config.immediateFeedback)
      ? this.examExplanation({
          correct: answered === q.answer,
          correctIndex: q.answer,
          explanation: q.explanation,
          topic: topicLabel,
          correctText: q.options[q.answer],
        })
      : '';

    // Back nav for wide exams goes to the right place
    const backParams = engine.config.scope === 'custom' ? {} : isWide
      ? (engine.config.scope === 'subject'
          ? { moduleId: engine.config.module, examType: engine.config.examType, subject: engine.config.subject }
          : { moduleId: engine.config.module })
      : { moduleId: engine.config.module, examType: engine.config.examType, subject: engine.config.subject };
    const backNav = engine.config.scope === 'custom' ? 'review' : isWide
      ? (engine.config.scope === 'subject' ? 'subject' : 'module')
      : 'subject';

    const progressPct = total ? Math.round((progress.answered / total) * 100) : 0;
    const isLastQuestion = idx === total - 1;

    return `
    <div class="exam-layout" style="--mod-color:${modObj?.color || 'var(--primary)'}">
      <aside class="exam-sidebar">
        <div class="exam-sidebar__header">
          <div class="exam-sidebar__title">${sidebarTitle}</div>
          <div class="exam-sidebar__sub">${sidebarSub}</div>
        </div>
        <div class="exam-progress-info">${this.examProgressInfo(progress)}</div>
        ${this.progressBar(progressPct)}
        <div class="palette">${paletteHTML}</div>
        <button class="btn btn--ghost btn--sm exam-submit-btn submit-exam-trigger">
          ${this.examIcon('check')} Submit Exam
        </button>
      </aside>

      <main class="exam-main">
        <div class="exam-topbar">
          ${this.backBtn(backNav, backParams)}
          <button class="flag-btn ${isFlagged ? 'flag-btn--active' : ''}" id="flag-btn" title="${isFlagged ? 'Remove from saved' : 'Save question'}" aria-pressed="${isFlagged}">
            ${this.examIcon('flag')}
            <span class="flag-btn__label">${isFlagged ? 'Saved' : 'Save'}</span>
          </button>
        </div>
        <div class="question-card">
          <div class="question-card__meta">
            <span class="question-card__number">Question ${idx + 1} <span class="question-card__of">/ ${total}</span></span>
            ${topicLabel ? this.topicVeil(topicLabel, !!(shownTopics && shownTopics.has(idx))) : ''}
          </div>
          <p class="question-card__text">${q.question}</p>
        </div>
        <div class="options-list">${optionsHTML}</div>
        ${explanationHTML}
        <div class="exam-dock">
          <div class="palette palette--strip">${paletteHTML}<button class="palette-submit submit-exam-trigger" aria-label="Submit exam">${this.examIcon('check')}Submit</button></div>
          <div class="exam-nav">
            <button class="btn btn--ghost" id="prev-btn" ${idx === 0 ? 'disabled' : ''}>${this.examIcon('prev')} Previous</button>
            ${isLastQuestion
              ? `<button class="btn btn--primary submit-exam-trigger" id="finish-exam-btn">Finish Exam ${this.examIcon('check')}</button>`
              : `<button class="btn btn--primary" id="next-btn">Next ${this.examIcon('next')}</button>`}
          </div>
        </div>
      </main>
    </div>`;
  },

  // ─── Results page ─────────────────────────────────────────────────────────

  // Donut of the exam: correct (green), incorrect (red), skipped (grey) as arcs of one ring, the score in the middle.
  resultRing(results) {
    const r = 52, circ = 2 * Math.PI * r;
    const total = results.total || 1;
    const parts = [
      { n: results.correct,    cls: 'res-ring__arc--ok'   },
      { n: results.incorrect,  cls: 'res-ring__arc--bad'  },
      { n: results.unanswered, cls: 'res-ring__arc--skip' },
    ].filter(p => p.n > 0);
    const gap = parts.length > 1 ? 2 : 0;
    let used = 0;
    const arcs = parts.map(p => {
      const len  = Math.max(0, (p.n / total) * circ - gap);
      const rest = circ - len;
      const off  = -used;
      used += (p.n / total) * circ;
      return `<circle class="res-ring__arc ${p.cls}" cx="60" cy="60" r="${r}" fill="none" stroke-width="9"
        style="--len:${len.toFixed(2)};--rest:${rest.toFixed(2)};--circ:${circ.toFixed(2)}" stroke-dasharray="${len.toFixed(2)} ${rest.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>`;
    }).join('');
    return `<div class="res-ring" role="img" aria-label="Score ${results.score}%: ${results.correct} correct, ${results.incorrect} incorrect, ${results.unanswered} skipped">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--border)" stroke-width="9"/>
        <g transform="rotate(-90 60 60)">${arcs}</g>
      </svg>
      <div class="res-ring__label"><span class="res-ring__value">${results.score}<span class="res-ring__pct">%</span></span><span class="res-ring__caption">Score</span></div>
    </div>`;
  },

  // One row of a review list (results page, Incorrect page, Saved page): a status mark, a small meta line and the
  // question cut to two lines; tapping the row opens the rest (`body`). Same markup everywhere so it behaves alike.
  rvRow({ state, meta, saved = false, question, body, uid = '', attrs = '' }) {
    const marks = {
      correct: '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
      wrong:   '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      skipped: '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><line x1="6" y1="12" x2="18" y2="12"/></svg>',
      saved:   '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    };
    const star = '<svg class="icon rv__saved" viewBox="0 0 24 24" aria-label="Saved"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    return `<div class="rv rv--${state}"${uid ? ` data-uid="${uid}"` : ''}${attrs ? ` ${attrs}` : ''}>
      <button type="button" class="rv__head" aria-expanded="false">
        <span class="rv__mark">${marks[state]}</span>
        <span class="rv__main">
          <span class="rv__meta"><span class="rv__meta-text">${meta}</span>${saved ? star : ''}</span>
          <span class="rv__q">${question}</span>
        </span>
        <svg class="icon icon--sm rv__chev" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="rv__body"><div class="rv__inner"><div class="rv__pad">${body}</div></div></div>
    </div>`;
  },

  _explanationBlock(text, correctText) {
    return this.isRedundantExplanation(text, correctText) ? '' : `<p class="rv__expl">${text}</p>`;
  },

  renderResults(results, config, opts = {}) {
    const et    = config.examTypes.find(e => e.id === results.config.examType);
    const mod   = config.modules.find(m => m.id === results.config.module);
    const isWide = !!results.config.scope;
    const rc    = results.config;

    let titleLabel, subtitleLabel, backNav, backParams, crumbs;
    if (isWide) {
      if (rc.scope === 'custom') {
        titleLabel    = rc.title || 'Custom exam';
        subtitleLabel = `${rc.topicCount || new Set(results.perQuestion.map(p => `${p._module}|${p._examType}|${p._subject}|${p._subSubject}`)).size} topics`;
        backNav       = 'review';
        backParams    = {};
        crumbs        = [{ label: 'Dashboard', nav: 'dashboard' }, { label: 'Incorrect Questions', nav: 'review' }, { label: 'Results' }];
      } else if (rc.scope === 'subject') {
        const sub = config.subjects.find(s => s.id === rc.subject);
        titleLabel    = `${sub?.label} — Full Exam`;
        subtitleLabel = `${mod?.title} · ${et?.label}`;
        backNav       = 'subject';
        backParams    = { moduleId: rc.module, examType: rc.examType, subject: rc.subject };
        crumbs        = [
          { label: 'Dashboard', nav: 'dashboard' },
          { label: mod?.title, nav: 'module', params: { moduleId: rc.module } },
          { label: et?.label, nav: 'module', params: { moduleId: rc.module } },
          { label: sub?.label, nav: 'subject', params: backParams },
          { label: opts.stored ? 'Last attempt' : 'Results' },
        ];
      } else {
        titleLabel    = `${et?.label} — Full Exam`;
        subtitleLabel = mod?.title;
        backNav       = 'module';
        backParams    = { moduleId: rc.module };
        crumbs        = [
          { label: 'Dashboard', nav: 'dashboard' },
          { label: mod?.title, nav: 'module', params: { moduleId: rc.module } },
          { label: et?.label, nav: 'module', params: { moduleId: rc.module } },
          { label: opts.stored ? 'Last attempt' : 'Results' },
        ];
      }
    } else {
      const sub     = config.subjects.find(s => s.id === rc.subject);
      const subSubs = (mod?.subSubjects?.[rc.examType]?.[rc.subject]) || [];
      const ss      = subSubs.find(s => s.id === rc.subSubject) || { label: rc.subSubject };
      titleLabel    = ss.label;
      subtitleLabel = `${sub?.label} · ${et?.label}`;
      backNav       = 'subsubject';
      backParams    = { moduleId: rc.module, examType: rc.examType, subject: rc.subject, subSubject: rc.subSubject };
      crumbs        = [
        { label: 'Dashboard', nav: 'dashboard' },
        { label: mod?.title, nav: 'module', params: { moduleId: rc.module } },
        { label: et?.label, nav: 'module', params: { moduleId: rc.module } },
        { label: sub?.label, nav: 'subject', params: { moduleId: rc.module, examType: rc.examType, subject: rc.subject } },
        { label: ss.label, nav: 'subsubject', params: backParams },
        { label: opts.stored ? 'Last attempt' : 'Results' },
      ];
    }

    const L = i => this.examLetter(i);
    const savedUids = new Set(Storage.getFlagged().map(f => f.uid));
    const entryOf = (pq) => ({ module: pq._module || rc.module, examType: pq._examType || rc.examType, subject: rc.subject || pq._subject, subSubject: rc.subSubject || pq._subSubject, id: pq.id });
    const topicKey = pq => `${pq._module || rc.module || ''}|${pq._subject || rc.subject || ''}|${pq._subSubject || rc.subSubject || ''}`;
    const star = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    let savedCount = 0;

    const rows = results.perQuestion.map((pq, i) => {
      const state = pq.correct ? 'correct' : pq.answered ? 'wrong' : 'skipped';
      const isSaved = pq.id !== undefined && savedUids.has(Storage.questionUid(entryOf(pq)));
      if (isSaved) savedCount++;
      // Every choice, marked like the Incorrect page: the right one green, a wrong pick red
      const opts = pq.options.map((opt, oi) => {
        const cls = oi === pq.answer ? ' rv-opt--ok' : (pq.answered && oi === pq.userAnswer) ? ' rv-opt--bad' : '';
        return `<li class="rv-opt${cls}"><span class="rv-opt__letter">${L(oi)}</span><span class="rv-opt__text">${opt}</span></li>`;
      }).join('');
      const note = pq.answered ? '' : '<p class="rv-skipnote">Not answered</p>';
      const saveBtn = pq.id === undefined ? '' : `<button type="button" class="btn btn--ghost btn--sm res-save${isSaved ? ' is-saved' : ''}" data-save-q="${i}" aria-pressed="${isSaved}">${star}<span class="res-save__text">${isSaved ? 'Saved' : 'Save'}</span></button>`;
      return this.rvRow({
        state,
        attrs:    `data-state="${state}" data-saved="${isSaved ? 1 : 0}" data-topic="${topicKey(pq)}"`,
        meta:     `Q${i + 1}${(isWide && pq._subSubjectLabel) ? ` · ${pq._subSubjectLabel}` : ''}`,
        saved:    isSaved,
        question: pq.question,
        body:     `${note}<ul class="rv-opts">${opts}</ul>${this._explanationBlock(pq.explanation, pq.options[pq.answer])}${saveBtn ? `<div class="rv__foot"><span class="rv__foot-text"></span>${saveBtn}</div>` : ''}`,
      });
    }).join('');

    // By topic (multi-topic exams only): weakest first; a topic row also filters the list below
    let topicsHTML = '';
    if (isWide) {
      const map = new Map();
      results.perQuestion.forEach(pq => {
        const k = topicKey(pq);
        const t = map.get(k) || { key: k, label: pq._subSubjectLabel || '', n: 0, ok: 0 };
        t.n++; if (pq.correct) t.ok++; map.set(k, t);
      });
      const list = [...map.values()].sort((a, b) => (a.ok / a.n) - (b.ok / b.n) || b.n - a.n);
      if (list.length >= 2) {
        const trow = t => { const pct = Math.round((t.ok / t.n) * 100); return `<button type="button" class="res-topic" data-topic="${t.key}" aria-pressed="false">
            <span class="res-topic__name">${t.label}</span><span class="res-topic__score">${t.ok}/${t.n}</span><span class="res-topic__pct">${pct}%</span>${this.progressBar(pct)}
          </button>`; };
        const first = list.slice(0, 5), rest = list.slice(5);
        topicsHTML = `<div class="page-label page-label--wide">By topic</div>
          <div class="res-topics" id="res-topics">${first.map(trow).join('')}${rest.length ? `<div class="res-topics__more" id="res-topics-more" hidden>${rest.map(trow).join('')}</div>` : ''}</div>
          ${rest.length ? `<button type="button" class="res-more" id="res-topics-toggle" data-more="${rest.length}">Show all ${list.length} topics</button>` : ''}`;
      }
    }

    const stat = (cls, value, label) => `<div class="res-stat"><span class="res-stat__v${cls ? ` res-stat__v--${cls}` : ''}">${value}</span><span class="res-stat__l">${label}</span></div>`;
    const total = results.perQuestion.length;
    const chip = (f, label, n, pressed = false) => `<button type="button" class="res-chip" data-filter="${f}" aria-pressed="${pressed}"${n === 0 && f !== 'all' ? ' hidden' : ''}>${label}<span class="res-chip__n">${n}</span></button>`;

    // Compared with the previous attempt of the same scope
    let delta = '';
    if (results.previous && typeof results.previous.score === 'number') {
      const d = results.score - results.previous.score;
      const when = results.previous.completedAt ? new Date(results.previous.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
      const icon = d > 0 ? '<polyline points="18 15 12 9 6 15"/>' : d < 0 ? '<polyline points="6 9 12 15 18 9"/>' : '<line x1="5" y1="12" x2="19" y2="12"/>';
      delta = `<p class="res-delta"><svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span><strong>${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} pts</strong> vs previous attempt (${results.previous.score}%${when ? `, ${when}` : ''})</span></p>`;
    }
    const when = opts.stored && results.completedAt ? new Date(results.completedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    const practiceNote = (rc.retryOf && rc.scope !== 'custom') ? ' · Incorrect retry' : (results.updated ? ' · Updated after retry' : '');
    const title = opts.stored ? (opts.backTo ? 'Attempt' : 'Last attempt') : (results.score === 100 ? 'Excellent' : 'Exam complete');
    const retryAll = `<button class="btn ${results.incorrect > 0 ? 'btn--ghost' : 'btn--primary'} btn--lg res-retry res-retry--all" id="retry-all-btn"
          data-module="${rc.module}"
          data-exam-type="${rc.examType}"
          data-subject="${rc.subject || ''}"
          data-sub-subject="${rc.subSubject || ''}"
          data-scope="${rc.scope || ''}">${this.examIcon('retry')}Retry exam</button>`;
    const retryBad = results.incorrect > 0
      ? `<button class="btn btn--primary btn--lg res-retry res-retry--bad" id="retry-incorrect-btn">Retry incorrect<span class="res-retry__n">${results.incorrect}</span></button>` : '';

    return `
    <div class="page results-page">
      ${opts.backTo ? this.backBtn(opts.backTo.nav, opts.backTo.params) : this.backBtn(backNav, backParams)}
      ${this.breadcrumb(crumbs)}
      <section class="res-hero">
        ${this.resultRing(results)}
        <div class="res-hero__text">
          <h1 class="res-hero__title">${title}</h1>
          <p class="res-hero__sub">${titleLabel} · ${subtitleLabel}${practiceNote}${when ? ` · ${when}` : ''}</p>
          ${delta}
        </div>
        <div class="res-stats">
          ${stat('ok', results.correct, 'Correct')}
          ${stat('bad', results.incorrect, 'Incorrect')}
          ${stat('', results.unanswered, 'Skipped')}
          ${stat('', ExamEngine.formatTime(results.timeSec), 'Time')}
        </div>
        <div class="res-retries">${retryBad}${retryAll}</div>
      </section>
      ${topicsHTML}
      <div class="page-label page-label--wide res-review-title"><span>Question review</span><span class="res-review-title__n" id="res-count">${total} ${total === 1 ? 'question' : 'questions'}</span></div>
      <div class="res-filter" id="res-filter" role="group" aria-label="Filter questions">
        ${chip('all', 'All', total, true)}${chip('wrong', 'Incorrect', results.incorrect)}${chip('skipped', 'Skipped', results.unanswered)}${chip('saved', 'Saved', savedCount)}
      </div>
      <div class="rv-list" id="results-list">${rows}<div class="empty-state res-none" id="res-none" hidden><h3 class="empty-state__title">Nothing here</h3><p class="empty-state__body">No question matches this filter.</p></div></div>
    </div>`;
  },

  // ─── Incorrect and Saved pages ────────────────────────────────────────────
  // One layout for both (kind: 'incorrect' | 'saved'); the lists are drawn by reviewItem so the page and its search
  // box (app.js) can never disagree about how a row looks.

  _reviewMeta(q, config) {
    const m   = config.modules.find(x => x.id === q.module);
    const sub = config.subjects.find(s => s.id === q.subject);
    return [m?.shortTitle || q.module, sub?.label, q.subSubjectLabel].filter(Boolean).join(' · ');
  },

  reviewItem(kind, q, config) {
    const saved = kind === 'saved';
    const et    = config.examTypes.find(e => e.id === q.examType);
    const opts  = q.options.map((opt, i) => {
      const cls = i === q.answer ? ' rv-opt--ok' : (!saved && i === q.userAnswer) ? ' rv-opt--bad' : '';
      return `<li class="rv-opt${cls}"><span class="rv-opt__letter">${this.examLetter(i)}</span><span class="rv-opt__text">${opt}</span></li>`;
    }).join('');
    const body = `<ul class="rv-opts">${opts}</ul>${this._explanationBlock(q.explanation, q.options[q.answer])}
      <div class="rv__foot">
        <span class="rv__foot-text">${et ? et.label : ''}</span>
        <button class="btn btn--ghost btn--sm" data-remove-uid="${q.uid}">${saved ? 'Remove from saved' : `${this.examIcon('check')} Mark as mastered`}</button>
      </div>`;
    return this.rvRow({ state: saved ? 'saved' : 'wrong', meta: this._reviewMeta(q, config), question: q.question, body, uid: q.uid });
  },

  // The list of an Incorrect / Saved page in the chosen order: 'newest' (default), 'oldest', or 'topic' (grouped under
  // a heading per topic, topics A to Z, newest first inside each). Used by the page and by its search box.
  reviewListHTML(kind, items, config, sort = 'newest') {
    const when = q => kind === 'saved' ? (q.flaggedAt || 0) : (q.updatedAt || q.addedAt || 0);
    const byNew = (a, b) => when(b) - when(a);
    if (sort === 'topic') {
      const groups = new Map();
      items.forEach(q => {
        const k = `${q.subject}|${q.subSubject}`;
        const g = groups.get(k) || { label: q.subSubjectLabel || q.subSubject || '', list: [] };
        g.list.push(q); groups.set(k, g);
      });
      return [...groups.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)))
        .map(g => `<div class="rv-group"><span class="rv-group__name">${g.label}</span><span class="rv-group__n">${g.list.length}</span></div>${g.list.sort(byNew).map(q => this.reviewItem(kind, q, config)).join('')}`).join('');
    }
    const sorted = [...items].sort(sort === 'oldest' ? (a, b) => -byNew(a, b) : byNew);
    return sorted.map(q => this.reviewItem(kind, q, config)).join('');
  },

  // First visible row or heading of a list has no top rule (rows can be hidden by a filter)
  tidyList(list) {
    if (!list) return;
    let first = true;
    [...list.children].forEach(el => { const show = !el.hidden; el.classList.toggle('is-first', show && first); if (show) first = false; });
  },

  _reviewPage(kind, list, config, filter) {
    const saved = kind === 'saved';
    const { page: backPage, params: backParams } = this._reviewScope(filter);
    const noun   = saved ? 'Saved Questions' : 'Incorrect Questions';
    const title  = filter ? `${saved ? 'Saved' : 'Incorrect'} — ${filter.label}` : (saved ? 'Saved Questions' : 'Incorrect Questions');
    const crumbs = filter
      ? [{ label: 'Dashboard', nav: 'dashboard' }, { label: filter.label, nav: backPage, params: backParams }, { label: noun }]
      : [{ label: 'Dashboard', nav: 'dashboard' }, { label: saved ? 'Saved Questions' : 'Incorrect Questions' }];
    const icon = saved
      ? '<svg class="icon icon--lg" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
      : '<svg class="icon icon--lg" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>';

    if (list.length === 0) {
      return `<div class="page">
        ${this.backBtn(backPage, backParams)}
        ${this.breadcrumb(crumbs)}
        ${saved
          ? this.emptyState('No Saved Questions', 'Save questions during an exam to review them later.', this.examIcon('flag', 'icon icon--xl'))
          : this.emptyState('Nothing to Review', 'Complete some exams and incorrect answers will appear here.', this.examIcon('checkcircle', 'icon icon--xl'))}
      </div>`;
    }

    const tools = filter ? '' : `
      <div class="rv-tools">
        <label class="rv-search">
          ${this.examIcon('search', 'icon icon--sm')}
          <input type="text" id="rv-search" class="input" placeholder="Search questions" autocomplete="off">
        </label>
        <select id="rv-module" class="select" aria-label="Module">
          <option value="">All modules</option>
          ${config.modules.map(m => `<option value="${m.id}">${m.title}</option>`).join('')}
        </select>
        <select id="rv-subject" class="select" aria-label="Subject">
          <option value="">All subjects</option>
          ${config.subjects.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
        </select>
      </div>`;

    return `
    <div class="page review-page" data-kind="${kind}">
      ${this.backBtn(backPage, backParams)}
      ${this.breadcrumb(crumbs)}
      <header class="page__header" style="--mod-color:var(${saved ? '--saved' : '--danger'})">
        <span class="page__icon">${icon}</span>
        <div>
          <h1 class="page__title">${title}</h1>
          <p class="page__subtitle">${saved ? 'Questions you saved to come back to' : 'Questions you got wrong, until you mark them mastered'}</p>
        </div>
      </header>
      ${!saved ? this._startRow(filter, list.length) : ''}
      ${tools}
      <div class="rv-head">
        <span class="rv-head__count" id="rv-count">${list.length} ${list.length === 1 ? 'question' : 'questions'}</span>
        <span class="rv-head__tools">
          <select id="rv-sort" class="rv-sort" aria-label="Order">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="topic">By topic</option>
          </select>
          ${filter ? '' : `<button class="rv-head__clear" id="rv-clear" type="button">${saved ? 'Clear all saved' : 'Clear all'}</button>`}
        </span>
      </div>
      <div class="rv-list" id="rv-list">${this.reviewListHTML(kind, list, config, 'newest')}</div>
    </div>`;
  },

  // Wide action row right under the Incorrect header: "Start a custom exam" on the main page, "Master incorrect Qs exam"
  // inside a topic / subject / module. Same look as the full-exam row on the subject page.
  _startRow(filter, n) {
    const arrow = '<svg class="icon icon--sm wide-exam-btn__arrow" viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
    return `<button class="btn btn--primary btn--lg wide-action" id="${filter ? 'master-incorrect-btn' : 'start-custom-exam-btn'}" type="button">
      ${filter ? 'Master incorrect Qs exam' : 'Start a custom exam'}<span class="badge badge--count">${n} Q</span>${arrow}
    </button>`;
  },

  renderReview(incorrectList, config, filter = null)  { return this._reviewPage('incorrect', incorrectList, config, filter); },
  renderFlagged(flaggedList, config, filter = null)   { return this._reviewPage('saved', flaggedList, config, filter); },

  // ─── Search page ──────────────────────────────────────────────────────────

  // ─── Attempts list (full exams and custom exams) ──────────────────────────
  // Every stored attempt of one full exam / of the custom exams, newest first, each with a short overview of the topics
  // it covered; tapping one opens its results page.
  renderAttempts(list, opts) {
    const back = opts.back || { nav: 'dashboard', params: {} };
    const when = t => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const chev = '<svg class="icon icon--sm att__go" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
    const rows = list.map(r => {
      const names = [];
      (r.perQuestion || []).forEach(p => { const n = p._subSubjectLabel || r.config.subSubjectLabel; if (n && !names.includes(n)) names.push(n); });
      const shown = names.slice(0, 3).map(n => `<span class="att__chip">${n}</span>`).join('');
      const more  = names.length > 3 ? `<span class="att__more">+${names.length - 3} more</span>` : '';
      const tone  = r.score >= 70 ? 'ok' : r.score >= 50 ? 'mid' : 'bad';
      const tag   = r.config.scope === 'custom' ? (r.config.title || 'Custom exam') : (r.config.partial ? 'Some topics' : 'All topics');
      return `<button type="button" class="att" data-results-key="${r._key}" data-back-to='${JSON.stringify({ nav: 'attempts', params: opts.self })}'>
        <span class="att__top"><span class="att__date">${when(r.completedAt)}</span><span class="att__tag">${tag}</span></span>
        <span class="att__meta">${r.correct} correct · ${r.incorrect} incorrect · ${r.unanswered} skipped · ${r.total} Q</span>
        <span class="att__topics">${shown}${more}</span>
        <span class="att__side"><span class="att__score att__score--${tone}">${r.score}%</span>${chev}</span>
      </button>`;
    }).join('');
    return `
    <div class="page attempts-page review-page">
      ${this.backBtn(back.nav, back.params)}
      ${this.breadcrumb([{ label: 'Dashboard', nav: 'dashboard' }, { label: 'Attempts' }])}
      <header class="page__header" style="--mod-color:var(--accent-text)">
        <span class="page__icon">${this.examIcon('chart', 'icon icon--lg')}</span>
        <div>
          <h1 class="page__title">Attempts</h1>
          <p class="page__subtitle">${list.length} ${list.length === 1 ? 'attempt' : 'attempts'} on this device, newest first</p>
        </div>
      </header>
      <div class="att-list">${rows}</div>
    </div>`;
  },

  // ─── Custom exam page ─────────────────────────────────────────────────────
  // Modules that have incorrect questions; each opens to its subjects, each subject to its topics, each topic with a
  // check mark (everything starts ticked). Built from the Incorrect list, so it only ever lists what can be practised.
  renderCustomExam(config) {
    const tree = new Map();
    Storage.getIncorrect().forEach(q => {
      const mk = q.module, sk = `${q.examType}|${q.subject}`, tk = `${q.module}|${q.examType}|${q.subject}|${q.subSubject}`;
      const m = tree.get(mk) || tree.set(mk, new Map()).get(mk);
      const sj = m.get(sk) || m.set(sk, { examType: q.examType, subject: q.subject, topics: new Map() }).get(sk);
      const t = sj.topics.get(tk) || sj.topics.set(tk, { label: q.subSubjectLabel || q.subSubject, n: 0 }).get(tk);
      t.n++;
    });
    const chev = '<svg class="icon icon--sm cx-head__chev" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    const tick = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
    const sum = (m) => [...m.values()].reduce((a, t) => a + t.n, 0);
    let total = 0;
    const html = [...tree.entries()].map(([mid, subs]) => {
      const mod = config.modules.find(x => x.id === mid);
      let mTotal = 0;
      const subHTML = [...subs.values()].map(sj => {
        const sub = config.subjects.find(x => x.id === sj.subject);
        const et  = config.examTypes.find(x => x.id === sj.examType);
        const n   = sum(sj.topics); mTotal += n;
        const rows = [...sj.topics.entries()].map(([key, t]) => `<button type="button" class="cx-topic" role="checkbox" aria-checked="false" data-key="${key}" data-n="${t.n}">
            <span class="cx-topic__box">${tick}</span><span class="cx-topic__name">${t.label}</span><span class="cx-topic__n">${t.n}</span>
          </button>`).join('');
        return `<div class="cx-group cx-group--sub" data-cx-group>
          <button type="button" class="cx-head" aria-expanded="false"><span class="cx-head__icon">${this.subjectIcon(sj.subject, 'module-icon')}</span><span class="cx-head__text"><span class="cx-head__name">${sub ? sub.label : sj.subject}</span>${et ? `<span class="cx-head__meta">${et.label}</span>` : ''}</span><span class="cx-head__n">${n}</span>${chev}</button>
          <div class="cx-body"><div class="cx-inner">${rows}</div></div>
        </div>`;
      }).join('');
      total += mTotal;
      return `<div class="cx-group" data-cx-group>
        <button type="button" class="cx-head" aria-expanded="false"><span class="cx-head__icon">${this.moduleIcon(mid, 'module-icon')}</span><span class="cx-head__text"><span class="cx-head__name">${mod ? mod.title : mid}</span></span><span class="cx-head__n">${mTotal}</span>${chev}</button>
        <div class="cx-body"><div class="cx-inner">${subHTML}</div></div>
      </div>`;
    }).join('');

    return `
    <div class="page custom-page review-page">
      ${this.backBtn('review', {})}
      ${this.breadcrumb([{ label: 'Dashboard', nav: 'dashboard' }, { label: 'Incorrect Questions', nav: 'review' }, { label: 'Custom exam' }])}
      <header class="page__header" style="--mod-color:var(--danger)">
        <span class="page__icon"><svg class="icon icon--lg" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg></span>
        <div>
          <h1 class="page__title">Custom exam</h1>
          <p class="page__subtitle">Choose the topics to practise</p>
        </div>
      </header>
      <section class="launch">
        <div class="launch__body">
          <p class="launch__eyebrow">Selected</p>
          <p class="launch__count"><span class="launch__num" id="custom-count">0</span><span class="launch__unit" id="custom-unit">questions</span></p>
        </div>
        <div class="launch__actions">
          <button class="btn btn--primary btn--lg launch__start" id="start-custom-btn" disabled>Start exam${this.examIcon('arrow', 'icon icon--sm launch__arrow')}</button>
        </div>
      </section>
      ${Storage.listAttempts('custom').length ? `<div class="tstats custom-last">${this._viewLastRow('custom', { nav: 'custom-exam', params: {} })}</div>` : ''}
      <div class="page-label page-label--wide res-review-title"><span>Topics with incorrect questions</span><button type="button" class="cx-all" id="custom-all">Select all</button></div>
      <div class="cx-list">${html}</div>
    </div>`;
  },

  // ─── Drop-down menu ───────────────────────────────────────────────────────
  // Replaces the browser's own select: a button with a properly placed arrow, and a menu that fits the app (a popover on
  // desktop, a small bottom sheet on phones). The real <select> stays in the page, hidden, as the value holder, so code
  // that reads `.value` or listens to `change` keeps working.
  enhanceSelect(sel) {
    if (!sel || sel.dataset.enhanced) return;
    sel.dataset.enhanced = '1';
    const label = sel.getAttribute('aria-label') || '';
    const wrap = document.createElement('div');
    wrap.className = `csel${sel.id === 'rv-sort' ? ' csel--sort' : ''}`;
    wrap.innerHTML = `<button type="button" class="csel__btn" aria-haspopup="listbox" aria-expanded="false" aria-label="${label}"><span class="csel__val"></span><svg class="icon icon--sm csel__chev" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
      <div class="csel__scrim"></div>
      <div class="csel__menu" role="listbox" aria-label="${label}"><p class="csel__title">${label}</p></div>`;
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.hidden = true; sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    const btn = wrap.querySelector('.csel__btn'), menu = wrap.querySelector('.csel__menu'), val = wrap.querySelector('.csel__val');
    const tick = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
    [...sel.options].forEach(o => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'csel__opt'; b.setAttribute('role', 'option'); b.dataset.value = o.value;
      b.innerHTML = `<span>${o.textContent}</span>${tick}`;
      menu.appendChild(b);
    });
    const sync = () => {
      const cur = sel.options[sel.selectedIndex];
      val.textContent = cur ? cur.textContent : '';
      menu.querySelectorAll('.csel__opt').forEach(b => b.setAttribute('aria-selected', String(b.dataset.value === sel.value)));
    };
    const close = (focus) => { wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); if (focus) btn.focus(); };
    const open  = () => {
      document.querySelectorAll('.csel.is-open').forEach(w => w !== wrap && w.querySelector('.csel__btn').click());
      wrap.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
      const cur = menu.querySelector('[aria-selected="true"]') || menu.querySelector('.csel__opt');
      if (cur) cur.focus({ preventScroll: false });
    };
    btn.addEventListener('click', () => wrap.classList.contains('is-open') ? close() : open());
    wrap.querySelector('.csel__scrim').addEventListener('click', () => close(true));
    menu.addEventListener('click', e => {
      const b = e.target.closest('.csel__opt'); if (!b) return;
      if (sel.value !== b.dataset.value) { sel.value = b.dataset.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      sync(); close(true);
    });
    wrap.addEventListener('keydown', e => {
      if (e.key === 'Escape' && wrap.classList.contains('is-open')) { e.preventDefault(); close(true); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      if (!wrap.classList.contains('is-open')) { open(); return; }
      const items = [...menu.querySelectorAll('.csel__opt')], i = items.indexOf(document.activeElement);
      (items[i + (e.key === 'ArrowDown' ? 1 : -1)] || items[i < 0 ? 0 : i]).focus();
    });
    sync();
    if (!UI._cselBound) {   // one listener for every menu: a tap anywhere else closes the open one
      UI._cselBound = true;
      document.addEventListener('click', e => document.querySelectorAll('.csel.is-open').forEach(w => { if (!w.contains(e.target)) { w.classList.remove('is-open'); w.querySelector('.csel__btn').setAttribute('aria-expanded', 'false'); } }));
    }
  },

  renderSearch(config) {
    return `
    <div class="page search-page">
      ${this.backBtn('dashboard')}
      ${this.breadcrumb([{ label: 'Dashboard', nav: 'dashboard' }, { label: 'Search' }])}
      <header class="page__header" style="--mod-color:var(--info)">
        <span class="page__icon"><svg class="icon icon--lg" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
        <div>
          <h1 class="page__title">Search</h1>
          <p class="page__subtitle">Search across all subjects and modules</p>
        </div>
      </header>
      <div class="search-bar-wrap">
        <input type="text" id="global-search" class="input input--lg" placeholder="Search questions, subjects, modules…" autofocus>
      </div>
      <div id="search-results" class="search-results">
        <p class="search-hint">Start typing to search across all available questions.</p>
      </div>
    </div>`;
  },

  // ─── Internal helpers ─────────────────────────────────────────────────────

  // Module glyphs: Health Icons "outline/body" set (MIT, github.com/resolvetosavelives/healthicons),
  // 48x48 filled outlines drawn with currentColor. Heart = CPM, stomach = GIT, brain (Lucide, ISC) = CNS,
  // thyroid = ENDO & REPRO, kidneys = Urinary; unknown ids get a generic body glyph.
  moduleIcon(id, cls = 'module-icon') {
    const g = {
      CPM: '<path fill-rule="evenodd" clip-rule="evenodd" d="M30.05 9.52V7C30.05 6.73 29.94 6.48 29.75 6.29C29.56 6.11 29.31 6 29.04 6L24.7 6C24.14 6 23.69 6.45 23.69 7V9.43L22.2 10.12L20.27 7.72C19.94 7.32 19.37 7.22 18.93 7.5L15.53 9.66C15.29 9.81 15.12 10.06 15.08 10.34C15.03 10.62 15.11 10.9 15.28 11.12L17.18 13.48C17.09 13.59 16.99 13.72 16.89 13.85C16.69 14.11 16.46 14.45 16.27 14.83C15.52 14.16 14.64 13.6 13.8 13.16C12.89 12.68 11.99 12.31 11.33 12.06C10.99 11.93 10.42 11.74 10.23 11.68C9.95 11.6 9.63 11.63 9.39 11.78C9.14 11.93 8.97 12.17 8.92 12.45L8.02 17.18C7.97 17.44 8.03 17.72 8.18 17.94C8.34 18.16 8.58 18.31 8.85 18.35C9.95 18.53 10.79 19.07 11.36 19.59C11.64 19.85 11.86 20.1 11.99 20.28C12.01 20.3 12.03 20.33 12.05 20.36C11.05 21.89 10.66 23.68 10.72 25.53C10.8 28.03 11.71 30.67 13.08 33.07C14.45 35.47 16.31 37.68 18.37 39.29C20.42 40.9 22.76 42 25.07 42C27.37 42 29.77 40.91 31.89 39.29C34.03 37.66 35.99 35.43 37.43 32.97C40.25 28.14 41.28 21.93 36.72 17.93C36.53 17.77 36.35 17.63 36.19 17.51C36.92 17.5 37.76 17.51 38.73 17.55L39.75 17.58L40 10.83L39 10.8C36.43 10.71 34.08 10.82 31.94 11.31C31.41 10.62 30.83 10.11 30.38 9.77C30.26 9.67 30.15 9.59 30.05 9.52ZM32.22 18.14C32.4 18.06 32.58 17.99 32.77 17.93C33.27 18.21 33.67 18.4 33.99 18.56C34.1 18.61 34.19 18.66 34.28 18.7C34.66 18.89 34.96 19.06 35.38 19.43C38.82 22.45 38.35 27.4 35.68 31.97C34.37 34.22 32.58 36.25 30.66 37.71C28.73 39.18 26.76 40 25.07 40C23.38 40 21.48 39.18 19.62 37.73C17.78 36.28 16.09 34.28 14.84 32.08C13.58 29.88 12.81 27.55 12.74 25.46C12.66 23.39 13.28 21.6 14.75 20.31C15.5 19.65 16.82 19.38 18.51 19.48C19.62 19.54 20.79 19.75 21.86 20.03L21.86 20.03L23 20.36C24.21 20.71 25.61 21.27 26.53 21.65L25.08 24.78L21.34 26.45L17.3 25.51L16.83 27.46L20.07 28.21L19.01 30.88L20.89 31.61L22.23 28.25L24.42 27.27C24.31 28.43 24.5 29.61 24.97 30.69L25.32 31.48L25.59 35.42L27.6 35.28L27.39 32.13L30.72 31.74L30.49 29.76L26.94 30.17L26.82 29.89C26.36 28.84 26.28 27.67 26.59 26.57L26.78 25.88L28.96 21.21C29.07 21.11 29.16 20.99 29.24 20.86C30.17 19.41 31.14 18.64 32.22 18.14ZM24.75 18.82C25.41 17.67 26.12 16.76 26.93 16.01C27.1 15.86 27.27 15.71 27.44 15.57C28.16 14.98 28.96 14.51 29.87 14.09C32.06 13.08 34.69 12.73 37.91 12.77L37.8 15.52C34.96 15.45 33.01 15.59 31.38 16.33C29.93 17 28.66 18.04 27.54 19.81C27.52 19.83 27.5 19.85 27.47 19.86C27.45 19.86 27.44 19.86 27.44 19.86C26.77 19.57 25.77 19.17 24.75 18.82ZM14.72 18.01C14.55 18.08 14.39 18.15 14.23 18.24L13.64 18.53C13.52 18.59 13.41 18.65 13.3 18.71L12.73 18.12C12.13 17.58 11.28 16.98 10.18 16.62L10.69 13.96C11.29 14.18 12.07 14.51 12.85 14.93C13.68 15.36 14.47 15.88 15.07 16.46C15.42 16.79 15.68 17.13 15.85 17.46L14.72 18.01ZM18 17.46C18.21 17.46 18.42 17.47 18.63 17.48C18.81 17.49 19 17.5 19.18 17.52C20.46 17.63 21.77 17.89 22.81 18.13C23.53 16.49 24.88 15.07 26.23 13.96C27.36 13.04 28.56 12.27 29.58 11.71C29.43 11.57 29.28 11.45 29.14 11.35C28.96 11.2 28.55 10.95 28.55 10.95C28.55 10.95 28.03 10.43 28.03 10.07V8L25.71 8V10.07C25.71 10.46 25.48 10.81 25.12 10.97L22.34 12.27C21.91 12.47 21.41 12.35 21.12 11.99L19.26 9.67L17.56 10.74L19.29 12.9C19.62 13.3 19.58 13.89 19.2 14.25L19 14.46C19 14.46 18.69 14.8 18.51 15.04C18.12 15.56 17.88 16.06 17.87 16.41C17.86 16.61 17.87 16.89 17.93 17.23C17.96 17.3 17.98 17.38 18 17.46Z"/>',
      GIT: '<path fill-rule="evenodd" clip-rule="evenodd" d="M22.43 7.81C22.45 8.37 22.56 8.7 22.73 8.9C22.97 9.19 23.22 9.29 23.51 9.32C23.84 9.35 24.28 9.27 24.85 9.09C25.13 9.01 25.41 8.9 25.72 8.79C25.75 8.78 25.79 8.77 25.82 8.76C26.09 8.66 26.39 8.55 26.68 8.45C27.32 8.24 28.06 8.04 28.81 8.04C33.61 8.04 36.46 11.79 38.34 15.14C40.64 19.25 40.54 24.38 38.09 28.4C36.48 31.05 34.41 33.34 31.29 34.56C26.75 36.32 21.74 35.64 17.62 33.6C16.7 33.15 15.62 33.84 15.62 34.73V41H13.62V34.73C13.62 32.18 16.42 30.78 18.5 31.81C22.24 33.66 26.66 34.21 30.56 32.69C33.13 31.69 34.89 29.8 36.38 27.36C38.46 23.95 38.54 19.59 36.59 16.12C34.74 12.81 32.4 10.04 28.81 10.04C28.39 10.04 27.9 10.16 27.31 10.35C27.04 10.44 26.78 10.53 26.5 10.64C26.47 10.65 26.44 10.66 26.4 10.67C26.1 10.78 25.77 10.9 25.44 11C24.8 11.2 24.07 11.37 23.33 11.31C22.54 11.24 21.8 10.9 21.2 10.19C20.59 9.47 20.46 8.58 20.43 7.88C20.42 7.51 20.44 7.16 20.45 6.84C20.45 6.79 20.46 6.75 20.46 6.7C20.47 6.44 20.48 6.21 20.48 6L22.48 6C22.48 6.26 22.47 6.55 22.46 6.81C22.45 6.85 22.45 6.9 22.45 6.94C22.43 7.25 22.42 7.54 22.43 7.81ZM13.86 6.51C13.86 6.34 13.86 6.17 13.86 6H15.86C15.86 6.13 15.86 6.25 15.86 6.37C15.86 9.1 15.85 11.4 17.13 13.54C18.01 15.03 19.32 16.08 20.8 17.26C21.02 17.44 21.24 17.61 21.47 17.8C23.27 19.25 23.66 21.23 23.04 22.97C22.45 24.63 20.96 26.01 19.13 26.54C18.15 26.82 17.21 27.03 16.36 27.21C16.17 27.26 15.97 27.3 15.78 27.35C14.77 27.58 13.91 27.79 13.15 28.11C11.71 28.71 10.53 29.67 9.59 31.98C9.2 32.94 9 33.96 9 34.99V41H7V34.99C7 33.7 7.25 32.43 7.74 31.23C8.87 28.45 10.43 27.07 12.38 26.26C13.32 25.88 14.32 25.63 15.34 25.4C15.54 25.35 15.75 25.3 15.95 25.26C16.79 25.07 17.66 24.88 18.58 24.61C19.83 24.26 20.79 23.32 21.16 22.3C21.5 21.34 21.34 20.26 20.21 19.35C20 19.19 19.79 19.02 19.58 18.85C18.11 17.68 16.49 16.39 15.41 14.56C13.84 11.93 13.85 9.11 13.86 6.51Z"/>',
      CNS: '<g transform="scale(2)" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/></g>',
      ENDO_REPRO: '<path fill-rule="evenodd" clip-rule="evenodd" d="M21.58 10.09L21.58 10.09C21.57 10.02 21.57 9.94 21.57 9.86L21.56 9.7C21.52 9.04 21.47 8.04 21.06 7.25C20.84 6.82 20.5 6.41 19.98 6.15C19.46 5.9 18.87 5.84 18.25 5.92C17.69 6 17.19 6.23 16.8 6.6C16.42 6.97 16.2 7.44 16.07 7.91C15.83 8.83 15.93 9.93 16.18 10.98C16.69 13.12 17.92 15.58 19.3 17.26C19.84 17.91 20 18.88 20 19.3V21.5L22 22V20.68C22.88 20.36 23.48 20.21 24.04 20.2C24.58 20.18 25.16 20.3 26 20.65V22L28 21.5L28 19.3C28 18.88 28.16 17.91 28.7 17.26C30.07 15.6 31.36 13.14 31.94 11.01C32.22 9.96 32.36 8.86 32.15 7.94C32.04 7.47 31.82 6.99 31.45 6.61C31.06 6.23 30.56 6 30 5.92C29.38 5.84 28.79 5.9 28.27 6.15C27.75 6.41 27.41 6.82 27.19 7.25C26.78 8.04 26.73 9.04 26.69 9.7L26.68 9.86C26.68 9.94 26.68 10.02 26.67 10.09L26.67 10.09C26.19 9.66 25.56 9.52 25.13 9.45C24.8 9.41 24.49 9.39 24.25 9.39V9.39L24.24 9.39C24.2 9.39 24.17 9.39 24.12 9.39C24.08 9.39 24.05 9.39 24.01 9.39L24 9.39V9.39C23.76 9.39 23.45 9.41 23.12 9.45C22.69 9.52 22.06 9.66 21.58 10.09ZM22.91 11.58C22.92 11.58 22.92 11.57 22.94 11.56C22.96 11.55 22.98 11.55 23 11.54V16H25V11.46C25.08 11.48 25.15 11.5 25.2 11.52C25.25 11.53 25.28 11.55 25.31 11.56C25.33 11.57 25.33 11.58 25.34 11.58C25.76 11.96 26.19 12.28 26.62 12.42C26.85 12.5 27.15 12.55 27.46 12.47C27.8 12.39 28.05 12.19 28.22 11.97C28.5 11.6 28.58 11.13 28.61 10.85C28.65 10.57 28.67 10.24 28.68 9.95L28.69 9.81C28.73 9.06 28.79 8.51 28.97 8.17C29.04 8.03 29.11 7.97 29.16 7.94C29.23 7.91 29.39 7.86 29.73 7.91C29.91 7.93 29.99 7.99 30.03 8.03C30.08 8.08 30.15 8.18 30.2 8.39C30.3 8.84 30.26 9.56 30 10.49C29.51 12.34 28.35 14.53 27.15 15.99C26.48 16.8 26.18 17.79 26.07 18.54C25.35 18.3 24.69 18.18 24 18.2C23.32 18.21 22.65 18.36 21.94 18.59C21.83 17.83 21.53 16.81 20.85 15.99C19.66 14.55 18.56 12.36 18.13 10.52C17.91 9.59 17.89 8.87 18 8.42C18.06 8.21 18.14 8.1 18.2 8.04C18.25 7.99 18.34 7.93 18.52 7.91C18.86 7.86 19.02 7.91 19.09 7.94C19.14 7.97 19.21 8.03 19.28 8.17C19.46 8.51 19.52 9.06 19.56 9.81L19.57 9.95C19.58 10.24 19.6 10.57 19.64 10.85C19.67 11.13 19.75 11.6 20.03 11.97C20.2 12.19 20.45 12.39 20.79 12.47C21.1 12.55 21.4 12.5 21.63 12.42C22.06 12.28 22.49 11.96 22.91 11.58Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M24 42C26.21 42 28 40.21 28 38L28 35.83L26 33.67L26 35.31C25.12 35.64 24.52 35.79 23.96 35.8C23.42 35.82 22.84 35.7 22 35.35V33.67L20 35.83V38C20 40.21 21.79 42 24 42ZM24 40C22.9 40 22 39.1 22 38L22 37.48C22.69 37.71 23.33 37.82 24 37.8C24.67 37.79 25.31 37.65 26 37.43V38C26 39.1 25.1 40 24 40Z"/><path d="M11 19C11.55 19 12 18.55 12 18C12 17.45 11.55 17 11 17C10.45 17 10 17.45 10 18C10 18.55 10.45 19 11 19Z"/><path d="M14 22C14 22.55 13.55 23 13 23C12.45 23 12 22.55 12 22C12 21.45 12.45 21 13 21C13.55 21 14 21.45 14 22Z"/><path d="M11 27C11.55 27 12 26.55 12 26C12 25.45 11.55 25 11 25C10.45 25 10 25.45 10 26C10 26.55 10.45 27 11 27Z"/><path d="M17 31C17 31.55 16.55 32 16 32C15.45 32 15 31.55 15 31C15 30.45 15.45 30 16 30C16.55 30 17 30.45 17 31Z"/><path d="M12 32C12.55 32 13 31.55 13 31C13 30.45 12.55 30 12 30C11.45 30 11 30.45 11 31C11 31.55 11.45 32 12 32Z"/><path d="M17 27C17 27.55 16.55 28 16 28C15.45 28 15 27.55 15 27C15 26.45 15.45 26 16 26C16.55 26 17 26.45 17 27Z"/><path d="M20 29C20.55 29 21 28.55 21 28C21 27.45 20.55 27 20 27C19.45 27 19 27.45 19 28C19 28.55 19.45 29 20 29Z"/><path d="M36 18C36 18.55 36.45 19 37 19C37.55 19 38 18.55 38 18C38 17.45 37.55 17 37 17C36.45 17 36 17.45 36 18Z"/><path d="M35 23C34.45 23 34 22.55 34 22C34 21.45 34.45 21 35 21C35.55 21 36 21.45 36 22C36 22.55 35.55 23 35 23Z"/><path d="M36 26C36 26.55 36.45 27 37 27C37.55 27 38 26.55 38 26C38 25.45 37.55 25 37 25C36.45 25 36 25.45 36 26Z"/><path d="M32 32C31.45 32 31 31.55 31 31C31 30.45 31.45 30 32 30C32.55 30 33 30.45 33 31C33 31.55 32.55 32 32 32Z"/><path d="M35 31C35 31.55 35.45 32 36 32C36.55 32 37 31.55 37 31C37 30.45 36.55 30 36 30C35.45 30 35 30.45 35 31Z"/><path d="M32 28C31.45 28 31 27.55 31 27C31 26.45 31.45 26 32 26C32.55 26 33 26.45 33 27C33 27.55 32.55 28 32 28Z"/><path d="M27 28C27 28.55 27.45 29 28 29C28.55 29 29 28.55 29 28C29 27.45 28.55 27 28 27C27.45 27 27 27.45 27 28Z"/><path d="M24 29C24.55 29 25 28.55 25 28C25 27.45 24.55 27 24 27C23.45 27 23 27.45 23 28C23 28.55 23.45 29 24 29Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M33.23 14.72C33.83 13.22 34.65 12.08 35.64 11.46C36.68 10.8 37.87 10.75 38.92 11.36C39.91 11.93 40.67 13.01 41.18 14.38C41.7 15.77 42 17.55 42 19.68V29.87C42 30.72 41.84 32.68 40.88 34.48C39.89 36.34 38.05 38 34.85 38C33.25 38 32.06 37.55 31.09 36.85C30.23 36.22 29.57 35.41 28.99 34.7L28.88 34.56C28.25 33.78 27.69 33.13 26.96 32.65C26.26 32.18 25.35 31.85 24 31.85C22.65 31.85 21.74 32.18 21.04 32.65C20.31 33.13 19.75 33.78 19.12 34.56L19.01 34.7C18.43 35.41 17.77 36.22 16.91 36.85C15.94 37.55 14.75 38 13.15 38C9.95 38 8.11 36.34 7.12 34.48C6.16 32.68 6 30.72 6 29.87V19.68C6 17.55 6.3 15.77 6.82 14.38C7.33 13.01 8.09 11.93 9.08 11.36C10.13 10.75 11.32 10.8 12.36 11.46C13.35 12.08 14.17 13.22 14.77 14.72C14.93 15.11 15.08 15.52 15.24 15.95C15.75 17.38 16.35 19.01 17.39 20.47C18.69 22.28 20.64 23.74 24 23.74C27.36 23.74 29.31 22.28 30.61 20.47C31.65 19.01 32.25 17.38 32.76 15.95C32.92 15.52 33.07 15.11 33.23 14.72ZM15.77 21.63C17.38 23.89 19.9 25.74 24 25.74C28.1 25.74 30.62 23.89 32.23 21.63C33.46 19.92 34.18 17.92 34.7 16.48C34.84 16.1 34.97 15.76 35.08 15.47C35.6 14.18 36.2 13.46 36.71 13.15C37.16 12.86 37.54 12.87 37.92 13.09C38.36 13.34 38.89 13.95 39.31 15.08C39.72 16.19 40 17.72 40 19.68V29.87C40 30.55 39.86 32.15 39.12 33.54C38.41 34.86 37.19 36 34.85 36C33.67 36 32.89 35.68 32.27 35.23C31.62 34.76 31.12 34.14 30.5 33.38L30.43 33.29C29.81 32.53 29.08 31.65 28.06 30.98C27.02 30.29 25.72 29.85 24 29.85C22.28 29.85 20.98 30.29 19.94 30.98C18.92 31.65 18.19 32.53 17.57 33.29L17.5 33.38C16.88 34.14 16.38 34.76 15.73 35.23C15.11 35.68 14.33 36 13.15 36C10.81 36 9.59 34.86 8.88 33.54C8.14 32.15 8 30.55 8 29.87V19.68C8 17.72 8.28 16.19 8.69 15.08C9.11 13.95 9.64 13.34 10.08 13.09C10.46 12.87 10.84 12.86 11.29 13.15C11.8 13.46 12.4 14.18 12.92 15.47C13.03 15.76 13.16 16.1 13.3 16.48C13.82 17.92 14.54 19.92 15.77 21.63Z"/>',
      URINARY: '<path fill-rule="evenodd" clip-rule="evenodd" d="M12.55 30.75C1.68 26.17 5.97 10.7 13.51 8.15C16.64 7.09 20.09 10.61 20.07 12.79C20.06 13.73 19.57 14.65 19.07 15.61C18.4 16.87 17.7 18.2 18 19.73C18.52 22.43 19.11 26.99 17.6 29.15C16.08 31.31 14.56 31.6 12.55 30.75ZM13.33 28.91C14.11 29.24 14.49 29.22 14.7 29.16C14.92 29.1 15.34 28.88 15.96 28C16.33 27.47 16.58 26.35 16.56 24.67C16.54 23.09 16.29 21.41 16.03 20.11C15.63 18.03 16.46 16.29 17.05 15.15C17.15 14.95 17.25 14.77 17.33 14.61C17.53 14.24 17.69 13.94 17.83 13.62C18.02 13.19 18.07 12.93 18.07 12.77C18.07 12.72 18.04 12.45 17.78 12.02C17.53 11.61 17.16 11.17 16.71 10.8C15.75 10.02 14.82 9.82 14.15 10.04C11.34 11 8.7 14.66 8.11 18.96C7.54 23.09 8.95 27.07 13.33 28.91Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M34.35 8.15C41.89 10.7 46.18 26.17 35.31 30.75C33.3 31.6 31.78 31.31 30.27 29.15C28.75 26.99 29.34 22.43 29.86 19.73C30.16 18.2 29.46 16.87 28.79 15.61C28.29 14.65 27.8 13.73 27.79 12.79C27.77 10.61 31.22 7.09 34.35 8.15ZM33.16 29.16C33.37 29.22 33.75 29.24 34.54 28.91C38.91 27.07 40.32 23.09 39.75 18.96C39.16 14.66 36.52 11 33.71 10.04C33.05 9.82 32.11 10.02 31.15 10.8C30.7 11.17 30.33 11.61 30.08 12.02C29.82 12.45 29.79 12.72 29.79 12.77C29.79 12.93 29.84 13.19 30.03 13.62C30.17 13.94 30.33 14.24 30.53 14.61C30.61 14.77 30.71 14.95 30.81 15.15C31.4 16.29 32.23 18.03 31.83 20.11C31.57 21.41 31.32 23.09 31.3 24.67C31.28 26.35 31.53 27.47 31.9 28C32.52 28.88 32.94 29.1 33.16 29.16Z"/><path d="M28.62 22.78C28.69 23.78 28.69 23.78 28.69 23.78L28.69 23.78L28.69 23.78L28.7 23.78L28.7 23.78L28.7 23.78C28.7 23.78 28.69 23.78 28.68 23.78C28.65 23.78 28.6 23.79 28.54 23.81C28.4 23.85 28.23 23.92 28.06 24.04C27.77 24.24 27.35 24.7 27.35 25.86V40.32C27.35 40.32 27.35 40.32 26.35 40.32C25.35 40.32 25.35 40.32 25.35 40.32V25.86C25.35 24.09 26.06 23.01 26.9 22.41C27.3 22.12 27.7 21.97 27.99 21.89C28.14 21.85 28.27 21.82 28.36 21.8C28.41 21.8 28.45 21.79 28.48 21.79C28.5 21.79 28.51 21.79 28.52 21.78L28.54 21.78L28.54 21.78L28.55 21.78L28.55 21.78C28.55 21.78 28.55 21.78 28.62 22.78Z"/><path d="M19.24 22.78C19.17 23.78 19.17 23.78 19.17 23.78L19.17 23.78L19.17 23.78L19.17 23.78L19.16 23.78L19.16 23.78C19.16 23.78 19.17 23.78 19.18 23.78C19.21 23.78 19.26 23.79 19.32 23.81C19.46 23.85 19.63 23.92 19.8 24.04C20.09 24.24 20.51 24.7 20.51 25.86V40.32C20.51 40.32 20.51 40.32 21.51 40.32C22.51 40.32 22.51 40.32 22.51 40.32V25.86C22.51 24.09 21.8 23.01 20.96 22.41C20.56 22.12 20.16 21.97 19.87 21.89C19.72 21.85 19.59 21.82 19.5 21.8C19.45 21.8 19.41 21.79 19.38 21.79C19.36 21.79 19.35 21.79 19.34 21.78L19.32 21.78L19.32 21.78L19.31 21.78L19.31 21.78C19.31 21.78 19.31 21.78 19.24 22.78Z"/>',
    }[id] || '<path fill-rule="evenodd" clip-rule="evenodd" d="M24 12C25.66 12 27 10.66 27 9C27 7.34 25.66 6 24 6C22.34 6 21 7.34 21 9C21 10.66 22.34 12 24 12ZM24 14C26.76 14 29 11.76 29 9C29 6.24 26.76 4 24 4C21.24 4 19 6.24 19 9C19 11.76 21.24 14 24 14Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M17.37 18.31C18.32 18.49 19 19.32 19 20.28L19 41C19 41.55 19.45 42 20 42H20.09C20.6 42 21.04 41.61 21.08 41.09L22 31C22 29.9 22.9 29.01 24 29.01C25.1 29.01 26 29.9 26 31L26.92 41.09C26.96 41.61 27.4 42 27.91 42H28C28.55 42 29 41.55 29 41V20.32C29 19.36 29.68 18.53 30.63 18.35C32.38 18.02 34.24 17.55 36.28 16.96C36.81 16.81 37.11 16.25 36.96 15.72C36.81 15.19 36.25 14.89 35.72 15.04C31.09 16.39 27.53 17.02 24 17C20.47 16.98 16.91 16.33 12.27 15.04C11.74 14.89 11.18 15.2 11.04 15.73C10.89 16.26 11.2 16.82 11.73 16.96C13.77 17.53 15.62 17.98 17.37 18.31ZM22.98 41.8C22.62 43.08 21.46 44 20.09 44H20C18.34 44 17 42.66 17 41L17 20.28C15.17 19.93 13.27 19.46 11.2 18.89C9.6 18.45 8.67 16.79 9.11 15.2C9.55 13.6 11.21 12.67 12.8 13.11C17.37 14.38 20.74 14.99 24.01 15C27.28 15.01 30.63 14.44 35.16 13.12C36.75 12.66 38.42 13.57 38.88 15.16C39.34 16.75 38.43 18.42 36.84 18.88C34.76 19.49 32.83 19.97 31 20.32V41C31 42.66 29.66 44 28 44H27.91C26.54 44 25.38 43.08 25.02 41.8C24.99 41.69 24.96 41.56 24.95 41.44C24.94 41.39 24.93 41.33 24.93 41.27L24.01 31.18C24 31.12 24 31.06 24 31.01C24 31.06 24 31.12 23.99 31.18L23.07 41.27C23.07 41.33 23.06 41.39 23.05 41.44C23.04 41.56 23.01 41.69 22.98 41.8Z"/>';
    return `<svg class="${cls}" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">${g}</svg>`;
  },

  // Subject glyphs (Health Icons, MIT): skull = Anatomy, brain = Physiology,
  // DNA = Biochemistry, microscope = Histology. Unknown ids get a generic body glyph.
  subjectIcon(id, cls = 'module-icon') {
    const g = {
      anatomy:      '<path fill-rule="evenodd" clip-rule="evenodd" d="M19 19C20.2138 19 21.2364 19.6583 21.9213 20.5716C22.6061 21.4845 23 22.7 23 24C23 25.3 22.6061 26.5155 21.9213 27.4284C21.2364 28.3417 20.2138 29 19 29C17.7862 29 16.7636 28.3417 16.0787 27.4284C15.3939 26.5155 15 25.3 15 24C15 22.7 15.3939 21.4845 16.0787 20.5716C16.7636 19.6583 17.7862 19 19 19ZM21 24C21 23.0909 20.7224 22.3063 20.3213 21.7716C19.9205 21.2371 19.4431 21 19 21C18.5569 21 18.0795 21.2371 17.6787 21.7716C17.2776 22.3063 17 23.0909 17 24C17 24.9091 17.2776 25.6937 17.6787 26.2284C18.0795 26.7629 18.5569 27 19 27C19.4431 27 19.9205 26.7629 20.3213 26.2284C20.7224 25.6937 21 24.9091 21 24Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M26.0787 20.5716C26.7636 19.6583 27.7862 19 29 19C30.2138 19 31.2364 19.6583 31.9213 20.5716C32.6061 21.4845 33 22.7 33 24C33 25.3 32.6061 26.5155 31.9213 27.4284C31.2364 28.3417 30.2138 29 29 29C27.7862 29 26.7636 28.3417 26.0787 27.4284C25.3939 26.5155 25 25.3 25 24C25 22.7 25.3939 21.4845 26.0787 20.5716ZM27.6787 21.7716C27.2776 22.3063 27 23.0909 27 24C27 24.9091 27.2776 25.6937 27.6787 26.2284C28.0795 26.7629 28.5569 27 29 27C29.4431 27 29.9205 26.7629 30.3213 26.2284C30.7224 25.6937 31 24.9091 31 24C31 23.0909 30.7224 22.3063 30.3213 21.7716C29.9205 21.2371 29.4431 21 29 21C28.5569 21 28.0795 21.2371 27.6787 21.7716Z" fill="currentColor"/><path d="M24 29L23.9818 29.0084C23.7321 29.1255 21 30.4486 21 32.2759C21 33.1061 21.5794 33.8805 22.3993 33.9874C22.4627 33.9957 22.5276 34 22.5937 34C23.233 34 23.7073 33.6278 24 33.0998C24.2928 33.6278 24.7671 34 25.4062 34C25.4724 34 25.5373 33.9957 25.6007 33.9874C26.4205 33.8805 27 33.1062 27 32.2759C27 30.369 24.0178 29.0078 24.0178 29.0078L24 29Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M12.9693 7.55747C10.3617 9.822 9 12.9793 9 16.5C9 19.9313 9.79883 22.0837 10.6056 23.6972C10.7892 24.0644 10.9724 24.4022 11.1375 24.7065L11.1717 24.7696C11.349 25.0966 11.5003 25.3782 11.6275 25.6468C11.8792 26.1781 12 26.5857 12 27V30.9992C12 31.5515 12.4477 32 13 32L13.0157 32C13.0295 32.5428 13.0556 33.2704 13.1047 34.0863C13.2082 35.8049 13.4178 37.9883 13.8559 39.6552C14.0237 40.2938 14.4243 40.8384 14.9753 41.1919C16.2644 42.0189 19.7777 44 24 44C28.2223 44 31.7356 42.0189 33.0247 41.1919C33.5757 40.8384 33.9763 40.2938 34.1441 39.6552C34.5822 37.9883 34.7918 35.8049 34.8953 34.0863C34.9444 33.2704 34.9705 32.5428 34.9843 32L35 32C35.5523 32 36 31.5515 36 30.9992V27C36 26.5857 36.1208 26.1781 36.3725 25.6468C36.4997 25.3782 36.651 25.0966 36.8283 24.7696L36.8625 24.7065C37.0276 24.4022 37.2109 24.0643 37.3944 23.6972C38.2012 22.0837 39 19.9313 39 16.5C39 12.9793 37.6383 9.822 35.0307 7.55747C32.4332 5.30179 28.6812 4 24 4C19.3188 4 15.5668 5.30179 12.9693 7.55747ZM32.6164 32.5382C32.7167 32.4701 32.8348 32.4036 32.9736 32.3418C32.9587 32.8049 32.9354 33.3606 32.8989 33.9661C32.7966 35.665 32.5948 37.6821 32.2098 39.1468C32.1708 39.295 32.0786 39.4227 31.9448 39.5085C30.7664 40.2645 27.6482 42 24 42C20.3518 42 17.2336 40.2645 16.0552 39.5085C15.9214 39.4227 15.8292 39.295 15.7902 39.1468C15.4052 37.6821 15.2034 35.665 15.1011 33.9661C15.0646 33.3606 15.0413 32.8049 15.0264 32.3418C15.1652 32.4036 15.2833 32.4701 15.3836 32.5382C15.7823 32.809 15.9892 33.1635 16.0954 33.567C16.2073 33.9921 16.2028 34.4631 16.1546 34.8974C16.1309 35.1101 16.0985 35.301 16.069 35.4672L16.0613 35.5108C16.0496 35.5764 16.0373 35.6455 16.028 35.7038C16.0192 35.759 16 35.8793 16 36C16 36.8549 16.7238 37.6113 17.8492 38.1037C19.0297 38.6201 20.9369 39 24 39C27.0631 39 28.9703 38.6201 30.1508 38.1037C31.2762 37.6113 32 36.8549 32 36C32 35.8793 31.9808 35.759 31.972 35.7038C31.9627 35.6455 31.9504 35.5764 31.9387 35.5108L31.931 35.4672C31.9015 35.301 31.8691 35.1101 31.8454 34.8974C31.7972 34.4631 31.7927 33.9921 31.9046 33.567C32.0108 33.1635 32.2177 32.809 32.6164 32.5382ZM29.3492 36.2713C28.5297 36.6299 26.9369 37 24 37C21.0631 37 19.4703 36.6299 18.6508 36.2713C18.2723 36.1057 18.0995 35.9662 18.0253 35.8899L18.0384 35.816C18.0695 35.6404 18.1113 35.3977 18.1423 35.1182C18.2034 34.5682 18.2302 33.8204 18.0296 33.058C17.8233 32.274 17.374 31.4723 16.5071 30.8836C15.8566 30.4419 15.0275 30.1586 14 30.0501V27C14 26.1643 13.7458 25.4469 13.435 24.7907C13.281 24.4655 13.1042 24.1378 12.9299 23.8163L12.8984 23.7582C12.731 23.4496 12.5625 23.139 12.3944 22.8028C11.7012 21.4163 11 19.5687 11 16.5C11 13.5207 12.1383 10.928 14.2807 9.06753C16.4332 7.19821 19.6812 6 24 6C28.3188 6 31.5668 7.19821 33.7193 9.06753C35.8617 10.928 37 13.5207 37 16.5C37 19.5687 36.2988 21.4163 35.6056 22.8028C35.4375 23.139 35.269 23.4496 35.1016 23.7582L35.0701 23.8163C34.8958 24.1378 34.719 24.4655 34.565 24.7907C34.2542 25.4469 34 26.1643 34 27V30.0501C32.9725 30.1586 32.1434 30.4419 31.4929 30.8836C30.626 31.4723 30.1767 32.274 29.9704 33.058C29.7698 33.8204 29.7966 34.5682 29.8577 35.1182C29.8887 35.3977 29.9305 35.6404 29.9616 35.816L29.9747 35.8899C29.9005 35.9662 29.7277 36.1057 29.3492 36.2713Z" fill="currentColor"/>',
      physiology:   '<g transform="scale(2)" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/></g>',
      biochemistry: '<path fill-rule="evenodd" clip-rule="evenodd" d="M35 9.22967V6H33V9H15V6H13V9.22967C13 14.6524 15.5895 19.6466 19.8037 22.7875C20.4275 22.3933 21.0782 22.0334 21.7536 21.7107C19.8831 20.4891 18.329 18.8727 17.1851 17H30.8149C29.2395 19.5789 26.8863 21.6719 24 22.9172C23.9947 22.9194 23.9894 22.9217 23.9841 22.924C23.8665 22.9746 23.748 23.0238 23.6286 23.0715C22.9531 23.3417 22.302 23.6524 21.6777 24C16.8813 26.6708 13.6672 31.5245 13.0925 37H13V38.7703V39V42H15V39H33V42H35V39V38.7703V37H34.9075C34.4113 32.2723 31.9474 28.0082 28.1963 25.2125C27.5725 25.6067 26.9218 25.9666 26.2464 26.2893C28.1169 27.5109 29.671 29.1273 30.8149 31H17.1851C18.7605 28.4211 21.1137 26.3281 24 25.0828C24.0053 25.0806 24.0106 25.0783 24.0159 25.076C24.1335 25.0254 24.252 24.9762 24.3714 24.9285C25.0469 24.6583 25.698 24.3476 26.3223 24C31.63 21.0445 35 15.4159 35 9.22967ZM31.8385 33H16.1615C15.6308 34.2636 15.2711 35.608 15.1051 37H32.8949C32.7289 35.608 32.3692 34.2636 31.8385 33ZM16.1615 15H31.8385C32.3692 13.7364 32.7289 12.392 32.8949 11H15.1051C15.2711 12.392 15.6308 13.7364 16.1615 15Z" fill="currentColor"/>',
      histology:    '<path fill-rule="evenodd" clip-rule="evenodd" d="M19.77 8.3L21.26 7.45L22.24 9.15C23.57 8.72 25.06 9.25 25.79 10.5L30.31 18.28C31.15 19.71 30.66 21.54 29.22 22.37L28.37 22.85L29.05 24.16L26.37 25.52L25.77 24.35L25.1 24.73C23.66 25.55 21.82 25.06 20.99 23.63L18.07 18.6C15.5 20.08 13.74 21.72 12.79 23.61C11.99 25.19 11.73 27.03 12.17 29.24C13.6 28.45 15.25 28 17 28C20.27 28 23.17 29.57 25 32L37.08 25.18L38.08 26.92L26.03 33.71C26.65 35.01 27 36.46 27 38C27 38.68 26.93 39.35 26.8 40H40C40.55 40 41 40.45 41 41C41 41.55 40.55 42 40 42H7.83C7.3 40.78 7 39.42 7 38C7 35 8.32 32.32 10.4 30.48C9.64 27.56 9.86 24.97 11 22.71C12.19 20.35 14.31 18.46 17.06 16.87L16.46 15.85C15.82 14.75 15.97 13.41 16.72 12.48L15.66 10.64L17.16 9.79L15.92 7.56L18.55 6.11L19.77 8.3ZM28.58 19.28L24.06 11.5C23.78 11.02 23.17 10.86 22.69 11.13L18.57 13.49C18.09 13.77 17.92 14.38 18.2 14.86L22.72 22.63C23 23.11 23.61 23.27 24.09 23L28.21 20.64C28.69 20.36 28.86 19.75 28.58 19.28ZM24.75 40C24.91 39.36 25 38.69 25 38C25 36.82 24.74 35.7 24.29 34.69L19.48 37.4L18.49 35.66L23.24 32.99C21.77 31.17 19.52 30 17 30C12.58 30 9 33.58 9 38C9 38.69 9.09 39.36 9.25 40H24.75Z"/>',
    }[id];
    if (!g) return this.moduleIcon('__generic__', cls);
    return `<svg class="${cls}" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">${g}</svg>`;
  },

  // One unified dot for every topic (topics are added over time, so no per-topic glyphs)
  topicIcon() {
    return '<svg class="topic-dot" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>';
  },

  // Topic row meta line. With a professor the count is shortened to save space: "14 Qs · Prof. Samaa" (plain text, one grey,
  // no badge; if the row is too narrow the end of the line, the professor, is cut with an ellipsis). Without a professor
  // there is room, so the count keeps its full words: "14 Questions".
  topicMeta(count, professor) {
    const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const n = Number(count) || 0;
    if (!professor) return `<span class="topic-row__line">${n} Question${n === 1 ? '' : 's'}</span>`;
    return `<span class="topic-row__line" title="Questions by ${esc(professor)}">${n} ${n === 1 ? 'Q' : 'Qs'} · ${esc(professor)}</span>`;
  },

  // Professor badge — returns '' when no professor is set on the topic
  professorBadge(name) {
    if (!name) return '';
    const safe = String(name).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return `<span class="badge badge--prof" title="Questions by ${safe}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span class="badge--prof__text">${safe}</span></span>`;
  },


  // Latest study activity for a module, derived from existing progress records (no storage change).
  _moduleActivity(mod, progressMap) {
    let ts = 0, topic = '', latestKey = '';
    const prefix = mod.id + '|';
    Object.keys(progressMap || {}).forEach(k => {
      if (!k.startsWith(prefix)) return;
      const t = progressMap[k]?.updatedAt || 0;
      if (t > ts) { ts = t; latestKey = k; }
    });
    if (latestKey) {
      const [, examType, subject, subSubject] = latestKey.split('|');
      const list = mod.subSubjects?.[examType]?.[subject] || [];
      topic = (list.find(x => x.id === subSubject) || {}).label || '';
    }
    return { ts, topic };
  },

  _timeAgo(ts) {
    const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (sec < 60)     return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60)     return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24)      return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day === 1)    return 'yesterday';
    if (day < 30)     return `${day}d ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },

  // Phone module carousel: drives the scale/fade "wheel" effect (--d = 0 centred … 1 far)
  // and the page dots. Harmless on wider screens, where the cards are a normal grid.
  initModuleCarousel() {
    if (this._carouselCleanup) { this._carouselCleanup(); this._carouselCleanup = null; }
    const track = document.querySelector('.modules-grid');
    if (!track) return;
    const cards = [...track.querySelectorAll('.module-card')];
    const dots  = [...document.querySelectorAll('.modules-dots__dot')];
    if (cards.length < 2) return;

    let raf = 0;
    const gap = () => parseFloat(getComputedStyle(track).columnGap) || 12;
    const pad = () => parseFloat(getComputedStyle(track).paddingLeft) || 0;
    const update = () => {
      raf = 0;
      const step = cards[0].offsetWidth + gap();
      let best = 0, bestDist = Infinity;
      cards.forEach((c, i) => {
        // distance of each card from the snap position (left edge, after the track padding)
        const dist = Math.abs(c.offsetLeft - track.scrollLeft - pad());
        c.style.setProperty('--d', Math.min(dist / step, 1).toFixed(3));
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      if (track.scrollLeft >= track.scrollWidth - track.clientWidth - 2) best = cards.length - 1;
      dots.forEach((d, i) => d.classList.toggle('modules-dots__dot--active', i === best));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    const goTo = i => {
      const c = cards[i];
      if (c) track.scrollTo({ left: c.offsetLeft - pad(), behavior: 'smooth' });
    };
    const onDot = e => {
      const dot = e.target.closest('[data-dot]');
      if (dot) goTo(parseInt(dot.dataset.dot, 10));
    };
    const dotsEl = document.querySelector('.modules-dots');

    track.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    dotsEl && dotsEl.addEventListener('click', onDot);
    update();

    this._carouselCleanup = () => {
      track.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      dotsEl && dotsEl.removeEventListener('click', onDot);
      if (raf) cancelAnimationFrame(raf);
    };
  },

  _calcModuleProgress(mod, config, progressMap) {
    const subSubjects = mod.subSubjects || {};
    let completed   = 0;
    let total       = 0;
    let scoreSum    = 0;
    let scoredCount = 0;
    config.examTypes.forEach(et => {
      config.subjects.forEach(sub => {
        const list = (subSubjects[et.id] && subSubjects[et.id][sub.id]) || [];
        total += list.length;
        list.forEach(ss => {
          const key = `${mod.id}|${et.id}|${sub.id}|${ss.id}`;
          const entry = progressMap[key];
          if (entry?.completed) {
            completed++;
            if (typeof entry.score === 'number') {
              scoreSum += entry.score;
              scoredCount++;
            }
          }
        });
      });
    });
    return {
      setsCompleted: completed,
      totalSets:     total,
      percent:       total > 0 ? Math.round((completed / total) * 100) : 0,
      avgScore:      scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0,
    };
  },
};