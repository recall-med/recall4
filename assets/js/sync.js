/**
 * ============================================================
 * Recall — sync.js  (cloud sync layer)
 * ============================================================
 * Local storage stays the source of truth for the interface. This file
 * mirrors changes to the signed-in account and pulls changes made on other
 * devices. Guests are never affected: nothing here talks to the network
 * unless a person is signed in, and the whole feature stays hidden until
 * config/sync-config.json says "cloudEnabled": true.
 *
 * It wraps a few Storage / ExamEngine methods instead of editing them, so
 * storage.js, exam.js and app.js are unchanged.
 * ============================================================
 */
(function () {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────────────────
  var API = '/api';
  var STORE_KEY = 'dqb_sync';
  var FLAG_KEY = 'dqb_cloud_flag';
  var PREVIEW_KEY = 'dqb_cloud_preview';
  var DEVICE_KEY = 'dqb_device_id';
  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  var QID_RE = /^\d{1,6}$/;
  var SCOPE_RE = /^[A-Za-z0-9_-]{1,40}(\|[A-Za-z0-9_-]{1,40}){3}$/;
  var MAX_ENTRIES = 200;      // server limit per call
  var MAX_SCOPES = 40;
  var MAX_ATTEMPTS = 30;
  var PULL_MIN_GAP_MS = 60 * 1000;
  var REFRESHABLE = ['dashboard', 'module', 'subject', 'subsubject', 'wide-exam-start'];

  // ─── Small helpers ───────────────────────────────────────────────────────
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function parseJson(t, fb) { try { var v = JSON.parse(t); return v == null ? fb : v; } catch (e) { return fb; } }
  function now() { return Date.now(); }
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function deviceId() {
    var d = lsGet(DEVICE_KEY);
    if (!d || !/^[A-Za-z0-9-]{8,64}$/.test(d)) { d = uuid(); lsSet(DEVICE_KEY, d); }
    return d;
  }
  function cmp(a, b) { // positive when a beats b (same rule as the server)
    if (a.epoch !== b.epoch) return a.epoch - b.epoch;
    if (a.rev !== b.rev) return a.rev - b.rev;
    return a.updatedAt - b.updatedAt;
  }

  // ─── Persistent sync store (separate from the app's own keys) ───────────
  function freshStore() {
    return {
      v: 1, uid: null, profile: null, baseEpoch: 0,
      meta: { progress: {}, incorrect: {}, flags: {} },
      dirty: {}, outbox: [], pendingReset: null,
      settingsAt: 0, lastPull: 0, lastSync: 0
    };
  }
  function loadStore() {
    var s = parseJson(lsGet(STORE_KEY), null);
    if (!isObj(s) || s.v !== 1 || !isObj(s.meta) || !isObj(s.dirty) || !Array.isArray(s.outbox)) return freshStore();
    s.meta.progress = s.meta.progress || {}; s.meta.incorrect = s.meta.incorrect || {}; s.meta.flags = s.meta.flags || {};
    return s;
  }
  var S = loadStore();
  function save() { lsSet(STORE_KEY, JSON.stringify(S)); }

  // ─── Feature flag ────────────────────────────────────────────────────────
  (function readPreviewParam() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.has('cloud')) {
        if (q.get('cloud') === '1') lsSet(PREVIEW_KEY, '1'); else lsDel(PREVIEW_KEY);
        history.replaceState(history.state, '', location.pathname + location.hash);
      }
    } catch (e) { /* ignore */ }
  })();
  var active = lsGet(FLAG_KEY) === '1' || lsGet(PREVIEW_KEY) === '1';

  // ─── Runtime state ───────────────────────────────────────────────────────
  var provider = null;          // set by auth.js (or a test double)
  var user = null;              // { uid, email, providerId } from the auth provider
  var syncing = false, again = false, timer = null, backoff = 0;
  var status = { kind: 'idle', detail: '' };
  var authLoadFailed = false;
  var unavailable = {};         // question uids whose question file no longer has them
  var fileCache = {};           // scope -> Promise of question list
  var busy = false;
  var deleting = false;         // true while an account deletion is running: no syncing allowed
  var Orig = {};                // the unwrapped methods

  function tracking() { return !!S.uid; }

  // ─── Scope / key helpers ─────────────────────────────────────────────────
  function scopeOf(e) {
    if (!e) return null;
    var s = [e.module, e.examType, e.subject, e.subSubject].join('|');
    return SCOPE_RE.test(s) ? s : null;
  }
  function qidOf(e) { var q = String(e.id); return QID_RE.test(q) ? q : null; }
  function mark(kind, scope, qid, rev) {
    S.dirty[kind + '|' + scope + (qid ? '|' + qid : '')] = rev;
  }
  function metaMap(kind, scope) {
    var root = kind === 'i' ? S.meta.incorrect : S.meta.flags;
    if (!root[scope]) root[scope] = {};
    return root[scope];
  }

  // ─── Change tracking (wrappers around Storage) ──────────────────────────
  function trackIncorrect(entry, removed) {
    var scope = scopeOf(entry), qid = qidOf(entry);
    if (!scope || !qid) return;
    var m = metaMap('i', scope), prev = m[qid];
    var ua = Number.isInteger(entry.userAnswer) && entry.userAnswer >= -1 && entry.userAnswer <= 9 ? entry.userAnswer : (prev ? prev.userAnswer : -1);
    var e = {
      epoch: S.baseEpoch, rev: (prev ? prev.rev : 0) + 1, updatedAt: now(),
      userAnswer: ua, addedAt: (prev && prev.addedAt) || now(), removed: !!removed
    };
    m[qid] = e;
    mark('i', scope, qid, e.rev);
  }
  function trackIncorrectUid(uid, removed) {
    var p = String(uid).split('|');
    if (p.length !== 5) return;
    trackIncorrect({ module: p[0], examType: p[1], subject: p[2], subSubject: p[3], id: p[4] }, removed);
  }
  function trackFlag(entry, flaggedNow) {
    var scope = scopeOf(entry), qid = qidOf(entry);
    if (!scope || !qid) return;
    var m = metaMap('f', scope), prev = m[qid];
    var e = { epoch: 0, rev: (prev ? prev.rev : 0) + 1, updatedAt: now(), flaggedAt: now(), removed: !flaggedNow };
    m[qid] = e;
    mark('f', scope, qid, e.rev);
  }
  function progressEntry(obj, prev) {
    var e = { epoch: S.baseEpoch, rev: (prev ? prev.rev : 0) + 1, updatedAt: Math.min(Number(obj.updatedAt) || now(), now()) };
    var n = 0;
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (k === 'updatedAt' || k === 'epoch' || k === 'rev' || n >= 14) return;
      if (!/^[A-Za-z0-9_]{1,30}$/.test(k)) return;
      if ((typeof v === 'number' && isFinite(v)) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 60)) { e[k] = v; n++; }
    });
    return e;
  }

  var lastAttemptId = null;

  function installWrappers() {
    if (typeof Storage === 'undefined' || typeof Storage.addIncorrect !== 'function') return;

    function wrap(obj, name, fn) { Orig[name] = obj[name]; obj[name] = fn; }
    Orig.resetAll = Storage.resetAll;   // used to clear this device on sign-in / sign-out (not wrapped)

    wrap(Storage, 'addIncorrect', function (entry) {
      var r = Orig.addIncorrect.apply(this, arguments);
      if (tracking() && entry) { trackIncorrect(entry, false); save(); schedule(4000); }
      return r;
    });
    wrap(Storage, 'removeIncorrect', function (uid) {
      var r = Orig.removeIncorrect.apply(this, arguments);
      if (tracking()) { trackIncorrectUid(uid, true); save(); schedule(4000); }
      return r;
    });
    wrap(Storage, 'clearAllIncorrect', function () {
      var list = tracking() ? Storage.getIncorrect() : [];
      var r = Orig.clearAllIncorrect.apply(this, arguments);
      if (tracking()) { list.forEach(function (q) { trackIncorrect(q, true); }); save(); schedule(4000); }
      return r;
    });
    wrap(Storage, 'toggleFlag', function (entry) {
      var r = Orig.toggleFlag.apply(this, arguments);
      if (tracking() && entry) { trackFlag(entry, r); save(); schedule(4000); }
      return r;
    });
    wrap(Storage, 'setSubjectProgress', function (module, examType, subject, subSubject) {
      var r = Orig.setSubjectProgress.apply(this, arguments);
      if (tracking()) {
        var scope = [module, examType, subject, subSubject].join('|');
        var obj = Storage.getProgress()[scope];
        if (SCOPE_RE.test(scope) && obj) {
          var e = progressEntry(obj, S.meta.progress[scope]);
          S.meta.progress[scope] = e; mark('p', scope, null, e.rev); save(); schedule(4000);
        }
      }
      return r;
    });
    wrap(Storage, 'addExamResult', function (result) {
      var r = Orig.addExamResult.apply(this, arguments);
      if (tracking()) {
        lastAttemptId = uuid();
        var h = Storage.getExamHistory();
        if (h.length) { h[0].attemptId = lastAttemptId; Storage._set(STORAGE_KEYS.EXAM_HISTORY, h); }
      }
      return r;
    });
    wrap(Storage, 'saveSetting', function () {
      var r = Orig.saveSetting.apply(this, arguments);
      if (tracking()) { S.settingsAt = now(); S.settingsDirty = true; save(); schedule(6000); }
      return r;
    });
    wrap(Storage, 'wipeHistory', function () {
      var r = Orig.wipeHistory.apply(this, arguments);
      if (tracking()) onLocalReset();
      return r;
    });

    if (typeof ExamEngine !== 'undefined' && typeof ExamEngine.submit === 'function') {
      wrap(ExamEngine, 'submit', function () {
        lastAttemptId = null;
        var res = Orig.submit.apply(this, arguments);
        if (res && tracking()) {
          try { enqueueAttempt(res); } catch (e) { console.warn('[Sync] could not queue attempt', e); }
        }
        return res;
      });
    }
  }

  function enqueueAttempt(res) {
    var cfg = res.config || {};
    var id = lastAttemptId || uuid();
    function idOrNull(v) { return typeof v === 'string' && ID_RE.test(v) ? v : null; }
    var keys = [], answers = [], ok = true;
    (res.questions || []).forEach(function (q, i) {
      var k = [cfg.module, cfg.examType, q._subject || cfg.subject, q._subSubject || cfg.subSubject, q.id].join('|');
      if (!/^[A-Za-z0-9_-]{1,40}(\|[A-Za-z0-9_-]{1,40}){3}\|\d{1,6}$/.test(k)) ok = false;
      keys.push(k);
      var a = res.answers ? res.answers[i] : undefined;
      answers.push(Number.isInteger(a) && a >= 0 && a <= 9 ? a : -1);
    });
    var attempted = res.total - res.unanswered;
    var a = {
      attemptId: id,
      module: cfg.module, examType: cfg.examType,
      subject: idOrNull(cfg.subject), subSubject: idOrNull(cfg.subSubject),
      scope: typeof cfg.scope === 'string' && /^[A-Za-z0-9_|-]{1,60}$/.test(cfg.scope) ? cfg.scope : null,
      score: res.score, correct: res.correct, total: res.total, attempted: attempted,
      timeSec: Math.min(res.timeSec || 0, 86400), clientTs: res.completedAt,
      review: ok && keys.length > 0 && keys.length <= 300 ? { keys: keys, answers: answers } : null
    };
    if (!ID_RE.test(String(a.module)) || !ID_RE.test(String(a.examType))) return;
    S.outbox.push(a);
    save();
    schedule(1500);
  }

  // ─── Local reset (Reset Progress) ────────────────────────────────────────
  function onLocalReset() {
    // Flags survive a reset (same as wipeHistory). Everything else is now from an old epoch.
    S.pendingReset = { fromEpoch: S.pendingReset ? S.pendingReset.fromEpoch : S.baseEpoch };
    S.baseEpoch = S.pendingReset.fromEpoch + 1;
    S.meta.progress = {}; S.meta.incorrect = {};
    Object.keys(S.dirty).forEach(function (k) { if (k.charAt(0) !== 'f') delete S.dirty[k]; });
    S.outbox = [];
    S.settingsAt = 0; S.settingsDirty = false;
    save();
    schedule(800);
  }

  // ─── Network ─────────────────────────────────────────────────────────────
  function SyncError(code, httpStatus, data) { this.code = code; this.status = httpStatus; this.data = data || null; }

  async function api(path, method, body, opts) {
    opts = opts || {};
    var token = await provider.getToken(!!opts.forceRefresh);
    var init = { method: method, headers: { Authorization: 'Bearer ' + token } };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    if (opts.keepalive && init.body && init.body.length < 60000) init.keepalive = true;
    var res = await fetch(API + path, init);
    var ct = (res.headers.get('content-type') || '');
    var data = null;
    if (ct.indexOf('application/json') !== -1) { try { data = await res.json(); } catch (e) { data = null; } }
    // An HTML page or anything without an explicit ok flag is never treated as success.
    if (!data || typeof data.ok !== 'boolean') throw new SyncError('bad_response', res.status);
    if (!data.ok) throw new SyncError(data.error || 'error', res.status, data);
    return data;
  }

  // ─── Building the payload ────────────────────────────────────────────────
  function buildPayload() {
    var scopes = {}, nEntries = 0, nScopes = 0, sent = [];
    var keys = Object.keys(S.dirty).sort();
    for (var i = 0; i < keys.length && nEntries < MAX_ENTRIES; i++) {
      var k = keys[i], p = k.split('|'), kind = p[0];
      var scope = p.slice(1, 5).join('|'), qid = p[5];
      var entry = kind === 'p' ? S.meta.progress[scope]
        : kind === 'i' ? (S.meta.incorrect[scope] || {})[qid]
        : (S.meta.flags[scope] || {})[qid];
      if (!entry || !SCOPE_RE.test(scope)) { delete S.dirty[k]; continue; }
      if (!scopes[scope]) { if (nScopes >= MAX_SCOPES) continue; scopes[scope] = {}; nScopes++; }
      var sc = scopes[scope];
      if (kind === 'p') sc.progress = entry;
      else if (kind === 'i') { sc.incorrect = sc.incorrect || {}; sc.incorrect[qid] = entry; }
      else { sc.flags = sc.flags || {}; sc.flags[qid] = entry; }
      sent.push({ key: k, rev: entry.rev });
      nEntries++;
    }
    var attempts = S.outbox.slice(0, MAX_ATTEMPTS);
    var body = { baseEpoch: S.baseEpoch, deviceId: deviceId() };
    if (nEntries) body.scopes = scopes;
    if (attempts.length) body.attempts = attempts;
    if (S.settingsDirty) {
      var data = sanitizeSettings(Storage.getSettings());
      if (data) body.settings = { data: data, updatedAt: S.settingsAt || now() };
    }
    var empty = !nEntries && !attempts.length && !body.settings;
    return { body: body, sent: sent, attempts: attempts, empty: empty };
  }
  function sanitizeSettings(obj) {
    var out = {}, n = 0;
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k];
      if (!/^[A-Za-z0-9_]{1,40}$/.test(k) || n >= 30) return;
      if (typeof v === 'number' && isFinite(v) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 100)) { out[k] = v; n++; }
    });
    return JSON.stringify(out).length > 1800 ? null : out;
  }
  function pendingCount() {
    var n = Object.keys(S.dirty).length + S.outbox.length + (S.pendingReset ? 1 : 0);
    return n;
  }

  // ─── Applying server data locally ────────────────────────────────────────
  function setLocalStats(serverStats) {
    S.lastStats = serverStats;
    var pend = S.outbox.reduce(function (a, x) {
      a.att += x.attempted; a.cor += x.correct; a.n += 1; a.t += x.timeSec; return a;
    }, { att: 0, cor: 0, n: 0, t: 0 });
    Storage._set(STORAGE_KEYS.STATS, {
      totalAttempted: serverStats.totalAttempted + pend.att,
      totalCorrect: serverStats.totalCorrect + pend.cor,
      totalIncorrect: serverStats.totalIncorrect + (pend.att - pend.cor),
      completedExams: serverStats.completedExams + pend.n,
      totalTimeSpentSec: serverStats.totalTimeSpentSec + pend.t
    });
  }

  function labelFor(m, et, sub, ss) {
    try {
      var mod = App.config.modules.filter(function (x) { return x.id === m; })[0];
      var f = mod.subSubjects[et][sub].filter(function (x) { return x.id === ss; })[0];
      return f ? f.label : ss;
    } catch (e) { return ss; }
  }

  function applyScopes(scopes) {
    var progress = Storage.getProgress(), progCh = false;
    var inc = Storage.getIncorrect(), flg = Storage.getFlagged(), incCh = false, flgCh = false;
    var incIdx = {}, flgIdx = {};
    inc.forEach(function (q) { incIdx[q.uid] = q; });
    flg.forEach(function (q) { flgIdx[q.uid] = q; });
    var incRemoved = {}, flgRemoved = {};

    Object.keys(scopes || {}).forEach(function (scope) {
      if (!SCOPE_RE.test(scope)) return;
      var sc = scopes[scope] || {};
      var p = sc.progress;
      if (p && isObj(p)) {
        var mp = S.meta.progress[scope];
        if (!mp || cmp(p, mp) > 0) {
          S.meta.progress[scope] = p; delete S.dirty['p|' + scope];
          var o = {}; Object.keys(p).forEach(function (k) { if (k !== 'epoch' && k !== 'rev') o[k] = p[k]; });
          progress[scope] = o; progCh = true;
        }
      }
      Object.keys(sc.incorrect || {}).forEach(function (qid) {
        var e = sc.incorrect[qid], m = metaMap('i', scope), cur = m[qid], uid = scope + '|' + qid;
        if (cur && cmp(e, cur) <= 0) return;
        m[qid] = e; delete S.dirty['i|' + scope + '|' + qid];
        if (e.removed) { if (incIdx[uid]) { incRemoved[uid] = true; incCh = true; } }
        else if (incIdx[uid]) { incIdx[uid].userAnswer = e.userAnswer; incCh = true; }
      });
      Object.keys(sc.flags || {}).forEach(function (qid) {
        var e = sc.flags[qid], m = metaMap('f', scope), cur = m[qid], uid = scope + '|' + qid;
        if (cur && cmp(e, cur) <= 0) return;
        m[qid] = e; delete S.dirty['f|' + scope + '|' + qid];
        if (e.removed && flgIdx[uid]) { flgRemoved[uid] = true; flgCh = true; }
      });
    });

    if (progCh) Storage._set(STORAGE_KEYS.PROGRESS, progress);
    if (incCh) Storage._set(STORAGE_KEYS.INCORRECT, inc.filter(function (q) { return !incRemoved[q.uid]; }));
    if (flgCh) Storage._set(STORAGE_KEYS.FLAGGED, flg.filter(function (q) { return !flgRemoved[q.uid]; }));
    return progCh || incCh || flgCh;
  }

  function loadQuestions(scope) {
    if (!fileCache[scope]) {
      var p = scope.split('|');
      fileCache[scope] = fetch('data/' + p[0] + '/' + p[1] + '/' + p[2] + '/' + p[3] + '.json')
        .then(function (r) { if (!r.ok) throw new Error('missing'); return r.json(); })
        .then(function (d) { return Array.isArray(d.questions) ? d.questions : []; })
        .catch(function (e) { delete fileCache[scope]; throw e; });
    }
    return fileCache[scope];
  }

  // Rebuilds list entries that the account has but this device does not (question text comes from the static files).
  async function hydrateMissing() {
    var inc = Storage.getIncorrect(), flg = Storage.getFlagged(), have = {};
    inc.forEach(function (q) { have['i|' + q.uid] = 1; });
    flg.forEach(function (q) { have['f|' + q.uid] = 1; });
    var need = {};
    function collect(kind, root) {
      Object.keys(root).forEach(function (scope) {
        Object.keys(root[scope]).forEach(function (qid) {
          var e = root[scope][qid], uid = scope + '|' + qid;
          if (e.removed || have[kind + '|' + uid] || unavailable[uid]) return;
          (need[scope] = need[scope] || []).push({ kind: kind, qid: qid, e: e, uid: uid });
        });
      });
    }
    collect('i', S.meta.incorrect); collect('f', S.meta.flags);
    var scopeKeys = Object.keys(need), changed = false;
    for (var i = 0; i < scopeKeys.length; i++) {
      var scope = scopeKeys[i], qs;
      try { qs = await loadQuestions(scope); } catch (err) { continue; } // offline: try again at the next pull
      var p = scope.split('|');
      need[scope].forEach(function (n) {
        var q = qs.filter(function (x) { return String(x.id) === n.qid; })[0];
        if (!q) { unavailable[n.uid] = true; return; }
        var base = { module: p[0], examType: p[1], subject: p[2], subSubject: p[3], id: q.id, question: q.question,
          options: q.options, answer: q.answer, explanation: q.explanation, uid: n.uid };
        if (n.kind === 'i') {
          base.subSubjectLabel = labelFor(p[0], p[1], p[2], p[3]);
          base.userAnswer = n.e.userAnswer; base.addedAt = n.e.addedAt || n.e.updatedAt;
          inc.push(base);
        } else { base.flaggedAt = n.e.flaggedAt || n.e.updatedAt; flg.push(base); }
        changed = true;
      });
    }
    if (changed) { Storage._set(STORAGE_KEYS.INCORRECT, inc); Storage._set(STORAGE_KEYS.FLAGGED, flg); }
    return changed;
  }

  function mergeHistory(attempts) {
    if (!attempts || !attempts.length) return false;
    var hist = Storage.getExamHistory(), ids = {};
    hist.forEach(function (h) { if (h.attemptId) ids[h.attemptId] = 1; });
    var added = false;
    attempts.forEach(function (a) {
      if (ids[a.attempt_id]) return;
      hist.push({
        module: a.module, examType: a.exam_type, subject: a.subject, subSubject: a.sub_subject, scope: a.scope,
        score: a.score, correct: a.correct, total: a.total, attempted: a.attempted, timeSec: a.time_sec,
        id: a.created_at, attemptId: a.attempt_id
      });
      added = true;
    });
    if (!added) return false;
    hist.sort(function (x, y) { return y.id - x.id; });
    if (hist.length > 100) hist.length = 100;
    Storage._set(STORAGE_KEYS.EXAM_HISTORY, hist);
    return true;
  }

  async function applyState(state) {
    S.baseEpoch = state.epoch;
    var ch = applyScopes(state.scopes);
    ch = mergeHistory(state.attempts) || ch;
    if (state.settings && state.settings.updatedAt > (S.settingsAt || 0) && !S.settingsDirty) {
      Storage._set(STORAGE_KEYS.SETTINGS, state.settings.data); S.settingsAt = state.settings.updatedAt; ch = true;
    }
    setLocalStats(state.stats);
    ch = (await hydrateMissing()) || ch;
    S.lastPull = now();
    save();
    if (ch) refreshView();
  }

  // Another device reset the account: mirror that here (flags are kept).
  async function adoptRemoteReset(state) {
    var keep = Storage.getFlagged();
    wipeLocalData();
    if (keep.length) Storage._set(STORAGE_KEYS.FLAGGED, keep);
    S.meta.progress = {}; S.meta.incorrect = {};
    Object.keys(S.dirty).forEach(function (k) { if (k.charAt(0) !== 'f') delete S.dirty[k]; });
    S.outbox = []; S.settingsAt = 0; S.settingsDirty = false;
    await applyState(state);
    if (typeof UI !== 'undefined' && UI.toast) UI.toast('Progress was reset on another device.', 'success');
  }

  function refreshView() {
    try {
      if (typeof App === 'undefined' || typeof UI === 'undefined') return;
      var p = App.currentPage;
      if (REFRESHABLE.indexOf(p) === -1) return;
      UI._silent = true;
      Promise.resolve(App._renderPage(p, App.currentParams)).catch(function () {}).then(function () { UI._silent = false; });
    } catch (e) { /* never break the page */ }
  }

  // ─── Sync loop ───────────────────────────────────────────────────────────
  function canSync() {
    return !!(active && !deleting && provider && user && S.uid && user.uid === S.uid && navigator.onLine !== false);
  }
  function schedule(ms) {
    if (!tracking() || !active) { renderStatusIfOpen(); return; }
    clearTimeout(timer);
    timer = setTimeout(function () { syncNow(); }, ms);
    renderStatusIfOpen();
  }

  async function syncNow(reason) {
    if (!canSync()) { setStatus(navigator.onLine === false ? 'offline' : 'idle'); return false; }
    if (syncing) { again = true; return false; }
    syncing = true; setStatus('syncing');
    try {
      await runSync(reason);
      backoff = 0; setStatus('idle');
      return true;
    } catch (err) {
      handleSyncError(err);
      return false;
    } finally {
      syncing = false;
      if (again) { again = false; schedule(1000); }
    }
  }

  async function authed(fn) { // one retry with a fresh token on 401
    try { return await fn(false); }
    catch (e) { if (e instanceof SyncError && e.status === 401) return await fn(true); throw e; }
  }

  async function runSync(reason) {
    var hiding = reason === 'hide';
    if (S.pendingReset) {
      var r = await authed(function (force) { return api('/reset', 'POST', { fromEpoch: S.pendingReset.fromEpoch }, { forceRefresh: force, keepalive: hiding }); });
      S.baseEpoch = r.epoch; S.pendingReset = null; save();
    }
    for (var round = 0; round < 20; round++) {
      var pl = buildPayload();
      if (pl.empty) break;
      var res = await authed(function (force) { return api('/sync', 'POST', pl.body, { forceRefresh: force, keepalive: hiding }); });
      var accepted = {};
      (res.acceptedAttempts || []).forEach(function (id) { accepted[id] = 1; });
      var rejectedStale = {};
      (res.rejectedAttempts || []).forEach(function (x) { if (x.reason === 'stale_epoch') rejectedStale[x.attemptId] = 1; });
      S.outbox = S.outbox.filter(function (a) { return !accepted[a.attemptId] && !rejectedStale[a.attemptId]; });
      var rateLimited = (res.rejectedAttempts || []).some(function (x) { return x.reason === 'rate_limited'; });
      if (res.droppedStale) { await adoptRemoteReset(res.state); save(); break; }
      pl.sent.forEach(function (s) { if (S.dirty[s.key] === s.rev) delete S.dirty[s.key]; });
      if (pl.body.settings) S.settingsDirty = false;
      S.baseEpoch = res.epoch;
      applyScopes(res.scopes);
      setLocalStats(res.stats);
      S.lastSync = now(); save();
      if (rateLimited) { schedule(10 * 60 * 1000); break; }
    }
    if (!hiding && (now() - S.lastPull > PULL_MIN_GAP_MS || reason === 'force')) await pull();
    refreshView();
  }

  async function pull() {
    var res = await authed(function (force) { return api('/state', 'GET', undefined, { forceRefresh: force }); });
    // A device that has never pulled this account yet (just signed in) is empty anyway: no 'reset on another device' notice.
    if (res.epoch > S.baseEpoch && !S.pendingReset && S.lastPull > 0) { await adoptRemoteReset(res); return res; }
    await applyState(res);
    return res;
  }

  function handleSyncError(err) {
    var code = err && err.code, st = err && err.status;
    if (code === 'resource_exhausted' || (st === 503 && code !== 'busy')) setStatus('paused');
    else if (st === 401) setStatus('auth');
    else if (navigator.onLine === false || !(err instanceof SyncError)) setStatus('offline');
    else setStatus('error', code);
    if (st === 401) return; // needs the person; do not hammer
    backoff = backoff ? Math.min(backoff * 2, 5 * 60 * 1000) : 5000;
    var jitter = backoff * (0.5 + Math.random());
    clearTimeout(timer);
    timer = setTimeout(function () { syncNow(); }, jitter);
  }

  function setStatus(kind, detail) {
    status = { kind: kind, detail: detail || '' };
    renderStatusIfOpen();
  }

  // ─── Local data helpers ──────────────────────────────────────────────────
  function wipeLocalData() { // clears ALL of the app's own progress keys, flags included
    Orig.resetAll.call(Storage);
  }
  function hasLocalData() {
    return Storage.getExamHistory().length > 0 || Storage.getIncorrect().length > 0 || Storage.getFlagged().length > 0 ||
      Object.keys(Storage.getProgress()).length > 0 || (Storage.getStats().completedExams || 0) > 0;
  }
  function snapshotLocal(label) {
    var snap = { at: now(), label: label, data: {} };
    Object.keys(STORAGE_KEYS).forEach(function (k) {
      var v = lsGet(STORAGE_KEYS[k]);
      if (v != null) snap.data[STORAGE_KEYS[k]] = v;
    });
    var key = 'dqb_backup_' + label;
    var prev = lsGet(key);
    if (prev && label === 'guest') lsSet('dqb_backup_guest_prev', prev);
    lsSet(key, JSON.stringify(snap));
  }
  function guestBackupExists() { return !!lsGet('dqb_backup_guest'); }

  // ─── Guest progress import (Phase 4) ─────────────────────────────────────
  // The copy of the guest's progress lives in dqb_backup_guest (made at sign-in).
  // Rules: a brand-new (empty, never reset) account receives it automatically;
  // an account that already has data only receives it when the person asks, and
  // import only ADDS what the account does not have. It never overwrites.
  var BACKUP_KEY = 'dqb_backup_guest', BACKUP_DONE_KEY = 'dqb_backup_guest_imported';

  function readBackup() {
    var snap = parseJson(lsGet(BACKUP_KEY), null);
    if (!isObj(snap) || !isObj(snap.data)) return null;
    function g(k) { return parseJson(snap.data[STORAGE_KEYS[k]], null); }
    var prog = g('PROGRESS'), inc = g('INCORRECT'), flg = g('FLAGGED'), hist = g('EXAM_HISTORY');
    return {
      at: snap.at || 0,
      progress: isObj(prog) ? prog : {},
      incorrect: Array.isArray(inc) ? inc : [],
      flagged: Array.isArray(flg) ? flg : [],
      history: Array.isArray(hist) ? hist.slice(0, 100) : []
    };
  }
  function backupCounts() {
    var b = readBackup();
    if (!b) return null;
    var c = { exams: b.history.length, incorrect: b.incorrect.length, flagged: b.flagged.length, topics: Object.keys(b.progress).length };
    return (c.exams || c.incorrect || c.flagged || c.topics) ? c : null;
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function countsText(c) {
    var parts = [];
    if (c.exams) parts.push(plural(c.exams, 'exam'));
    if (c.incorrect) parts.push(plural(c.incorrect, 'incorrect question'));
    if (c.flagged) parts.push(plural(c.flagged, 'flagged question'));
    if (c.topics) parts.push('progress in ' + plural(c.topics, 'topic'));
    return parts.join(', ');
  }

  function importGuest() {
    var b = readBackup();
    if (!b || !tracking()) return null;
    var raw = lsGet(BACKUP_KEY);
    var done = { exams: 0, incorrect: 0, flagged: 0, topics: 0 };
    function idOrNull(v) { return typeof v === 'string' && ID_RE.test(v) ? v : null; }
    function has(root, scope, qid) { return !!(root[scope] && root[scope][qid]); }

    // progress (one entry per topic)
    Object.keys(b.progress).forEach(function (scope) {
      var o = b.progress[scope];
      if (!SCOPE_RE.test(scope) || !isObj(o) || S.meta.progress[scope]) return;
      var p = scope.split('|'), data = {};
      Object.keys(o).forEach(function (k) { if (k !== 'updatedAt' && k !== 'epoch' && k !== 'rev') data[k] = o[k]; });
      Storage.setSubjectProgress(p[0], p[1], p[2], p[3], data);
      done.topics++;
    });

    // incorrect questions
    var haveInc = {};
    Storage.getIncorrect().forEach(function (q) { haveInc[q.uid] = 1; });
    b.incorrect.forEach(function (q) {
      if (!isObj(q)) return;
      var scope = scopeOf(q), qid = qidOf(q);
      if (!scope || !qid) return;
      var uid = scope + '|' + qid;
      if (haveInc[uid] || has(S.meta.incorrect, scope, qid)) return; // cloud wins, including removals
      Storage.addIncorrect(q); haveInc[uid] = 1; done.incorrect++;
    });

    // flags
    var haveFlg = {};
    Storage.getFlagged().forEach(function (q) { haveFlg[q.uid] = 1; });
    b.flagged.forEach(function (q) {
      if (!isObj(q)) return;
      var scope = scopeOf(q), qid = qidOf(q);
      if (!scope || !qid) return;
      var uid = scope + '|' + qid;
      if (haveFlg[uid] || has(S.meta.flags, scope, qid)) return;
      if (Storage.toggleFlag(q)) { haveFlg[uid] = 1; done.flagged++; }
    });

    // exam history -> attempts (stats are derived on the server from these)
    var hist = Storage.getExamHistory(), haveHist = {}, queued = {};
    hist.forEach(function (h) { if (h.attemptId) haveHist[h.attemptId] = 1; });
    S.outbox.forEach(function (a) { queued[a.attemptId] = 1; });
    var dev = deviceId().replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
    b.history.forEach(function (h) {
      if (!isObj(h) || !Number.isInteger(h.id) || h.id < 0) return;
      var id = 'imp-' + dev + '-' + h.id;       // same exam imported twice = same id = stored once
      if (haveHist[id] || queued[id]) return;
      var total = h.total, correct = h.correct;
      var attempted = Number.isInteger(h.attempted) ? h.attempted : total;
      var timeSec = Number.isInteger(h.timeSec) ? Math.min(Math.max(h.timeSec, 0), 86400) : 0;
      if (!Number.isInteger(total) || total < 0 || total > 1000) return;
      if (!Number.isInteger(attempted) || attempted < 0 || attempted > total) return;
      if (!Number.isInteger(correct) || correct < 0 || correct > attempted) return;
      if (!Number.isInteger(h.score) || h.score < 0 || h.score > 100) return;
      if (!ID_RE.test(String(h.module)) || !ID_RE.test(String(h.examType))) return;
      S.outbox.push({
        attemptId: id, module: h.module, examType: h.examType,
        subject: idOrNull(h.subject), subSubject: idOrNull(h.subSubject),
        scope: typeof h.scope === 'string' && /^[A-Za-z0-9_|-]{1,60}$/.test(h.scope) ? h.scope : null,
        score: h.score, correct: correct, total: total, attempted: attempted,
        timeSec: timeSec, clientTs: h.id, review: null
      });
      hist.push({
        module: h.module, examType: h.examType, subject: h.subject, subSubject: h.subSubject, scope: h.scope,
        score: h.score, correct: correct, total: total, attempted: attempted, timeSec: timeSec,
        id: h.id, attemptId: id
      });
      done.exams++;
    });
    hist.sort(function (x, y) { return y.id - x.id; });
    if (hist.length > 100) hist.length = 100;
    Storage._set(STORAGE_KEYS.EXAM_HISTORY, hist);

    // the copy is kept under a new name (never deleted) so the offer disappears
    if (raw) lsSet(BACKUP_DONE_KEY, raw);
    lsDel(BACKUP_KEY);
    S.lastImport = { at: now(), exams: done.exams, incorrect: done.incorrect, flagged: done.flagged, topics: done.topics };
    save();
    setLocalStats(S.lastStats || { totalAttempted: 0, totalCorrect: 0, totalIncorrect: 0, completedExams: 0, totalTimeSpentSec: 0 });
    schedule(500);
    refreshView();
    return done;
  }

  // Runs once, right after the first pull following a sign-in that found guest data on the device.
  function handleGuestAfterPull(state) {
    S.guestPending = false;
    save();
    var empty = !!state && state.epoch === 0 && !Object.keys(state.scopes || {}).length && !(state.attempts || []).length;
    if (!empty) return;                       // existing account: offer only (button in the account window)
    var done = importGuest();
    if (done && (done.exams || done.incorrect || done.flagged || done.topics) && typeof UI !== 'undefined' && UI.toast) {
      UI.toast('Your progress from before signing in was added to this account.', 'success');
    }
  }

  // ─── Auth hooks ──────────────────────────────────────────────────────────
  async function onAuth(u) {
    user = u ? { uid: u.uid, email: u.email || '', providerId: u.providerId || '' } : null;
    if (!u) { renderHeader(); renderStatusIfOpen(); return; }
    try {
      if (S.uid && S.uid !== u.uid) {
        // Leftovers from a different account on this device: keep a copy, never mix.
        snapshotLocal('account_' + S.uid.slice(0, 12));
        wipeLocalData(); S = freshStore();
      }
      if (!S.uid) {
        var hadGuest = hasLocalData();
        if (hadGuest) snapshotLocal('guest');
        wipeLocalData();
        S = freshStore(); S.uid = u.uid;
        S.guestPending = hadGuest;   // decided right after the first pull (see handleGuestAfterPull)
      }
      S.profile = { email: u.email || '', providerId: u.providerId || '' };
      save();
      renderHeader();
      setStatus('syncing');
      var first = await pull();
      if (S.guestPending) handleGuestAfterPull(first);
      setStatus('idle');
      refreshView();
      if (pendingCount()) schedule(500);
    } catch (err) {
      handleSyncError(err);
    }
    renderHeader();
    renderStatusIfOpen();
  }

  function attachAuth(p) {
    provider = p;
    authLoadFailed = false;
    p.onChange(onAuth);
    renderHeader();
  }

  async function loadAuthModule() {
    if (provider || !active) return;
    try {
      await import('./auth.js');
      authLoadFailed = false;
    } catch (e) {
      console.warn('[Sync] sign-in module did not load', e);
      authLoadFailed = true;
    }
    renderHeader();
  }

  // ─── Sign-out ────────────────────────────────────────────────────────────
  async function doSignOut(force) {
    if (!provider) return;
    busy = true; renderAccount();
    try {
      if (!force && S.uid && canSync() && pendingCount()) {
        await Promise.race([syncNow('force'), new Promise(function (r) { setTimeout(r, 8000); })]);
      }
      if (!force && pendingCount()) { busy = false; view = 'confirm-signout'; renderAccount(); return; }
      await provider.signOut();
      wipeLocalData();
      lsDel(STORE_KEY); S = freshStore(); user = null; fileCache = {}; unavailable = {};
      busy = false; closeModal();
      renderHeader();
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('Signed out.', 'success');
      if (typeof App !== 'undefined') App.navigate('dashboard');
    } catch (e) {
      busy = false; view = 'account'; renderAccount(); setFormError(authMessage(e));
    }
  }

  // ─── Interface ───────────────────────────────────────────────────────────
  var view = 'signin';
  var $ = function (id) { return document.getElementById(id); };

  var ICON_USER = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  var ICON_CLOSE = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var ICON_G = '<svg class="acct-google__g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.9 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

  function renderHeader() {
    var signIn = $('signin-btn'), acct = $('account-btn'), wipe = $('wipe-history-btn');
    if (!signIn || !acct) return;
    if (!active) { signIn.hidden = true; acct.hidden = true; if (wipe) wipe.hidden = false; return; }
    var signedIn = !!(S.uid || user);
    if (wipe) wipe.hidden = signedIn;   // signed-in people reset from the account window instead
    signIn.hidden = signedIn; acct.hidden = !signedIn;
    acct.title = signedIn ? 'Account' + (S.profile && S.profile.email ? ' (' + S.profile.email + ')' : '') : '';
  }

  function openModal(v) {
    if (!active) return;
    var m = $('account-modal'); if (!m) return;
    view = v || ((S.uid || user) ? 'account' : 'signin');
    m.style.display = 'flex';
    renderAccount();
    if (!provider && !authLoadFailed) loadAuthModule().then(renderAccount);
    var first = m.querySelector('input'); if (first) first.focus();
  }
  function closeModal() {
    var m = $('account-modal'); if (m) m.style.display = 'none';
    view = 'signin';
  }
  function modalOpen() { var m = $('account-modal'); return !!m && m.style.display !== 'none'; }

  function ago(t) {
    if (!t) return 'not yet';
    var s = Math.round((now() - t) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return s + ' seconds ago';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  }
  function statusText() {
    var n = pendingCount();
    switch (status.kind) {
      case 'syncing': return 'Syncing…';
      case 'offline': return 'Offline. ' + (n ? n + ' change' + (n === 1 ? '' : 's') + ' will upload when you are back online.' : 'Changes will upload when you are back online.');
      case 'paused': return 'Cloud sync is paused. Your progress is saved on this device and will upload automatically.';
      case 'auth': return 'Please sign in again to continue syncing.';
      case 'error': return 'Sync hit a problem and will retry shortly.';
      default:
        if (n) return n + ' change' + (n === 1 ? '' : 's') + ' waiting to upload.';
        return 'Up to date. Last sync ' + ago(S.lastSync || S.lastPull) + '.';
    }
  }
  function renderStatusIfOpen() {
    renderHeader();
    if (modalOpen() && view === 'account') {
      var el = $('acct-status'); if (el) el.textContent = statusText();
    }
  }

  var ERR = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-not-found': 'Incorrect email or password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/missing-password': 'Enter your password.',
    'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/operation-not-supported-in-this-environment': 'Google sign-in does not work inside this browser. Open the site in Chrome or Safari, or use email and password.',
    'auth/web-storage-unsupported': 'This browser blocks the storage sign-in needs. Turn off private mode or use another browser.',
    'auth/unauthorized-domain': 'This address is not allowed for sign-in yet.',
    'auth/operation-not-allowed': 'This sign-in method is not turned on.',
    'auth/user-mismatch': 'That is not the account you are signed in with.',
    'auth/requires-recent-login': 'Please sign in again, then try once more.'
  };
  function authMessage(e) {
    var c = e && e.code;
    return ERR[c] || 'Something went wrong. Please try again.';
  }
  function setFormError(msg) { var el = $('acct-error'); if (el) el.textContent = msg || ''; }
  function setBusyUi(on) {
    busy = on;
    var m = $('account-modal'); if (!m) return;
    m.querySelectorAll('button, input').forEach(function (b) { if (b.id !== 'account-close') b.disabled = on; });
  }

  function googleBtn(label) {
    return '<button class="btn btn--ghost acct-google" type="button" data-acct="google">' + ICON_G + '<span>' + label + '</span></button>' +
      '<div class="acct-or"><span>or</span></div>';
  }
  function field(label, name, type, auto, extra) {
    return '<label class="acct-field"><span>' + label + '</span><input class="acct-input" name="' + name + '" type="' + type +
      '" autocomplete="' + auto + '" ' + (extra || '') + ' required></label>';
  }

  function guestImportHtml() {
    var c = backupCounts();
    if (c) {
      return '<p class="acct-note">Progress you made before signing in (' + esc(countsText(c)) + ') is saved on this device and is not in this account yet.</p>' +
        '<div class="acct-actions"><button class="btn btn--ghost btn--sm" type="button" data-acct="to-import">Add it to this account</button></div>';
    }
    if (S.lastImport) {
      var li = S.lastImport, parts = [];
      if (li.exams) parts.push(plural(li.exams, 'exam'));
      if (li.incorrect) parts.push(plural(li.incorrect, 'incorrect question'));
      if (li.flagged) parts.push(plural(li.flagged, 'flagged question'));
      if (li.topics) parts.push('progress in ' + plural(li.topics, 'topic'));
      return '<p class="acct-note">' + (parts.length ? 'Added from this device: ' + esc(parts.join(', ')) + '.' : 'Nothing new to add from this device. This account already had it.') + '</p>';
    }
    return '';
  }

  function renderAccount() {
    var box = $('account-view'); if (!box) return;
    var h = '';
    if (!provider && authLoadFailed && view !== 'account') {
      h = '<h2 class="acct-title" id="account-title">Sign in</h2>' +
        '<p class="acct-sub">Sign-in could not load. Check your connection and try again.</p>' +
        '<div class="acct-actions"><button class="btn btn--primary" type="button" data-acct="retry-load">Try again</button></div>';
    } else if (!provider && view !== 'account') {
      h = '<h2 class="acct-title" id="account-title">Sign in</h2><p class="acct-sub">Loading…</p>';
    } else if (view === 'signin') {
      h = '<h2 class="acct-title" id="account-title">Sign in</h2>' +
        '<p class="acct-sub">Keep your progress on all your devices. Studying without an account still works.</p>' +
        googleBtn('Continue with Google') +
        '<form id="acct-form" data-mode="signin" novalidate>' +
        field('Email', 'email', 'email', 'email', 'inputmode="email" autocapitalize="off"') +
        field('Password', 'password', 'password', 'current-password') +
        '<p class="acct-error" id="acct-error" role="alert" aria-live="polite"></p>' +
        '<button class="btn btn--primary acct-submit" type="submit">Sign in</button></form>' +
        '<div class="acct-links"><button class="acct-link" type="button" data-acct="to-reset">Forgot password?</button>' +
        '<button class="acct-link" type="button" data-acct="to-signup">Create account</button></div>';
    } else if (view === 'signup') {
      h = '<h2 class="acct-title" id="account-title">Create account</h2>' +
        '<p class="acct-sub">Free. Your progress will sync across your devices.</p>' +
        googleBtn('Sign up with Google') +
        '<form id="acct-form" data-mode="signup" novalidate>' +
        field('Email', 'email', 'email', 'email', 'inputmode="email" autocapitalize="off"') +
        field('Password', 'password', 'password', 'new-password', 'minlength="6"') +
        field('Confirm password', 'confirm', 'password', 'new-password', 'minlength="6"') +
        '<p class="acct-error" id="acct-error" role="alert" aria-live="polite"></p>' +
        '<button class="btn btn--primary acct-submit" type="submit">Create account</button></form>' +
        '<div class="acct-links acct-links--center"><button class="acct-link" type="button" data-acct="to-signin">Already have an account? Sign in</button></div>';
    } else if (view === 'reset') {
      h = '<h2 class="acct-title" id="account-title">Reset password</h2>' +
        '<p class="acct-sub">Enter your email and we will send you a link to choose a new password.</p>' +
        '<form id="acct-form" data-mode="reset" novalidate>' +
        field('Email', 'email', 'email', 'email', 'inputmode="email" autocapitalize="off"') +
        '<p class="acct-error" id="acct-error" role="alert" aria-live="polite"></p>' +
        '<button class="btn btn--primary acct-submit" type="submit">Send reset link</button></form>' +
        '<div class="acct-links acct-links--center"><button class="acct-link" type="button" data-acct="to-signin">Back to sign in</button></div>';
    } else if (view === 'reset-sent') {
      h = '<h2 class="acct-title" id="account-title">Check your email</h2>' +
        '<p class="acct-sub">If an account exists for that address, a reset link is on its way. It can take a few minutes, and it may land in spam.</p>' +
        '<div class="acct-actions"><button class="btn btn--primary" type="button" data-acct="to-signin">Back to sign in</button></div>';
    } else if (view === 'confirm-delete') {
      var dpid = (S.profile && S.profile.providerId) || (user && user.providerId) || '';
      var dg = dpid === 'google.com';
      h = '<h2 class="acct-title" id="account-title">Delete account?</h2>' +
        '<p class="acct-sub">This permanently deletes your account and everything stored for it: exams, progress, incorrect questions and flags. Progress saved on this device is removed too. This cannot be undone.</p>' +
        (dg ? '<p class="acct-sub">You will be asked to sign in with Google again to confirm.</p>'
            : field('Enter your password to confirm', 'password', 'password', 'current-password')) +
        '<p class="acct-error" id="acct-error" role="alert" aria-live="polite"></p>' +
        '<div class="acct-actions acct-actions--row"><button class="btn btn--ghost" type="button" data-acct="to-account">Cancel</button>' +
        '<button class="btn btn--danger" type="button" data-acct="delete-go">Delete account</button></div>';
    } else if (view === 'confirm-import') {
      var ic = backupCounts();
      h = '<h2 class="acct-title" id="account-title">Add progress from this device?</h2>' +
        '<p class="acct-sub">' + (ic ? 'This device has ' + esc(countsText(ic)) + ' from before you signed in. ' : '') +
        'They will be added to this account. Anything this account already has is kept as it is and is never overwritten.</p>' +
        '<div class="acct-actions acct-actions--row"><button class="btn btn--ghost" type="button" data-acct="to-account">Cancel</button>' +
        '<button class="btn btn--primary" type="button" data-acct="import-go">Add progress</button></div>';
    } else if (view === 'confirm-signout') {
      var n = pendingCount();
      h = '<h2 class="acct-title" id="account-title">Sign out?</h2>' +
        '<p class="acct-sub">' + n + ' change' + (n === 1 ? ' has' : 's have') + ' not uploaded yet. If you sign out now, ' + (n === 1 ? 'it' : 'they') + ' will be lost. Staying signed in until you are online keeps your progress.</p>' +
        '<div class="acct-actions acct-actions--row"><button class="btn btn--ghost" type="button" data-acct="to-account">Stay signed in</button>' +
        '<button class="btn btn--danger" type="button" data-acct="signout-force">Sign out anyway</button></div>';
    } else { // account
      var email = (S.profile && S.profile.email) || (user && user.email) || '';
      var pid = (S.profile && S.profile.providerId) || (user && user.providerId) || '';
      var viaGoogle = pid === 'google.com';
      var initial = (email || '?').trim().charAt(0).toUpperCase();
      h = '<h2 class="acct-title" id="account-title">Account</h2>' +
        '<div class="acct-head"><div class="acct-avatar" aria-hidden="true">' + esc(initial) + '</div>' +
        '<div class="acct-id"><div class="acct-email">' + esc(email || 'Signed in') + '</div>' +
        '<div class="acct-meta">' + (viaGoogle ? 'Signed in with Google' : 'Signed in with email') + '</div></div></div>' +
        '<div class="acct-card"><div class="acct-card__label">Cloud sync</div>' +
        '<div class="acct-card__value" id="acct-status" aria-live="polite">' + esc(statusText()) + '</div>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-acct="sync-now">Sync now</button></div>' +
        guestImportHtml() +
        '<p class="acct-note">The admin dashboard shows combined usage totals only, such as exams per day.</p>' +
        '<p class="acct-error" id="acct-error" role="alert" aria-live="polite"></p>' +
        '<div class="acct-actions acct-actions--row">' +
        (!viaGoogle && email ? '<button class="btn btn--ghost" type="button" data-acct="send-reset">Reset password</button>' : '') +
        '<button class="btn btn--ghost acct-signout" type="button" data-acct="signout">Sign out</button></div>' +
        '<div class="acct-manage"><div class="acct-card__label">Your data</div>' +
        '<p class="acct-note">Reset progress clears your exam scores, progress and incorrect questions on all your devices. Flagged questions are kept. Delete account removes your account and everything stored for it.</p>' +
        '<div class="acct-actions acct-actions--row">' +
        '<button class="btn btn--ghost acct-danger" type="button" data-acct="reset-progress">Reset progress</button>' +
        '<button class="btn btn--ghost acct-danger" type="button" data-acct="to-delete">Delete account</button></div></div>';
    }
    box.innerHTML = h;
    if (busy) setBusyUi(true);
  }

  async function submitForm(form) {
    var mode = form.getAttribute('data-mode');
    var email = (form.elements.email.value || '').trim();
    var pw = form.elements.password ? form.elements.password.value : '';
    setFormError('');
    if (!email) { setFormError('Enter your email address.'); return; }
    if (mode !== 'reset' && !pw) { setFormError('Enter your password.'); return; }
    if (mode === 'signup') {
      if (pw.length < 6) { setFormError('Use a password with at least 6 characters.'); return; }
      if (pw !== form.elements.confirm.value) { setFormError('The two passwords do not match.'); return; }
    }
    setBusyUi(true);
    try {
      if (mode === 'signin') await provider.signInEmail(email, pw);
      else if (mode === 'signup') await provider.signUpEmail(email, pw);
      else { await provider.resetPassword(email); setBusyUi(false); view = 'reset-sent'; renderAccount(); return; }
      setBusyUi(false); closeModal();
      if (typeof UI !== 'undefined' && UI.toast) UI.toast(mode === 'signup' ? 'Account created.' : 'Signed in.', 'success');
    } catch (e) {
      setBusyUi(false);
      if (mode === 'reset' && e && (e.code === 'auth/user-not-found')) { view = 'reset-sent'; renderAccount(); return; }
      setFormError(authMessage(e));
    }
  }

  async function googleSignIn() {
    setFormError(''); setBusyUi(true);
    try {
      await provider.signInGoogle();
      setBusyUi(false); closeModal();
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('Signed in.', 'success');
    } catch (e) { setBusyUi(false); setFormError(authMessage(e)); }
  }

  // Delete account: confirm identity, delete the cloud data, delete the sign-in, then clear this device.
  async function doDeleteAccount() {
    if (!provider || !tracking() || busy) return;
    var pid = (S.profile && S.profile.providerId) || (user && user.providerId) || '';
    var viaGoogle = pid === 'google.com';
    var pwEl = $('account-view') && $('account-view').querySelector('input[name=password]');
    var pw = pwEl ? pwEl.value : '';
    if (!viaGoogle && !pw) { setFormError('Enter your password to confirm.'); return; }
    setFormError(''); setBusyUi(true);
    deleting = true; clearTimeout(timer);
    try {
      if (viaGoogle) await provider.reauthGoogle(); else await provider.reauthEmail(pw);
    } catch (e) {
      deleting = false; setBusyUi(false); setFormError(authMessage(e)); return;
    }
    for (var i = 0; i < 60 && syncing; i++) await new Promise(function (r) { setTimeout(r, 100); });
    try {
      await authed(function (force) { return api('/account', 'POST', { confirm: 'delete' }, { forceRefresh: true }); });
    } catch (e) {
      deleting = false; setBusyUi(false);
      setFormError('Could not delete your account data. Nothing was deleted. Check your connection and try again.');
      if (pendingCount()) schedule(3000);
      return;
    }
    var uid = S.uid, signInRemoved = true;
    try { await provider.deleteAccount(); } catch (e) {
      signInRemoved = false;
      try { await provider.signOut(); } catch (e2) { /* ignore */ }
    }
    wipeLocalData();
    lsDel(STORE_KEY);
    if (uid) lsDel('dqb_backup_account_' + String(uid).slice(0, 12));
    S = freshStore(); user = null; fileCache = {}; unavailable = {};
    deleting = false; busy = false; closeModal(); renderHeader();
    if (typeof UI !== 'undefined' && UI.toast) {
      UI.toast(signInRemoved ? 'Your account was deleted.' : 'Your data was deleted, but removing the sign-in itself failed. Sign in again and choose Delete account to finish.', 'success');
    }
    if (typeof App !== 'undefined') App.navigate('dashboard');
  }

  // Manual import: first bring in the account's latest data (so nothing newer is overwritten), then add.
  async function doImportClick() {
    if (!tracking() || busy) return;
    setBusyUi(true);
    try {
      if (!canSync()) throw new SyncError('offline', 0);
      await pull();
    } catch (e) {
      setBusyUi(false); view = 'account'; renderAccount();
      setFormError('Could not reach your account. Connect to the internet and try again.');
      return;
    }
    var r = importGuest();
    setBusyUi(false); view = 'account'; renderAccount();
    if (UI && UI.toast) UI.toast(r && (r.exams || r.incorrect || r.flagged || r.topics) ? 'Progress added to this account.' : 'Nothing new to add.', 'success');
  }

  function onClick(e) {
    var t = e.target;
    if (t.closest('#signin-btn')) { openModal('signin'); return; }
    if (t.closest('#account-btn')) { openModal('account'); return; }
    if (t.closest('#account-close')) { if (!busy) closeModal(); return; }
    if (t.id === 'account-modal') { if (!busy) closeModal(); return; }
    var b = t.closest('[data-acct]');
    if (!b || !$('account-modal') || !$('account-modal').contains(b)) return;
    var a = b.getAttribute('data-acct');
    if (a === 'google') googleSignIn();
    else if (a === 'to-signin') { view = 'signin'; renderAccount(); }
    else if (a === 'to-signup') { view = 'signup'; renderAccount(); }
    else if (a === 'to-reset') { view = 'reset'; renderAccount(); }
    else if (a === 'to-account') { view = 'account'; renderAccount(); }
    else if (a === 'to-import') { view = 'confirm-import'; renderAccount(); }
    else if (a === 'to-delete') { view = 'confirm-delete'; renderAccount(); }
    else if (a === 'delete-go') doDeleteAccount();
    else if (a === 'reset-progress') {
      closeModal();
      var wm = document.getElementById('wipe-modal');
      if (wm) wm.style.display = 'flex';   // the same confirmation the old header button opened
    }
    else if (a === 'import-go') doImportClick();
    else if (a === 'retry-load') { authLoadFailed = false; renderAccount(); loadAuthModule().then(renderAccount); }
    else if (a === 'sync-now') { setStatus('syncing'); syncNow('force'); }
    else if (a === 'signout') doSignOut(false);
    else if (a === 'signout-force') doSignOut(true);
    else if (a === 'send-reset') {
      var email = (S.profile && S.profile.email) || (user && user.email) || '';
      setBusyUi(true);
      provider.resetPassword(email).then(function () { setBusyUi(false); setFormError(''); if (UI && UI.toast) UI.toast('Reset link sent. Check your email.', 'success'); })
        .catch(function (err) { setBusyUi(false); setFormError(authMessage(err)); });
    }
  }

  function bindUi() {
    document.addEventListener('click', onClick);
    document.addEventListener('submit', function (e) {
      if (e.target && e.target.id === 'acct-form') { e.preventDefault(); if (!busy && provider) submitForm(e.target); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalOpen() && !busy) closeModal();
    });
    window.addEventListener('online', function () { if (tracking()) schedule(Math.random() * 5000); });
    window.addEventListener('offline', function () { if (tracking()) setStatus('offline'); });
    document.addEventListener('visibilitychange', function () {
      if (!tracking()) return;
      if (document.hidden) { if (pendingCount() && canSync()) syncNow('hide'); }
      else if (now() - S.lastPull > 5 * 60 * 1000 && canSync()) syncNow('force');
    });
    window.addEventListener('pagehide', function () { if (tracking() && pendingCount() && canSync()) syncNow('hide'); });
  }

  // ─── Start ───────────────────────────────────────────────────────────────
  function applyFlag(on) {
    on = !!on;
    lsSet(FLAG_KEY, on ? '1' : '0');
    var was = active;
    active = on || lsGet(PREVIEW_KEY) === '1';
    renderHeader();
    if (active && !was) loadAuthModule();
  }

  function start() {
    installWrappers();
    bindUi();
    renderHeader();
    if (active) loadAuthModule();
    fetch('config/sync-config.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) { if (c && typeof c.cloudEnabled === 'boolean') applyFlag(c.cloudEnabled); })
      .catch(function () { /* offline: keep the last known setting */ });
  }

  window.Sync = {
    attachAuth: attachAuth,
    syncNow: function () { return syncNow('force'); },
    isActive: function () { return active; },
    owner: function () { return S.uid || 'guest'; },
    pending: pendingCount,
    status: function () { return status.kind; },
    // test hooks (read-only views of internal state)
    _state: function () { return S; },
    _flush: function () { return syncNow('force'); }
  };

  // The header exists already (this script is loaded at the end of <body>, before app.js).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
