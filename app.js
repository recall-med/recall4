/**
 * ============================================================
 * DEPT. Q. BANK — app.js
 * ============================================================
 * Main application controller. Orchestrates navigation,
 * data loading, and page rendering.
 *
 * HOW TO ADD A NEW PAGE:
 * 1. Add a navigate case in App._renderPage().
 * 2. Add a UI.renderMyPage() method in ui.js.
 * 3. Add event binding in App._bindPageEvents().
 * ============================================================
 */

const App = {

  config: null,       // loaded from config/modules.json
  currentPage: null,
  currentParams: {},
  lastResults: null,  // holds most recent exam results for retry flows

  // ─── Bootstrap ───────────────────────────────────────────────────────────

  async init() {
    UI.loading('Loading Dept. Q. Bank…');
    try {
      this.config = await this._loadConfig();
      document.title = this.config.siteTitle;
    } catch (e) {
      UI.setContent(`<div class="error-screen">
        <h2>⚠️ Configuration Error</h2>
        <p>Could not load <code>config/modules.json</code>. Check the file exists and is valid JSON.</p>
        <pre>${e.message}</pre>
      </div>`);
      return;
    }

    // Attach global click delegation
    document.addEventListener('click', e => this._handleGlobalClick(e));

    // Restore last page or go to dashboard
    const last = Storage.loadLastPage();
    if (last && last.page) {
      this.navigate(last.page, last.params);
    } else {
      this.navigate('dashboard');
    }
  },

  // ─── Navigation ──────────────────────────────────────────────────────────

  navigate(page, params = {}) {
    this.currentPage   = page;
    this.currentParams = params;
    Storage.saveLastPage({ page, params });
    this._renderPage(page, params);
  },

  async _renderPage(page, params) {
    switch (page) {

      case 'dashboard': {
        const progress = Storage.getProgress();
        const stats    = Storage.getStats();
        UI.setContent(UI.renderDashboard(this.config, progress, stats));
        this._bindDashboardEvents();
        break;
      }

      case 'module': {
        const mod = this._getModule(params.moduleId);
        if (!mod) { this.navigate('dashboard'); break; }
        const progress = Storage.getProgress();
        UI.setContent(UI.renderModule(mod, this.config, progress));
        this._bindPageEvents();
        break;
      }

      case 'subject': {
        const mod     = this._getModule(params.moduleId);
        const subject = params.subject;
        const et      = params.examType;
        if (!mod) { this.navigate('dashboard'); break; }
        UI.loading('Loading subject…');
        const count    = await this._getQuestionCount(mod, et, subject);
        const progress = Storage.getSubjectProgress(mod.id, et, subject);
        UI.setContent(UI.renderSubject(mod, et, subject, count, progress, this.config));
        this._bindSubjectEvents(mod, et, subject);
        this._bindPageEvents();
        break;
      }

      case 'exam': {
        UI.loading('Preparing exam…');
        const started = await this._startExam(params);
        if (!started) { this.navigate('subject', params); break; }
        UI.setContent(UI.renderExam(ExamEngine, this.config));
        this._bindExamEvents();
        break;
      }

      case 'results': {
        if (!this.lastResults) { this.navigate('dashboard'); break; }
        UI.setContent(UI.renderResults(this.lastResults, this.config));
        this._bindResultsEvents();
        this._bindPageEvents();
        break;
      }

      case 'review': {
        const incorrect = Storage.getIncorrect();
        UI.setContent(UI.renderReview(incorrect, this.config));
        this._bindReviewEvents();
        this._bindPageEvents();
        break;
      }

      case 'search': {
        UI.setContent(UI.renderSearch(this.config));
        this._bindSearchEvents();
        this._bindPageEvents();
        break;
      }

      default:
        this.navigate('dashboard');
    }
  },

  // ─── Global click delegation ─────────────────────────────────────────────

  _handleGlobalClick(e) {
    const el = e.target.closest('[data-nav]');
    if (!el) return;
    e.preventDefault();
    const page   = el.dataset.nav;
    let params = {};
    try { params = JSON.parse(el.dataset.params || '{}'); } catch {}
    this.navigate(page, params);
  },

  // ─── Dashboard events ─────────────────────────────────────────────────────

  _bindDashboardEvents() {
    // Module cards are handled by global click delegation
    // Nothing extra needed
  },

  // ─── Generic page events (back buttons, breadcrumbs) ──────────────────────

  _bindPageEvents() {
    // All [data-nav] elements handled by global click delegation
  },

  // ─── Subject page events ──────────────────────────────────────────────────

  _bindSubjectEvents(mod, examType, subject) {
    const startBtn = document.getElementById('start-exam-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        const feedback = document.getElementById('opt-feedback')?.checked ?? false;
        const random   = document.getElementById('opt-random')?.checked ?? false;
        this.navigate('exam', {
          moduleId:         mod.id,
          examType,
          subject,
          immediateFeedback: feedback,
          randomize:         random,
          retryIncorrectOnly: false,
        });
      });
    }
    const retryBtn = document.getElementById('retry-exam-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        const feedback = document.getElementById('opt-feedback')?.checked ?? false;
        const random   = document.getElementById('opt-random')?.checked ?? false;
        this.navigate('exam', {
          moduleId:         mod.id,
          examType,
          subject,
          immediateFeedback: feedback,
          randomize:         random,
          retryIncorrectOnly: false,
        });
      });
    }
  },

  // ─── Exam events ──────────────────────────────────────────────────────────

  _bindExamEvents() {
    // Option selection
    document.addEventListener('click', this._examClickHandler = e => {
      const optBtn = e.target.closest('.option:not([disabled])');
      if (optBtn) {
        const idx = parseInt(optBtn.dataset.option, 10);
        const result = ExamEngine.answer(idx);
        if (result) {
          // Re-render question area
          const opts = document.querySelectorAll('.option');
          opts.forEach((btn, i) => {
            btn.disabled = true;
            if (i === result.correctIndex)          btn.classList.add('option--correct');
            else if (i === idx && !result.correct)  btn.classList.add('option--wrong');
          });

          // Update palette
          this._updatePalette();

          // Show explanation if immediate feedback
          if (ExamEngine.config.immediateFeedback) {
            const existing = document.querySelector('.explanation-box');
            if (!existing) {
              const box = document.createElement('div');
              box.className = `explanation-box ${result.correct ? 'explanation-box--correct' : 'explanation-box--wrong'}`;
              box.innerHTML = `
                <div class="explanation-box__header">
                  ${result.correct ? '✅ Correct!' : `❌ Incorrect — Correct answer: <strong>${['A','B','C','D'][result.correctIndex]}</strong>`}
                </div>
                <p class="explanation-box__text">${result.explanation}</p>`;
              document.querySelector('.options-list').after(box);
            }
          }
        }
      }

      // Palette navigation
      const palBtn = e.target.closest('.palette-btn');
      if (palBtn && palBtn.dataset.goto !== undefined) {
        ExamEngine.goTo(parseInt(palBtn.dataset.goto, 10));
        UI.setContent(UI.renderExam(ExamEngine, this.config));
        this._bindExamEvents();
      }

      // Next/Prev
      if (e.target.id === 'next-btn') {
        ExamEngine.next();
        UI.setContent(UI.renderExam(ExamEngine, this.config));
        this._bindExamEvents();
      }
      if (e.target.id === 'prev-btn') {
        ExamEngine.prev();
        UI.setContent(UI.renderExam(ExamEngine, this.config));
        this._bindExamEvents();
      }

      // Flag
      if (e.target.id === 'flag-btn' || e.target.closest('#flag-btn')) {
        const nowFlagged = ExamEngine.toggleFlag(ExamEngine.state.currentIndex);
        const btn = document.getElementById('flag-btn');
        if (btn) {
          btn.classList.toggle('flag-btn--active', nowFlagged);
          btn.textContent = `🚩 ${nowFlagged ? 'Flagged' : 'Flag'}`;
        }
        this._updatePalette();
        UI.toast(nowFlagged ? 'Question flagged.' : 'Flag removed.', 'info', 1500);
      }

      // Submit
      if (e.target.id === 'submit-exam-btn' || e.target.closest('#submit-exam-btn')) {
        const unanswered = ExamEngine.getProgress().unanswered;
        if (unanswered > 0) {
          const ok = confirm(`You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submit anyway?`);
          if (!ok) return;
        }
        this._submitExam();
      }
    });

    // Remove handler when leaving exam
    this._cleanupExamListeners = () => {
      document.removeEventListener('click', this._examClickHandler);
    };
  },

  _updatePalette() {
    const palette = document.querySelector('.palette');
    if (!palette) return;
    ExamEngine.questions.forEach((_, i) => {
      const btn = palette.querySelector(`[data-goto="${i}"]`);
      if (!btn) return;
      btn.className = 'palette-btn';
      if (i === ExamEngine.state.currentIndex) btn.classList.add('palette-btn--current');
      else if (ExamEngine.isAnswered(i))       btn.classList.add('palette-btn--answered');
      if (ExamEngine.isFlagged(i))             btn.classList.add('palette-btn--flagged');
    });

    const info = document.querySelector('.exam-progress-info');
    if (info) {
      const p = ExamEngine.getProgress();
      info.innerHTML = `<span>${p.answered}/${p.total} answered</span>${p.flagged > 0 ? `<span>🚩 ${p.flagged}</span>` : ''}`;
    }
  },

  _submitExam() {
    if (this._cleanupExamListeners) this._cleanupExamListeners();
    this.lastResults = ExamEngine.submit();
    this.navigate('results');
  },

  // ─── Results events ───────────────────────────────────────────────────────

  _bindResultsEvents() {
    document.addEventListener('click', e => {
      if (e.target.id === 'retry-incorrect-btn' || e.target.closest('#retry-incorrect-btn')) {
        const btn = e.target.closest('#retry-incorrect-btn') || e.target;
        this.navigate('exam', {
          moduleId:           btn.dataset.module,
          examType:           btn.dataset.examType,
          subject:            btn.dataset.subject,
          immediateFeedback:  this.lastResults?.config?.immediateFeedback ?? false,
          randomize:          true,
          retryIncorrectOnly: true,
        });
      }
      if (e.target.id === 'retry-all-btn' || e.target.closest('#retry-all-btn')) {
        const btn = e.target.closest('#retry-all-btn') || e.target;
        this.navigate('exam', {
          moduleId:           btn.dataset.module,
          examType:           btn.dataset.examType,
          subject:            btn.dataset.subject,
          immediateFeedback:  false,
          randomize:          false,
          retryIncorrectOnly: false,
        });
      }
    }, { once: true });
  },

  // ─── Review events ────────────────────────────────────────────────────────

  _bindReviewEvents() {
    const list   = document.getElementById('review-list');
    const search = document.getElementById('review-search');
    const fMod   = document.getElementById('review-filter-module');
    const fSub   = document.getElementById('review-filter-subject');
    const clearAll = document.getElementById('clear-all-review');

    const filterAndRender = () => {
      let items = Storage.getIncorrect();
      const q = search?.value.toLowerCase() ?? '';
      const m = fMod?.value ?? '';
      const s = fSub?.value ?? '';
      if (q) items = items.filter(i => i.question.toLowerCase().includes(q));
      if (m) items = items.filter(i => i.module === m);
      if (s) items = items.filter(i => i.subject === s);

      if (list) {
        list.innerHTML = items.length === 0
          ? UI.emptyState('No Matches', 'Try adjusting your filters or search term.', '🔍')
          : items.map(q => {
              const sub = this.config.subjects.find(s => s.id === q.subject);
              const et  = this.config.examTypes.find(e => e.id === q.examType);
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
      }
    };

    search?.addEventListener('input', filterAndRender);
    fMod?.addEventListener('change', filterAndRender);
    fSub?.addEventListener('change', filterAndRender);

    clearAll?.addEventListener('click', () => {
      if (confirm('Remove all questions from review? This cannot be undone.')) {
        Storage.clearAllIncorrect();
        this.navigate('review');
      }
    });

    list?.addEventListener('click', e => {
      const btn = e.target.closest('[data-remove-uid]');
      if (btn) {
        Storage.removeIncorrect(btn.dataset.removeUid);
        btn.closest('.review-item')?.remove();
        UI.toast('Marked as mastered.', 'success');
      }
    });
  },

  // ─── Search events ────────────────────────────────────────────────────────

  _bindSearchEvents() {
    const input   = document.getElementById('global-search');
    const results = document.getElementById('search-results');
    if (!input || !results) return;

    let debounceTimer;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => this._runSearch(input.value, results), 300);
    });
  },

  async _runSearch(query, container) {
    if (!query || query.trim().length < 2) {
      container.innerHTML = '<p class="search-hint">Start typing to search across all available questions.</p>';
      return;
    }
    container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
    const q = query.toLowerCase().trim();
    const found = [];

    // Search modules and subjects by name
    this.config.modules.forEach(mod => {
      if (mod.title.toLowerCase().includes(q) || mod.fullTitle.toLowerCase().includes(q)) {
        found.push({ type: 'module', label: mod.title, sub: mod.fullTitle, nav: 'module', params: { moduleId: mod.id } });
      }
    });
    this.config.subjects.forEach(sub => {
      if (sub.label.toLowerCase().includes(q)) {
        found.push({ type: 'subject', label: sub.label, sub: 'Subject', nav: 'dashboard', params: {} });
      }
    });

    // Search incorrect questions bank (already loaded)
    Storage.getIncorrect().forEach(iq => {
      if (iq.question.toLowerCase().includes(q)) {
        found.push({ type: 'question', label: iq.question, sub: `${iq.module} · ${iq.subject}`, nav: 'review', params: {} });
      }
    });

    if (found.length === 0) {
      container.innerHTML = `<p class="search-hint">No results for "<strong>${query}</strong>".</p>`;
      return;
    }

    container.innerHTML = found.slice(0, 30).map(r => `
      <div class="search-result-item" data-nav="${r.nav}" data-params='${JSON.stringify(r.params)}'>
        <span class="search-result-item__type">${r.type}</span>
        <div>
          <div class="search-result-item__label">${r.label}</div>
          <div class="search-result-item__sub">${r.sub}</div>
        </div>
      </div>`).join('');
  },

  // ─── Exam start helper ───────────────────────────────────────────────────

  async _startExam(params) {
    let questions;

    if (params.retryIncorrectOnly) {
      // Filter from global incorrect bank
      const all = Storage.getIncorrect().filter(
        q => q.module === params.moduleId &&
             q.examType === params.examType &&
             q.subject === params.subject
      );
      if (all.length === 0) {
        UI.toast('No incorrect questions to retry.', 'info');
        return false;
      }
      // Inject as questions array
      ExamEngine.config = {
        module:            params.moduleId,
        examType:          params.examType,
        subject:           params.subject,
        immediateFeedback: params.immediateFeedback ?? false,
        randomize:         params.randomize ?? true,
      };
      ExamEngine.questions = params.randomize ? ExamEngine._shuffle([...all]) : all;
      ExamEngine.state = {
        currentIndex: 0,
        answers: {},
        flagged: new Set(),
        startTime: Date.now(),
        endTime: null,
        submitted: false,
      };
      return true;
    }

    const count = await ExamEngine.init({
      module:            params.moduleId,
      examType:          params.examType,
      subject:           params.subject,
      immediateFeedback: params.immediateFeedback ?? false,
      randomize:         params.randomize ?? false,
    });

    if (count === 0) {
      UI.toast('No questions available for this subject.', 'info');
      return false;
    }
    return true;
  },

  // ─── Config loader ───────────────────────────────────────────────────────

  async _loadConfig() {
    const res = await fetch('config/modules.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async _getQuestionCount(mod, examType, subject) {
    const path = `data/${mod.dataPath}/${examType}/${subject}.json`;
    try {
      const res = await fetch(path);
      if (!res.ok) return 0;
      const data = await res.json();
      return Array.isArray(data.questions) ? data.questions.length : 0;
    } catch { return 0; }
  },

  _getModule(id) {
    return this.config?.modules?.find(m => m.id === id) ?? null;
  },
};

// ─── Start the application ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
