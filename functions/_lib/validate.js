// Strict input validation. Anything unexpected is rejected with 400.

import { HttpError } from './http.js';

const bad = (msg) => new HttpError(400, 'bad_request', msg);

export const LIMITS = {
  maxEntriesPerSync: 200,
  maxAttemptsPerSync: 30,
  maxAttemptsPerHour: 60,
  maxScopesPerSync: 40,
  maxReviewItems: 300,
  maxSessionBytes: 64 * 1024,
  maxSettingsBytes: 2 * 1024,
  maxProgressBytes: 1024,
};

const ID = /^[A-Za-z0-9_-]{1,40}$/;
export const SCOPE_KEY = /^[A-Za-z0-9_-]{1,40}(\|[A-Za-z0-9_-]{1,40}){3}$/;
const QID = /^\d{1,6}$/;
const UUID = /^[A-Za-z0-9-]{8,64}$/;

export const isInt = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

export function reqInt(v, name, min, max) {
  if (!isInt(v, min, max)) throw bad(name + ' must be an integer between ' + min + ' and ' + max);
  return v;
}

export function reqId(v, name) {
  if (typeof v !== 'string' || !UUID.test(v)) throw bad(name + ' is invalid');
  return v;
}

function reqBase(e, name) {
  if (!isObj(e)) throw bad(name + ' must be an object');
  reqInt(e.epoch, name + '.epoch', 0, 1e6);
  reqInt(e.rev, name + '.rev', 1, 1e9);
  reqInt(e.updatedAt, name + '.updatedAt', 0, 1e14);
}

// progress: free-form small object of primitives, plus the base fields.
export function validateProgress(e, name) {
  reqBase(e, name);
  const keys = Object.keys(e);
  if (keys.length > 20) throw bad(name + ' has too many fields');
  for (const k of keys) {
    const v = e[k];
    if (!/^[A-Za-z0-9_]{1,30}$/.test(k)) throw bad(name + ' has a bad field name');
    if (!(typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 60))) {
      throw bad(name + '.' + k + ' has an invalid value');
    }
    if (typeof v === 'number' && !Number.isFinite(v)) throw bad(name + '.' + k + ' is not finite');
  }
  if (JSON.stringify(e).length > LIMITS.maxProgressBytes) throw bad(name + ' is too large');
  return e;
}

// incorrect: { epoch, rev, updatedAt, userAnswer (-1..9), addedAt, removed }
export function validateIncorrect(e, name) {
  reqBase(e, name);
  const allowed = new Set(['epoch', 'rev', 'updatedAt', 'userAnswer', 'addedAt', 'removed']);
  for (const k of Object.keys(e)) if (!allowed.has(k)) throw bad(name + ' has unknown field ' + k);
  if (e.userAnswer !== undefined) reqInt(e.userAnswer, name + '.userAnswer', -1, 9);
  if (e.addedAt !== undefined) reqInt(e.addedAt, name + '.addedAt', 0, 1e14);
  if (e.removed !== undefined && typeof e.removed !== 'boolean') throw bad(name + '.removed must be boolean');
  return e;
}

// flags: { epoch (ignored, forced 0), rev, updatedAt, flaggedAt, removed }
export function validateFlag(e, name) {
  reqBase(e, name);
  const allowed = new Set(['epoch', 'rev', 'updatedAt', 'flaggedAt', 'removed']);
  for (const k of Object.keys(e)) if (!allowed.has(k)) throw bad(name + ' has unknown field ' + k);
  if (e.flaggedAt !== undefined) reqInt(e.flaggedAt, name + '.flaggedAt', 0, 1e14);
  if (e.removed !== undefined && typeof e.removed !== 'boolean') throw bad(name + '.removed must be boolean');
  return { ...e, epoch: 0 };
}

export function validateMap(map, name, fn) {
  if (map === undefined) return {};
  if (!isObj(map)) throw bad(name + ' must be an object');
  const out = {};
  for (const k of Object.keys(map)) {
    if (!QID.test(k)) throw bad(name + ' has a bad question id');
    out[k] = fn(map[k], name + '.' + k);
  }
  return out;
}

export function validateAttempt(a, i) {
  const n = 'attempts[' + i + ']';
  if (!isObj(a)) throw bad(n + ' must be an object');
  const out = { attemptId: reqId(a.attemptId, n + '.attemptId') };
  for (const f of ['module', 'examType']) {
    if (typeof a[f] !== 'string' || !ID.test(a[f])) throw bad(n + '.' + f + ' is invalid');
    out[f] = a[f];
  }
  for (const f of ['subject', 'subSubject']) {
    if (a[f] === null || a[f] === undefined) out[f] = null;
    else if (typeof a[f] === 'string' && ID.test(a[f])) out[f] = a[f];
    else throw bad(n + '.' + f + ' is invalid');
  }
  if (a.scope === null || a.scope === undefined) out.scope = null;
  else if (typeof a.scope === 'string' && /^[A-Za-z0-9_|-]{1,60}$/.test(a.scope)) out.scope = a.scope;
  else throw bad(n + '.scope is invalid');

  out.total = reqInt(a.total, n + '.total', 0, 1000);
  out.attempted = reqInt(a.attempted, n + '.attempted', 0, out.total);
  out.correct = reqInt(a.correct, n + '.correct', 0, out.attempted);
  out.score = reqInt(a.score, n + '.score', 0, 100);
  out.timeSec = reqInt(a.timeSec, n + '.timeSec', 0, 86400);
  out.clientTs = a.clientTs === undefined ? null : reqInt(a.clientTs, n + '.clientTs', 0, 1e14);

  if (a.review === undefined || a.review === null) out.review = null;
  else {
    if (!isObj(a.review) || !Array.isArray(a.review.keys) || !Array.isArray(a.review.answers)) {
      throw bad(n + '.review is invalid');
    }
    const { keys, answers } = a.review;
    if (keys.length !== answers.length || keys.length > LIMITS.maxReviewItems) {
      throw bad(n + '.review size is invalid');
    }
    for (const k of keys) {
      if (typeof k !== 'string' || !/^[A-Za-z0-9_-]{1,40}(\|[A-Za-z0-9_-]{1,40}){3}\|\d{1,6}$/.test(k)) {
        throw bad(n + '.review has a bad question key');
      }
    }
    for (const x of answers) if (!isInt(x, -1, 9)) throw bad(n + '.review has a bad answer');
    out.review = { keys, answers };
  }
  return out;
}
