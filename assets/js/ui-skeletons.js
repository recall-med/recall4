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

  _skel(w, h, radius = '0.3125rem', extra = '') {
    return `<span class="skeleton" style="display:block;width:${w};height:${h};border-radius:${radius};${extra}"></span>`;
  },

  skeletonDashboard() {
    const pill = `<div class="stat-pill">
        ${this._skel('44%', '1.375rem', '0.3125rem')}
        <div style="margin-top:0.5rem">${this._skel('70%', '0.5625rem', '0.25rem')}</div>
      </div>`;

    const moduleCard = `<div class="module-card" style="cursor:default">
        <div class="module-card__header">
          ${this._skel('2rem', '2rem', 'var(--radius-sm)')}
          <div class="module-card__meta">
            ${this._skel('5rem', '1rem', '0.25rem')}
            <div style="margin-top:0.4375rem">${this._skel('60%', '0.6875rem', '0.25rem')}</div>
            <div style="margin-top:0.4375rem">${this._skel('35%', '0.5625rem', '0.25rem')}</div>
          </div>
        </div>
        ${this._skel('100%', '0.375rem', '62.4375rem')}
        <div class="module-card__row">${this._skel('8.125rem', '1.875rem', '0.375rem')}${this._skel('5.625rem', '1rem', '0.25rem')}</div>
      </div>`;

    return `
    <div class="dashboard">
      <div class="dashboard__intro">
        <div>
          ${this._skel('10.625rem', '1.75rem', '0.375rem')}
          <div style="margin-top:0.5625rem">${this._skel('14.375rem', '0.8125rem', '0.25rem')}</div>
        </div>
        <div class="dashboard__quickactions">
          ${this._skel('2.375rem', '2.375rem', 'var(--radius)')}
          ${this._skel('2.375rem', '2.375rem', 'var(--radius)')}
        </div>
      </div>
      <aside class="dashboard__rail">
        <div class="dashboard__skel-title" style="margin-bottom:0.875rem">${this._skel('4rem', '0.6875rem', '0.25rem')}</div>
        <div class="stats-strip">${pill}${pill}${pill}</div>
      </aside>
      <section class="section">
        <div class="dashboard__skel-title" style="margin-bottom:0.875rem">${this._skel('4.75rem', '0.6875rem', '0.25rem')}</div>
        <div class="modules-grid">${moduleCard.replace('class="module-card"', 'class="module-card module-card--hero"')}${moduleCard}</div>
      </section>
    </div>`;
  },

  skeletonPageHeader() {
    return `<div class="page__header">
      ${this._skel('2.25rem', '2.25rem', 'var(--radius-sm)')}
      <div>
        ${this._skel('10rem', '1.125rem', '0.25rem')}
        <div style="margin-top:0.5rem">${this._skel('13.75rem', '0.6875rem', '0.25rem')}</div>
      </div>
    </div>`;
  },

  // Progress rail placeholder (PC/tablet only; hidden on phone by CSS)
  skeletonRail() {
    const pill = `<div class="stat-pill">
        ${this._skel('2.25rem', '1.125rem', '0.3125rem')}
        <div style="margin-top:0.5rem">${this._skel('80%', '0.5625rem', '0.25rem')}</div>
      </div>`;
    return `<aside class="dashboard__rail">
      <div class="dashboard__skel-title" style="margin-bottom:0.875rem">${this._skel('4rem', '0.6875rem', '0.25rem')}</div>
      <div class="stats-strip">${pill}${pill}${pill}</div>
    </aside>`;
  },

  // Module page — exam-type sections with rows of subject cards
  skeletonModule() {
    const row = `<div class="subject-card" style="cursor:default">
        <div class="subject-card__left">
          ${this._skel('1.75rem', '1.75rem', 'var(--radius-sm)')}
          <div class="subject-card__text">
            ${this._skel('7.5rem', '0.8125rem', '0.25rem')}
            <div style="margin-top:0.375rem">${this._skel('5rem', '0.625rem', '0.25rem')}</div>
          </div>
        </div>
        ${this._skel('1rem', '1rem', '0.1875rem')}
      </div>`;

    const section = `<div class="exam-type-section">
        <div class="exam-type-header">
          <div class="exam-type-header__top">
            <div>
              ${this._skel('8.125rem', '0.8125rem', '0.25rem')}
              <div style="margin-top:0.375rem">${this._skel('11.25rem', '0.625rem', '0.25rem')}</div>
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
          ${this._skel('2.25rem', '2.25rem', 'var(--radius-sm)')}
          <div>
            ${this._skel('6.875rem', '0.8125rem', '0.25rem')}
            <div style="margin-top:0.375rem">${this._skel('4.375rem', '0.625rem', '0.25rem')}</div>
          </div>
        </div>
        ${this._skel('1rem', '1rem', '0.1875rem')}
      </div>`;

    return `<div class="page skeleton-page subject-page has-rail">
      ${this.skeletonPageHeader()}
      ${this.skeletonRail()}
      <div class="page__main">
        <div class="topic-panel">
          ${this._skel('75%', '0.6875rem', '0.25rem')}
          <div style="margin-top:0.875rem">${this._skel('15rem', '2.75rem', 'var(--radius)')}</div>
        </div>
        <div class="page-label">${this._skel('3.75rem', '0.625rem', '0.25rem')}</div>
        <div class="topics-list">${row}${row}${row}${row}${row}</div>
      </div>
    </div>`;
  },

  // Sub-subject page — stat pills + action panel
  skeletonSubSubject() {
    return `<div class="page skeleton-page subsubject-page has-rail">
      ${this.skeletonPageHeader()}
      ${this.skeletonRail()}
      <div class="page__main">
        <div class="page-label page-label--wide">${this._skel('3.75rem', '0.625rem', '0.25rem')}</div>
        ${this.skeletonLaunch()}
      </div>
    </div>`;
  },

  // The card shared by the topic page and the full-exam start page
  skeletonLaunch() {
    return `<div class="launch">
      <div class="launch__body">
        ${this._skel('5rem', '0.625rem', '0.25rem')}
        <div style="margin-top:0.75rem">${this._skel('8rem', '2.25rem', '0.375rem')}</div>
        <div style="margin-top:0.75rem">${this._skel('min(18rem, 90%)', '0.6875rem', '0.25rem')}</div>
      </div>
      <div class="launch__actions">${this._skel('100%', '2.875rem', 'var(--radius)')}</div>
    </div>`;
  },

  // Exam page — sidebar palette + question card + options + nav
  skeletonExam() {
    const paletteCell = this._skel('100%', '1.875rem', 'var(--radius-sm)');
    const option = this._skel('100%', '3.25rem', 'var(--radius)');
    return `<div class="exam-layout">
      <aside class="exam-sidebar">
        <div class="exam-sidebar__header">
          ${this._skel('70%', '0.875rem', '0.25rem')}
          <div style="margin-top:0.375rem">${this._skel('50%', '0.625rem', '0.25rem')}</div>
        </div>
        ${this._skel('100%', '0.375rem', '62.4375rem', 'margin:0.875rem 0')}
        <div class="palette">${Array(10).fill(paletteCell).join('')}</div>
      </aside>
      <div class="exam-main">
        <div class="exam-topbar">
          ${this._skel('4.5rem', '1.875rem', 'var(--radius)')}
          ${this._skel('5.25rem', '1.875rem', 'var(--radius)', 'margin-left:auto')}
        </div>
        <div class="question-card">
          ${this._skel('6.875rem', '0.625rem', '0.25rem', 'margin-bottom:1rem')}
          ${this._skel('92%', '0.9375rem', '0.25rem')}
          <div style="margin-top:0.5rem">${this._skel('78%', '0.9375rem', '0.25rem')}</div>
          <div style="margin-top:0.5rem">${this._skel('55%', '0.9375rem', '0.25rem')}</div>
        </div>
        <div class="options-list">${Array(4).fill(option).join('')}</div>
        <div class="exam-nav">
          ${this._skel('7.5rem', '2.375rem', 'var(--radius)')}
          ${this._skel('11.25rem', '2.375rem', 'var(--radius)', 'margin-left:auto')}
        </div>
      </div>
    </div>`;
  },

  // Wide exam start page — stat-pill row + topic panel + breakdown card
  skeletonWideExamStart() {
    const row = `<li class="scope-row">${this._skel('1rem', '1rem', '50%')}<span class="scope-row__text">${this._skel('45%', '0.75rem', '0.25rem')}</span>${this._skel('2.25rem', '0.75rem', '0.25rem')}</li>`;
    return `<div class="page skeleton-page wide-exam-start-page has-rail">
      ${this.skeletonPageHeader()}
      ${this.skeletonRail()}
      <div class="page__main">
        <div class="page-label page-label--wide">${this._skel('3.75rem', '0.625rem', '0.25rem')}</div>
        ${this.skeletonLaunch()}
        <div class="page-label page-label--wide scope-title">${this._skel('6.25rem', '0.625rem', '0.25rem')}</div>
        <ul class="scope-list">${row}${row}${row}</ul>
      </div>
    </div>`;
  },

  // Generic app-shell skeleton, shown once on first boot before config loads
  skeletonAppBoot() {
    return this.skeletonDashboard();
  },

});
