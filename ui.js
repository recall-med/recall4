/**
 * ============================================================
 * DEPT. Q. BANK — ui.js
 * ============================================================
 * Pure UI rendering functions. No business logic here.
 * All renders return HTML strings or modify the DOM directly.
 *
 * HOW TO ADD A NEW PAGE:
 * 1. Add a render function UI.renderMyPage(data) below.
 * 2. In app.js, call App.navigate('myPage', data) and
 *    add a case to App._renderPage().
 * ============================================================
 */

const UI = {

  // ─── Root container ──────────────────────────────────────────────────────

  get root() { return document.getElementById('app'); },

  setContent(html) {
    this.root.innerHTML = html;
    // Small entry animation
    this.root.classList.remove('page-enter');
    void this.root.offsetWidth; // force reflow
    this.root.classList.add('page-enter');
  },

  // ─── Toast notifications ─────────────────────────────────────────────────

  toast(message, type = 'info', duration = 2800) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = `toast toast--${type}`;
    t.innerHTML = `<span class="toast__icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>${message}`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast--visible'));
    setTimeout(() => {
      t.classList.remove('toast--visible');
      setTimeout(() => t.remove(), 400);
    }, duration);
  },

  // ─── Breadcrumb ──────────────────────────────────────────────────────────

  breadcrumb(crumbs) {
    if (!crumbs || crumbs.length === 0) return '';
    const items = crumbs.map((c, i) => {
      if (i === crumbs.length - 1) {
        return `<span class="breadcrumb__current">${c.label}</span>`;
      }
      return `<a class="breadcrumb__link" data-nav="${c.nav}" data-params='${JSON.stringify(c.params || {})}'>${c.label}</a>`;
    });
    return `<nav class="breadcrumb" aria-label="Breadcrumb">
      <span class="breadcrumb__home">🏠</span>
      ${items.join('<span class="breadcrumb__sep">›</span>')}
    </nav>`;
  },

  // ─── Back button ─────────────────────────────────────────────────────────

  backBtn(nav, params = {}) {
    return `<button class="btn btn--ghost btn--sm back-btn" data-nav="${nav}" data-params='${JSON.stringify(params)}'>
      <span class="btn__icon">←</span> Back
    </button>`;
  },

  // ─── Loading spinner ─────────────────────────────────────────────────────

  loading(message = 'Loading…') {
    this.setContent(`<div class="loading-screen">
      <div class="spinner"></div>
      <p class="loading-screen__text">${message}</p>
    </div>`);
  },

  // ─── Empty state ─────────────────────────────────────────────────────────

  emptyState(title, body, icon = '📭') {
    return `<div class="empty-state">
      <div class="empty-state__icon">${icon}</div>
      <h3 class="empty-state__title">${title}</h3>
      <p class="empty-state__body">${body}</p>
    </div>`;
  },

  // ─── Stat card ───────────────────────────────────────────────────────────

  statCard(label, value, icon, color) {
    return `<div class="stat-card" style="--accent:${color}">
      <div class="stat-card__icon">${icon}</div>
      <div class="stat-card__value">${value}</div>
      <div class="stat-card__label">${label}</div>
    </div>`;
  },

  // ─── Progress bar ────────────────────────────────────────────────────────

  progressBar(percent, color = 'var(--primary)') {
    const p = Math.min(100, Math.max(0, percent));
    return `<div class="progress-bar" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar__fill" style="width:${p}%;background:${color}"></div>
    </div>`;
  },

  // ─── Score ring ──────────────────────────────────────────────────────────

  scoreRing(percent) {
    const r = 52;
    const circ = 2 * Math.PI * r;
    const offset = circ - (percent / 100) * circ;
    const color = percent >= 70 ? '#059669' : percent >= 50 ? '#d97706' : '#dc2626';
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

  // ─── Dashboard ───────────────────────────────────────────────────────────

  renderDashboard(config, progressMap, stats) {
    const accuracy = stats.totalAttempted > 0
      ? Math.round((stats.totalCorrect / stats.totalAttempted) * 100)
      : 0;
    const incorrect = Storage.getIncorrect();
    const flagged   = Storage.getFlagged();

    const statsHTML = [
      this.statCard('Questions Attempted', stats.totalAttempted,   '📝', '#2563eb'),
      this.statCard('Correct Answers',     stats.totalCorrect,     '✅', '#059669'),
      this.statCard('Incorrect Answers',   stats.totalIncorrect,   '❌', '#dc2626'),
      this.statCard('Overall Accuracy',    `${accuracy}%`,         '🎯', '#7c3aed'),
      this.statCard('Exams Completed',     stats.completedExams,   '🏆', '#d97706'),
      this.statCard('Flagged Questions',   flagged.length,         '🚩', '#0891b2'),
      this.statCard('For Review',          incorrect.length,       '🔄', '#be185d'),
    ].join('');

    const modulesHTML = config.modules.map(mod => {
      const modProgress = this._calcModuleProgress(mod, config, progressMap);
      return `<div class="module-card" data-nav="module" data-params='${JSON.stringify({ moduleId: mod.id })}' style="--mod-color:${mod.color}" tabindex="0" role="button" aria-label="Open ${mod.title}">
        <div class="module-card__header">
          <span class="module-card__icon">${mod.icon}</span>
          <div class="module-card__meta">
            <h3 class="module-card__title">${mod.title}</h3>
            <p class="module-card__subtitle">${mod.fullTitle}</p>
          </div>
          <span class="module-card__arrow">›</span>
        </div>
        <div class="module-card__body">
          <div class="module-card__info">
            <span>${modProgress.setsCompleted}/${modProgress.totalSets} sets completed</span>
            <span>${modProgress.percent}%</span>
          </div>
          ${this.progressBar(modProgress.percent, mod.color)}
        </div>
      </div>`;
    }).join('');

    const reviewBtn = incorrect.length > 0
      ? `<button class="btn btn--danger review-btn" data-nav="review">
          <span>🔄</span> Review Incorrect Questions
          <span class="badge">${incorrect.length}</span>
        </button>` : '';

    return `
    <div class="dashboard">
      <header class="dashboard__header">
        <div class="dashboard__title-wrap">
          <h1 class="dashboard__title">${config.siteTitle}</h1>
          <p class="dashboard__subtitle">${config.siteSubtitle}</p>
        </div>
        <div class="dashboard__actions">
          ${reviewBtn}
          <button class="btn btn--ghost btn--sm" data-nav="search" title="Search questions">🔍 Search</button>
        </div>
      </header>

      <section class="section">
        <h2 class="section__title">Overview</h2>
        <div class="stats-grid">${statsHTML}</div>
      </section>

      <section class="section">
        <h2 class="section__title">Modules</h2>
        <div class="modules-grid">${modulesHTML}</div>
      </section>
    </div>`;
  },

  // ─── Module page ─────────────────────────────────────────────────────────

  renderModule(mod, config, progressMap) {
    const examTypesHTML = config.examTypes.map(et => {
      const subjectsHTML = config.subjects.map(sub => {
        const prog = progressMap[`${mod.id}|${et.id}|${sub.id}`] || {};
        const pct  = prog.total ? Math.round((prog.correct || 0) / prog.total * 100) : 0;
        return `<div class="subject-card" data-nav="subject" data-params='${JSON.stringify({ moduleId: mod.id, examType: et.id, subject: sub.id })}' tabindex="0" role="button">
          <div class="subject-card__left">
            <span class="subject-card__icon" style="background:${sub.color}20;color:${sub.color}">${sub.icon}</span>
            <div>
              <div class="subject-card__name">${sub.label}</div>
              ${prog.completed ? `<div class="subject-card__score" style="color:${sub.color}">${pct}% · Last: ${new Date(prog.lastAttempt).toLocaleDateString()}</div>` : '<div class="subject-card__score">Not attempted</div>'}
            </div>
          </div>
          <div class="subject-card__right">
            ${prog.completed ? `<span class="badge badge--success">Done</span>` : ''}
            <span class="subject-card__arrow">›</span>
          </div>
        </div>`;
      }).join('');

      return `<div class="exam-type-section">
        <div class="exam-type-header" style="--et-color:${et.color}">
          <h3 class="exam-type-header__title">${et.label}</h3>
          <p class="exam-type-header__desc">${et.description}</p>
        </div>
        <div class="subjects-list">${subjectsHTML}</div>
      </div>`;
    }).join('');

    return `
    <div class="page module-page">
      ${this.backBtn('dashboard')}
      ${this.breadcrumb([
        { label: 'Dashboard', nav: 'dashboard' },
        { label: mod.title },
      ])}
      <header class="page__header" style="--mod-color:${mod.color}">
        <span class="page__icon">${mod.icon}</span>
        <div>
          <h1 class="page__title">${mod.title}</h1>
          <p class="page__subtitle">${mod.fullTitle}</p>
        </div>
      </header>
      ${examTypesHTML}
    </div>`;
  },

  // ─── Subject page ─────────────────────────────────────────────────────────

  renderSubject(mod, examType, subject, questionCount, progress, config) {
    const sub = config.subjects.find(s => s.id === subject);
    const et  = config.examTypes.find(e => e.id === examType);
    const pct = progress && progress.total
      ? Math.round((progress.correct / progress.total) * 100) : 0;

    const noQuestions = questionCount === 0;

    return `
    <div class="page subject-page">
      ${this.backBtn('module', { moduleId: mod.id })}
      ${this.breadcrumb([
        { label: 'Dashboard', nav: 'dashboard' },
        { label: mod.title, nav: 'module', params: { moduleId: mod.id } },
        { label: et.label, nav: 'module', params: { moduleId: mod.id } },
        { label: sub.label },
      ])}
      <header class="page__header" style="--mod-color:${sub.color}">
        <span class="page__icon">${sub.icon}</span>
        <div>
          <h1 class="page__title">${sub.label}</h1>
          <p class="page__subtitle">${mod.title} · ${et.label}</p>
        </div>
      </header>

      ${noQuestions
        ? this.emptyState(
            'No Questions Available',
            'Upload questions to <code>data/${mod.dataPath}/${examType}/${subject}.json</code> in your GitHub repository.',
            sub.icon
          )
        : `<div class="subject-info-cards">
            <div class="info-card">
              <div class="info-card__label">Questions Available</div>
              <div class="info-card__value">${questionCount}</div>
            </div>
            ${progress ? `
            <div class="info-card">
              <div class="info-card__label">Last Score</div>
              <div class="info-card__value" style="color:${pct >= 70 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626'}">${pct}%</div>
            </div>
            <div class="info-card">
              <div class="info-card__label">Last Attempt</div>
              <div class="info-card__value info-card__value--sm">${new Date(progress.lastAttempt).toLocaleDateString()}</div>
            </div>` : ''}
          </div>
          <div class="exam-options-card">
            <h3 class="exam-options-card__title">Exam Settings</h3>
            <label class="toggle-row">
              <span>Immediate Feedback</span>
              <input type="checkbox" id="opt-feedback" class="toggle" ${config.examSettings.defaultImmediateFeedback ? 'checked' : ''}>
            </label>
            <label class="toggle-row">
              <span>Randomise Questions</span>
              <input type="checkbox" id="opt-random" class="toggle" ${config.examSettings.defaultRandomize ? 'checked' : ''}>
            </label>
            <div class="exam-actions">
              <button class="btn btn--primary btn--lg" id="start-exam-btn"
                data-module="${mod.id}"
                data-exam-type="${examType}"
                data-subject="${subject}">
                Start Exam →
              </button>
              ${progress ? `<button class="btn btn--ghost" id="retry-exam-btn"
                data-module="${mod.id}"
                data-exam-type="${examType}"
                data-subject="${subject}">
                Retry Exam
              </button>` : ''}
            </div>
          </div>`
      }
    </div>`;
  },

  // ─── Exam interface ──────────────────────────────────────────────────────

  renderExam(engine, config) {
    const q     = engine.getCurrent();
    const idx   = engine.state.currentIndex;
    const total = engine.questions.length;
    const sub   = config.subjects.find(s => s.id === engine.config.subject);
    const et    = config.examTypes.find(e => e.id === engine.config.examType);
    const answered = engine.getCurrentAnswer();
    const isFlagged = engine.isFlagged(idx);
    const progress  = engine.getProgress();

    const paletteHTML = engine.questions.map((_, i) => {
      let cls = 'palette-btn';
      if (i === idx)                  cls += ' palette-btn--current';
      else if (engine.isAnswered(i))  cls += ' palette-btn--answered';
      if (engine.isFlagged(i))        cls += ' palette-btn--flagged';
      return `<button class="${cls}" data-goto="${i}" title="Question ${i + 1}">${i + 1}</button>`;
    }).join('');

    const optionsHTML = q.options.map((opt, i) => {
      let cls = 'option';
      if (answered !== undefined) {
        if (i === q.answer)               cls += ' option--correct';
        else if (i === answered)          cls += ' option--wrong';
      }
      const letter = ['A', 'B', 'C', 'D'][i];
      return `<button class="${cls}" data-option="${i}" ${answered !== undefined ? 'disabled' : ''}>
        <span class="option__letter">${letter}</span>
        <span class="option__text">${opt}</span>
      </button>`;
    }).join('');

    const explanationHTML = (answered !== undefined && engine.config.immediateFeedback)
      ? `<div class="explanation-box ${answered === q.answer ? 'explanation-box--correct' : 'explanation-box--wrong'}">
          <div class="explanation-box__header">
            ${answered === q.answer ? '✅ Correct!' : `❌ Incorrect — Correct answer: <strong>${['A','B','C','D'][q.answer]}</strong>`}
          </div>
          <p class="explanation-box__text">${q.explanation}</p>
        </div>` : '';

    return `
    <div class="exam-layout">
      <aside class="exam-sidebar">
        <div class="exam-sidebar__header">
          <div class="exam-sidebar__title">${sub.icon} ${sub.label}</div>
          <div class="exam-sidebar__sub">${et.label}</div>
        </div>
        <div class="exam-progress-info">
          <span>${progress.answered}/${total} answered</span>
          ${progress.flagged > 0 ? `<span>🚩 ${progress.flagged}</span>` : ''}
        </div>
        <div class="palette">${paletteHTML}</div>
        <div class="palette-legend">
          <span class="legend-item legend-item--current">Current</span>
          <span class="legend-item legend-item--answered">Answered</span>
          <span class="legend-item legend-item--flagged">Flagged</span>
        </div>
        <button class="btn btn--danger btn--sm submit-exam-btn" id="submit-exam-btn">Submit Exam</button>
      </aside>

      <main class="exam-main">
        <div class="exam-topbar">
          ${this.backBtn('subject', { moduleId: engine.config.module, examType: engine.config.examType, subject: engine.config.subject })}
          <div class="exam-counter">Question <strong>${idx + 1}</strong> of <strong>${total}</strong></div>
          <button class="flag-btn ${isFlagged ? 'flag-btn--active' : ''}" id="flag-btn" title="${isFlagged ? 'Unflag' : 'Flag'} question">
            🚩 ${isFlagged ? 'Flagged' : 'Flag'}
          </button>
        </div>

        <div class="question-card">
          <div class="question-card__number">Q${idx + 1}</div>
          <p class="question-card__text">${q.question}</p>
        </div>

        <div class="options-list">${optionsHTML}</div>
        ${explanationHTML}

        <div class="exam-nav">
          <button class="btn btn--ghost" id="prev-btn" ${idx === 0 ? 'disabled' : ''}>← Previous</button>
          <button class="btn btn--primary" id="next-btn" ${idx === total - 1 ? 'disabled' : ''}>Next →</button>
        </div>
      </main>
    </div>`;
  },

  // ─── Results page ─────────────────────────────────────────────────────────

  renderResults(results, config) {
    const sub = config.subjects.find(s => s.id === results.config.subject);
    const et  = config.examTypes.find(e => e.id === results.config.examType);

    const reviewHTML = results.perQuestion.map((pq, i) => {
      const cls = pq.correct ? 'result-item--correct' : pq.answered ? 'result-item--wrong' : 'result-item--skipped';
      const status = pq.correct ? '✅' : pq.answered ? '❌' : '—';
      return `<div class="result-item ${cls}">
        <div class="result-item__header">
          <span class="result-item__num">${status} Q${i + 1}</span>
          ${pq.flagged ? '<span class="result-item__flag">🚩</span>' : ''}
        </div>
        <p class="result-item__question">${pq.question}</p>
        <div class="result-item__answers">
          ${pq.answered ? `<span class="result-item__user ${pq.correct ? 'result-item__user--correct' : 'result-item__user--wrong'}">Your answer: ${['A','B','C','D'][pq.userAnswer]}. ${pq.options[pq.userAnswer]}</span>` : '<span class="result-item__skipped">Not answered</span>'}
          ${!pq.correct ? `<span class="result-item__correct">Correct: ${['A','B','C','D'][pq.answer]}. ${pq.options[pq.answer]}</span>` : ''}
        </div>
        <div class="result-item__explanation">${pq.explanation}</div>
      </div>`;
    }).join('');

    return `
    <div class="page results-page">
      ${this.backBtn('subject', { moduleId: results.config.module, examType: results.config.examType, subject: results.config.subject })}
      ${this.breadcrumb([
        { label: 'Dashboard', nav: 'dashboard' },
        { label: results.config.module, nav: 'module', params: { moduleId: results.config.module } },
        { label: et.label },
        { label: sub.label },
        { label: 'Results' },
      ])}

      <div class="results-summary">
        <div class="results-summary__ring">
          ${this.scoreRing(results.score)}
        </div>
        <div class="results-summary__stats">
          <h2 class="results-summary__title">Exam Complete</h2>
          <p class="results-summary__subtitle">${sub.label} · ${et.label}</p>
          <div class="results-summary__grid">
            ${this.statCard('Correct',   results.correct,   '✅', '#059669')}
            ${this.statCard('Incorrect', results.incorrect, '❌', '#dc2626')}
            ${this.statCard('Skipped',   results.unanswered,'—',  '#6b7280')}
            ${this.statCard('Time',      ExamEngine.formatTime(results.timeSec), '⏱', '#2563eb')}
          </div>
        </div>
      </div>

      <div class="results-actions">
        ${results.incorrect > 0 ? `<button class="btn btn--danger" data-nav="review">🔄 Review Incorrect</button>` : ''}
        <button class="btn btn--primary" id="retry-incorrect-btn"
          data-module="${results.config.module}"
          data-exam-type="${results.config.examType}"
          data-subject="${results.config.subject}"
          ${results.incorrect === 0 ? 'disabled' : ''}>Retry Incorrect Only</button>
        <button class="btn btn--ghost" id="retry-all-btn"
          data-module="${results.config.module}"
          data-exam-type="${results.config.examType}"
          data-subject="${results.config.subject}">Retry Full Exam</button>
        <button class="btn btn--ghost" data-nav="dashboard">Dashboard</button>
      </div>

      <section class="section">
        <h2 class="section__title">Question Review</h2>
        <div class="results-list">${reviewHTML}</div>
      </section>
    </div>`;
  },

  // ─── Review page ──────────────────────────────────────────────────────────

  renderReview(incorrectList, config) {
    if (incorrectList.length === 0) {
      return `<div class="page">
        ${this.backBtn('dashboard')}
        ${this.breadcrumb([{ label: 'Dashboard', nav: 'dashboard' }, { label: 'Review' }])}
        ${this.emptyState('Nothing to Review', 'Complete some exams and any incorrect answers will appear here for review.', '🎉')}
      </div>`;
    }

    const grouped = {};
    incorrectList.forEach(q => {
      const key = q.module;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(q);
    });

    const listHTML = incorrectList.map(q => {
      const sub = config.subjects.find(s => s.id === q.subject);
      const et  = config.examTypes.find(e => e.id === q.examType);
      return `<div class="review-item" data-uid="${q.uid}">
        <div class="review-item__meta">
          <span class="badge" style="background:${sub?.color}20;color:${sub?.color}">${sub?.icon} ${sub?.label}</span>
          <span class="badge badge--ghost">${q.module}</span>
          <span class="badge badge--ghost">${et?.label}</span>
        </div>
        <p class="review-item__question">${q.question}</p>
        <div class="review-item__options">
          ${q.options.map((opt, i) => `<span class="review-opt ${i === q.answer ? 'review-opt--correct' : i === q.userAnswer ? 'review-opt--wrong' : ''}">${['A','B','C','D'][i]}. ${opt}</span>`).join('')}
        </div>
        <div class="review-item__explanation">${q.explanation}</div>
        <button class="btn btn--ghost btn--sm review-item__remove" data-remove-uid="${q.uid}">✓ Mark as Mastered</button>
      </div>`;
    }).join('');

    const filterOptions = config.modules.map(m =>
      `<option value="${m.id}">${m.title}</option>`
    ).join('');

    return `
    <div class="page review-page">
      ${this.backBtn('dashboard')}
      ${this.breadcrumb([{ label: 'Dashboard', nav: 'dashboard' }, { label: 'Review Incorrect Questions' }])}
      <header class="page__header" style="--mod-color:#dc2626">
        <span class="page__icon">🔄</span>
        <div>
          <h1 class="page__title">Review Incorrect Questions</h1>
          <p class="page__subtitle">${incorrectList.length} questions pending review</p>
        </div>
      </header>

      <div class="review-filters">
        <input type="text" id="review-search" class="input" placeholder="Search questions…">
        <select id="review-filter-module" class="select">
          <option value="">All Modules</option>
          ${filterOptions}
        </select>
        <select id="review-filter-subject" class="select">
          <option value="">All Subjects</option>
          ${config.subjects.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
        </select>
        <button class="btn btn--danger btn--sm" id="clear-all-review">Clear All</button>
      </div>

      <div class="review-list" id="review-list">${listHTML}</div>
    </div>`;
  },

  // ─── Search page ──────────────────────────────────────────────────────────

  renderSearch(config) {
    return `
    <div class="page search-page">
      ${this.backBtn('dashboard')}
      ${this.breadcrumb([{ label: 'Dashboard', nav: 'dashboard' }, { label: 'Search' }])}
      <header class="page__header" style="--mod-color:#2563eb">
        <span class="page__icon">🔍</span>
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

  // ─── Internal helpers ────────────────────────────────────────────────────

  _calcModuleProgress(mod, config, progressMap) {
    let completed = 0;
    const total = config.examTypes.length * config.subjects.length;
    config.examTypes.forEach(et => {
      config.subjects.forEach(sub => {
        const key = `${mod.id}|${et.id}|${sub.id}`;
        if (progressMap[key]?.completed) completed++;
      });
    });
    return {
      setsCompleted: completed,
      totalSets:     total,
      percent:       total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  },
};
