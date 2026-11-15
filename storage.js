/**
 * ============================================================
 * DEPT. Q. BANK — storage.js
 * ============================================================
 * Handles all LocalStorage persistence.
 * All keys are prefixed with 'dqb_' to avoid collisions.
 *
 * HOW TO ADD NEW PERSISTENT DATA:
 * 1. Add a new key constant to STORAGE_KEYS below.
 * 2. Add getter/setter methods following existing patterns.
 * ============================================================
 */

const STORAGE_KEYS = {
  STATS:          'dqb_stats',
  PROGRESS:       'dqb_progress',
  INCORRECT:      'dqb_incorrect',
  FLAGGED:        'dqb_flagged',
  EXAM_HISTORY:   'dqb_exam_history',
  CURRENT_EXAM:   'dqb_current_exam',
  REVIEW_HISTORY: 'dqb_review_history',
  LAST_PAGE:      'dqb_last_page',
  SETTINGS:       'dqb_settings',
};

const Storage = {

  // ─── Generic helpers ─────────────────────────────────────────────────────

  _get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn(`[Storage] Failed to read key "${key}":`, e);
      return null;
    }
  },

  _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`[Storage] Failed to write key "${key}":`, e);
    }
  },

  _delete(key) {
    localStorage.removeItem(key);
  },

  // ─── Global Statistics ───────────────────────────────────────────────────

  getStats() {
    return this._get(STORAGE_KEYS.STATS) || {
      totalAttempted:    0,
      totalCorrect:      0,
      totalIncorrect:    0,
      completedExams:    0,
      totalTimeSpentSec: 0,
    };
  },

  updateStats(delta) {
    const stats = this.getStats();
    Object.keys(delta).forEach(k => {
      if (typeof stats[k] === 'number') stats[k] += delta[k];
    });
    this._set(STORAGE_KEYS.STATS, stats);
    return stats;
  },

  // ─── Module / Subject Progress ───────────────────────────────────────────

  getProgress() {
    return this._get(STORAGE_KEYS.PROGRESS) || {};
  },

  /**
   * key: e.g. "CNS|end_module|anatomy"
   * data: { attempted, correct, completed, lastAttempt }
   */
  setSubjectProgress(module, examType, subject, data) {
    const progress = this.getProgress();
    const key = `${module}|${examType}|${subject}`;
    progress[key] = { ...( progress[key] || {} ), ...data, updatedAt: Date.now() };
    this._set(STORAGE_KEYS.PROGRESS, progress);
  },

  getSubjectProgress(module, examType, subject) {
    const key = `${module}|${examType}|${subject}`;
    return (this.getProgress())[key] || null;
  },

  // ─── Incorrect Questions ─────────────────────────────────────────────────

  getIncorrect() {
    return this._get(STORAGE_KEYS.INCORRECT) || [];
  },

  /**
   * Save an incorrectly answered question.
   * Deduplicates by (module + examType + subject + questionId).
   */
  addIncorrect(entry) {
    // entry: { module, examType, subject, question, options, answer, explanation, userAnswer, timestamp }
    const list = this.getIncorrect();
    const uid = `${entry.module}|${entry.examType}|${entry.subject}|${entry.id}`;
    const idx = list.findIndex(q => `${q.module}|${q.examType}|${q.subject}|${q.id}` === uid);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...entry, updatedAt: Date.now() };
    } else {
      list.push({ ...entry, uid, addedAt: Date.now() });
    }
    this._set(STORAGE_KEYS.INCORRECT, list);
  },

  removeIncorrect(uid) {
    const list = this.getIncorrect().filter(q => q.uid !== uid);
    this._set(STORAGE_KEYS.INCORRECT, list);
  },

  clearAllIncorrect() {
    this._set(STORAGE_KEYS.INCORRECT, []);
  },

  // ─── Flagged Questions ───────────────────────────────────────────────────

  getFlagged() {
    return this._get(STORAGE_KEYS.FLAGGED) || [];
  },

  isFlagged(module, examType, subject, questionId) {
    const uid = `${module}|${examType}|${subject}|${questionId}`;
    return this.getFlagged().some(f => f.uid === uid);
  },

  toggleFlag(entry) {
    const uid = `${entry.module}|${entry.examType}|${entry.subject}|${entry.id}`;
    let flags = this.getFlagged();
    const idx = flags.findIndex(f => f.uid === uid);
    if (idx >= 0) {
      flags.splice(idx, 1);
      this._set(STORAGE_KEYS.FLAGGED, flags);
      return false; // now unflagged
    } else {
      flags.push({ ...entry, uid, flaggedAt: Date.now() });
      this._set(STORAGE_KEYS.FLAGGED, flags);
      return true; // now flagged
    }
  },

  // ─── Exam History ────────────────────────────────────────────────────────

  getExamHistory() {
    return this._get(STORAGE_KEYS.EXAM_HISTORY) || [];
  },

  addExamResult(result) {
    const history = this.getExamHistory();
    history.unshift({ ...result, id: Date.now() });
    // Keep last 100 exams
    if (history.length > 100) history.length = 100;
    this._set(STORAGE_KEYS.EXAM_HISTORY, history);
  },

  // ─── In-progress Exam State ──────────────────────────────────────────────

  saveCurrentExam(state) {
    this._set(STORAGE_KEYS.CURRENT_EXAM, state);
  },

  loadCurrentExam() {
    return this._get(STORAGE_KEYS.CURRENT_EXAM);
  },

  clearCurrentExam() {
    this._delete(STORAGE_KEYS.CURRENT_EXAM);
  },

  // ─── Settings ────────────────────────────────────────────────────────────

  getSettings() {
    return this._get(STORAGE_KEYS.SETTINGS) || {};
  },

  saveSetting(key, value) {
    const s = this.getSettings();
    s[key] = value;
    this._set(STORAGE_KEYS.SETTINGS, s);
  },

  // ─── Last Page ───────────────────────────────────────────────────────────

  saveLastPage(page) {
    this._set(STORAGE_KEYS.LAST_PAGE, page);
  },

  loadLastPage() {
    return this._get(STORAGE_KEYS.LAST_PAGE);
  },

  // ─── Debug: Reset Everything ─────────────────────────────────────────────

  resetAll() {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    console.log('[Storage] All data cleared.');
  },
};
