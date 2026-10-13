/**
 * ============================================================
 * DEPT. Q. BANK — ui.js  (v3 — subject & exam-type wide exams)
 * ============================================================
 */

const UI = {

  get root() { return document.getElementById('app'); },

  setContent(html) {
    this.root.innerHTML = html;
    this.root.classList.remove('page-enter');
    void this.root.offsetWidth;
    this.root.classList.add('page-enter');
  },

  toast(message, type = 'info', duration = 2800) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = `toast toast--${type}`;
    t.innerHTML = `<span class="toast__icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>${message}`;
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

  // ─── Skeleton loaders ───────────────────────────────────────────────────

  _skel(w, h, radius = '5px', extra = '') {
    return `<span class="skeleton" style="display:block;width:${w};height:${h};border-radius:${radius};${extra}"></span>`;
  },

  skeletonDashboard() {
    const pill = `<div class="stat-pill">
        ${this._skel('44%', '22px', '5px')}
        <div style="margin-top:8px">${this._skel('70%', '9px', '4px')}</div>
      </div>`;

    const moduleCard = `<div class="module-card" style="cursor:default">
        <div class="module-card__header">
          ${this._skel('32px', '32px', 'var(--radius-sm)')}
          <div class="module-card__meta">
            ${this._skel('80px', '16px', '4px')}
            <div style="margin-top:7px">${this._skel('60%', '11px', '4px')}</div>
            <div style="margin-top:7px">${this._skel('35%', '9px', '4px')}</div>
          </div>
        </div>
        ${this._skel('100%', '6px', '999px')}
        <div class="module-card__row">${this._skel('130px', '30px', '6px')}${this._skel('90px', '16px', '4px')}</div>
      </div>`;

    return `
    <div class="dashboard">
      <div class="dashboard__intro">
        <div>
          ${this._skel('170px', '28px', '6px')}
          <div style="margin-top:9px">${this._skel('230px', '13px', '4px')}</div>
        </div>
        <div class="dashboard__quickactions">
          ${this._skel('38px', '38px', 'var(--radius)')}
          ${this._skel('38px', '38px', 'var(--radius)')}
        </div>
      </div>
      <aside class="dashboard__rail">
        <div class="dashboard__skel-title" style="margin-bottom:14px">${this._skel('64px', '11px', '4px')}</div>
        <div class="stats-strip">${pill}${pill}${pill}</div>
      </aside>
      <section class="section">
        <div class="dashboard__skel-title" style="margin-bottom:14px">${this._skel('76px', '11px', '4px')}</div>
        <div class="modules-grid">${moduleCard.replace('class="module-card"', 'class="module-card module-card--hero"')}${moduleCard}</div>
      </section>
    </div>`;
  },

  skeletonPageHeader() {
    return `<div class="page__header">
      ${this._skel('36px', '36px', 'var(--radius-sm)')}
      <div>
        ${this._skel('160px', '18px', '4px')}
        <div style="margin-top:8px">${this._skel('220px', '11px', '4px')}</div>
      </div>
    </div>`;
  },

  // Progress rail placeholder (PC/tablet only; hidden on phone by CSS)
  skeletonRail() {
    const pill = `<div class="stat-pill">
        ${this._skel('36px', '18px', '5px')}
        <div style="margin-top:8px">${this._skel('80%', '9px', '4px')}</div>
      </div>`;
    return `<aside class="dashboard__rail">
      <div class="dashboard__skel-title" style="margin-bottom:14px">${this._skel('64px', '11px', '4px')}</div>
      <div class="stats-strip">${pill}${pill}${pill}</div>
    </aside>`;
  },

  // Module page — exam-type sections with rows of subject cards
  skeletonModule() {
    const row = `<div class="subject-card" style="cursor:default">
        <div class="subject-card__left">
          ${this._skel('28px', '28px', 'var(--radius-sm)')}
          <div class="subject-card__text">
            ${this._skel('120px', '13px', '4px')}
            <div style="margin-top:6px">${this._skel('80px', '10px', '4px')}</div>
          </div>
        </div>
        ${this._skel('16px', '16px', '3px')}
      </div>`;

    const section = `<div class="exam-type-section">
        <div class="exam-type-header">
          <div class="exam-type-header__top">
            <div>
              ${this._skel('130px', '13px', '4px')}
              <div style="margin-top:6px">${this._skel('180px', '10px', '4px')}</div>
            </div>
          </div>
        </div>
        <div class="subjects-list">${row}${row}${row}</div>
      </div>`;

    return `<div class="page skeleton-page module-page has-rail">
      ${this.skeletonPageHeader()}
      ${this.skeletonRail()}
      <div class="page__main">${section}${section}</div>
    </div>`;
  },

  // Subject page — topic-panel CTA + row-based topics list
  skeletonSubject() {
    const row = `<div class="topic-row" style="cursor:default">
        <div class="topic-row__left">
          ${this._skel('36px', '36px', 'var(--radius-sm)')}
          <div>
            ${this._skel('110px', '13px', '4px')}
            <div style="margin-top:6px">${this._skel('70px', '10px', '4px')}</div>
          </div>
        </div>
        ${this._skel('16px', '16px', '3px')}
      </div>`;

    return `<div class="page skeleton-page subject-page has-rail">
      ${this.skeletonPageHeader()}
      ${this.skeletonRail()}
      <div class="page__main">
        <div class="topic-panel">
          ${this._skel('75%', '11px', '4px')}
          <div style="margin-top:14px">${this._skel('240px', '44px', 'var(--radius)')}</div>
        </div>
        <div class="page-label">${this._skel('60px', '10px', '4px')}</div>
        <div class="topics-list">${row}${row}${row}${row}${row}</div>
      </div>
    </div>`;
  },

  // Sub-subject page — stat pills + action panel
  skeletonSubSubject() {
    const pill = `<div class="stat-pill">
        ${this._skel('36px', '20px', '5px')}
        <div style="margin-top:8px">${this._skel('80%', '9px', '4px')}</div>
      </div>`;

    return `<div class="page skeleton-page subsubject-page has-rail">
      ${this.skeletonPageHeader()}
      ${this.skeletonRail()}
      <div class="page__main">
        <div class="stats-strip" style="margin-bottom:18px">${pill}${pill}${pill}</div>
        <div class="topic-panel">
          <div class="topic-panel__primary">
            ${this._skel('150px', '44px', 'var(--radius)')}
            ${this._skel('110px', '44px', 'var(--radius)')}
          </div>
          <div class="topic-panel__divider"></div>
          <div class="topic-panel__secondary">
            ${this._skel('90px', '11px', '4px')}
            <div style="display:flex;gap:8px">
              ${this._skel('96px', '34px', 'var(--radius)')}${this._skel('84px', '34px', 'var(--radius)')}
            </div>
          </div>
        </div>
      </div>
    </div>`;
  },

  // Exam page — sidebar palette + question card + options + nav
  skeletonExam() {
    const paletteCell = this._skel('100%', '30px', 'var(--radius-sm)');
    const option = this._skel('100%', '52px', 'var(--radius)');
    return `<div class="exam-layout">
      <aside class="exam-sidebar">
        <div class="exam-sidebar__header">
          ${this._skel('70%', '14px', '4px')}
          <div style="margin-top:6px">${this._skel('50%', '10px', '4px')}</div>
        </div>
        ${this._skel('100%', '6px', '999px', 'margin:14px 0')}
        <div class="palette">${Array(10).fill(paletteCell).join('')}</div>
      </aside>
      <div class="exam-main">
        <div class="exam-topbar">
          ${this._skel('72px', '30px', 'var(--radius)')}
          ${this._skel('84px', '30px', 'var(--radius)', 'margin-left:auto')}
        </div>
        <div class="question-card">
          ${this._skel('110px', '10px', '4px', 'margin-bottom:16px')}
          ${this._skel('92%', '15px', '4px')}
          <div style="margin-top:8px">${this._skel('78%', '15px', '4px')}</div>
          <div style="margin-top:8px">${this._skel('55%', '15px', '4px')}</div>
        </div>
        <div class="options-list">${Array(4).fill(option).join('')}</div>
        <div class="exam-nav">
          ${this._skel('120px', '38px', 'var(--radius)')}
          ${this._skel('180px', '38px', 'var(--radius)', 'margin-left:auto')}
        </div>
      </div>
    </div>`;
  },

  // Wide exam start page — stat-pill row + topic panel + breakdown card
  skeletonWideExamStart() {
    const pill = `<div class="stat-pill">
        ${this._skel('50%', '18px', '5px')}
        <div style="margin-top:8px">${this._skel('80%', '9px', '4px')}</div>
      </div>`;

    return `<div class="page skeleton-page wide-exam-start-page has-rail">
      ${this.skeletonPageHeader()}
      ${this.skeletonRail()}
      <div class="page__main">
        <div class="stats-strip" style="margin-bottom:18px">${pill}${pill}${pill}</div>
        <div class="topic-panel" style="margin-bottom:18px">
          ${this._skel('85%', '11px', '4px')}
          <div style="margin-top:14px">${this._skel('220px', '44px', 'var(--radius)')}</div>
        </div>
        <div class="wide-exam-breakdown">
          <div style="margin-bottom:12px">${this._skel('100px', '10px', '4px')}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${this._skel('90px', '26px', 'var(--radius-sm)')}${this._skel('110px', '26px', 'var(--radius-sm)')}${this._skel('80px', '26px', 'var(--radius-sm)')}${this._skel('100px', '26px', 'var(--radius-sm)')}
          </div>
        </div>
      </div>
    </div>`;
  },

  // Generic app-shell skeleton, shown once on first boot before config loads
  skeletonAppBoot() {
    return this.skeletonDashboard();
  },

  emptyState(title, body, icon = '📭') {
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

  progressBar(percent, color = 'var(--primary)') {
    const p = Math.min(100, Math.max(0, percent));
    return `<div class="progress-bar" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar__fill" style="width:${p}%;background:${color}"></div>
    </div>`;
  },

  formatStudyTime(totalSeconds) {
    const totalMinutes = Math.round((totalSeconds || 0) / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },

  scoreRing(percent) {
    const r = 52, circ = 2 * Math.PI * r;
    const offset = circ - (percent / 100) * circ;
    const color  = percent >= 70 ? 'var(--success)' : percent >= 50 ? 'var(--warning)' : 'var(--danger)';
    return `<div class="score-ring">
      <svg viewBox="0 0 120 120" width="120" height="120">
        <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--border)" stroke-width="10"/>
        <circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="10"
          stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 60 60)"
          style="transition:stroke-dashoffset 1s ease"/>
      </svg>
      <div class="score-ring__label">
        <span class="score-ring__value" style="color:${color}">${percent}%</span>
      </div>
    </div>`;
  },

  // ─── Confetti (lightweight canvas celebration) ─────────────────────────────

  launchConfetti() {
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const colors = ['#1B3A6B', '#2a5298', '#0f9b82', '#d97706', '#4A9E8E'];
    const pieces = Array.from({ length: 140 }, () => ({
      x:        Math.random() * canvas.width,
      y:        -20 - Math.random() * canvas.height * 0.4,
      w:        5 + Math.random() * 5,
      h:        8 + Math.random() * 6,
      color:    colors[Math.floor(Math.random() * colors.length)],
      speed:    2 + Math.random() * 3,
      drift:    (Math.random() - 0.5) * 2.2,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
    }));

    const onResize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    let frame = 0;
    const maxFrames = 210;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.y        += p.speed;
        p.x        += p.drift;
        p.rotation += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < maxFrames) {
        requestAnimationFrame(draw);
      } else {
        window.removeEventListener('resize', onResize);
        canvas.remove();
      }
    };
    draw();
  },

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
      <div class="resume-banner__info">
        <span class="resume-banner__icon">
          <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polygon points="10,8.3 16,12 10,15.7" fill="currentColor" stroke="none"/></svg>
        </span>
        <div class="resume-banner__text">
          <div class="resume-banner__title">Continue Exam</div>
          <div class="resume-banner__subtitle">${mod?.title || saved.config.module} · ${setLabel} — Question ${currentQ} / ${totalQ}</div>
        </div>
      </div>
      <div class="resume-banner__actions">
        <button class="btn btn--primary btn--sm" data-nav="resume-exam">Resume <svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
        <button class="icon-btn resume-banner__dismiss" id="resume-dismiss-btn" aria-label="Abandon exam">
          <svg class="icon icon--sm" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
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
    const visibleMods = config.modules
      .filter(mod => {
        if (!countMap) return true;
        return Object.keys(countMap).some(k => k.startsWith(mod.id + '|') && countMap[k] > 0);
      })
      .map(mod => ({ mod, act: this._moduleActivity(mod, progressMap) }))
      .sort((x, y) => y.act.ts - x.act.ts);

    const arrowSvg = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

    const modulesHTML = visibleMods.map(({ mod, act }, i) => {
      const mp = this._calcModuleProgress(mod, config, progressMap);
      return `<div class="module-card${i === 0 ? ' module-card--hero' : ''}" data-nav="module" data-params='${JSON.stringify({ moduleId: mod.id })}' tabindex="0" role="button" aria-label="Open ${mod.title}">
        <div class="module-card__header">
          <span class="module-card__icon">${this.moduleIcon(mod.id)}</span>
          <div class="module-card__meta">
            <h3 class="module-card__title">${mod.title}</h3>
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

    const flaggedBtn = `<button class="quick-icon-btn quick-icon-btn--success${flagged.length === 0 ? ' quick-icon-btn--empty' : ''}" data-nav="flagged-review" title="Flagged" aria-label="Flagged questions${flagged.length > 0 ? ` (${flagged.length})` : ''}">
          <svg class="icon" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          ${flagged.length > 0 ? `<span class="quick-icon-btn__badge" style="background:var(--success)">${flagged.length}</span>` : ''}
        </button>`;

    const chevron = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
    const railAction = (nav, icon, label, n) => `<button class="rail-action" data-nav="${nav}" aria-label="Review ${label.toLowerCase()} questions (${n})">
          <span class="rail-action__label">${icon}${label}</span>
          <span class="rail-action__end"><span class="rail-action__count${n ? '' : ' rail-action__count--zero'}">${n}</span>${chevron}</span>
        </button>`;
    const incIcon  = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>';
    const flagIcon = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';
    const actionsHTML = railAction('review', incIcon, 'Incorrect', incorrect.length) + railAction('flagged-review', flagIcon, 'Flagged', flagged.length);

    return `
    <div class="dashboard">
      <div class="dashboard__intro">
        <div>
          <h1 class="dashboard__greeting">Welcome back</h1>
          <p class="dashboard__subgreeting">ZNU medical students, the A⁺ is waiting...</p>
        </div>
        <div class="dashboard__quickactions">
          ${reviewBtn}
          ${flaggedBtn}
        </div>
      </div>
      ${resumeBannerHTML}
      <aside class="dashboard__rail">
        <h2 class="section__title">Progress</h2>
        <div class="stats-strip">${statsHTML}${actionsHTML}</div>
      </aside>
      <section class="section">
        <h2 class="section__title">Modules</h2>
        <div class="modules-grid">${modulesHTML}</div>
        ${dotsHTML}
      </section>
      <footer class="dashboard__footer">
        <p>Made by <strong>Kareem Farouk</strong> · Questions by Department Heads</p>
        <p>Visit the <a href="https://harvest-programme.web.app/index.html" target="_blank" rel="noopener noreferrer" class="harvest-link">Harvest Programme</a> for exam simulation & more</p>
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
    const params = { moduleId: f.moduleId, examType: f.examType, subject: f.subject, subSubject: f.subSubject, label: f.label };
    const chevron  = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
    const incIcon  = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>';
    const flagIcon = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';
    const action = (nav, icon, label, n) => `<button class="rail-action" data-nav="${nav}" data-params='${JSON.stringify(params)}' aria-label="Review ${label.toLowerCase()} questions (${n})">
        <span class="rail-action__label">${icon}${label}</span>
        <span class="rail-action__end"><span class="rail-action__count${n ? '' : ' rail-action__count--zero'}">${n}</span>${chevron}</span>
      </button>`;
    return `<aside class="dashboard__rail">
      <h2 class="section__title">Progress</h2>
      <div class="stats-strip">${lead}${stats}${action('scoped-review', incIcon, 'Incorrect', st.incorrect)}${action('scoped-flagged', flagIcon, 'Flagged', st.flagged)}</div>
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

    const examTypesHTML = config.examTypes.map(et => {
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
            ${completed === subSubs.length && subSubs.length > 0 ? `<span class="badge badge--success">Done</span>` : ''}
            <span class="subject-card__arrow"><svg class="icon icon--sm" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
          </div>
        </div>`;
      }).join('');

      if (!subjectsHTML) return '';

      // Total questions for this exam type
      const etTotalQ = countMap
        ? Object.entries(countMap)
            .filter(([k]) => k.startsWith(`${mod.id}|${et.id}|`))
            .reduce((acc, [, n]) => acc + n, 0)
        : null;

      const fullExamBtn = etTotalQ > 0
        ? `<button class="btn btn--primary wide-exam-btn"
            data-nav="wide-exam-start"
            data-params='${JSON.stringify({ moduleId: mod.id, examType: et.id, scope: 'examtype' })}'>
            Start Full ${et.label} <span class="badge badge--count">${etTotalQ} Q</span>${arrow}
          </button>`
        : '';

      return `<div class="exam-type-section">
        <div class="exam-type-header">
          <div class="exam-type-header__top">
            <div>
              <h3 class="exam-type-header__title">${et.label}</h3>
              <p class="exam-type-header__desc">${et.description}</p>
            </div>
            ${fullExamBtn}
          </div>
        </div>
        <div class="subjects-list">${subjectsHTML}</div>
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
          <p class="wide-exam-note">Practice every topic in ${sub.label} as one shuffled exam.</p>
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
            <div class="topic-row__name">${ss.label}</div>
            <div class="topic-row__meta">${qCount} Question${qCount === 1 ? '' : 's'}${prog.completed ? '' : ' · Not attempted'}</div>
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

  // ─── Sub-subject page — exam start screen ────────────────────────────────

  renderSubSubject(mod, examType, subjectId, subSubjectId, questionCount, progress, config) {
    const sub    = config.subjects.find(s => s.id === subjectId);
    const et     = config.examTypes.find(e => e.id === examType);
    const subSubs = (mod.subSubjects && mod.subSubjects[examType] && mod.subSubjects[examType][subjectId]) || [];
    const ss     = subSubs.find(s => s.id === subSubjectId) || { label: subSubjectId };
    const pct    = progress && progress.total ? Math.round((progress.correct / progress.total) * 100) : 0;
    const pctColor = pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
    const noQ    = questionCount === 0;

    const statPills = [
      { label: 'Questions Available', value: questionCount },
      ...(progress ? [
        { label: 'Last Score',   value: `${pct}%`, color: pctColor },
        { label: 'Last Attempt', value: new Date(progress.lastAttempt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) },
      ] : []),
    ].map(s => `<div class="stat-pill"><div class="stat-pill__value"${s.color ? ` style="color:${s.color}"` : ''}>${s.value}</div><div class="stat-pill__label">${s.label}</div></div>`).join('');

    const retryBtn = progress
      ? `<button class="btn btn--ghost btn--lg" id="retry-exam-btn">
          <svg class="icon icon--sm" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg> Retry
        </button>` : '';

    const rail = this.scopeRail(
      { moduleId: mod.id, examType, subject: subjectId, subSubject: subSubjectId, label: ss.label },
      { lead: [['Questions', questionCount], ['Last Score', progress ? `${pct}%` : '—']], stats: ['accuracy', 'time'] }
    );

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
        </div>
      </header>
      ${rail}
      <div class="page__main">
      ${noQ
        ? this.emptyState(
            'No Questions Yet',
            `Add questions to <code>data/${mod.dataPath}/${examType}/${subjectId}/${subSubjectId}.json</code> in your repo.`,
            this.subjectIcon(subjectId, 'module-icon module-icon--lg')
          )
        : `<div class="page-label page-label--wide">Exam</div>
          <div class="stats-strip" style="margin-bottom:18px">${statPills}</div>
          <div class="topic-panel">
            <div class="topic-panel__primary">
              <button class="btn btn--primary btn--lg" id="start-exam-btn">
                Start Exam <svg class="icon icon--sm" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
              ${retryBtn}
            </div>
            <div class="topic-panel__divider"></div>
            <div class="topic-panel__secondary">
              <span class="topic-panel__secondary-label">Review This Topic</span>
              <div class="topic-panel__secondary-actions">
                <button class="topic-action-btn topic-action-btn--danger" data-nav="scoped-review"
                  data-params='${JSON.stringify({ moduleId: mod.id, examType, subject: subjectId, subSubject: subSubjectId, label: ss.label })}'
                  title="Incorrect answers in this topic">
                  <svg class="icon icon--sm" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                  <span>Incorrect</span>
                </button>
                <button class="topic-action-btn topic-action-btn--success" data-nav="scoped-flagged"
                  data-params='${JSON.stringify({ moduleId: mod.id, examType, subject: subjectId, subSubject: subSubjectId, label: ss.label })}'
                  title="Flagged questions in this topic">
                  <svg class="icon icon--sm" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                  <span>Flagged</span>
                </button>
              </div>
            </div>
          </div>`
      }
      </div>
    </div>`;
  },

  // ─── NEW: Wide exam start page (subject-level or examtype-level) ──────────

  renderWideExamStart(mod, params, totalCount, config) {
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

    const statPills = [
      { label: 'Total Questions', value: totalCount },
      { label: 'Question Order',  value: 'Randomized' },
      { label: 'Feedback',        value: 'Immediate' },
    ].map(s => `<div class="stat-pill"><div class="stat-pill__value">${s.value}</div><div class="stat-pill__label">${s.label}</div></div>`).join('');

    // Build topic breakdown
    let breakdownHTML = '';
    if (isSubjectScope) {
      const ssList = (mod.subSubjects?.[params.examType]?.[params.subject]) || [];
      breakdownHTML = ssList.map(ss => `
        <div class="wide-breakdown-item">
          <span class="wide-breakdown-item__label">${this.topicIcon()}${ss.label}</span>
        </div>`).join('');
    } else {
      breakdownHTML = config.subjects.map(sub => {
        const ssList = (mod.subSubjects?.[params.examType]?.[sub.id]) || [];
        if (ssList.length === 0) return '';
        return `<div class="wide-breakdown-item">
          <span class="wide-breakdown-item__label">${this.subjectIcon(sub.id, 'module-icon module-icon--inline')}${sub.label}</span>
          <span class="wide-breakdown-count">${ssList.length} topics</span>
        </div>`;
      }).join('');
    }

    const railFilter = isSubjectScope
      ? { moduleId: mod.id, examType: params.examType, subject: params.subject, label: sub.label }
      : { moduleId: mod.id, examType: params.examType, label: et.label };

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
      ${this.scopeRail(railFilter)}
      <div class="page__main">
      ${noQ
        ? this.emptyState('No Questions Available', 'No questions have been added to this section yet.', icon.replace('module-icon', 'module-icon module-icon--lg'))
        : `<div class="page-label page-label--wide">Exam</div>
          <div class="stats-strip" style="margin-bottom:18px">${statPills}</div>

          <div class="topic-panel" style="margin-bottom:18px">
            <p class="wide-exam-note">Questions from all topics are shuffled together into one randomized exam.</p>
            <div class="topic-panel__primary">
              <button class="btn btn--primary btn--lg" id="start-wide-exam-btn">
                Start Exam (${totalCount} Q) <svg class="icon icon--sm" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>

          <div class="wide-exam-breakdown">
            <h3 class="wide-exam-breakdown__title">Covered Topics</h3>
            <div class="wide-breakdown-grid">${breakdownHTML}</div>
          </div>`
      }
      </div>
    </div>`;
  },

  // ─── Exam interface ───────────────────────────────────────────────────────

  // Inline SVG glyphs for exam chrome (no emoji in UI chrome — see DESIGN_STANDARDS §1/§4)
  examIcon(name) {
    const paths = {
      flag:  '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
      check: '<polyline points="20 6 9 17 4 12"/>',
      x:     '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
      prev:  '<polyline points="15 18 9 12 15 6"/>',
      next:  '<polyline points="9 18 15 12 9 6"/>',
    };
    return `<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`;
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

  renderExam(engine, config) {
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
      if (engine.config.scope === 'subject') {
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
      sidebarTitle = `${this.topicIcon()}${ss.label}`;
      sidebarSub   = `${sub?.label} · ${et?.label}`;
    }

    const topicLabel = (isWide && q._subSubjectLabel) ? q._subSubjectLabel : '';

    const paletteHTML = engine.questions.map((_, i) => {
      let cls = 'palette-btn';
      if (i === idx)                 cls += ' palette-btn--current';
      else if (engine.isAnswered(i)) cls += ' palette-btn--answered';
      if (engine.isFlagged(i))       cls += ' palette-btn--flagged';
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
    const backParams = isWide
      ? (engine.config.scope === 'subject'
          ? { moduleId: engine.config.module, examType: engine.config.examType, subject: engine.config.subject }
          : { moduleId: engine.config.module })
      : { moduleId: engine.config.module, examType: engine.config.examType, subject: engine.config.subject };
    const backNav = isWide
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
        ${this.progressBar(progressPct, 'var(--mod-color, var(--primary))')}
        <div class="palette">${paletteHTML}</div>
        <div class="palette-legend">
          <span class="legend-item legend-item--current">Current</span>
          <span class="legend-item legend-item--answered">Answered</span>
          <span class="legend-item legend-item--flagged">Flagged</span>
        </div>
        <button class="btn btn--ghost btn--sm exam-submit-btn submit-exam-trigger">
          ${this.examIcon('check')} Submit Exam
        </button>
      </aside>

      <main class="exam-main">
        <div class="exam-topbar">
          ${this.backBtn(backNav, backParams)}
          <button class="flag-btn ${isFlagged ? 'flag-btn--active' : ''}" id="flag-btn" title="${isFlagged ? 'Unflag' : 'Flag'} question" aria-pressed="${isFlagged}">
            ${this.examIcon('flag')}
            <span class="flag-btn__label">${isFlagged ? 'Flagged' : 'Flag'}</span>
          </button>
        </div>
        <div class="question-card">
          <div class="question-card__meta">
            <span class="question-card__number">Question ${idx + 1} <span class="question-card__of">/ ${total}</span></span>
            ${topicLabel ? `<span class="exam-question-topic">${topicLabel}</span>` : ''}
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

  renderResults(results, config) {
    const et    = config.examTypes.find(e => e.id === results.config.examType);
    const mod   = config.modules.find(m => m.id === results.config.module);
    const isWide = !!results.config.scope;

    let titleLabel, subtitleLabel, backNav, backParams, crumbs;
    if (isWide) {
      if (results.config.scope === 'subject') {
        const sub = config.subjects.find(s => s.id === results.config.subject);
        titleLabel    = `${sub?.label} — Full Exam`;
        subtitleLabel = `${mod?.title} · ${et?.label}`;
        backNav       = 'subject';
        backParams    = { moduleId: results.config.module, examType: results.config.examType, subject: results.config.subject };
        crumbs        = [
          { label: 'Dashboard', nav: 'dashboard' },
          { label: mod?.title, nav: 'module', params: { moduleId: results.config.module } },
          { label: et?.label, nav: 'module', params: { moduleId: results.config.module } },
          { label: sub?.label, nav: 'subject', params: backParams },
          { label: 'Results' },
        ];
      } else {
        titleLabel    = `${et?.label} — Full Exam`;
        subtitleLabel = mod?.title;
        backNav       = 'module';
        backParams    = { moduleId: results.config.module };
        crumbs        = [
          { label: 'Dashboard', nav: 'dashboard' },
          { label: mod?.title, nav: 'module', params: { moduleId: results.config.module } },
          { label: et?.label, nav: 'module', params: { moduleId: results.config.module } },
          { label: 'Results' },
        ];
      }
    } else {
      const sub     = config.subjects.find(s => s.id === results.config.subject);
      const subSubs = (mod?.subSubjects?.[results.config.examType]?.[results.config.subject]) || [];
      const ss      = subSubs.find(s => s.id === results.config.subSubject) || { label: results.config.subSubject };
      titleLabel    = ss.label;
      subtitleLabel = `${sub?.label} · ${et?.label}`;
      backNav       = 'subsubject';
      backParams    = { moduleId: results.config.module, examType: results.config.examType, subject: results.config.subject, subSubject: results.config.subSubject };
      crumbs        = [
        { label: 'Dashboard', nav: 'dashboard' },
        { label: results.config.module, nav: 'module', params: { moduleId: results.config.module } },
        { label: et?.label, nav: 'module', params: { moduleId: results.config.module } },
        { label: sub?.label, nav: 'subject', params: { moduleId: results.config.module, examType: results.config.examType, subject: results.config.subject } },
        { label: ss.label, nav: 'subsubject', params: backParams },
        { label: 'Results' },
      ];
    }

    const reviewHTML = results.perQuestion.map((pq, i) => {
      const cls = pq.correct ? 'result-item--correct' : pq.answered ? 'result-item--wrong' : 'result-item--skipped';
      const statusIcon = pq.correct
        ? `<svg class="icon icon--sm" viewBox="0 0 24 24" style="color:var(--success)"><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></svg>`
        : pq.answered
          ? `<svg class="icon icon--sm" viewBox="0 0 24 24" style="color:var(--danger)"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`
          : `<svg class="icon icon--sm" viewBox="0 0 24 24" style="color:var(--text-4)"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
      const flagIcon = pq.flagged
        ? `<svg class="icon icon--sm" viewBox="0 0 24 24" style="color:var(--warning)"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>` : '';
      // For wide exams show topic badge
      const topicTag = (isWide && pq._subSubjectLabel)
        ? `<span class="result-item__topic">${pq._subSubjectLabel}</span>` : '';
      return `<div class="result-item ${cls}">
        <div class="result-item__header">
          ${statusIcon}
          <span class="result-item__num">Q${i + 1}</span>
          ${topicTag}
          ${flagIcon}
        </div>
        <p class="result-item__question">${pq.question}</p>
        <div class="result-item__answers">
          ${pq.answered ? `<span class="result-item__user ${pq.correct ? 'result-item__user--correct' : 'result-item__user--wrong'}">Your answer: ${['A','B','C','D','E','F','G','H'][pq.userAnswer]}. ${pq.options[pq.userAnswer]}</span>` : '<span class="result-item__skipped">Not answered</span>'}
          ${!pq.correct ? `<span class="result-item__correct">Correct: ${['A','B','C','D','E','F','G','H'][pq.answer]}. ${pq.options[pq.answer]}</span>` : ''}
        </div>
        <div class="result-item__explanation">${pq.explanation}</div>
      </div>`;
    }).join('');

    const summaryPills = [
      { label: 'Correct',   value: results.correct,   color: 'var(--success)' },
      { label: 'Incorrect', value: results.incorrect, color: 'var(--danger)' },
      { label: 'Skipped',   value: results.unanswered, color: 'var(--text-4)' },
      { label: 'Time',      value: ExamEngine.formatTime(results.timeSec) },
    ].map(s => `<div class="stat-pill"><div class="stat-pill__value"${s.color ? ` style="color:${s.color}"` : ''}>${s.value}</div><div class="stat-pill__label">${s.label}</div></div>`).join('');

    return `
    <div class="page results-page">
      ${this.backBtn(backNav, backParams)}
      ${this.breadcrumb(crumbs)}
      <div class="results-summary">
        <div class="results-summary__ring">${this.scoreRing(results.score)}</div>
        <div class="results-summary__stats">
          <h2 class="results-summary__title">Exam Complete</h2>
          <p class="results-summary__subtitle">${titleLabel} · ${subtitleLabel}</p>
          <div class="stats-strip results-summary__pills">${summaryPills}</div>
        </div>
      </div>
      <div class="results-actions">
        <button class="btn btn--primary" id="retry-all-btn"
          data-module="${results.config.module}"
          data-exam-type="${results.config.examType}"
          data-subject="${results.config.subject || ''}"
          data-sub-subject="${results.config.subSubject || ''}"
          data-scope="${results.config.scope || ''}"><svg class="icon icon--sm" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg> Retry Exam</button>
        <button class="btn btn--ghost" data-nav="dashboard"><svg class="icon icon--sm" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Dashboard</button>
      </div>
      <section class="section">
        <h2 class="section__title">Question Review</h2>
        <div class="results-list">${reviewHTML}</div>
      </section>
    </div>`;
  },

  // ─── Review page ──────────────────────────────────────────────────────────

  renderReview(incorrectList, config, filter = null) {
    const { page: backPage, params: backParams } = this._reviewScope(filter);
    const title     = filter ? `Incorrect — ${filter.label}` : 'Review Incorrect Questions';
    const crumbs    = filter
      ? [{ label: 'Dashboard', nav: 'dashboard' }, { label: filter.label, nav: backPage, params: backParams }, { label: 'Incorrect Questions' }]
      : [{ label: 'Dashboard', nav: 'dashboard' }, { label: 'Review' }];

    if (incorrectList.length === 0) {
      return `<div class="page">
        ${this.backBtn(backPage, backParams)}
        ${this.breadcrumb(crumbs)}
        ${this.emptyState('Nothing to Review', 'Complete some exams and incorrect answers will appear here.', '🎉')}
      </div>`;
    }

    const listHTML = incorrectList.map(q => {
      const sub = config.subjects.find(s => s.id === q.subject);
      const et  = config.examTypes.find(e => e.id === q.examType);
      return `<div class="review-item" data-uid="${q.uid}">
        <div class="review-item__meta">
          <span class="badge">${this.subjectIcon(sub?.id, 'module-icon module-icon--inline')}${sub?.label}</span>
          <span class="badge badge--ghost">${q.module}</span>
          ${q.subSubjectLabel ? `<span class="badge badge--ghost">${q.subSubjectLabel}</span>` : ''}
          <span class="badge badge--ghost">${et?.label}</span>
        </div>
        <p class="review-item__question">${q.question}</p>
        <div class="review-item__options">
          ${q.options.map((opt, i) => `<span class="review-opt ${i === q.answer ? 'review-opt--correct' : i === q.userAnswer ? 'review-opt--wrong' : ''}">${['A','B','C','D','E','F','G','H'][i]}. ${opt}</span>`).join('')}
        </div>
        <div class="review-item__explanation">${q.explanation}</div>
        <button class="btn btn--ghost btn--sm review-item__remove" data-remove-uid="${q.uid}">Mark as Mastered</button>
      </div>`;
    }).join('');

    const filtersHTML = filter ? '' : `
      <div class="review-filters">
        <input type="text" id="review-search" class="input" placeholder="Search questions…">
        <select id="review-filter-module" class="select">
          <option value="">All Modules</option>
          ${config.modules.map(m => `<option value="${m.id}">${m.title}</option>`).join('')}
        </select>
        <select id="review-filter-subject" class="select">
          <option value="">All Subjects</option>
          ${config.subjects.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
        </select>
        <button class="btn btn--danger btn--sm" id="clear-all-review">Clear</button>
      </div>`;

    return `
    <div class="page review-page">
      ${this.backBtn(backPage, backParams)}
      ${this.breadcrumb(crumbs)}
      <header class="page__header" style="--mod-color:var(--danger)">
        <span class="page__icon"><svg class="icon icon--lg" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg></span>
        <div>
          <h1 class="page__title">${title}</h1>
          <p class="page__subtitle">${incorrectList.length} questions pending review</p>
        </div>
      </header>
      ${filtersHTML}
      <div class="review-list" id="review-list">${listHTML}</div>
    </div>`;
  },

  // ─── Flagged review page ─────────────────────────────────────────────────

  renderFlagged(flaggedList, config, filter = null) {
    const { page: backPage, params: backParams } = this._reviewScope(filter);
    const title      = filter ? `Flagged — ${filter.label}` : 'Flagged Questions';
    const crumbs     = filter
      ? [{ label: 'Dashboard', nav: 'dashboard' }, { label: filter.label, nav: backPage, params: backParams }, { label: 'Flagged Questions' }]
      : [{ label: 'Dashboard', nav: 'dashboard' }, { label: 'Flagged Questions' }];

    if (flaggedList.length === 0) {
      return `<div class="page">
        ${this.backBtn(backPage, backParams)}
        ${this.breadcrumb(crumbs)}
        ${this.emptyState('No Flagged Questions', 'Flag questions during an exam to review them later.', '🚩')}
      </div>`;
    }

    const listHTML = flaggedList.map(q => {
      const sub = config.subjects.find(s => s.id === q.subject);
      const et  = config.examTypes.find(e => e.id === q.examType);
      return `<div class="review-item" data-uid="${q.uid}">
        <div class="review-item__meta">
          <span class="badge">${this.subjectIcon(sub?.id, 'module-icon module-icon--inline')}${sub?.label}</span>
          <span class="badge badge--ghost">${q.module}</span>
          ${q.subSubjectLabel ? `<span class="badge badge--ghost">${q.subSubjectLabel}</span>` : ''}
          <span class="badge badge--ghost">${et?.label}</span>
          <span class="badge" style="background:var(--success-bg);color:var(--success)">🚩 Flagged</span>
        </div>
        <p class="review-item__question">${q.question}</p>
        <div class="review-item__options">
          ${q.options.map((opt, i) => `<span class="review-opt ${i === q.answer ? 'review-opt--correct' : ''}">${['A','B','C','D','E','F','G','H'][i]}. ${opt}</span>`).join('')}
        </div>
        <div class="review-item__explanation">${q.explanation}</div>
        <button class="btn btn--ghost btn--sm review-item__remove" data-remove-uid="${q.uid}">Remove Flag</button>
      </div>`;
    }).join('');

    const flagFiltersHTML = filter ? '' : `
      <div class="review-filters">
        <input type="text" id="flagged-search" class="input" placeholder="Search questions…">
        <select id="flagged-filter-module" class="select">
          <option value="">All Modules</option>
          ${config.modules.map(m => `<option value="${m.id}">${m.title}</option>`).join('')}
        </select>
        <select id="flagged-filter-subject" class="select">
          <option value="">All Subjects</option>
          ${config.subjects.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
        </select>
        <button class="btn btn--danger btn--sm" id="clear-all-flagged">Clear All Flags</button>
      </div>`;

    return `
    <div class="page review-page">
      ${this.backBtn(backPage, backParams)}
      ${this.breadcrumb(crumbs)}
      <header class="page__header" style="--mod-color:var(--success)">
        <span class="page__icon"><svg class="icon icon--lg" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></span>
        <div>
          <h1 class="page__title">${title}</h1>
          <p class="page__subtitle">${flaggedList.length} flagged for review</p>
        </div>
      </header>
      ${flagFiltersHTML}
      <div class="review-list" id="flagged-list">${listHTML}</div>
    </div>`;
  },

  // ─── Search page ──────────────────────────────────────────────────────────

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
  // 48x48 filled outlines drawn with currentColor. Heart = CPM, stomach = GIT, brain = CNS,
  // thyroid = ENDO & REPRO, kidneys = Urinary; unknown ids get a generic body glyph.
  moduleIcon(id, cls = 'module-icon') {
    const g = {
      CPM: '<path fill-rule="evenodd" clip-rule="evenodd" d="M30.05 9.52V7C30.05 6.73 29.94 6.48 29.75 6.29C29.56 6.11 29.31 6 29.04 6L24.7 6C24.14 6 23.69 6.45 23.69 7V9.43L22.2 10.12L20.27 7.72C19.94 7.32 19.37 7.22 18.93 7.5L15.53 9.66C15.29 9.81 15.12 10.06 15.08 10.34C15.03 10.62 15.11 10.9 15.28 11.12L17.18 13.48C17.09 13.59 16.99 13.72 16.89 13.85C16.69 14.11 16.46 14.45 16.27 14.83C15.52 14.16 14.64 13.6 13.8 13.16C12.89 12.68 11.99 12.31 11.33 12.06C10.99 11.93 10.42 11.74 10.23 11.68C9.95 11.6 9.63 11.63 9.39 11.78C9.14 11.93 8.97 12.17 8.92 12.45L8.02 17.18C7.97 17.44 8.03 17.72 8.18 17.94C8.34 18.16 8.58 18.31 8.85 18.35C9.95 18.53 10.79 19.07 11.36 19.59C11.64 19.85 11.86 20.1 11.99 20.28C12.01 20.3 12.03 20.33 12.05 20.36C11.05 21.89 10.66 23.68 10.72 25.53C10.8 28.03 11.71 30.67 13.08 33.07C14.45 35.47 16.31 37.68 18.37 39.29C20.42 40.9 22.76 42 25.07 42C27.37 42 29.77 40.91 31.89 39.29C34.03 37.66 35.99 35.43 37.43 32.97C40.25 28.14 41.28 21.93 36.72 17.93C36.53 17.77 36.35 17.63 36.19 17.51C36.92 17.5 37.76 17.51 38.73 17.55L39.75 17.58L40 10.83L39 10.8C36.43 10.71 34.08 10.82 31.94 11.31C31.41 10.62 30.83 10.11 30.38 9.77C30.26 9.67 30.15 9.59 30.05 9.52ZM32.22 18.14C32.4 18.06 32.58 17.99 32.77 17.93C33.27 18.21 33.67 18.4 33.99 18.56C34.1 18.61 34.19 18.66 34.28 18.7C34.66 18.89 34.96 19.06 35.38 19.43C38.82 22.45 38.35 27.4 35.68 31.97C34.37 34.22 32.58 36.25 30.66 37.71C28.73 39.18 26.76 40 25.07 40C23.38 40 21.48 39.18 19.62 37.73C17.78 36.28 16.09 34.28 14.84 32.08C13.58 29.88 12.81 27.55 12.74 25.46C12.66 23.39 13.28 21.6 14.75 20.31C15.5 19.65 16.82 19.38 18.51 19.48C19.62 19.54 20.79 19.75 21.86 20.03L21.86 20.03L23 20.36C24.21 20.71 25.61 21.27 26.53 21.65L25.08 24.78L21.34 26.45L17.3 25.51L16.83 27.46L20.07 28.21L19.01 30.88L20.89 31.61L22.23 28.25L24.42 27.27C24.31 28.43 24.5 29.61 24.97 30.69L25.32 31.48L25.59 35.42L27.6 35.28L27.39 32.13L30.72 31.74L30.49 29.76L26.94 30.17L26.82 29.89C26.36 28.84 26.28 27.67 26.59 26.57L26.78 25.88L28.96 21.21C29.07 21.11 29.16 20.99 29.24 20.86C30.17 19.41 31.14 18.64 32.22 18.14ZM24.75 18.82C25.41 17.67 26.12 16.76 26.93 16.01C27.1 15.86 27.27 15.71 27.44 15.57C28.16 14.98 28.96 14.51 29.87 14.09C32.06 13.08 34.69 12.73 37.91 12.77L37.8 15.52C34.96 15.45 33.01 15.59 31.38 16.33C29.93 17 28.66 18.04 27.54 19.81C27.52 19.83 27.5 19.85 27.47 19.86C27.45 19.86 27.44 19.86 27.44 19.86C26.77 19.57 25.77 19.17 24.75 18.82ZM14.72 18.01C14.55 18.08 14.39 18.15 14.23 18.24L13.64 18.53C13.52 18.59 13.41 18.65 13.3 18.71L12.73 18.12C12.13 17.58 11.28 16.98 10.18 16.62L10.69 13.96C11.29 14.18 12.07 14.51 12.85 14.93C13.68 15.36 14.47 15.88 15.07 16.46C15.42 16.79 15.68 17.13 15.85 17.46L14.72 18.01ZM18 17.46C18.21 17.46 18.42 17.47 18.63 17.48C18.81 17.49 19 17.5 19.18 17.52C20.46 17.63 21.77 17.89 22.81 18.13C23.53 16.49 24.88 15.07 26.23 13.96C27.36 13.04 28.56 12.27 29.58 11.71C29.43 11.57 29.28 11.45 29.14 11.35C28.96 11.2 28.55 10.95 28.55 10.95C28.55 10.95 28.03 10.43 28.03 10.07V8L25.71 8V10.07C25.71 10.46 25.48 10.81 25.12 10.97L22.34 12.27C21.91 12.47 21.41 12.35 21.12 11.99L19.26 9.67L17.56 10.74L19.29 12.9C19.62 13.3 19.58 13.89 19.2 14.25L19 14.46C19 14.46 18.69 14.8 18.51 15.04C18.12 15.56 17.88 16.06 17.87 16.41C17.86 16.61 17.87 16.89 17.93 17.23C17.96 17.3 17.98 17.38 18 17.46Z"/>',
      GIT: '<path fill-rule="evenodd" clip-rule="evenodd" d="M22.43 7.81C22.45 8.37 22.56 8.7 22.73 8.9C22.97 9.19 23.22 9.29 23.51 9.32C23.84 9.35 24.28 9.27 24.85 9.09C25.13 9.01 25.41 8.9 25.72 8.79C25.75 8.78 25.79 8.77 25.82 8.76C26.09 8.66 26.39 8.55 26.68 8.45C27.32 8.24 28.06 8.04 28.81 8.04C33.61 8.04 36.46 11.79 38.34 15.14C40.64 19.25 40.54 24.38 38.09 28.4C36.48 31.05 34.41 33.34 31.29 34.56C26.75 36.32 21.74 35.64 17.62 33.6C16.7 33.15 15.62 33.84 15.62 34.73V41H13.62V34.73C13.62 32.18 16.42 30.78 18.5 31.81C22.24 33.66 26.66 34.21 30.56 32.69C33.13 31.69 34.89 29.8 36.38 27.36C38.46 23.95 38.54 19.59 36.59 16.12C34.74 12.81 32.4 10.04 28.81 10.04C28.39 10.04 27.9 10.16 27.31 10.35C27.04 10.44 26.78 10.53 26.5 10.64C26.47 10.65 26.44 10.66 26.4 10.67C26.1 10.78 25.77 10.9 25.44 11C24.8 11.2 24.07 11.37 23.33 11.31C22.54 11.24 21.8 10.9 21.2 10.19C20.59 9.47 20.46 8.58 20.43 7.88C20.42 7.51 20.44 7.16 20.45 6.84C20.45 6.79 20.46 6.75 20.46 6.7C20.47 6.44 20.48 6.21 20.48 6L22.48 6C22.48 6.26 22.47 6.55 22.46 6.81C22.45 6.85 22.45 6.9 22.45 6.94C22.43 7.25 22.42 7.54 22.43 7.81ZM13.86 6.51C13.86 6.34 13.86 6.17 13.86 6H15.86C15.86 6.13 15.86 6.25 15.86 6.37C15.86 9.1 15.85 11.4 17.13 13.54C18.01 15.03 19.32 16.08 20.8 17.26C21.02 17.44 21.24 17.61 21.47 17.8C23.27 19.25 23.66 21.23 23.04 22.97C22.45 24.63 20.96 26.01 19.13 26.54C18.15 26.82 17.21 27.03 16.36 27.21C16.17 27.26 15.97 27.3 15.78 27.35C14.77 27.58 13.91 27.79 13.15 28.11C11.71 28.71 10.53 29.67 9.59 31.98C9.2 32.94 9 33.96 9 34.99V41H7V34.99C7 33.7 7.25 32.43 7.74 31.23C8.87 28.45 10.43 27.07 12.38 26.26C13.32 25.88 14.32 25.63 15.34 25.4C15.54 25.35 15.75 25.3 15.95 25.26C16.79 25.07 17.66 24.88 18.58 24.61C19.83 24.26 20.79 23.32 21.16 22.3C21.5 21.34 21.34 20.26 20.21 19.35C20 19.19 19.79 19.02 19.58 18.85C18.11 17.68 16.49 16.39 15.41 14.56C13.84 11.93 13.85 9.11 13.86 6.51Z"/>',
      CNS: '<path fill-rule="evenodd" clip-rule="evenodd" d="M29.58 22.87C30.74 22.87 31.88 22.56 32.83 21.97C33.81 22.56 34.95 22.87 36.12 22.85L39.84 21.63C40.89 20.85 41.61 19.77 41.88 18.58C42.15 17.38 41.96 16.13 41.33 15.04C40.7 13.96 39.68 13.1 38.43 12.61C38.15 11.45 37.43 10.41 36.4 9.67L32.77 8.52H32.36C31.56 7.46 30.34 6.7 28.96 6.39L21.17 6C19.88 6.1 18.66 6.58 17.71 7.38C17.26 7.29 16.8 7.24 16.34 7.23C15.22 7.24 14.13 7.53 13.2 8.08C12.26 8.63 11.52 9.41 11.07 10.33L8.11 12.22C7.38 13.11 6.98 14.2 6.98 15.32C6.97 15.79 7.04 16.25 7.19 16.7C6.41 17.61 5.99 18.72 6 19.87C6 21.2 6.56 22.48 7.57 23.44C7.66 24.39 8.02 25.31 8.64 26.08C9.26 26.86 10.1 27.47 11.07 27.84C12.19 28.48 13.14 29.33 13.85 30.34C14.55 31.34 15 32.48 15.16 33.66H22.79V28.14C22.79 27.16 23.09 26.2 23.67 25.36C24.24 24.53 25.06 23.86 26.04 23.42C26.59 23.23 26.73 22.98 26.89 22.67C27 22.46 27.12 22.23 27.39 21.97C27.63 22.11 27.81 22.24 27.97 22.35C28.45 22.69 28.71 22.87 29.58 22.87ZM34.03 20.34C34.57 20.63 35.18 20.81 35.82 20.84L38.88 19.84C39.44 19.35 39.79 18.75 39.93 18.13C40.09 17.43 39.98 16.7 39.6 16.04C39.21 15.37 38.56 14.8 37.7 14.47L36.74 14.09L36.49 13.08C36.35 12.49 36 11.92 35.46 11.46L32.46 10.52H31.37L30.77 9.73C30.3 9.1 29.56 8.61 28.67 8.38L21.21 8C20.36 8.08 19.58 8.41 19 8.91L18.25 9.53L17.29 9.33C16.98 9.26 16.66 9.23 16.34 9.23C15.57 9.23 14.83 9.43 14.21 9.8C13.59 10.16 13.13 10.66 12.86 11.21L12.62 11.71L9.49 13.7C9.15 14.2 8.98 14.76 8.98 15.31L8.98 15.33L8.98 15.34C8.98 15.59 9.01 15.84 9.09 16.09L9.43 17.15L8.71 17.99C8.23 18.55 8 19.21 8 19.85L8 19.86L8 19.87C8 20.62 8.31 21.38 8.95 21.99L9.5 22.51L9.57 23.27C9.61 23.81 9.83 24.35 10.21 24.83C10.59 25.32 11.13 25.72 11.79 25.97L11.93 26.03L12.05 26.1C12.2 26.18 12.34 26.27 12.48 26.35L12.48 26.36C15.2 28.02 16.35 30.43 16.74 31.67H17.35V24.37L15.15 22.41L13.66 23.91C13.26 24.3 12.63 24.3 12.24 23.91C11.85 23.52 11.85 22.89 12.24 22.5L14.03 20.7L13.5 17.75L11.06 16.53C10.57 16.28 10.37 15.68 10.61 15.19C10.86 14.69 11.46 14.49 11.95 14.74L14.33 15.93L17.24 14.08L16.34 11.66C16.14 11.14 16.4 10.57 16.92 10.37C17.44 10.18 18.02 10.44 18.21 10.96L19.18 13.55H20.26L20.77 12.53L19.96 10.62C19.74 10.11 19.98 9.53 20.48 9.31C20.99 9.09 21.58 9.33 21.8 9.83L22.5 11.47L25.29 11.98L25.3 11.97L27.1 10.53C27.53 10.18 28.16 10.25 28.5 10.69C28.85 11.12 28.78 11.75 28.35 12.09L27.14 13.05L28.48 14.77L28.99 13.75C29.16 13.41 29.51 13.19 29.89 13.19H32.05C32.6 13.19 33.05 13.64 33.05 14.19C33.05 14.75 32.6 15.19 32.05 15.19H30.5L30.24 15.73L31.91 16.1C31.99 16.12 32.06 16.15 32.14 16.18L33.58 16.9C34.07 17.15 34.27 17.75 34.02 18.24C33.78 18.74 33.18 18.94 32.68 18.69L31.35 18.03L28.23 17.33C28 17.28 27.8 17.15 27.66 16.97L25.37 14.03L22.59 13.52C22.55 13.56 22.51 13.59 22.46 13.61L21.88 14.79V15.36H23.04C23.19 15.36 23.35 15.39 23.49 15.46L26.37 16.9C26.86 17.15 27.06 17.75 26.82 18.24C26.57 18.74 25.97 18.94 25.48 18.69L22.8 17.36H21.88V18.88C21.88 19.43 21.43 19.88 20.88 19.88C20.32 19.88 19.88 19.43 19.88 18.88V16.36L19.88 16.36L19.88 16.35V15.55H18.65L15.49 17.56L16.03 20.52L19.02 23.18C19.23 23.37 19.35 23.64 19.35 23.92V31.67H20.79V28.1C20.79 25.4 22.3 23.74 23.13 22.96C23.78 22.33 24.77 21.8 25.19 21.61C25.27 21.43 25.55 20.95 26.01 20.51C26.47 20.08 26.95 19.62 27.14 19.45C28.37 20.15 29.34 20.87 29.34 20.87C29.34 20.87 30.62 20.79 31.2 20.56C31.66 20.37 32.48 19.85 32.82 19.62L34.03 20.34Z"/><path d="M15 38H23V36H15V38Z"/><path d="M23 42H15V40H23V42Z"/>',
      ENDO_REPRO: '<path fill-rule="evenodd" clip-rule="evenodd" d="M21.58 10.09L21.58 10.09C21.57 10.02 21.57 9.94 21.57 9.86L21.56 9.7C21.52 9.04 21.47 8.04 21.06 7.25C20.84 6.82 20.5 6.41 19.98 6.15C19.46 5.9 18.87 5.84 18.25 5.92C17.69 6 17.19 6.23 16.8 6.6C16.42 6.97 16.2 7.44 16.07 7.91C15.83 8.83 15.93 9.93 16.18 10.98C16.69 13.12 17.92 15.58 19.3 17.26C19.84 17.91 20 18.88 20 19.3V21.5L22 22V20.68C22.88 20.36 23.48 20.21 24.04 20.2C24.58 20.18 25.16 20.3 26 20.65V22L28 21.5L28 19.3C28 18.88 28.16 17.91 28.7 17.26C30.07 15.6 31.36 13.14 31.94 11.01C32.22 9.96 32.36 8.86 32.15 7.94C32.04 7.47 31.82 6.99 31.45 6.61C31.06 6.23 30.56 6 30 5.92C29.38 5.84 28.79 5.9 28.27 6.15C27.75 6.41 27.41 6.82 27.19 7.25C26.78 8.04 26.73 9.04 26.69 9.7L26.68 9.86C26.68 9.94 26.68 10.02 26.67 10.09L26.67 10.09C26.19 9.66 25.56 9.52 25.13 9.45C24.8 9.41 24.49 9.39 24.25 9.39V9.39L24.24 9.39C24.2 9.39 24.17 9.39 24.12 9.39C24.08 9.39 24.05 9.39 24.01 9.39L24 9.39V9.39C23.76 9.39 23.45 9.41 23.12 9.45C22.69 9.52 22.06 9.66 21.58 10.09ZM22.91 11.58C22.92 11.58 22.92 11.57 22.94 11.56C22.96 11.55 22.98 11.55 23 11.54V16H25V11.46C25.08 11.48 25.15 11.5 25.2 11.52C25.25 11.53 25.28 11.55 25.31 11.56C25.33 11.57 25.33 11.58 25.34 11.58C25.76 11.96 26.19 12.28 26.62 12.42C26.85 12.5 27.15 12.55 27.46 12.47C27.8 12.39 28.05 12.19 28.22 11.97C28.5 11.6 28.58 11.13 28.61 10.85C28.65 10.57 28.67 10.24 28.68 9.95L28.69 9.81C28.73 9.06 28.79 8.51 28.97 8.17C29.04 8.03 29.11 7.97 29.16 7.94C29.23 7.91 29.39 7.86 29.73 7.91C29.91 7.93 29.99 7.99 30.03 8.03C30.08 8.08 30.15 8.18 30.2 8.39C30.3 8.84 30.26 9.56 30 10.49C29.51 12.34 28.35 14.53 27.15 15.99C26.48 16.8 26.18 17.79 26.07 18.54C25.35 18.3 24.69 18.18 24 18.2C23.32 18.21 22.65 18.36 21.94 18.59C21.83 17.83 21.53 16.81 20.85 15.99C19.66 14.55 18.56 12.36 18.13 10.52C17.91 9.59 17.89 8.87 18 8.42C18.06 8.21 18.14 8.1 18.2 8.04C18.25 7.99 18.34 7.93 18.52 7.91C18.86 7.86 19.02 7.91 19.09 7.94C19.14 7.97 19.21 8.03 19.28 8.17C19.46 8.51 19.52 9.06 19.56 9.81L19.57 9.95C19.58 10.24 19.6 10.57 19.64 10.85C19.67 11.13 19.75 11.6 20.03 11.97C20.2 12.19 20.45 12.39 20.79 12.47C21.1 12.55 21.4 12.5 21.63 12.42C22.06 12.28 22.49 11.96 22.91 11.58Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M24 42C26.21 42 28 40.21 28 38L28 35.83L26 33.67L26 35.31C25.12 35.64 24.52 35.79 23.96 35.8C23.42 35.82 22.84 35.7 22 35.35V33.67L20 35.83V38C20 40.21 21.79 42 24 42ZM24 40C22.9 40 22 39.1 22 38L22 37.48C22.69 37.71 23.33 37.82 24 37.8C24.67 37.79 25.31 37.65 26 37.43V38C26 39.1 25.1 40 24 40Z"/><path d="M11 19C11.55 19 12 18.55 12 18C12 17.45 11.55 17 11 17C10.45 17 10 17.45 10 18C10 18.55 10.45 19 11 19Z"/><path d="M14 22C14 22.55 13.55 23 13 23C12.45 23 12 22.55 12 22C12 21.45 12.45 21 13 21C13.55 21 14 21.45 14 22Z"/><path d="M11 27C11.55 27 12 26.55 12 26C12 25.45 11.55 25 11 25C10.45 25 10 25.45 10 26C10 26.55 10.45 27 11 27Z"/><path d="M17 31C17 31.55 16.55 32 16 32C15.45 32 15 31.55 15 31C15 30.45 15.45 30 16 30C16.55 30 17 30.45 17 31Z"/><path d="M12 32C12.55 32 13 31.55 13 31C13 30.45 12.55 30 12 30C11.45 30 11 30.45 11 31C11 31.55 11.45 32 12 32Z"/><path d="M17 27C17 27.55 16.55 28 16 28C15.45 28 15 27.55 15 27C15 26.45 15.45 26 16 26C16.55 26 17 26.45 17 27Z"/><path d="M20 29C20.55 29 21 28.55 21 28C21 27.45 20.55 27 20 27C19.45 27 19 27.45 19 28C19 28.55 19.45 29 20 29Z"/><path d="M36 18C36 18.55 36.45 19 37 19C37.55 19 38 18.55 38 18C38 17.45 37.55 17 37 17C36.45 17 36 17.45 36 18Z"/><path d="M35 23C34.45 23 34 22.55 34 22C34 21.45 34.45 21 35 21C35.55 21 36 21.45 36 22C36 22.55 35.55 23 35 23Z"/><path d="M36 26C36 26.55 36.45 27 37 27C37.55 27 38 26.55 38 26C38 25.45 37.55 25 37 25C36.45 25 36 25.45 36 26Z"/><path d="M32 32C31.45 32 31 31.55 31 31C31 30.45 31.45 30 32 30C32.55 30 33 30.45 33 31C33 31.55 32.55 32 32 32Z"/><path d="M35 31C35 31.55 35.45 32 36 32C36.55 32 37 31.55 37 31C37 30.45 36.55 30 36 30C35.45 30 35 30.45 35 31Z"/><path d="M32 28C31.45 28 31 27.55 31 27C31 26.45 31.45 26 32 26C32.55 26 33 26.45 33 27C33 27.55 32.55 28 32 28Z"/><path d="M27 28C27 28.55 27.45 29 28 29C28.55 29 29 28.55 29 28C29 27.45 28.55 27 28 27C27.45 27 27 27.45 27 28Z"/><path d="M24 29C24.55 29 25 28.55 25 28C25 27.45 24.55 27 24 27C23.45 27 23 27.45 23 28C23 28.55 23.45 29 24 29Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M33.23 14.72C33.83 13.22 34.65 12.08 35.64 11.46C36.68 10.8 37.87 10.75 38.92 11.36C39.91 11.93 40.67 13.01 41.18 14.38C41.7 15.77 42 17.55 42 19.68V29.87C42 30.72 41.84 32.68 40.88 34.48C39.89 36.34 38.05 38 34.85 38C33.25 38 32.06 37.55 31.09 36.85C30.23 36.22 29.57 35.41 28.99 34.7L28.88 34.56C28.25 33.78 27.69 33.13 26.96 32.65C26.26 32.18 25.35 31.85 24 31.85C22.65 31.85 21.74 32.18 21.04 32.65C20.31 33.13 19.75 33.78 19.12 34.56L19.01 34.7C18.43 35.41 17.77 36.22 16.91 36.85C15.94 37.55 14.75 38 13.15 38C9.95 38 8.11 36.34 7.12 34.48C6.16 32.68 6 30.72 6 29.87V19.68C6 17.55 6.3 15.77 6.82 14.38C7.33 13.01 8.09 11.93 9.08 11.36C10.13 10.75 11.32 10.8 12.36 11.46C13.35 12.08 14.17 13.22 14.77 14.72C14.93 15.11 15.08 15.52 15.24 15.95C15.75 17.38 16.35 19.01 17.39 20.47C18.69 22.28 20.64 23.74 24 23.74C27.36 23.74 29.31 22.28 30.61 20.47C31.65 19.01 32.25 17.38 32.76 15.95C32.92 15.52 33.07 15.11 33.23 14.72ZM15.77 21.63C17.38 23.89 19.9 25.74 24 25.74C28.1 25.74 30.62 23.89 32.23 21.63C33.46 19.92 34.18 17.92 34.7 16.48C34.84 16.1 34.97 15.76 35.08 15.47C35.6 14.18 36.2 13.46 36.71 13.15C37.16 12.86 37.54 12.87 37.92 13.09C38.36 13.34 38.89 13.95 39.31 15.08C39.72 16.19 40 17.72 40 19.68V29.87C40 30.55 39.86 32.15 39.12 33.54C38.41 34.86 37.19 36 34.85 36C33.67 36 32.89 35.68 32.27 35.23C31.62 34.76 31.12 34.14 30.5 33.38L30.43 33.29C29.81 32.53 29.08 31.65 28.06 30.98C27.02 30.29 25.72 29.85 24 29.85C22.28 29.85 20.98 30.29 19.94 30.98C18.92 31.65 18.19 32.53 17.57 33.29L17.5 33.38C16.88 34.14 16.38 34.76 15.73 35.23C15.11 35.68 14.33 36 13.15 36C10.81 36 9.59 34.86 8.88 33.54C8.14 32.15 8 30.55 8 29.87V19.68C8 17.72 8.28 16.19 8.69 15.08C9.11 13.95 9.64 13.34 10.08 13.09C10.46 12.87 10.84 12.86 11.29 13.15C11.8 13.46 12.4 14.18 12.92 15.47C13.03 15.76 13.16 16.1 13.3 16.48C13.82 17.92 14.54 19.92 15.77 21.63Z"/>',
      URINARY: '<path fill-rule="evenodd" clip-rule="evenodd" d="M12.55 30.75C1.68 26.17 5.97 10.7 13.51 8.15C16.64 7.09 20.09 10.61 20.07 12.79C20.06 13.73 19.57 14.65 19.07 15.61C18.4 16.87 17.7 18.2 18 19.73C18.52 22.43 19.11 26.99 17.6 29.15C16.08 31.31 14.56 31.6 12.55 30.75ZM13.33 28.91C14.11 29.24 14.49 29.22 14.7 29.16C14.92 29.1 15.34 28.88 15.96 28C16.33 27.47 16.58 26.35 16.56 24.67C16.54 23.09 16.29 21.41 16.03 20.11C15.63 18.03 16.46 16.29 17.05 15.15C17.15 14.95 17.25 14.77 17.33 14.61C17.53 14.24 17.69 13.94 17.83 13.62C18.02 13.19 18.07 12.93 18.07 12.77C18.07 12.72 18.04 12.45 17.78 12.02C17.53 11.61 17.16 11.17 16.71 10.8C15.75 10.02 14.82 9.82 14.15 10.04C11.34 11 8.7 14.66 8.11 18.96C7.54 23.09 8.95 27.07 13.33 28.91Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M34.35 8.15C41.89 10.7 46.18 26.17 35.31 30.75C33.3 31.6 31.78 31.31 30.27 29.15C28.75 26.99 29.34 22.43 29.86 19.73C30.16 18.2 29.46 16.87 28.79 15.61C28.29 14.65 27.8 13.73 27.79 12.79C27.77 10.61 31.22 7.09 34.35 8.15ZM33.16 29.16C33.37 29.22 33.75 29.24 34.54 28.91C38.91 27.07 40.32 23.09 39.75 18.96C39.16 14.66 36.52 11 33.71 10.04C33.05 9.82 32.11 10.02 31.15 10.8C30.7 11.17 30.33 11.61 30.08 12.02C29.82 12.45 29.79 12.72 29.79 12.77C29.79 12.93 29.84 13.19 30.03 13.62C30.17 13.94 30.33 14.24 30.53 14.61C30.61 14.77 30.71 14.95 30.81 15.15C31.4 16.29 32.23 18.03 31.83 20.11C31.57 21.41 31.32 23.09 31.3 24.67C31.28 26.35 31.53 27.47 31.9 28C32.52 28.88 32.94 29.1 33.16 29.16Z"/><path d="M28.62 22.78C28.69 23.78 28.69 23.78 28.69 23.78L28.69 23.78L28.69 23.78L28.7 23.78L28.7 23.78L28.7 23.78C28.7 23.78 28.69 23.78 28.68 23.78C28.65 23.78 28.6 23.79 28.54 23.81C28.4 23.85 28.23 23.92 28.06 24.04C27.77 24.24 27.35 24.7 27.35 25.86V40.32C27.35 40.32 27.35 40.32 26.35 40.32C25.35 40.32 25.35 40.32 25.35 40.32V25.86C25.35 24.09 26.06 23.01 26.9 22.41C27.3 22.12 27.7 21.97 27.99 21.89C28.14 21.85 28.27 21.82 28.36 21.8C28.41 21.8 28.45 21.79 28.48 21.79C28.5 21.79 28.51 21.79 28.52 21.78L28.54 21.78L28.54 21.78L28.55 21.78L28.55 21.78C28.55 21.78 28.55 21.78 28.62 22.78Z"/><path d="M19.24 22.78C19.17 23.78 19.17 23.78 19.17 23.78L19.17 23.78L19.17 23.78L19.17 23.78L19.16 23.78L19.16 23.78C19.16 23.78 19.17 23.78 19.18 23.78C19.21 23.78 19.26 23.79 19.32 23.81C19.46 23.85 19.63 23.92 19.8 24.04C20.09 24.24 20.51 24.7 20.51 25.86V40.32C20.51 40.32 20.51 40.32 21.51 40.32C22.51 40.32 22.51 40.32 22.51 40.32V25.86C22.51 24.09 21.8 23.01 20.96 22.41C20.56 22.12 20.16 21.97 19.87 21.89C19.72 21.85 19.59 21.82 19.5 21.8C19.45 21.8 19.41 21.79 19.38 21.79C19.36 21.79 19.35 21.79 19.34 21.78L19.32 21.78L19.32 21.78L19.31 21.78L19.31 21.78C19.31 21.78 19.31 21.78 19.24 22.78Z"/>',
    }[id] || '<path fill-rule="evenodd" clip-rule="evenodd" d="M24 12C25.66 12 27 10.66 27 9C27 7.34 25.66 6 24 6C22.34 6 21 7.34 21 9C21 10.66 22.34 12 24 12ZM24 14C26.76 14 29 11.76 29 9C29 6.24 26.76 4 24 4C21.24 4 19 6.24 19 9C19 11.76 21.24 14 24 14Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M17.37 18.31C18.32 18.49 19 19.32 19 20.28L19 41C19 41.55 19.45 42 20 42H20.09C20.6 42 21.04 41.61 21.08 41.09L22 31C22 29.9 22.9 29.01 24 29.01C25.1 29.01 26 29.9 26 31L26.92 41.09C26.96 41.61 27.4 42 27.91 42H28C28.55 42 29 41.55 29 41V20.32C29 19.36 29.68 18.53 30.63 18.35C32.38 18.02 34.24 17.55 36.28 16.96C36.81 16.81 37.11 16.25 36.96 15.72C36.81 15.19 36.25 14.89 35.72 15.04C31.09 16.39 27.53 17.02 24 17C20.47 16.98 16.91 16.33 12.27 15.04C11.74 14.89 11.18 15.2 11.04 15.73C10.89 16.26 11.2 16.82 11.73 16.96C13.77 17.53 15.62 17.98 17.37 18.31ZM22.98 41.8C22.62 43.08 21.46 44 20.09 44H20C18.34 44 17 42.66 17 41L17 20.28C15.17 19.93 13.27 19.46 11.2 18.89C9.6 18.45 8.67 16.79 9.11 15.2C9.55 13.6 11.21 12.67 12.8 13.11C17.37 14.38 20.74 14.99 24.01 15C27.28 15.01 30.63 14.44 35.16 13.12C36.75 12.66 38.42 13.57 38.88 15.16C39.34 16.75 38.43 18.42 36.84 18.88C34.76 19.49 32.83 19.97 31 20.32V41C31 42.66 29.66 44 28 44H27.91C26.54 44 25.38 43.08 25.02 41.8C24.99 41.69 24.96 41.56 24.95 41.44C24.94 41.39 24.93 41.33 24.93 41.27L24.01 31.18C24 31.12 24 31.06 24 31.01C24 31.06 24 31.12 23.99 31.18L23.07 41.27C23.07 41.33 23.06 41.39 23.05 41.44C23.04 41.56 23.01 41.69 22.98 41.8Z"/>';
    return `<svg class="${cls}" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">${g}</svg>`;
  },

  // Subject glyphs (Health Icons, MIT): skeleton = Anatomy, cardiogram = Physiology,
  // biochemistry lab = Biochemistry, microscope = Histology. Unknown ids get a generic body glyph.
  subjectIcon(id, cls = 'module-icon') {
    const g = {
      anatomy:      '<path fill-rule="evenodd" clip-rule="evenodd" d="M18 14C18 12.34 19.34 11 21 11C22.45 11 23.66 12.03 23.94 13.39C24.26 12.02 25.49 11 26.96 11C28.68 11 30.07 12.39 30.07 14.11C30.07 15.82 28.68 17.21 26.97 17.22C25.46 17.22 24.2 16.14 23.91 14.71C23.59 16.03 22.41 17 21 17C19.34 17 18 15.66 18 14ZM21 13C20.45 13 20 13.45 20 14C20 14.55 20.45 15 21 15C21.55 15 22 14.55 22 14C22 13.45 21.55 13 21 13ZM25.86 14.11C25.86 13.5 26.35 13 26.96 13C27.57 13 28.07 13.5 28.07 14.11C28.07 14.72 27.57 15.21 26.96 15.22C26.35 15.22 25.86 14.72 25.86 14.11Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M16.62 17.35C16.62 19.38 18 19.83 18.46 19.83C18.92 19.83 19.08 21.19 19.08 22.1C19.08 22.87 21 22.98 23 23V24.5H16.5C13.61 24.5 12.23 26.65 11.62 28.42C11.3 29.33 11.15 30.22 11.08 30.87C11.04 31.2 11.02 31.48 11.01 31.67C11.01 31.77 11 31.85 11 31.9C11 31.93 11 31.95 11 31.97L11 31.99L11 32L11 32V32C11 32.55 11.45 33 12 33C12.55 33 13 32.55 13 32L13 31.99L13 31.97L13 31.95C13 31.91 13 31.85 13.01 31.77C13.02 31.61 13.03 31.38 13.06 31.1C13.13 30.53 13.26 29.8 13.51 29.08C14.02 27.6 14.89 26.5 16.5 26.5H23V27.71C22.17 27.76 21.35 27.86 20.64 28.04C20.14 28.16 19.66 28.32 19.24 28.53C18.84 28.74 18.42 29.04 18.15 29.47C17.86 29.94 18 30.56 18.47 30.85C18.94 31.14 19.56 31 19.85 30.53C19.85 30.53 19.86 30.51 19.91 30.47C19.97 30.42 20.04 30.37 20.16 30.31C20.39 30.19 20.7 30.08 21.11 29.98C21.66 29.85 22.31 29.76 23 29.71V31.71C22.17 31.76 21.35 31.86 20.64 32.04C20.14 32.16 19.66 32.32 19.24 32.53C18.84 32.74 18.42 33.04 18.15 33.47C17.86 33.94 18 34.56 18.47 34.85C18.94 35.14 19.56 35 19.85 34.53C19.85 34.53 19.86 34.51 19.91 34.47C19.97 34.42 20.04 34.37 20.16 34.31C20.39 34.19 20.7 34.08 21.11 33.98C21.66 33.85 22.31 33.76 23 33.71V36H19C17.89 36 17.06 36.53 16.49 37.24C15.94 37.92 15.61 38.78 15.41 39.56C15 41.12 15 42.72 15 43L15 43C15 43.55 15.45 44 16 44C16.55 44 17 43.55 17 43C17 42.76 17 41.37 17.34 40.06C17.51 39.41 17.75 38.86 18.04 38.49C18.31 38.16 18.61 38 19 38H29C29.39 38 29.69 38.16 29.96 38.49C30.25 38.86 30.49 39.41 30.66 40.06C31 41.37 31 42.76 31 43C31 43.55 31.45 44 32 44C32.55 44 33 43.55 33 43V43C33 42.72 33 41.12 32.59 39.56C32.39 38.78 32.06 37.92 31.51 37.24C30.94 36.53 30.11 36 29 36H25V33.71C25.69 33.76 26.34 33.85 26.89 33.98C27.3 34.08 27.61 34.19 27.84 34.31C27.96 34.37 28.03 34.42 28.09 34.47C28.14 34.51 28.15 34.53 28.15 34.53C28.44 35 29.06 35.14 29.53 34.85C30 34.56 30.14 33.94 29.85 33.47C29.58 33.04 29.16 32.74 28.76 32.53C28.34 32.32 27.86 32.16 27.36 32.04C26.65 31.86 25.83 31.76 25 31.71V29.71C25.69 29.76 26.34 29.85 26.89 29.98C27.3 30.08 27.61 30.19 27.84 30.31C27.96 30.37 28.03 30.42 28.09 30.47C28.14 30.51 28.15 30.53 28.15 30.53C28.44 31 29.06 31.14 29.53 30.85C30 30.56 30.14 29.94 29.85 29.47C29.58 29.04 29.16 28.74 28.76 28.53C28.34 28.32 27.86 28.16 27.36 28.04C26.65 27.86 25.83 27.76 25 27.71V26.5H31.5C33.11 26.5 33.98 27.6 34.49 29.08C34.74 29.8 34.87 30.53 34.94 31.1C34.97 31.38 34.98 31.61 34.99 31.77C35 31.85 35 31.91 35 31.95C35 31.97 35 31.98 35 31.99L35 32V32C35 32.55 35.45 33 36 33C36.55 33 37 32.55 37 32H36C37 32 37 32 37 32L37 32L37 31.99L37 31.97L37 31.92L37 31.9C37 31.85 36.99 31.77 36.99 31.67C36.98 31.48 36.96 31.2 36.92 30.87C36.85 30.22 36.7 29.33 36.38 28.42C35.77 26.65 34.39 24.5 31.5 24.5H25V23C27 22.98 28.92 22.87 28.92 22.1C28.92 21.19 29.5 19.83 29.54 19.83C29.58 19.83 31.38 19.38 31.38 17.35C31.38 16.54 31.64 16.16 31.94 15.7C32.41 15 33 14.11 33 11.24C33 1.59 15 1.59 15 11.24C15 14.11 15.59 15 16.06 15.7C16.36 16.16 16.62 16.54 16.62 17.35ZM18.69 17.85C18.69 17.84 18.69 17.83 18.68 17.82C18.66 17.77 18.62 17.63 18.62 17.35C18.62 15.86 17.96 14.92 17.65 14.47C17.6 14.4 17.55 14.34 17.53 14.29C17.35 14 17 13.36 17 11.24C17 9.54 17.76 8.31 18.98 7.44C20.26 6.52 22.07 6 24 6C25.93 6 27.74 6.52 29.02 7.44C30.24 8.31 31 9.54 31 11.24C31 13.36 30.65 14 30.47 14.29C30.45 14.34 30.4 14.4 30.35 14.47C30.04 14.92 29.38 15.86 29.38 17.35C29.38 17.55 29.34 17.64 29.33 17.68C29.3 17.72 29.27 17.76 29.22 17.8C29.17 17.84 29.11 17.87 29.06 17.89L29.06 17.89C28.66 17.99 28.4 18.19 28.32 18.25C28.16 18.37 28.06 18.48 28.01 18.54C27.92 18.65 27.85 18.75 27.83 18.79C27.77 18.88 27.73 18.96 27.71 19C27.67 19.09 27.62 19.19 27.58 19.28C27.5 19.48 27.41 19.72 27.32 20C27.24 20.24 27.14 20.55 27.07 20.9C26.27 21 25.18 21 24 21C22.85 21 21.8 21 21.01 20.91C20.98 20.68 20.95 20.44 20.9 20.21C20.83 19.91 20.72 19.48 20.5 19.08C20.32 18.78 19.77 17.95 18.69 17.85Z"/>',
      physiology:   '<path fill-rule="evenodd" clip-rule="evenodd" d="M17 7C17 5.34 18.34 4 20 4H28C29.66 4 31 5.34 31 7H35C36.66 7 38 8.34 38 10V41C38 42.66 36.66 44 35 44H13C11.34 44 10 42.66 10 41V10C10 8.34 11.34 7 13 7H17ZM17 9H13C12.45 9 12 9.45 12 10V20.99H17.63L21.02 14.97L23.14 22.38L25.73 19.04H31.22C31.77 19.04 32.22 19.49 32.22 20.04C32.22 20.6 31.77 21.04 31.22 21.04H26.71L22.3 26.71L20.41 20.12L18.8 22.99H12V41C12 41.55 12.45 42 13 42H35C35.55 42 36 41.55 36 41V10C36 9.45 35.55 9 35 9H31C31 10.66 29.66 12 28 12H20C18.34 12 17 10.66 17 9ZM20 6C19.45 6 19 6.45 19 7V9C19 9.55 19.45 10 20 10H28C28.55 10 29 9.55 29 9V7C29 6.45 28.55 6 28 6H20ZM16 31C16 30.45 16.45 30 17 30H31C31.55 30 32 30.45 32 31C32 31.55 31.55 32 31 32H17C16.45 32 16 31.55 16 31ZM16 37C16 36.45 16.45 36 17 36H23C23.55 36 24 36.45 24 37C24 37.55 23.55 38 23 38H17C16.45 38 16 37.55 16 37Z"/>',
      biochemistry: '<path fill-rule="evenodd" clip-rule="evenodd" d="M14 22L14 25L10.51 30.98C8.95 33.65 10.88 37 13.96 37H21.04C24.12 37 26.05 33.65 24.49 30.98L21 25L21 22C21.55 22 22 21.55 22 21V17C22 16.45 21.55 16 21 16H14C13.45 16 13 16.45 13 17V21C13 21.55 13.45 22 14 22ZM22.76 31.99L19 25.54V22H16V25.54L12.24 31.99C11.46 33.33 12.42 35 13.96 35H21.04C22.58 35 23.54 33.33 22.76 31.99ZM15 18V20H20V18H15Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M32 16.68C34.28 15.16 36 13.69 36 11H38C38 14.41 35.92 16.38 33.81 17.87C34.64 18.42 35.47 19.03 36.15 19.72C37.22 20.81 38 22.17 38 24C38 25.83 37.22 27.19 36.15 28.28C35.47 28.97 34.64 29.58 33.81 30.13C35.92 31.62 38 33.59 38 37H36C36 36.65 35.97 36.31 35.91 36H31C30.45 36 30 35.55 30 35C30 34.45 30.45 34 31 34H35.06C34.34 32.98 33.26 32.16 32 31.32C29.72 32.84 28 34.31 28 37H26C26 33.59 28.08 31.62 30.19 30.13C29.36 29.58 28.53 28.97 27.85 28.28C26.78 27.19 26 25.83 26 24C26 22.17 26.78 20.81 27.85 19.72C28.53 19.03 29.36 18.42 30.19 17.87C28.08 16.38 26 14.41 26 11H28C28 11.35 28.03 11.69 28.09 12H33C33.55 12 34 12.45 34 13C34 13.55 33.55 14 33 14H28.94C29.66 15.02 30.74 15.84 32 16.68ZM32 19.07C31 19.72 30.1 20.32 29.4 21H34.6C33.9 20.32 33 19.72 32 19.07ZM28 24C28 23.64 28.04 23.31 28.13 23H35.87C35.96 23.31 36 23.64 36 24C36 24.36 35.96 24.69 35.87 25H28.13C28.04 24.69 28 24.36 28 24ZM29.4 27C30.1 27.68 31 28.28 32 28.93C33 28.28 33.9 27.68 34.6 27H29.4Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M9 6C7.34 6 6 7.34 6 9V39C6 40.66 7.34 42 9 42H39C40.66 42 42 40.66 42 39V9C42 7.34 40.66 6 39 6H9ZM40 9C40 8.45 39.55 8 39 8H9C8.45 8 8 8.45 8 9V39C8 39.55 8.45 40 9 40H39C39.55 40 40 39.55 40 39V9Z"/>',
      histology:    '<path fill-rule="evenodd" clip-rule="evenodd" d="M19.77 8.3L21.26 7.45L22.24 9.15C23.57 8.72 25.06 9.25 25.79 10.5L30.31 18.28C31.15 19.71 30.66 21.54 29.22 22.37L28.37 22.85L29.05 24.16L26.37 25.52L25.77 24.35L25.1 24.73C23.66 25.55 21.82 25.06 20.99 23.63L18.07 18.6C15.5 20.08 13.74 21.72 12.79 23.61C11.99 25.19 11.73 27.03 12.17 29.24C13.6 28.45 15.25 28 17 28C20.27 28 23.17 29.57 25 32L37.08 25.18L38.08 26.92L26.03 33.71C26.65 35.01 27 36.46 27 38C27 38.68 26.93 39.35 26.8 40H40C40.55 40 41 40.45 41 41C41 41.55 40.55 42 40 42H7.83C7.3 40.78 7 39.42 7 38C7 35 8.32 32.32 10.4 30.48C9.64 27.56 9.86 24.97 11 22.71C12.19 20.35 14.31 18.46 17.06 16.87L16.46 15.85C15.82 14.75 15.97 13.41 16.72 12.48L15.66 10.64L17.16 9.79L15.92 7.56L18.55 6.11L19.77 8.3ZM28.58 19.28L24.06 11.5C23.78 11.02 23.17 10.86 22.69 11.13L18.57 13.49C18.09 13.77 17.92 14.38 18.2 14.86L22.72 22.63C23 23.11 23.61 23.27 24.09 23L28.21 20.64C28.69 20.36 28.86 19.75 28.58 19.28ZM24.75 40C24.91 39.36 25 38.69 25 38C25 36.82 24.74 35.7 24.29 34.69L19.48 37.4L18.49 35.66L23.24 32.99C21.77 31.17 19.52 30 17 30C12.58 30 9 33.58 9 38C9 38.69 9.09 39.36 9.25 40H24.75Z"/>',
    }[id];
    if (!g) return this.moduleIcon('__generic__', cls);
    return `<svg class="${cls}" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">${g}</svg>`;
  },

  // One unified dot for every topic (topics are added over time, so no per-topic glyphs)
  topicIcon() {
    return '<svg class="topic-dot" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>';
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
