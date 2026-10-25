/**
 * ============================================================
 * Recall — ui-skeletons.js
 * ============================================================
 * Loading skeletons for each page. These are added onto the UI
 * object from ui.js, so this file must load AFTER ui.js.
 * (Kept separate so ui.js stays a manageable size.)
 * ============================================================
 */

Object.assign(UI, {

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
        <div class="page-label page-label--wide">${this._skel('60px', '10px', '4px')}</div>
        <div class="topic-panel">
          ${this._skel('100%', '54px', 'var(--radius-lg)')}
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

});
