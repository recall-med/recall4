// Database helpers shared by the routes.

import { dropOlderEpoch } from './merge.js';

export async function touchUser(db, uid, now) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO users (uid, created_at, last_seen) VALUES (?, ?, ?)').bind(uid, now, now),
    // Throttled: writes at most once per 10 minutes per user.
    db.prepare('UPDATE users SET last_seen = ? WHERE uid = ? AND last_seen < ?').bind(now, uid, now - 600000),
  ]);
  return db.prepare('SELECT * FROM users WHERE uid = ?').bind(uid).first();
}

export function parseJson(text, fallback) {
  try { const v = JSON.parse(text); return v === null || v === undefined ? fallback : v; }
  catch (e) { return fallback; }
}

export async function getStats(db, uid, epoch) {
  const r = await db.prepare(
    'SELECT COUNT(*) AS n, COALESCE(SUM(attempted),0) AS a, COALESCE(SUM(correct),0) AS c, ' +
    'COALESCE(SUM(time_sec),0) AS t FROM attempts WHERE uid = ? AND epoch = ?'
  ).bind(uid, epoch).first();
  return {
    totalAttempted: r.a,
    totalCorrect: r.c,
    totalIncorrect: r.a - r.c,
    completedExams: r.n,
    totalTimeSpentSec: r.t,
  };
}

// Converts a scopes row into the shape sent to the client, hiding
// anything from before the user's current reset epoch. Flags survive resets.
export function shapeScope(row, epoch) {
  const progress = parseJson(row.progress, {});
  return {
    progress: progress && progress.epoch >= epoch ? progress : null,
    incorrect: dropOlderEpoch(parseJson(row.incorrect, {}), epoch),
    flags: parseJson(row.flags, {}),
    version: row.version,
  };
}

export async function buildState(db, user) {
  const uid = user.uid;
  const epoch = user.reset_epoch;
  const [scopeRows, attemptRows, stats] = await Promise.all([
    db.prepare('SELECT scope_key, progress, incorrect, flags, version FROM scopes WHERE uid = ?').bind(uid).all(),
    db.prepare(
      'SELECT attempt_id, created_at, module, exam_type, subject, sub_subject, scope, score, correct, total, ' +
      'attempted, time_sec FROM attempts WHERE uid = ? AND epoch = ? ORDER BY created_at DESC LIMIT 30'
    ).bind(uid, epoch).all(),
    getStats(db, uid, epoch),
  ]);
  const scopes = {};
  for (const row of scopeRows.results) scopes[row.scope_key] = shapeScope(row, epoch);
  const settings = parseJson(user.settings, {});
  return {
    epoch,
    sessionVersion: user.session_version,
    settings: settings && settings.data ? settings : null,
    session: parseJson(user.session, null),
    scopes,
    stats,
    attempts: attemptRows.results,
    serverTime: Date.now(),
  };
}
