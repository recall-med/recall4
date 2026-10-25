// POST /api/sync
// Body: { baseEpoch, deviceId, scopes?, attempts?, settings? }
// Merges the device's changes into the account and returns the merged result.
// Safe to retry: attempts are INSERT OR IGNORE, merges are idempotent.

import { json, readJson, errorResponse, HttpError } from '../_lib/http.js';
import { touchUser, getStats, buildState, parseJson } from '../_lib/db.js';
import { mergeMaps, mergeEntry, clampEntry, dropOlderEpoch, canonical } from '../_lib/merge.js';
import {
  LIMITS, SCOPE_KEY, reqInt, reqId, validateProgress, validateIncorrect,
  validateFlag, validateMap, validateAttempt,
} from '../_lib/validate.js';

const bad = (m) => new HttpError(400, 'bad_request', m);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function parseBody(body, now) {
  const baseEpoch = reqInt(body.baseEpoch, 'baseEpoch', 0, 1e6);
  reqId(body.deviceId, 'deviceId');

  const scopes = {};
  let entries = 0;
  if (body.scopes !== undefined) {
    if (!isObj(body.scopes)) throw bad('scopes must be an object');
    const keys = Object.keys(body.scopes);
    if (keys.length > LIMITS.maxScopesPerSync) throw bad('too many scopes');
    for (const key of keys) {
      if (!SCOPE_KEY.test(key)) throw bad('bad scope key');
      const s = body.scopes[key];
      if (!isObj(s)) throw bad('scope must be an object');
      const progress = s.progress == null ? null : validateProgress(s.progress, 'progress');
      const incorrect = validateMap(s.incorrect, 'incorrect', validateIncorrect);
      const flags = validateMap(s.flags, 'flags', validateFlag);
      entries += (progress ? 1 : 0) + Object.keys(incorrect).length + Object.keys(flags).length;
      if (progress && progress.epoch > baseEpoch) throw bad('progress epoch is ahead of baseEpoch');
      for (const k of Object.keys(incorrect)) {
        if (incorrect[k].epoch > baseEpoch) throw bad('incorrect epoch is ahead of baseEpoch');
      }
      scopes[key] = {
        progress: progress ? clampEntry(progress, now) : null,
        incorrect: Object.fromEntries(Object.entries(incorrect).map(([k, v]) => [k, clampEntry(v, now)])),
        flags: Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, clampEntry(v, now)])),
      };
    }
    if (entries > LIMITS.maxEntriesPerSync) throw bad('too many entries in one sync');
  }

  let attempts = [];
  if (body.attempts !== undefined) {
    if (!Array.isArray(body.attempts)) throw bad('attempts must be an array');
    if (body.attempts.length > LIMITS.maxAttemptsPerSync) throw bad('too many attempts in one sync');
    attempts = body.attempts.map(validateAttempt);
    if (new Set(attempts.map((a) => a.attemptId)).size !== attempts.length) throw bad('duplicate attempt ids');
  }

  let settings = null;
  if (body.settings != null) {
    const s = body.settings;
    if (!isObj(s) || !isObj(s.data)) throw bad('settings is invalid');
    reqInt(s.updatedAt, 'settings.updatedAt', 0, 1e14);
    if (JSON.stringify(s.data).length > LIMITS.maxSettingsBytes) throw bad('settings too large');
    for (const [k, v] of Object.entries(s.data)) {
      if (!/^[A-Za-z0-9_]{1,40}$/.test(k) || !(['number', 'boolean', 'string'].includes(typeof v)) ||
          (typeof v === 'string' && v.length > 100)) throw bad('settings has an invalid field');
    }
    settings = { data: s.data, updatedAt: Math.min(s.updatedAt, now) };
  }
  return { baseEpoch, scopes, attempts, settings };
}

// Writes merged scope rows with compare-and-set; returns the keys that lost a race.
async function writeScopes(db, uid, epoch, scopes, keys, now) {
  const rows = new Map();
  if (keys.length) {
    const ph = keys.map(() => '?').join(',');
    const res = await db.prepare(
      'SELECT scope_key, progress, incorrect, flags, version FROM scopes WHERE uid = ? AND scope_key IN (' + ph + ')'
    ).bind(uid, ...keys).all();
    for (const r of res.results) rows.set(r.scope_key, r);
  }
  const stmts = [];
  const meta = [];
  const merged = {};
  for (const key of keys) {
    const inc = scopes[key];
    const row = rows.get(key);
    const oldProgress = row ? parseJson(row.progress, {}) : {};
    const storedProgress = oldProgress && oldProgress.epoch >= epoch ? oldProgress : null;
    const storedIncorrect = row ? dropOlderEpoch(parseJson(row.incorrect, {}), epoch) : {};
    const storedFlags = row ? parseJson(row.flags, {}) : {};
    const progress = mergeEntry(storedProgress, inc.progress);
    const incorrect = mergeMaps(storedIncorrect, inc.incorrect);
    const flags = mergeMaps(storedFlags, inc.flags);
    merged[key] = { progress, incorrect, flags };
    const same = row && canonical(progress) === canonical(storedProgress) &&
      canonical(incorrect) === canonical(storedIncorrect) && canonical(flags) === canonical(storedFlags);
    if (same) continue; // nothing changed: no row written
    const p = JSON.stringify(progress || {}), i = JSON.stringify(incorrect), f = JSON.stringify(flags);
    if (row) {
      stmts.push(db.prepare(
        'UPDATE scopes SET progress = ?, incorrect = ?, flags = ?, version = version + 1 ' +
        'WHERE uid = ? AND scope_key = ? AND version = ?'
      ).bind(p, i, f, uid, key, row.version));
    } else {
      stmts.push(db.prepare(
        'INSERT OR IGNORE INTO scopes (uid, scope_key, progress, incorrect, flags, version) VALUES (?, ?, ?, ?, ?, 1)'
      ).bind(uid, key, p, i, f));
    }
    meta.push(key);
  }
  const lost = [];
  if (stmts.length) {
    const results = await db.batch(stmts);
    results.forEach((r, idx) => { if (!r.meta || r.meta.changes === 0) lost.push(meta[idx]); });
  }
  return { lost, merged };
}

