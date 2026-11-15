/**
 * ============================================================
 * DEPT. Q. BANK — exam.js
 * ============================================================
 * Core exam engine: loads questions, tracks state, scores.
 *
 * HOW TO ADD NEW EXAM FEATURES (e.g. timed exams):
 * - Add a 'timerEnabled' flag to ExamEngine.config
 * - Track elapsed time in ExamEngine.state.elapsedSec
 * - Call ExamEngine.startTimer() / stopTimer() as needed
 * ============================================================
 */

const ExamEngine = {

  // ─── Current session state ───────────────────────────────────────────────

  config: null,   // { module, examType, subject, immediateFeedback, randomize }
  questions: [],  // full question list (possibly shuffled)
  state: {
    currentIndex: 0,
    answers: {},          // { [questionIndex]: optionIndex }
    flagged: new Set(),   // set of question indices
    startTime: null,
    endTime: null,
    submitted: false,
  },

  // ─── Initialise a new exam ───────────────────────────────────────────────

  async init(config) {
    this.config = config;
    const data = await this._loadQuestions(config);
    this.questions = config.randomize ? this._shuffle([...data]) : data;
    this.state = {
      currentIndex: 0,
      answers: {},
      flagged: new Set(),
      startTime: Date.now(),
      endTime: null,
      submitted: false,
    };
    Storage.clearCurrentExam();
    return this.questions.length;
  },

  // ─── Resume a saved exam ─────────────────────────────────────────────────

  async resume() {
    const saved = Storage.loadCurrentExam();
    if (!saved) return false;
    this.config    = saved.config;
    this.questions = saved.questions;
    this.state     = {
      ...saved.state,
      flagged: new Set(saved.state.flagged),
    };
    return true;
  },

  // ─── Save current exam to LocalStorage ──────────────────────────────────

  save() {
    if (!this.config || this.state.submitted) return;
    Storage.saveCurrentExam({
      config:    this.config,
      questions: this.questions,
      state: {
        ...this.state,
        flagged: [...this.state.flagged],
      },
    });
  },

  // ─── Navigation ──────────────────────────────────────────────────────────

  goTo(index) {
    if (index >= 0 && index < this.questions.length) {
      this.state.currentIndex = index;
      this.save();
    }
  },

  next() { this.goTo(this.state.currentIndex + 1); },
  prev() { this.goTo(this.state.currentIndex - 1); },

  // ─── Answer a question ───────────────────────────────────────────────────

  answer(optionIndex) {
    if (this.state.submitted) return null;
    this.state.answers[this.state.currentIndex] = optionIndex;
    this.save();
    const q = this.questions[this.state.currentIndex];
    return {
      correct: q.answer === optionIndex,
      correctIndex: q.answer,
      explanation: q.explanation,
    };
  },

  // ─── Flag / Unflag ───────────────────────────────────────────────────────

  toggleFlag(index) {
    if (this.state.flagged.has(index)) {
      this.state.flagged.delete(index);
    } else {
      this.state.flagged.add(index);
    }
    // Also persist to global flagged storage
    const q = this.questions[index];
    Storage.toggleFlag({
      module:      this.config.module,
      examType:    this.config.examType,
      subject:     this.config.subject,
      id:          q.id,
      question:    q.question,
      options:     q.options,
      answer:      q.answer,
      explanation: q.explanation,
    });
    this.save();
    return this.state.flagged.has(index);
  },

  // ─── Submit & Score ──────────────────────────────────────────────────────

  submit() {
    if (this.state.submitted) return null;
    this.state.submitted = true;
    this.state.endTime = Date.now();

    const results = {
      config:      this.config,
      questions:   this.questions,
      answers:     { ...this.state.answers },
      score:       0,
      total:       this.questions.length,
      correct:     0,
      incorrect:   0,
      unanswered:  0,
      timeSec:     Math.round((this.state.endTime - this.state.startTime) / 1000),
      completedAt: this.state.endTime,
      perQuestion: [],
    };

    this.questions.forEach((q, i) => {
      const userAns = this.state.answers[i];
      const answered = userAns !== undefined;
      const correct  = answered && userAns === q.answer;

      results.perQuestion.push({
        question:    q.question,
        options:     q.options,
        answer:      q.answer,
        explanation: q.explanation,
        userAnswer:  userAns,
        correct,
        answered,
        flagged:     this.state.flagged.has(i),
      });

      if (!answered)   results.unanswered++;
      else if (correct) results.correct++;
      else              results.incorrect++;

      // Persist incorrect questions for review
      if (!correct && answered) {
        Storage.addIncorrect({
          module:      this.config.module,
          examType:    this.config.examType,
          subject:     this.config.subject,
          id:          q.id,
          question:    q.question,
          options:     q.options,
          answer:      q.answer,
          explanation: q.explanation,
          userAnswer:  userAns,
        });
      }
    });

    results.score = results.total > 0
      ? Math.round((results.correct / results.total) * 100)
      : 0;

    // Update global stats
    Storage.updateStats({
      totalAttempted:    results.total - results.unanswered,
      totalCorrect:      results.correct,
      totalIncorrect:    results.incorrect,
      completedExams:    1,
      totalTimeSpentSec: results.timeSec,
    });

    // Save progress for this subject
    Storage.setSubjectProgress(
      this.config.module,
      this.config.examType,
      this.config.subject,
      {
        completed:   true,
        attempted:   results.total - results.unanswered,
        correct:     results.correct,
        total:       results.total,
        score:       results.score,
        lastAttempt: results.completedAt,
      }
    );

    // Save exam history
    Storage.addExamResult({
      module:    this.config.module,
      examType:  this.config.examType,
      subject:   this.config.subject,
      score:     results.score,
      correct:   results.correct,
      total:     results.total,
      timeSec:   results.timeSec,
    });

    Storage.clearCurrentExam();
    return results;
  },

  // ─── Getters ──────────────────────────────────────────────────────────────

  getCurrent() {
    return this.questions[this.state.currentIndex] || null;
  },

  getCurrentAnswer() {
    return this.state.answers[this.state.currentIndex];
  },

  isAnswered(index) {
    return this.state.answers[index] !== undefined;
  },

  isFlagged(index) {
    return this.state.flagged.has(index);
  },

  getProgress() {
    const answered  = Object.keys(this.state.answers).length;
    const flagged   = this.state.flagged.size;
    const unanswered = this.questions.length - answered;
    return { answered, unanswered, flagged, total: this.questions.length };
  },

  // ─── Internal helpers ────────────────────────────────────────────────────

  async _loadQuestions(config) {
    // Build path: data/MODULE/exam_type/subject.json
    const path = `data/${config.module}/${config.examType}/${config.subject}.json`;
    try {
      const res = await fetch(path);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.questions) ? data.questions : [];
    } catch (e) {
      console.warn(`[ExamEngine] Could not load ${path}:`, e);
      return [];
    }
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
