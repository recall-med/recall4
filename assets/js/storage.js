/**
 * ============================================================
 * Recall — storage.js  (v2 — sub-subject support)
 * ============================================================
 */

const STORAGE_KEYS = {
  STATS:          'dqb_stats',
  PROGRESS:       'dqb_progress',
  INCORRECT:      'dqb_incorrect',
  FLAGGED:        'dqb_flagged',
  EXAM_HISTORY:   'dqb_exam_history',
  CURRENT_EXAM:   'dqb_current_exam',
  LAST_PAGE:      'dqb_last_page',
  SETTINGS:       'dqb_settings',
  LAST_RESULTS:   'dqb_last_results',
  TOPIC_EXAMS:    'dqb_topic_exams',
};

const Storage = {

  _get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn(`[Storage] Failed to read "${key}":`, e);
      return null;
    }
  },

  _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`[Storage] Failed to write "${key}":`, e);
    }
  },

  _delete(key) { localStorage.removeItem(key); },

  // ─── Question-count cache ─────────────────────────────────────────────────
  // Remembers how many questions each topic file has, so pages can open instantly
  // instead of waiting on every data file. Deliberately NOT in STORAGE_KEYS: it is
  // not user progress, so Reset Progress must not clear it.
  getCountCache()      { return this._get('dqb_count_cache') || {}; },
  saveCountCache(map)  { this._set('dqb_count_cache', map); },

  // ─── Stats ────────────────────────────────────────────────────────────────

  getStats() {
    return this._get(STORAGE_KEYS.STATS) || {
      totalAttempted: 0, totalCorrect: 0, totalIncorrect: 0,
      completedExams: 0, totalTimeSpentSec: 0,
    };
  },

  updateStats(delta) {
    const stats = this.getStats();
    Object.keys(delta).forEach(k => { if (typeof stats[k] === 'number') stats[k] += delta[k]; });
    this._set(STORAGE_KEYS.STATS, stats);
    return stats;
  },

  // ─── Progress — now keyed by module|examType|subject|subSubject ───────────

  getProgress() {
    return this._get(STORAGE_KEYS.PROGRESS) || {};
  },

  setSubjectProgress(module, examType, subject, subSubject, data) {
    const progress = this.getProgress();
    const key = `${module}|${examType}|${subject}|${subSubject}`;
    progress[key] = { ...(progress[key] || {}), ...data, updatedAt: Date.now() };
    this._set(STORAGE_KEYS.PROGRESS, progress);
  },

  getSubjectProgress(module, examType, subject, subSubject) {
    const key = `${module}|${examType}|${subject}|${subSubject}`;
    return (this.getProgress())[key] || null;
  },

  // ─── Incorrect questions ──────────────────────────────────────────────────

  getIncorrect() { return this._get(STORAGE_KEYS.INCORRECT) || []; },

  addIncorrect(entry) {
    const list = this.getIncorrect();
    const uid  = `${entry.module}|${entry.examType}|${entry.subject}|${entry.subSubject}|${entry.id}`;
    const idx  = list.findIndex(q => q.uid === uid);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...entry, updatedAt: Date.now() };
    } else {
      list.push({ ...entry, uid, addedAt: Date.now() });
    }
    this._set(STORAGE_KEYS.INCORRECT, list);
  },

  removeIncorrect(uid) {
    this._set(STORAGE_KEYS.INCORRECT, this.getIncorrect().filter(q => q.uid !== uid));
  },

  clearAllIncorrect() { this._set(STORAGE_KEYS.INCORRECT, []); },

  // ─── Flagged ──────────────────────────────────────────────────────────────

  getFlagged() { return this._get(STORAGE_KEYS.FLAGGED) || []; },

  toggleFlag(entry) {
    const uid   = `${entry.module}|${entry.examType}|${entry.subject}|${entry.subSubject}|${entry.id}`;
    let flags   = this.getFlagged();
    const idx   = flags.findIndex(f => f.uid === uid);
    if (idx >= 0) {
      flags.splice(idx, 1);
      this._set(STORAGE_KEYS.FLAGGED, flags);
      return false;
    } else {
      flags.push({ ...entry, uid, flaggedAt: Date.now() });
      this._set(STORAGE_KEYS.FLAGGED, flags);
      return true;
    }
  },

  // ─── Exam history ─────────────────────────────────────────────────────────

  getExamHistory() { return this._get(STORAGE_KEYS.EXAM_HISTORY) || []; },

  addExamResult(result) {
    const history = this.getExamHistory();
    history.unshift({ ...result, id: Date.now() });
    if (history.length > 100) history.length = 100;
    this._set(STORAGE_KEYS.EXAM_HISTORY, history);
  },

  // ─── Last attempt of a scope (kept on this device for the Analytics view) ───
  // One full result per topic / subject / exam type (the newest 12 scopes). Practice runs ("retry incorrect") never land here.

  questionUid(e) { return `${e.module}|${e.examType}|${e.subject}|${e.subSubject}|${e.id}`; },
  resultsKey(c)  { return c.scope === 'custom' ? 'custom' : [c.module, c.examType, c.scope || 'topic', c.subject || '', c.subSubject || ''].join('|'); },

  // A topic keeps ONE record under its key (a retry merges into it). A full exam (subject / exam type) and the custom exams
  // keep every attempt, because the topics in them can differ: stored under `key#<completedAt>`, listed newest first.
  getLastResults(key) { const all = this._get(STORAGE_KEYS.LAST_RESULTS); return (all && all[key]) || (this.listAttempts(key)[0] || null); },

  listAttempts(key) {
    const all = this._get(STORAGE_KEYS.LAST_RESULTS) || {};
    return Object.keys(all).filter(k => k === key || k.startsWith(key + '#')).map(k => ({ ...all[k], _key: k }))
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  },

  saveAttempt(key, results) { this.saveLastResults(`${key}#${results.completedAt || Date.now()}`, results); },

  // Newest 40 records, and never more than about 1.5 MB of text in total (oldest go first)
  saveLastResults(key, results) {
    try { if (JSON.stringify(results).length > 600000) return; } catch (e) { return; }
    const all  = this._get(STORAGE_KEYS.LAST_RESULTS) || {};
    all[key]   = results;
    const order = Object.keys(all).sort((a, b) => (all[b].completedAt || 0) - (all[a].completedAt || 0));
    order.slice(40).forEach(k => delete all[k]);
    let size = JSON.stringify(all).length;
    for (let i = order.length - 1; i > 0 && size > 1500000; i--) { if (all[order[i]] && order[i] !== key) { size -= JSON.stringify(all[order[i]]).length; delete all[order[i]]; } }
    this._set(STORAGE_KEYS.LAST_RESULTS, all);
  },

  // ─── Current exam ────────────────────────────────────────────────────────

  saveCurrentExam(state)  { this._set(STORAGE_KEYS.CURRENT_EXAM, state); },
  loadCurrentExam()       { return this._get(STORAGE_KEYS.CURRENT_EXAM); },
  clearCurrentExam()      { this._delete(STORAGE_KEYS.CURRENT_EXAM); },

  // ─── Unfinished exam of a topic (one per topic, so the topic page can offer "Continue" on its own) ───
  // Separate from the single current-exam slot above, which the dashboard card uses: starting another exam replaces
  // that slot but leaves each topic's own unfinished exam alone. Device-local, not synced.
  getTopicExam(key) { const all = this._get(STORAGE_KEYS.TOPIC_EXAMS); const e = all && all[key]; return e && e.state && !e.state.submitted ? e : null; },
  saveTopicExam(key, exam) {
    try { if (JSON.stringify(exam).length > 600000) return; } catch (e) { return; }
    const all = this._get(STORAGE_KEYS.TOPIC_EXAMS) || {};
    all[key] = exam;
    this._set(STORAGE_KEYS.TOPIC_EXAMS, all);
  },
  clearTopicExam(key) {
    const all = this._get(STORAGE_KEYS.TOPIC_EXAMS);
    if (!all || !(key in all)) return;
    delete all[key];
    if (Object.keys(all).length) this._set(STORAGE_KEYS.TOPIC_EXAMS, all); else this._delete(STORAGE_KEYS.TOPIC_EXAMS);
  },

  // ─── Settings ─────────────────────────────────────────────────────────────

  getSettings()           { return this._get(STORAGE_KEYS.SETTINGS) || {}; },
  saveSetting(key, value) {
    const s = this.getSettings(); s[key] = value; this._set(STORAGE_KEYS.SETTINGS, s);
  },

  // ─── Last page ────────────────────────────────────────────────────────────

  saveLastPage(page)  { this._set(STORAGE_KEYS.LAST_PAGE, page); },
  loadLastPage()      { return this._get(STORAGE_KEYS.LAST_PAGE); },

  resetAll() {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  },

  // Wipe all history but keep flagged questions
  wipeHistory() {
    const flagged = this.getFlagged();
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    if (flagged.length > 0) this._set(STORAGE_KEYS.FLAGGED, flagged);
  },
};