export async function onRequest({ request, env, data }) {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use POST');
    const now = Date.now();
    const body = await readJson(request);
    const req = parseBody(body, now);
    const db = env.DB;
    const uid = data.uid;

    const user = await touchUser(db, uid, now);
    const epoch = user.reset_epoch;
    if (req.baseEpoch > epoch) throw bad('baseEpoch is ahead of the server');

    // A device from before a reset: drop its progress, incorrect entries,
    // attempts and settings. Flags survive a reset, so they are still merged.
    const stale = req.baseEpoch < epoch;
    const scopes = {};
    for (const [key, s] of Object.entries(req.scopes)) {
      scopes[key] = stale ? { progress: null, incorrect: {}, flags: s.flags } : s;
    }
    // Entries from before the current epoch are dropped on ingest.
    for (const s of Object.values(scopes)) {
      if (s.progress && s.progress.epoch < epoch) s.progress = null;
      s.incorrect = dropOlderEpoch(s.incorrect, epoch);
    }

    // ---- attempts (idempotent, rate-limited) ----
    const accepted = [];
    const rejected = [];
    if (!stale && req.attempts.length) {
      const ids = req.attempts.map((a) => a.attemptId);
      const ph = ids.map(() => '?').join(',');
      const existing = await db.prepare(
        'SELECT attempt_id FROM attempts WHERE uid = ? AND attempt_id IN (' + ph + ')'
      ).bind(uid, ...ids).all();
      const have = new Set(existing.results.map((r) => r.attempt_id));
      const fresh = req.attempts.filter((a) => !have.has(a.attemptId));
      for (const id of have) accepted.push(id); // retry of a stored attempt is success
      if (fresh.length) {
        const c = await db.prepare(
          'SELECT COUNT(*) AS n FROM attempts WHERE uid = ? AND created_at > ?'
        ).bind(uid, now - 3600000).first();
        let budget = Math.max(0, LIMITS.maxAttemptsPerHour - c.n);
        const toInsert = [];
        for (const a of fresh) {
          if (budget > 0) { toInsert.push(a); budget--; }
          else rejected.push({ attemptId: a.attemptId, reason: 'rate_limited' });
        }
        if (toInsert.length) {
          await db.batch(toInsert.map((a) => db.prepare(
            'INSERT OR IGNORE INTO attempts (uid, attempt_id, epoch, created_at, client_ts, module, exam_type, ' +
            'subject, sub_subject, scope, score, correct, total, attempted, time_sec, review) ' +
            'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
          ).bind(uid, a.attemptId, epoch, now, a.clientTs, a.module, a.examType, a.subject, a.subSubject,
            a.scope, a.score, a.correct, a.total, a.attempted, a.timeSec,
            a.review ? JSON.stringify(a.review) : null)));
          for (const a of toInsert) accepted.push(a.attemptId);
        }
      }
    } else if (stale && req.attempts.length) {
      for (const a of req.attempts) rejected.push({ attemptId: a.attemptId, reason: 'stale_epoch' });
    }

    // ---- scopes (compare-and-set, up to 5 rounds with jittered backoff) ----
    let pending = Object.keys(scopes);
    const mergedAll = {};
    for (let round = 0; round < 5 && pending.length; round++) {
      if (round > 0) await new Promise((r) => setTimeout(r, 15 + Math.random() * 60 * round)); // jittered backoff
      const { lost, merged } = await writeScopes(db, uid, epoch, scopes, pending, now);
      for (const k of pending) if (!lost.includes(k)) mergedAll[k] = merged[k];
      pending = lost;
    }
    if (pending.length) throw new HttpError(503, 'busy', 'Too many concurrent changes, retry shortly');

    // ---- settings (newer wins; skipped for stale devices) ----
    if (!stale && req.settings) {
      const stored = parseJson(user.settings, {});
      const have = stored && stored.data ? stored : null;
      const win = !have || req.settings.updatedAt > have.updatedAt ||
        (req.settings.updatedAt === have.updatedAt && canonical(req.settings) > canonical(have));
      if (win) {
        await db.prepare('UPDATE users SET settings = ? WHERE uid = ? AND reset_epoch = ?')
          .bind(JSON.stringify(req.settings), uid, epoch).run();
      }
    }

    // ---- response ----
    if (stale) {
      const fresh = await touchUser(db, uid, now);
      return json({ ok: true, droppedStale: true, acceptedAttempts: accepted, rejectedAttempts: rejected,
        state: await buildState(db, fresh) });
    }
    const out = {};
    for (const [k, v] of Object.entries(mergedAll)) {
      out[k] = {
        progress: v.progress && v.progress.epoch >= epoch ? v.progress : null,
        incorrect: v.incorrect, flags: v.flags,
      };
    }
    return json({
      ok: true, droppedStale: false, epoch,
      acceptedAttempts: accepted, rejectedAttempts: rejected,
      scopes: out, stats: await getStats(db, uid, epoch),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
