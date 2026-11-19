/**
 * ============================================================
 * Recall — exam.js  (v3 — subject & exam-type wide exams)
 * ============================================================
 */

const ExamEngine = {

  config: null,
  questions: [],
  state: {
    currentIndex: 0,
    answers: {},
    flagged: new Set(),
    startTime: null,
    endTime: null,
    elapsedMs: 0,
    paused: false,
    submitted: false,
  },

  async init(config) {
    this.config = config;
    let data;
    if (config.scope === 'subject') {
      // Load all sub-subjects for a given module+examType+subject
      data = await this._loadQuestionsForSubject(config);
    } else if (config.scope === 'examtype') {
      // Load all subjects+sub-subjects for a given module+examType
      data = await this._loadQuestionsForExamType(config);
    } else {
      data = await this._loadQuestions(config);
    }
    this.questions = config.randomize ? this._shuffle([...data]) : [...data];
    this.state = {
      currentIndex: 0,
      answers: {},
      flagged: new Set(),
      startTime: Date.now(),
      endTime: null,
      elapsedMs: 0,
      paused: false,
      submitted: false,
    };
    Storage.clearCurrentExam();
    if (this._isTopic(config)) Storage.clearTopicExam(Storage.resultsKey(config));   // a new attempt replaces the unfinished one
    // Saved straight away, so a refresh before the first answer keeps this exam instead of starting another one
    if (this.questions.length) this.save();
    return this.questions.length;
  },

  // A normal exam on one topic (not a full exam, not a practice run): the only kind that gets its own "Continue" card
  _isTopic(c) { return !!c && !c.scope && !c.retryOf; },

  async resume(topicKey) {
    const saved = topicKey ? Storage.getTopicExam(topicKey) : Storage.loadCurrentExam();
    if (!saved || !saved.state || saved.state.submitted) return false;
    this.config    = saved.config;
    this.questions = saved.questions;
    this.state     = { ...saved.state, flagged: new Set(saved.state.flagged) };
    // Any time already spent is preserved in elapsedMs; start a fresh active
    // segment now that the exam is actually back on screen.
    this.state.startTime = Date.now();
    this.state.paused    = false;
    this.save();
    return true;
  },

  // Called when the exam leaves the screen while still in progress (navigating
  // away, backgrounding the tab, etc.) — folds the current active segment into
  // elapsedMs and stops the clock so time away doesn't count as exam time.
  pause() {
    if (!this.config || this.state.submitted || this.state.paused) return;
    this.state.elapsedMs = (this.state.elapsedMs || 0) + (Date.now() - this.state.startTime);
    this.state.paused    = true;
    this.save();
  },

  // Called when an already-loaded exam comes back on screen (e.g. tab
  // refocused) without a full reload from storage — just restarts the active
  // segment.
  resumeSegment() {
    if (!this.config || this.state.submitted || !this.state.paused) return;
    this.state.startTime = Date.now();
    this.state.paused    = false;
    this.save();
  },

  save() {
    if (!this.config || this.state.submitted) return;
    const snap = {
      config:    this.config,
      questions: this.questions,
      state:     { ...this.state, flagged: [...this.state.flagged] },
    };
    Storage.saveCurrentExam(snap);
    if (this._isTopic(this.config)) Storage.saveTopicExam(Storage.resultsKey(this.config), snap);
  },

  goTo(index) {
    if (index >= 0 && index < this.questions.length) {
      this.state.currentIndex = index;
      this.save();
    }
  },

  next() { this.goTo(this.state.currentIndex + 1); },
  prev() { this.goTo(this.state.currentIndex - 1); },

  answer(optionIndex) {
    if (this.state.submitted) return null;
    this.state.answers[this.state.currentIndex] = optionIndex;
    this.save();
    const q = this.questions[this.state.currentIndex];
    return {
      correct:      q.answer === optionIndex,
      correctIndex: q.answer,
      explanation:  q.explanation,
    };
  },

  toggleFlag(index) {
    if (this.state.flagged.has(index)) {
      this.state.flagged.delete(index);
    } else {
      this.state.flagged.add(index);
    }
    const q = this.questions[index];
    Storage.toggleFlag({
      module:      q._module || this.config.module,
      examType:    q._examType || this.config.examType,
      subject:     this.config.subject || q._subject,
      subSubject:  this.config.subSubject || q._subSubject,
      id:          q.id,
      question:    q.question,
      options:     q.options,
      answer:      q.answer,
      explanation: q.explanation,
    });
    this.save();
    return this.state.flagged.has(index);
  },

  submit() {
    if (this.state.submitted) return null;
    this.state.submitted = true;
    this.state.endTime   = Date.now();

    const activeMs = this.state.paused ? 0 : (this.state.endTime - this.state.startTime);
    const totalMs  = (this.state.elapsedMs || 0) + activeMs;

    const results = {
      config:      this.config,
      questions:   this.questions,
      answers:     { ...this.state.answers },
      score:       0,
      total:       this.questions.length,
      correct:     0,
      incorrect:   0,
      unanswered:  0,
      timeSec:     Math.round(totalMs / 1000),
      completedAt: this.state.endTime,
      perQuestion: [],
    };

    this.questions.forEach((q, i) => {
      const userAns = this.state.answers[i];
      const answered = userAns !== undefined;
      const correct  = answered && userAns === q.answer;

      results.perQuestion.push({
        id:               q.id,
        question:         q.question,
        options:          q.options,
        answer:           q.answer,
        explanation:      q.explanation,
        userAnswer:       userAns,
        correct,
        answered,
        flagged:          this.state.flagged.has(i),
        _module:          q._module,
        _examType:        q._examType,
        _subject:         q._subject,
        _subSubject:      q._subSubject,
        _subSubjectLabel: q._subSubjectLabel,
      });

      if (!answered)    results.unanswered++;
      else if (correct) results.correct++;
      else              results.incorrect++;

      if (!correct && answered) {
        Storage.addIncorrect({
          module:           q._module   || this.config.module,
          examType:         q._examType || this.config.examType,
          subject:          q._subject         || this.config.subject,
          subSubject:       q._subSubject      || this.config.subSubject,
          subSubjectLabel:  q._subSubjectLabel || this.config.subSubjectLabel,
          id:               q.id,
          question:         q.question,
          options:          q.options,
          answer:           q.answer,
          explanation:      q.explanation,
          userAnswer:       userAns,
        });
      }
    });

    results.score = results.total > 0
      ? Math.round((results.correct / results.total) * 100) : 0;

    Storage.updateStats({
      totalAttempted:    results.total - results.unanswered,
      totalCorrect:      results.correct,
      totalIncorrect:    results.incorrect,
      completedExams:    1,
      totalTimeSpentSec: results.timeSec,
    });

    // A practice run (retry of the incorrect questions) is not an attempt at the whole scope: it leaves progress,
    // the last-attempt record and the previous-attempt comparison alone.
    const practice = !!this.config.retryOf;
    const same = h => !h.retry && h.module === this.config.module && h.examType === this.config.examType &&
      (h.scope || null) === (this.config.scope || null) && (h.subject || null) === (this.config.subject || null) &&
      (h.subSubject || null) === (this.config.subSubject || null);
    const prev = practice ? null : Storage.getExamHistory().find(same);
    results.previous = prev ? { score: prev.score, correct: prev.correct, total: prev.total, completedAt: prev.completedAt || prev.id } : null;

    // Only save per-subsubject progress for single sub-subject exams
    if (!this.config.scope && !practice) {
      Storage.setSubjectProgress(
        this.config.module,
        this.config.examType,
        this.config.subject,
        this.config.subSubject,
        {
          completed:   true,
          attempted:   results.total - results.unanswered,
          correct:     results.correct,
          total:       results.total,
          score:       results.score,
          lastAttempt: results.completedAt,
        }
      );
    }

    Storage.addExamResult({
      module:      this.config.module,
      examType:    this.config.examType,
      subject:     this.config.subject,
      subSubject:  this.config.subSubject,
      scope:       this.config.scope,
      score:       results.score,
      correct:     results.correct,
      total:       results.total,
      attempted:   results.total - results.unanswered,
      timeSec:     results.timeSec,
      retry:       practice || undefined,
    });

    const kind = this.config.scope;
    if (!practice || kind === 'custom') {
      const rec = {
        config: this.config, score: results.score, total: results.total, correct: results.correct, incorrect: results.incorrect,
        unanswered: results.unanswered, timeSec: results.timeSec, completedAt: results.completedAt,
        perQuestion: results.perQuestion, previous: results.previous,
      };
      // topic: one record (retries merge into it); full exams and custom exams: every attempt is kept
      if (kind) Storage.saveAttempt(Storage.resultsKey(this.config), rec); else Storage.saveLastResults(Storage.resultsKey(this.config), rec);
    }

    Storage.clearCurrentExam();
    if (this._isTopic(this.config)) Storage.clearTopicExam(Storage.resultsKey(this.config));

    // Retry of a topic's incorrect questions: the page shown afterwards is the whole topic's results, updated
    if (practice) { const merged = this._mergeIntoLast(results); if (merged) return merged; }
    return results;
  },

  // Folds the answers of a practice run into the stored last attempt of the same topic: each retried question takes its new
  // outcome, the counts and score are recalculated for the whole topic, and the topic's last score follows. Skipped questions
  // of the run change nothing. Returns null when there is nothing to merge into (then the run's own results are shown).
  _mergeIntoLast(run) {
    const cfg = this.config;
    if (cfg.scope || cfg.mixed) return null;
    const key = Storage.resultsKey(cfg);
    const rec = Storage.getLastResults(key);
    if (!rec || !Array.isArray(rec.perQuestion)) return null;
    const idOf = p => `${p._subject || ''}|${p._subSubject || ''}|${p.id}`;
    const at   = new Map(rec.perQuestion.map((p, i) => [idOf(p), i]));
    const per  = rec.perQuestion.map(p => ({ ...p }));
    let retried = 0, fixed = 0;
    run.perQuestion.forEach(p => {
      const i = at.get(idOf(p));
      if (i === undefined || !p.answered) return;
      const old = per[i];
      per[i] = { ...old, question: p.question, options: p.options, answer: p.answer, explanation: p.explanation, userAnswer: p.userAnswer, correct: p.correct, answered: true };
      retried++; if (!old.correct && p.correct) fixed++;
    });
    if (!retried) return null;
    const correct    = per.filter(p => p.correct).length;
    const unanswered = per.filter(p => !p.answered).length;
    const merged = {
      ...rec, perQuestion: per, correct, unanswered, incorrect: per.length - correct - unanswered,
      score: per.length ? Math.round((correct / per.length) * 100) : 0,
      timeSec: (rec.timeSec || 0) + (run.timeSec || 0), completedAt: run.completedAt,
      updated: { retried, fixed },
    };
    Storage.saveLastResults(key, merged);
    Storage.setSubjectProgress(cfg.module, cfg.examType, cfg.subject, cfg.subSubject, {
      attempted: per.length - unanswered, correct, total: per.length, score: merged.score, lastAttempt: run.completedAt,
    });
    return merged;
  },

  getCurrent()      { return this.questions[this.state.currentIndex] || null; },
  getCurrentAnswer(){ return this.state.answers[this.state.currentIndex]; },
  isAnswered(index) { return this.state.answers[index] !== undefined; },
  isFlagged(index)  { return this.state.flagged.has(index); },

  getProgress() {
    const answered   = Object.keys(this.state.answers).length;
    const flagged    = this.state.flagged.size;
    const unanswered = this.questions.length - answered;
    return { answered, unanswered, flagged, total: this.questions.length };
  },

  // ─── Question loaders ────────────────────────────────────────────────────

  // Load a single sub-subject file
  async _loadQuestions(config) {
    const path = `data/${config.module}/${config.examType}/${config.subject}/${config.subSubject}.json`;
    try {
      const res = await fetch(path);
      if (!res.ok) return [];
      const data = await res.json();
      const qs = Array.isArray(data.questions) ? data.questions : [];
      return qs.map(q => ({ ...q, _subject: config.subject, _subSubject: config.subSubject, _subSubjectLabel: config.subSubjectLabel }));
    } catch (e) {
      console.warn(`[ExamEngine] Could not load ${path}:`, e);
      return [];
    }
  },

  // Load all sub-subjects for one subject under one exam type
  async _loadQuestionsForSubject(config) {
    // config.subSubjectList = [{ id, label, icon }, ...]
    const list = config.subSubjectList || [];
    const batches = await Promise.all(
      list.map(ss => this._loadOneSubSubject(config.module, config.examType, config.subject, ss))
    );
    return batches.flat();
  },

  // Load all subjects + sub-subjects for one exam type
  async _loadQuestionsForExamType(config) {
    // config.subjectMap = { subjectId: [{ id, label, icon }, ...], ... }
    const subjectMap = config.subjectMap || {};
    const allBatches = await Promise.all(
      Object.entries(subjectMap).map(([subjectId, ssList]) =>
        Promise.all(ssList.map(ss =>
          this._loadOneSubSubject(config.module, config.examType, subjectId, ss)
        )).then(b => b.flat())
      )
    );
    return allBatches.flat();
  },

  async _loadOneSubSubject(moduleId, examType, subjectId, ss) {
    const path = `data/${moduleId}/${examType}/${subjectId}/${ss.id}.json`;
    try {
      const res = await fetch(path);
      if (!res.ok) return [];
      const data = await res.json();
      const qs = Array.isArray(data.questions) ? data.questions : [];
      return qs.map(q => ({ ...q, _subject: subjectId, _subSubject: ss.id, _subSubjectLabel: ss.label }));
    } catch { return []; }
  },

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  },
};
